// Edge Function "recap-pertes" — envoie par email le récap Pertes & Perso d'une semaine complète (7 jours validés).
// Remplace l'email du dimanche de l'ancienne app Google Apps Script.
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : recap-pertes.
// Laisser "Verify JWT" activé. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Secrets à créer (Supabase > Edge Functions > Secrets) :
//   RECAP_DESTINATAIRE  adresse(s) qui reçoivent le récap, séparées par des virgules
//   Envoi par Gmail (prioritaire, aucun réglage DNS) :
//     GMAIL_USER          adresse Google Workspace qui envoie, ex. prenom@lava-paris.com
//     GMAIL_APP_PASSWORD  mot de passe d'application de ce compte (16 lettres ; validation en deux étapes requise)
//   Sinon, envoi par Resend (domaine vérifié dans Resend) :
//     RESEND_API_KEY      clé Resend
//     RECAP_EXPEDITEUR    ex. « LAVA <recap@lava-paris.com> »
//
// Appels (POST JSON) :
//   admin connecté (bouton de l'app)  { semaine: "AAAA-MM-JJ" } = lundi de la semaine ; les 7 jours doivent être validés.
//   envoi du lundi (pg_cron)          { auto: true } + en-tête x-cron-token (jeton de la table perso_cron) :
//                                     récap de la semaine écoulée, une seule fois, jours non validés signalés.
//                                     + apercu: true et semaine : renvoie { pdf } en base64 sans envoyer d'email.
// Le récap est aussi joint en PDF A4 (pdf.ts, à déployer avec ce fichier).
// Réponse (toujours HTTP 200) : { ok: true, destinataire } ou { ok: false, message }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { nomPdf, recapPdf } from "./pdf.ts";

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

// ── Dates ──
const addDays = (d: string, n: number) => {
  const [a, m, j] = d.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, j + n, 12));
  return x.toISOString().slice(0, 10);
};
const jourParis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const court = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const num = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");
const encodeBase64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

    let semaine = String(corps.semaine || "");
    const apercu = auto && corps.apercu === true;   // vérification : renvoie le PDF sans rien envoyer
    if (apercu) semaine = String(corps.semaine || "");
    else if (auto) {
      const j = jourParis();
      semaine = addDays(j, -((dow(j) + 6) % 7) - 7);   // lundi de la semaine écoulée
      const { data: deja } = await admin.from("perso_recaps").select("semaine").eq("semaine", semaine).maybeSingle();
      if (deja) return reply({ ok: true, message: `Récap de la semaine du ${semaine} déjà envoyé` });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine) || dow(semaine) !== 1) return reply({ ok: false, message: "Semaine invalide" });
    const days = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
    const sunday = days[6];

    const to = (Deno.env.get("RECAP_DESTINATAIRE") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const gmailUser = Deno.env.get("GMAIL_USER")?.trim(), gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s/g, "");
    const key = Deno.env.get("RESEND_API_KEY");
    if (!to.length) return reply({ ok: false, message: "Envoi d'emails non configuré (secret RECAP_DESTINATAIRE)" });
    if (!(gmailUser && gmailPass) && !key) return reply({ ok: false, message: "Envoi d'emails non configuré (secrets GMAIL_USER et GMAIL_APP_PASSWORD)" });

    const [v, p, s, l, c] = await Promise.all([
      admin.from("perso_validations").select("date").gte("date", semaine).lte("date", sunday),
      admin.from("perso_produits").select("*").order("cree_le"),
      admin.from("perso_saisies").select("*").gte("date", semaine).lte("date", sunday),
      admin.from("pertes").select("*").gte("date", semaine).lte("date", sunday).order("date").order("cree_le"),
      admin.from("perso_commentaires").select("*").gte("date", semaine).lte("date", sunday).order("date"),
    ]);
    const err = [v, p, s, l, c].find((r) => r.error)?.error;
    if (err) return reply({ ok: false, message: err.message });

    const valides = new Set((v.data ?? []).map((x) => x.date));
    const manquants = days.filter((d) => !valides.has(d));
    const listeManquants = manquants.map((d) => JOURS[days.indexOf(d)] + " " + court(d)).join(", ");
    if (manquants.length && !auto) return reply({ ok: false, message: `Journées non validées : ${listeManquants}` });

    // Quantités : une ligne par produit utilisé, dans l'ordre de la liste
    const produits = new Map((p.data ?? []).map((x, i) => [x.cle, { ...x, i }]));
    const lignes = new Map<string, { nom: string; unite: string; cat: string; i: number; q: number[] }>();
    for (const x of s.data ?? []) {
      const j = days.indexOf(x.date), q = Number(x.quantite);
      if (j < 0 || !(q > 0)) continue;
      const pr = produits.get(x.produit_cle);
      const lg = lignes.get(x.produit_cle) ?? { nom: pr?.nom ?? x.produit_cle, unite: pr?.unite ?? "", cat: pr?.categorie ?? "Produits retirés", i: pr?.i ?? 1e9, q: [0, 0, 0, 0, 0, 0, 0] };
      lg.q[j] += q;
      lignes.set(x.produit_cle, lg);
    }
    const tri = [...lignes.values()].sort((a, b) => a.i - b.i);
    const pertes = l.data ?? [], cmts = c.data ?? [];
    const periode = `${court(semaine)} au ${court(sunday)}`;

    const th = `padding:6px 4px;font-size:11px;font-weight:600;color:${RED};border-bottom:1px solid ${LINE};text-align:center`;
    const td = `padding:6px 4px;font-size:13px;color:${INK};border-bottom:1px solid ${LINE};text-align:center`;
    const titre = (t: string) => `<div style="margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${RED};border-bottom:1px solid ${LINE};padding-bottom:4px">${t}</div>`;

    let h = `<div style="${FONT}background:#f5f5f7;padding:16px 6px"><div style="max-width:760px;margin:0 auto;background:#fff;border-radius:16px;padding:24px 22px;color:${INK}">`;
    h += `<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${RED}">Récap Pertes &amp; Perso</div>`;
    h += `<div style="font-size:24px;font-weight:700;text-transform:uppercase;margin-top:4px">Semaine du ${periode}</div>`;
    h += `<div style="font-size:14px;color:${MUTE};margin-top:4px">${7 - manquants.length}/7 jours validés · ${tri.length} produit${tri.length > 1 ? "s" : ""} utilisé${tri.length > 1 ? "s" : ""} · ${pertes.length} perte${pertes.length > 1 ? "s" : ""} déclarée${pertes.length > 1 ? "s" : ""}</div>`;
    h += `<div style="height:2px;background:${RED};margin:14px 0 4px"></div>`;
    if (manquants.length) h += `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#fff0e0;color:#8a3800;font-size:13px"><b>Journées non validées</b> : ${listeManquants}. Leurs quantités peuvent encore changer.</div>`;

    h += titre("Repas perso — quantités utilisées");
    if (!tri.length) h += `<div style="font-size:14px;color:${MUTE}">Aucune quantité saisie cette semaine.</div>`;
    else {
      h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><th style="${th};text-align:left">Produit</th>`;
      days.forEach((d, i) => { h += `<th style="${th}">${JOURS[i]}<br>${d.slice(8)}</th>`; });
      h += `<th style="${th};text-align:right">Total</th></tr>`;
      let cat = "", z = 0;
      for (const x of tri) {
        if (x.cat !== cat) { cat = x.cat; z = 0; h += `<tr><td colspan="9" style="padding:12px 4px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${RED}">${esc(cat)}</td></tr>`; }
        const bg = z++ % 2 ? `background:${ZEBRA};` : "";
        const total = x.q.reduce((a, b) => a + b, 0);
        h += `<tr><td style="${td};${bg}text-align:left">${esc(x.nom)} <span style="color:${MUTE};font-size:11px">(${esc(x.unite)})</span></td>`;
        x.q.forEach((q) => { h += `<td style="${td};${bg}${q ? "" : `color:#cbbcbc;`}">${q ? num(q) : "–"}</td>`; });
        h += `<td style="${td};${bg}text-align:right;font-weight:700;color:${RED}">${num(total)}</td></tr>`;
      }
      h += `</table>`;
    }

    h += titre("Pertes diverses");
    if (!pertes.length) h += `<div style="font-size:14px;color:${MUTE}">Aucune perte déclarée cette semaine.</div>`;
    else {
      h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><th style="${th};text-align:left">Jour</th><th style="${th};text-align:left">Produit / recette</th><th style="${th};text-align:left">Raison</th><th style="${th};text-align:right">Quantité</th></tr>`;
      pertes.forEach((x, i) => {
        const bg = i % 2 ? `background:${ZEBRA};` : "";
        h += `<tr><td style="${td};${bg}text-align:left;color:${MUTE};white-space:nowrap">${JOURS[days.indexOf(x.date)]} ${x.date.slice(8)}</td>` +
          `<td style="${td};${bg}text-align:left"><b>${esc(x.produit)}</b><div style="font-size:12px;color:${MUTE}">${esc(x.saisi_par)}</div></td>` +
          `<td style="${td};${bg}text-align:left">${esc(x.raison)}${x.precision ? `<div style="font-size:12px;color:${MUTE}">${esc(x.precision)}</div>` : ""}</td>` +
          `<td style="${td};${bg}text-align:right;font-weight:700;white-space:nowrap">${num(Number(x.quantite))} ${esc(x.unite)}</td></tr>`;
      });
      h += `</table>`;
    }

    if (cmts.length) {
      h += titre("Commentaires de l'équipe");
      for (const x of cmts) {
        h += `<div style="border-left:2px solid ${RED};padding:4px 10px;margin-bottom:8px"><div style="font-size:12px;color:${MUTE};font-weight:600">${JOURS[days.indexOf(x.date)]} ${court(x.date)} · ${esc(x.nom)}</div><div style="font-size:14px;margin-top:2px;white-space:pre-wrap">${esc(x.texte)}</div></div>`;
      }
    }
    h += `<div style="margin-top:18px;font-size:12px;color:${MUTE}">LAVA Hub Cuisine · récap en PDF joint, aussi imprimable dans l'onglet Pertes &amp; Perso &gt; Récap</div></div></div>`;

    const pdf = await recapPdf({
      jours: days, valides: [...valides], lignes: tri,
      pertes: pertes.map((x) => ({ date: x.date, produit: x.produit, par: x.saisi_par ?? "", quantite: Number(x.quantite), unite: x.unite, raison: x.raison, precision: x.precision ?? "" })),
      commentaires: cmts.map((x) => ({ date: x.date, nom: x.nom ?? "", texte: x.texte ?? "" })),
    });
    const fichier = nomPdf(days);
    if (apercu) return reply({ ok: true, fichier, pdf: encodeBase64(pdf) });
    const sujet = `LAVA - PERTES & PERSO · semaine du ${periode}`;
    if (gmailUser && gmailPass) {
      // Gmail (Google Workspace) : port 465 en TLS, mot de passe d'application
      const smtp = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPass } } });
      try {
        await smtp.send({ from: `LAVA Hub <${gmailUser}>`, to, subject: sujet, content: "auto", html: h,
          attachments: [{ filename: fichier, content: pdf, encoding: "binary", contentType: "application/pdf" }] });
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
        body: JSON.stringify({ from, to, subject: sujet, html: h, attachments: [{ filename: fichier, content: encodeBase64(pdf) }] }),
      });
      if (!r.ok) return reply({ ok: false, message: `Service d'emails : ${(await r.text()).slice(0, 200)}` });
    }

    await admin.from("perso_recaps").upsert({ semaine, envoye_le: new Date().toISOString(), destinataire: to.join(", ") });
    return reply({ ok: true, destinataire: to.join(", ") });
  } catch (e) {
    return reply({ ok: false, message: "Erreur : " + (e as Error).message });
  }
});
