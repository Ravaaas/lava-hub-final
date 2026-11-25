// Edge Function "allergenes-menus" — prévient par email quand la fiche allergènes imprimée de la carte n'est plus à jour.
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : allergenes-menus,
// avec les trois fichiers index.ts, pdf.ts et regles.ts. Laisser "Verify JWT" activé.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Secrets (Supabase > Edge Functions > Secrets) :
//   ALLERGENES_DESTINATAIRE  facultatif : adresse(s) séparées par des virgules (par défaut restaurant@lava-paris.com)
//   Envoi : les mêmes secrets que « recap-pertes » (GMAIL_USER et GMAIL_APP_PASSWORD, ou RESEND_API_KEY et RECAP_EXPEDITEUR).
//
// Principe : une seule fiche allergènes, pour tous les plats de la carte actuelle (fiches recette Partages, Carte du soir, Lunch).
// L'app retient la fiche imprimée (table allergenes_imprimes, ligne « carte » : plat → allergènes). Toutes les 15 minutes
// (pg_cron, supabase/sql/allergenes-menus.sql), la fonction compare la carte actuelle à la fiche imprimée. Un écart doit rester le même
// 30 minutes (personne n'est en train de modifier) avant l'email ; un seul email par écart (table allergenes_alertes) ; l'écart
// est soldé quand la fiche est réimprimée. Tant que la fiche n'a jamais été imprimée depuis le Hub, rien n'est surveillé.
//
// Appels (POST JSON) :
//   pg_cron                 { auto: true } + en-tête x-cron-token (jeton de la table perso_cron).
//   vérification            { apercu: true } (jeton ou admin) : renvoie { changements, fichier, pdf (base64), sujet, html } sans rien envoyer ni retenir.
//   email d'essai           { essai: true } (jeton ou admin) : envoie maintenant l'email avec la fiche actuelle (sujet « ESSAI » s'il n'y a
//                           aucun changement) sans rien retenir.
// Réponse (toujours HTTP 200) : { ok: true, ... } ou { ok: false, message }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { comparer, ecartVide, FICHE_CARTE, ficheCarte, libellesEcart, lireLignes, listeAllergenes, signatureEcart } from "./regles.ts";
import { ficheAllergenesPdf, nomFicheAllergenes } from "./pdf.ts";

const OWNER = "alexandre.ravasio@outlook.com";
const DESTINATAIRE = "restaurant@lava-paris.com";
const ATTENTE_MS = 30 * 60 * 1000;   // 30 minutes sans nouveau changement avant d'envoyer
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });

async function callerAdmin(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  if (email === OWNER) return email;
  const { data: m } = await admin.from("membres").select("role,actif,doit_changer_mdp").eq("email", email).maybeSingle();
  return m && m.actif && !m.doit_changer_mdp && m.role === "admin" ? email : null;
}

const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const encodeBase64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const dateFr = (d: string | Date) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

// Couleurs de la feuille LAVA (identiques aux fiches imprimées)
const RED = "#B5433C", INK = "#221818", MUTE = "#6B5C5C";
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";

/** Email : ce qui a changé sur la carte depuis la fiche imprimée ; la nouvelle fiche est jointe. */
function emailHtml(changements: readonly string[], imprimeLe: string, imprimePar: string, essai: boolean): string {
  let h = `<div style="${FONT}background:#f5f5f7;padding:16px 6px"><div style="max-width:760px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 22px;color:${INK}">`;
  h += `<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${RED}">${essai ? "Essai · " : ""}Fiche allergènes de la carte</div>`;
  h += `<div style="font-size:24px;font-weight:700;text-transform:uppercase;margin-top:4px">${essai ? "Fiche actuelle" : "À réimprimer"}</div>`;
  h += `<div style="font-size:14px;color:${MUTE};margin-top:4px">${essai ? "Envoi d'essai : la fiche allergènes actuelle de la carte, en PDF A4 joint." : "La fiche allergènes affichée n'est plus à jour. Nouvelle fiche A4 en PDF jointe."}</div>`;
  h += `<div style="height:2px;background:${RED};margin:14px 0 4px"></div>`;
  if (changements.length) {
    h += `<div style="font-size:13px;color:${MUTE};margin:10px 0 4px">${imprimeLe ? `Fiche imprimée le ${esc(dateFr(imprimeLe))}${imprimePar ? ` par ${esc(imprimePar)}` : ""}. Depuis :` : "Changements :"}</div>`;
    h += `<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">${changements.map((c) => `<li><b>${esc(c)}</b></li>`).join("")}</ul>`;
  }
  h += `<div style="margin-top:18px;font-size:13px;color:${INK}">Imprimer la nouvelle fiche depuis l'onglet <b>Menus &gt; Fiche allergènes</b> du Hub (ou le PDF joint), puis la noter comme imprimée : l'alerte disparaît.</div>`;
  h += `<div style="margin-top:12px;font-size:12px;color:${MUTE}">LAVA Hub Cuisine · un seul email par changement, 30 minutes après la dernière modification</div></div></div>`;
  return h;
}

async function envoyer(to: string[], sujet: string, html: string, pdfs: { fichier: string; pdf: Uint8Array }[]): Promise<string | null> {
  const gmailUser = Deno.env.get("GMAIL_USER")?.trim(), gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s/g, "");
  const key = Deno.env.get("RESEND_API_KEY");
  if (gmailUser && gmailPass) {
    const smtp = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } } });
    try {
      await smtp.send({ from: `LAVA Hub <${gmailUser}>`, to, subject: sujet, content: "auto", html,
        attachments: pdfs.map((f) => ({ filename: f.fichier, content: f.pdf, encoding: "binary", contentType: "application/pdf" })) });
    } catch (e) {
      const m = String((e as Error).message || e);
      return /auth|535|534|password|credentials/i.test(m) ? "Gmail refuse la connexion : vérifie GMAIL_USER et le mot de passe d'application" : "Gmail : " + m.slice(0, 200);
    } finally {
      try { await smtp.close(); } catch { /* déjà fermé */ }
    }
    return null;
  }
  if (!key) return "Envoi d'emails non configuré (secrets GMAIL_USER et GMAIL_APP_PASSWORD)";
  const from = Deno.env.get("RECAP_EXPEDITEUR") || "LAVA <onboarding@resend.dev>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: sujet, html, attachments: pdfs.map((f) => ({ filename: f.fichier, content: encodeBase64(f.pdf) })) }),
  });
  return r.ok ? null : `Service d'emails : ${(await r.text()).slice(0, 200)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corps = await req.json().catch(() => ({}));
    const jeton = req.headers.get("x-cron-token");
    if (jeton) {
      const { data } = await admin.from("perso_cron").select("jeton").eq("id", 1).maybeSingle();
      if (!data || data.jeton !== jeton) return reply({ ok: false, message: "Jeton refusé" });
    } else if (!(await callerAdmin(req))) return reply({ ok: false, message: "Réservé à l'administrateur" });
    const apercu = corps.apercu === true, essai = corps.essai === true;
    if (!apercu && !essai && !(jeton && corps.auto === true)) return reply({ ok: false, message: "Appel inconnu" });

    const [fr, imp, al] = await Promise.all([
      admin.from("fiches_recette").select("id,nom,statut,allergenes"),   // sans les photos
      admin.from("allergenes_imprimes").select("lignes,imprime_le,imprime_par").eq("menu_id", FICHE_CARTE.id).maybeSingle(),
      admin.from("allergenes_alertes").select("ecart,ecart_le,prevenu").eq("menu_id", FICHE_CARTE.id).maybeSingle(),
    ]);
    const err = [fr, imp, al].find((r) => r.error)?.error;
    if (err) return reply({ ok: false, message: err.message });
    const frs = (fr.data ?? []).map((l) => ({ id: String(l.id), nom: String(l.nom ?? ""), statut: String(l.statut ?? ""), allergenes: listeAllergenes(l.allergenes) }));
    const lignes = ficheCarte(frs);
    const i = imp.data, a = al.data;
    const e = i ? comparer(lireLignes(i.lignes), lignes) : null;
    const ecart = e && !ecartVide(e) ? e : null;
    const changements = ecart ? libellesEcart(ecart) : [];
    const signature = ecart ? signatureEcart(ecart) : "";
    const imprimeLe = i ? String(i.imprime_le) : "", imprimePar = i ? String(i.imprime_par ?? "") : "";

    const to = (Deno.env.get("ALLERGENES_DESTINATAIRE") || DESTINATAIRE).split(",").map((s) => s.trim()).filter(Boolean);
    const fichier = nomFicheAllergenes(FICHE_CARTE.nom);
    const pdfs = async () => [{ fichier, pdf: await ficheAllergenesPdf(FICHE_CARTE.nom, lignes, dateFr(new Date()), fichier) }];
    // Sujet court et SANS ACCENTS : un sujet long et accentué est mal découpé par l'envoi SMTP et casse tout l'email (en-têtes affichés en clair)
    const sujet = (enEssai: boolean) => enEssai ? "ESSAI - LAVA - Fiche allergenes de la carte"
      : `LAVA - Fiche allergenes a reimprimer (${changements.length} changement${changements.length > 1 ? "s" : ""})`;

    // Vérification ou essai : rien n'est retenu
    if (apercu || essai) {
      const html = emailHtml(changements, imprimeLe, imprimePar, !ecart), pj = await pdfs();
      if (apercu) return reply({ ok: true, sujet: sujet(!ecart), html, destinataire: to.join(", "), plats: lignes.length, changements, fichier, pdf: encodeBase64(pj[0]!.pdf) });
      const echec = await envoyer(to, sujet(!ecart), html, pj);
      return echec ? reply({ ok: false, message: echec }) : reply({ ok: true, destinataire: to.join(", "), plats: lignes.length, changements: changements.length });
    }

    // Passage programmé : retenir l'écart, attendre 30 min sans nouveau changement, prévenir une seule fois
    if (!signature) {   // à jour (réimprimée) ou jamais imprimée : plus rien à surveiller
      if (a) await admin.from("allergenes_alertes").delete().eq("menu_id", FICHE_CARTE.id);
      return reply({ ok: true, envoye: 0, ecart: false });
    }
    if (!a || a.ecart !== signature) {   // nouvel écart, ou il vient encore de changer : on repart pour 30 minutes
      await admin.from("allergenes_alertes").upsert({ menu_id: FICHE_CARTE.id, ecart: signature, ecart_le: new Date().toISOString(), prevenu: a?.prevenu ?? null });
      return reply({ ok: true, envoye: 0, ecart: true, attente: true });
    }
    if (a.prevenu === signature) return reply({ ok: true, envoye: 0, ecart: true, dejaPrevenu: true });
    if (Date.now() - new Date(String(a.ecart_le)).getTime() < ATTENTE_MS) return reply({ ok: true, envoye: 0, ecart: true, attente: true });

    const echec = await envoyer(to, sujet(false), emailHtml(changements, imprimeLe, imprimePar, false), await pdfs());
    if (echec) return reply({ ok: false, message: echec });   // rien de retenu : nouvel essai au prochain passage
    await admin.from("allergenes_alertes").update({ prevenu: signature, prevenu_le: new Date().toISOString() }).eq("menu_id", FICHE_CARTE.id);
    return reply({ ok: true, envoye: 1, destinataire: to.join(", "), changements: changements.length });
  } catch (e) {
    return reply({ ok: false, message: "Erreur : " + (e as Error).message });
  }
});
