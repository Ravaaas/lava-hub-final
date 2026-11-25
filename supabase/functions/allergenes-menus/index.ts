// Edge Function "allergenes-menus" — prévient par email quand la fiche allergènes imprimée d'un menu n'est plus à jour.
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : allergenes-menus,
// avec les trois fichiers index.ts, pdf.ts et regles.ts. Laisser "Verify JWT" activé.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Secrets (Supabase > Edge Functions > Secrets) :
//   ALLERGENES_DESTINATAIRE  facultatif : adresse(s) séparées par des virgules (par défaut restaurant@lava-paris.com)
//   Envoi : les mêmes secrets que « recap-pertes » (GMAIL_USER et GMAIL_APP_PASSWORD, ou RESEND_API_KEY et RECAP_EXPEDITEUR).
//
// Principe : l'app retient chaque fiche allergènes imprimée (table allergenes_imprimes : plat → allergènes). Toutes les 15 minutes
// (pg_cron, supabase/sql/allergenes-menus.sql), la fonction compare chaque menu à sa fiche imprimée. Un écart doit rester le même
// 30 minutes (personne n'est en train de modifier) avant l'email ; un seul email par écart (table allergenes_alertes) ; l'écart
// est soldé quand la fiche est réimprimée. Un menu jamais imprimé depuis le Hub n'est pas surveillé.
//
// Appels (POST JSON) :
//   pg_cron                 { auto: true } + en-tête x-cron-token (jeton de la table perso_cron).
//   vérification            { apercu: true } (jeton ou admin) : renvoie { menus: [{ nom, changements, fichier, pdf (base64) }], sujet, html }
//                           sans rien envoyer ni retenir ; + tous: true : la fiche de chaque menu, même sans écart.
//   email d'essai           { essai: true } (jeton ou admin) : envoie maintenant l'email des écarts actuels (ou, s'il n'y en a aucun,
//                           les fiches de tous les menus, sujet « ESSAI ») sans rien retenir.
// Réponse (toujours HTTP 200) : { ok: true, ... } ou { ok: false, message }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { comparer, ecartVide, ficheAllergenes, libellesEcart, lireLignes, lireMenu, listeAllergenes, signatureEcart, type LigneAllergenes } from "./regles.ts";
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
const RED = "#B5433C", INK = "#221818", MUTE = "#6B5C5C", LINE = "#EDD8D8";
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";

interface MenuAPrevenir { id: string; nom: string; lignes: LigneAllergenes[]; changements: string[]; signature: string; imprimeLe: string; imprimePar: string }

function emailHtml(menus: readonly MenuAPrevenir[], essai: boolean): string {
  let h = `<div style="${FONT}background:#f5f5f7;padding:16px 6px"><div style="max-width:760px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 22px;color:${INK}">`;
  h += `<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${RED}">${essai ? "Essai · " : ""}Fiche allergènes à réimprimer</div>`;
  h += `<div style="font-size:24px;font-weight:700;text-transform:uppercase;margin-top:4px">${esc(menus.map((m) => m.nom).join(", "))}</div>`;
  h += `<div style="font-size:14px;color:${MUTE};margin-top:4px">La fiche affichée n'est plus à jour. Nouvelle fiche A4 en PDF jointe${menus.length > 1 ? " pour chaque menu" : ""}.</div>`;
  h += `<div style="height:2px;background:${RED};margin:14px 0 4px"></div>`;
  for (const m of menus) {
    h += `<div style="margin-top:16px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${RED};padding-bottom:4px;border-bottom:1px solid ${LINE}">${esc(m.nom)}</div>`;
    h += `<div style="font-size:13px;color:${MUTE};margin:6px 0 4px">${m.imprimeLe ? `Fiche imprimée le ${esc(dateFr(m.imprimeLe))}${m.imprimePar ? ` par ${esc(m.imprimePar)}` : ""}. Depuis :` : "Fiche actuelle :"}</div>`;
    h += `<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">${(m.changements.length ? m.changements : ["(aucun changement : envoi d'essai)"]).map((c) => `<li><b>${esc(c)}</b></li>`).join("")}</ul>`;
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

    const [cfg, fr, imp, al] = await Promise.all([
      admin.from("lava_config").select("data").eq("id", "menus").maybeSingle(),
      admin.from("fiches_recette").select("id,nom,allergenes"),   // sans les photos
      admin.from("allergenes_imprimes").select("menu_id,menu_nom,lignes,imprime_le,imprime_par"),
      admin.from("allergenes_alertes").select("menu_id,ecart,ecart_le,prevenu"),
    ]);
    const err = [cfg, fr, imp, al].find((r) => r.error)?.error;
    if (err) return reply({ ok: false, message: err.message });
    const items = (cfg.data?.data as { items?: unknown[] } | null)?.items;
    const menus = (Array.isArray(items) ? items : []).map(lireMenu).filter((m) => m.id);
    const frs = (fr.data ?? []).map((l) => ({ id: String(l.id), nom: String(l.nom ?? ""), allergenes: listeAllergenes(l.allergenes) }));
    const imprimees = new Map((imp.data ?? []).map((l) => [String(l.menu_id), l]));
    const alertes = new Map((al.data ?? []).map((l) => [String(l.menu_id), l]));

    // Écart de chaque menu surveillé (imprimé au moins une fois depuis le Hub)
    const ecarts: MenuAPrevenir[] = [];
    const tous: MenuAPrevenir[] = [];
    for (const m of menus) {
      const lignes = ficheAllergenes(m, frs);
      const i = imprimees.get(m.id);
      const e = i ? comparer(lireLignes(i.lignes), lignes) : null;
      const x = { id: m.id, nom: m.nom, lignes, changements: e ? libellesEcart(e) : [], signature: e ? signatureEcart(e) : "", imprimeLe: i ? String(i.imprime_le) : "", imprimePar: i ? String(i.imprime_par ?? "") : "" };
      tous.push(x);
      if (e && !ecartVide(e)) ecarts.push(x);
    }

    const to = (Deno.env.get("ALLERGENES_DESTINATAIRE") || DESTINATAIRE).split(",").map((s) => s.trim()).filter(Boolean);
    const edition = dateFr(new Date());
    const pdfsDe = async (liste: readonly MenuAPrevenir[]) => Promise.all(liste.map(async (m) => {
      const fichier = nomFicheAllergenes(m.nom);
      return { fichier, pdf: await ficheAllergenesPdf(m.nom, m.lignes, edition, fichier) };
    }));
    const sujetDe = (liste: readonly MenuAPrevenir[], prefixe = "") => `${prefixe}LAVA - ALLERGÈNES À RÉIMPRIMER · ${liste.map((m) => m.nom).join(", ")}`;

    // Vérification ou essai : rien n'est retenu
    if (apercu || essai) {
      const liste = ecarts.length ? ecarts : essai || corps.tous === true ? tous : [];
      const html = emailHtml(liste, !ecarts.length), pdfs = await pdfsDe(liste);
      const sujet = sujetDe(liste, ecarts.length ? "" : "ESSAI - ");
      if (apercu) return reply({ ok: true, sujet, html, destinataire: to.join(", "), menus: liste.map((m, k) => ({ nom: m.nom, changements: m.changements, fichier: pdfs[k]!.fichier, pdf: encodeBase64(pdfs[k]!.pdf) })) });
      if (!liste.length) return reply({ ok: false, message: "Aucun menu" });
      const echec = await envoyer(to, sujet, html, pdfs);
      return echec ? reply({ ok: false, message: echec }) : reply({ ok: true, destinataire: to.join(", "), menus: liste.map((m) => m.nom) });
    }

    // Passage programmé : retenir chaque écart, attendre 30 min sans changement, prévenir une seule fois
    const maintenant = Date.now();
    const prets: MenuAPrevenir[] = [];
    for (const m of tous) {
      const a = alertes.get(m.id);
      if (!m.signature || !ecarts.includes(m)) {   // à jour (réimprimée) ou jamais imprimée : plus rien à surveiller
        if (a) await admin.from("allergenes_alertes").delete().eq("menu_id", m.id);
        continue;
      }
      if (!a || a.ecart !== m.signature) {   // nouvel écart, ou il vient encore de changer : on repart pour 30 minutes
        await admin.from("allergenes_alertes").upsert({ menu_id: m.id, ecart: m.signature, ecart_le: new Date().toISOString(), prevenu: a?.prevenu ?? null });
        continue;
      }
      if (a.prevenu === m.signature) continue;   // déjà prévenu pour cet écart
      if (maintenant - new Date(String(a.ecart_le)).getTime() >= ATTENTE_MS) prets.push(m);
    }
    if (!prets.length) return reply({ ok: true, envoye: 0, ecarts: ecarts.length });

    const echec = await envoyer(to, sujetDe(prets), emailHtml(prets, false), await pdfsDe(prets));
    if (echec) return reply({ ok: false, message: echec });   // rien de retenu : nouvel essai au prochain passage
    for (const m of prets) await admin.from("allergenes_alertes").update({ prevenu: m.signature, prevenu_le: new Date().toISOString() }).eq("menu_id", m.id);
    return reply({ ok: true, envoye: prets.length, destinataire: to.join(", "), menus: prets.map((m) => m.nom) });
  } catch (e) {
    return reply({ ok: false, message: "Erreur : " + (e as Error).message });
  }
});
