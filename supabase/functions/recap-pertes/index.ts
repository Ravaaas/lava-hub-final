// Edge Function "recap-pertes" — envoie par email le récap Pertes & Perso d'une semaine complète (7 jours validés).
// Remplace l'email du dimanche de l'ancienne app Google Apps Script.
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : recap-pertes.
// Laisser "Verify JWT" activé. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Secrets à créer (Supabase > Edge Functions > Secrets) :
//   RESEND_API_KEY      clé du service d'envoi d'emails Resend (resend.com, gratuit jusqu'à 3 000 emails/mois)
//   RECAP_DESTINATAIRE  adresse(s) qui reçoivent le récap, séparées par des virgules
//   RECAP_EXPEDITEUR    ex. « LAVA <recap@lava-paris.com> » (domaine vérifié dans Resend)
//
// Appel (POST JSON, admin connecté) : { semaine: "AAAA-MM-JJ" } = lundi de la semaine.
// Réponse (toujours HTTP 200) : { ok: true, destinataire } ou { ok: false, message }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER = "alexandre.ravasio@outlook.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const court = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const num = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");
const esc = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Couleurs de la feuille LAVA (identiques aux fiches imprimées)
const RED = "#B5433C", INK = "#221818", MUTE = "#6B5C5C", LINE = "#EDD8D8", ZEBRA = "#F5ECEC";
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const caller = await callerAdmin(req);
    if (!caller) return reply({ ok: false, message: "Réservé à l'administrateur" });

    const { semaine } = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(semaine || "")) || dow(semaine) !== 1) return reply({ ok: false, message: "Semaine invalide" });
    const days = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
    const sunday = days[6];

    const key = Deno.env.get("RESEND_API_KEY"), to = (Deno.env.get("RECAP_DESTINATAIRE") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const from = Deno.env.get("RECAP_EXPEDITEUR") || "LAVA <onboarding@resend.dev>";
    if (!key || !to.length) return reply({ ok: false, message: "Envoi d'emails non configuré (secrets RESEND_API_KEY et RECAP_DESTINATAIRE)" });

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
    if (manquants.length) return reply({ ok: false, message: `Journées non validées : ${manquants.map((d) => JOURS[days.indexOf(d)] + " " + court(d)).join(", ")}` });

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
    h += `<div style="font-size:14px;color:${MUTE};margin-top:4px">7/7 jours validés · ${tri.length} produit${tri.length > 1 ? "s" : ""} utilisé${tri.length > 1 ? "s" : ""} · ${pertes.length} perte${pertes.length > 1 ? "s" : ""} déclarée${pertes.length > 1 ? "s" : ""}</div>`;
    h += `<div style="height:2px;background:${RED};margin:14px 0 4px"></div>`;

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
    h += `<div style="margin-top:18px;font-size:12px;color:${MUTE}">LAVA Hub Cuisine · récap imprimable dans l'onglet Pertes &amp; Perso &gt; Récap</div></div></div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: `LAVA - PERTES & PERSO · semaine du ${periode}`, html: h }),
    });
    if (!r.ok) return reply({ ok: false, message: `Service d'emails : ${(await r.text()).slice(0, 200)}` });

    await admin.from("perso_recaps").upsert({ semaine, envoye_le: new Date().toISOString(), destinataire: to.join(", ") });
    return reply({ ok: true, destinataire: to.join(", ") });
  } catch (e) {
    return reply({ ok: false, message: "Erreur : " + (e as Error).message });
  }
});
