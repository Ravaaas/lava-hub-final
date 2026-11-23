// Edge Function "recap-groupes" — envoie par email, chaque lundi, les fiches des groupes validés de la semaine (lundi → dimanche),
// une fiche A4 en PDF par groupe (même dessin que la fiche imprimée de l'app, marge haute de 4 cm comprise).
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : recap-groupes,
// avec les quatre fichiers index.ts, pdf.ts, domaine.ts et aliments.ts. Laisser "Verify JWT" activé.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Secrets à créer (Supabase > Edge Functions > Secrets) :
//   GROUPES_DESTINATAIRE  adresse(s) qui reçoivent les fiches, séparées par des virgules
//   Envoi : les mêmes secrets que « recap-pertes » (GMAIL_USER et GMAIL_APP_PASSWORD, ou RESEND_API_KEY et RECAP_EXPEDITEUR).
//
// Appels (POST JSON) :
//   envoi du lundi (pg_cron)          { auto: true } + en-tête x-cron-token (jeton de la table perso_cron) :
//                                     groupes de la semaine en cours, une seule fois (table groupes_recaps).
//                                     + apercu: true : renvoie { fiches: [{ fichier, pdf }] } en base64 sans envoyer d'email.
//   admin connecté                    { semaine?: "AAAA-MM-JJ" } = lundi de la semaine (par défaut la semaine en cours) : envoie maintenant.
// Seuls les groupes validés sont envoyés (pas les brouillons) ; aucun email s'il n'y a aucun groupe cette semaine.
// Réponse (toujours HTTP 200) : { ok: true, destinataire, groupes } ou { ok: false, message }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { addDays, construireFiche, dateLongue, heureFr, jourDeSemaine, lireFiche, lireFicheRecette, lireGroupe, lireMenu, lundiDe } from "./domaine.ts";
import { fichePdf, nomFiche } from "./pdf.ts";

const OWNER = "alexandre.ravasio@outlook.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });

async function callerAdmin(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  if (email === OWNER) return email;
  const { data: m } = await admin.from("membres").select("role,actif,doit_changer_mdp").eq("email", email).maybeSingle();
  return m && m.actif && !m.doit_changer_mdp && m.role === "admin" ? email : null;
}

const jourParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const court = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const encodeBase64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

// Couleurs de la feuille LAVA (identiques aux fiches imprimées)
const RED = "#B5433C", INK = "#221818", MUTE = "#6B5C5C", LINE = "#EDD8D8", ZEBRA = "#F5ECEC";
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corps = await req.json().catch(() => ({}));
    const jeton = req.headers.get("x-cron-token");
    let auto = false;
    if (jeton) {
      // Envoi programmé du lundi : jeton connu de la base seulement
      const { data } = await admin.from("perso_cron").select("jeton").eq("id", 1).maybeSingle();
      if (!data || data.jeton !== jeton || corps.auto !== true) return reply({ ok: false, message: "Jeton refusé" });
      auto = true;
    } else if (!(await callerAdmin(req))) return reply({ ok: false, message: "Réservé à l'administrateur" });

    const apercu = auto && corps.apercu === true;   // vérification : renvoie les PDF sans rien envoyer
    const semaine = corps.semaine ? String(corps.semaine) : lundiDe(jourParis());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine) || jourDeSemaine(semaine) !== 1) return reply({ ok: false, message: "Semaine invalide" });
    const dimanche = addDays(semaine, 6);
    if (auto && !apercu) {
      const { data: deja } = await admin.from("groupes_recaps").select("semaine").eq("semaine", semaine).maybeSingle();
      if (deja) return reply({ ok: true, message: `Fiches de la semaine du ${semaine} déjà envoyées` });
    }

    const to = (Deno.env.get("GROUPES_DESTINATAIRE") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const gmailUser = Deno.env.get("GMAIL_USER")?.trim(), gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s/g, "");
    const key = Deno.env.get("RESEND_API_KEY");
    if (!apercu) {
      if (!to.length) return reply({ ok: false, message: "Envoi d'emails non configuré (secret GROUPES_DESTINATAIRE)" });
      if (!(gmailUser && gmailPass) && !key) return reply({ ok: false, message: "Envoi d'emails non configuré (secrets GMAIL_USER et GMAIL_APP_PASSWORD)" });
    }

    const g = await admin.from("groupes").select("*").gte("date", semaine).lte("date", dimanche).eq("statut", "confirme").order("date").order("heure");
    if (g.error) return reply({ ok: false, message: g.error.message });
    if (!g.data?.length) return reply({ ok: true, message: `Aucun groupe validé du ${court(semaine)} au ${court(dimanche)} : rien envoyé`, groupes: 0 });

    const [fr, fi, cfg] = await Promise.all([
      admin.from("fiches_recette").select("id,nom,allergenes,sous_recettes"),   // sans les photos
      admin.from("fiches").select("id,nom,ingredients"),
      admin.from("lava_config").select("data").eq("id", "menus").maybeSingle(),
    ]);
    const err = [fr, fi, cfg].find((r) => r.error)?.error;
    if (err) return reply({ ok: false, message: err.message });
    const frs = (fr.data ?? []).map(lireFicheRecette), fiches = (fi.data ?? []).map(lireFiche);
    const items = (cfg.data?.data as { items?: unknown[] } | null)?.items;
    const menus = (Array.isArray(items) ? items : []).map(lireMenu).filter((m) => m.id);

    // Une fiche PDF par groupe, dans l'ordre des jours
    const groupes = g.data.map((l) => lireGroupe(l));
    const fiches_pdf: { fichier: string; pdf: Uint8Array }[] = [];
    const pris = new Set<string>();
    for (const gr of groupes) {
      let fichier = nomFiche(gr.date, gr.nom);
      for (let i = 2; pris.has(fichier); i++) fichier = nomFiche(gr.date, gr.nom).replace(/\.pdf$/, ` ${i}.pdf`);
      pris.add(fichier);
      fiches_pdf.push({ fichier, pdf: await fichePdf(construireFiche(gr, menus, frs, fiches), fichier) });
    }
    if (apercu) return reply({ ok: true, fiches: fiches_pdf.map((f) => ({ fichier: f.fichier, pdf: encodeBase64(f.pdf) })) });

    // Email : liste des groupes de la semaine (le détail est dans les PDF joints)
    const periode = `${court(semaine)} au ${court(dimanche)}`;
    const th = `padding:6px 6px;font-size:11px;font-weight:600;color:${RED};border-bottom:1px solid ${LINE};text-align:left`;
    const td = `padding:7px 6px;font-size:13px;color:${INK};border-bottom:1px solid ${LINE};text-align:left;vertical-align:top`;
    let h = `<div style="${FONT}background:#f5f5f7;padding:16px 6px"><div style="max-width:760px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 22px;color:${INK}">`;
    h += `<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${RED}">Groupes de la semaine</div>`;
    h += `<div style="font-size:24px;font-weight:700;text-transform:uppercase;margin-top:4px">Du ${periode}</div>`;
    h += `<div style="font-size:14px;color:${MUTE};margin-top:4px">${groupes.length} groupe${groupes.length > 1 ? "s" : ""} · une fiche A4 en PDF jointe par groupe</div>`;
    h += `<div style="height:2px;background:${RED};margin:14px 0 4px"></div>`;
    h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><th style="${th}">Jour</th><th style="${th}">Groupe</th><th style="${th}">Personnes</th><th style="${th}">Salle</th></tr>`;
    groupes.forEach((gr, i) => {
      const bg = i % 2 ? `background:${ZEBRA};` : "";
      const alertes = construireFiche(gr, menus, frs, fiches).alertes.filter((a) => !a.adapte).length;
      h += `<tr><td style="${td};${bg}white-space:nowrap">${esc(dateLongue(gr.date))}${gr.heure ? `<div style="font-size:12px;color:${MUTE}">${esc(heureFr(gr.heure))}</div>` : ""}</td>` +
        `<td style="${td};${bg}"><b>${esc(gr.nom)}</b>${alertes ? `<div style="font-size:12px;color:${RED}">${alertes} plat${alertes > 1 ? "s" : ""} à adapter</div>` : ""}</td>` +
        `<td style="${td};${bg}">${gr.pax || ""}</td><td style="${td};${bg}">${esc(gr.salle)}</td></tr>`;
    });
    h += `</table><div style="margin-top:18px;font-size:12px;color:${MUTE}">LAVA Hub Cuisine · fiches aussi imprimables dans l'onglet Groupes</div></div></div>`;

    const sujet = `LAVA - GROUPES · semaine du ${periode}`;
    if (gmailUser && gmailPass) {
      // Gmail (Google Workspace) : port 465 en TLS, mot de passe d'application
      const smtp = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } } });
      try {
        await smtp.send({ from: `LAVA Hub <${gmailUser}>`, to, subject: sujet, content: "auto", html: h,
          attachments: fiches_pdf.map((f) => ({ filename: f.fichier, content: f.pdf, encoding: "binary", contentType: "application/pdf" })) });
      } catch (e) {
        const m = String((e as Error).message || e);
        return reply({ ok: false, message: /auth|535|534|password|credentials/i.test(m) ? "Gmail refuse la connexion : vérifie GMAIL_USER et le mot de passe d'application" : "Gmail : " + m.slice(0, 200) });
      } finally {
        try { await smtp.close(); } catch { /* déjà fermé */ }
      }
    } else {
      const from = Deno.env.get("RECAP_EXPEDITEUR") || "LAVA <onboarding@resend.dev>";
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject: sujet, html: h, attachments: fiches_pdf.map((f) => ({ filename: f.fichier, content: encodeBase64(f.pdf) })) }),
      });
      if (!r.ok) return reply({ ok: false, message: `Service d'emails : ${(await r.text()).slice(0, 200)}` });
    }

    await admin.from("groupes_recaps").upsert({ semaine, envoye_le: new Date().toISOString(), destinataire: to.join(", "), nb: groupes.length });
    return reply({ ok: true, destinataire: to.join(", "), groupes: groupes.length });
  } catch (e) {
    return reply({ ok: false, message: "Erreur : " + (e as Error).message });
  }
});
