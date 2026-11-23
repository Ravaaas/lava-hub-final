// Edge Function "yokitup" — LIT les recettes Yokitup et en range une copie dans la table yokitup_recettes.
// Sens unique, lecture seule : cette fonction n'envoie que des requêtes GET à Yokitup (voir `lire`), elle ne crée,
// ne modifie et ne supprime jamais rien chez Yokitup. Elle ne touche pas non plus aux fiches recette du Hub :
// l'admin compare puis reprend les grammages lui-même (Config > Yokitup).
//
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : yokitup.
// Laisser "Verify JWT" activé. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
// Secret à créer par le propriétaire (Supabase > Edge Functions > Secrets) :
//   YOKITUP_API_KEY       clé API Yokitup (Bearer)
//   YOKITUP_ETIQUETTES    facultatif ; par défaut « RECETTE CARTE,RECETTE MENU,RECETTE LUNCH »
//
// Appels (POST JSON) :
//   admin connecté (bouton « Mettre à jour depuis Yokitup »)  {}
//   lecture de la nuit (pg_cron)                              { auto: true } + en-tête x-cron-token (jeton de la table perso_cron)
// Réponse (toujours HTTP 200) : { ok: true, recettes } ou { ok: false, message }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER = "alexandre.ravasio@outlook.com";
const API = "https://api.yokitup.com";
const VERSION = "2026-06-01";
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

/** Prénom de l'admin connecté, ou null. */
async function callerAdmin(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const { data: m } = await admin.from("membres").select("prenom,role,actif,doit_changer_mdp").eq("email", email).maybeSingle();
  if (email === OWNER) return m?.prenom || "Admin";
  return m && m.actif && !m.doit_changer_mdp && m.role === "admin" ? m.prenom : null;
}

// ── Lecture de Yokitup : GET uniquement, pages suivies jusqu'au bout ──
type Ligne = Record<string, unknown>;
async function lire(cle: string, chemin: string, params: Record<string, string> = {}): Promise<Ligne[]> {
  const out: Ligne[] = [];
  const q = new URLSearchParams(params).toString();
  let url: string | null = `${API}${chemin}${q ? "?" + q : ""}`;
  for (let pages = 0; url; pages++) {
    if (pages >= 1000) throw new Error(`Trop de pages sur ${chemin} : lecture arrêtée, copie inchangée`);
    if (!url.startsWith(API + "/")) throw new Error("Adresse de page inattendue : " + url);
    let res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${cle}`, "Yokitup-Version": VERSION, Accept: "application/json" } });
    for (let essai = 0; res.status === 429 && essai < 3; essai++) {   // trop de requêtes : on attend le temps demandé
      await new Promise(r => setTimeout(r, Math.min(Number(res.headers.get("Retry-After") || 2), 20) * 1000));
      res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${cle}`, "Yokitup-Version": VERSION, Accept: "application/json" } });
    }
    if (res.status === 401) throw new Error("Clé Yokitup refusée (401) : vérifier YOKITUP_API_KEY");
    if (!res.ok) throw new Error(`Yokitup a répondu ${res.status} sur ${chemin}`);
    const corps = await res.json();
    if (Array.isArray(corps?.data)) out.push(...corps.data);
    // page suivante : adresse complète ou relative (« /products?page=2 »), toujours chez Yokitup
    url = typeof corps?.links?.next === "string" && corps.links.next ? new URL(corps.links.next, API).toString() : null;
  }
  return out;
}
/** Même lecture, un identifiant à la fois : Yokitup ne filtre que sur UNE valeur (« a,b » renvoie une liste vide). */
async function lireParIds(cle: string, chemin: string, nomParam: string, ids: string[]): Promise<Ligne[]> {
  const out: Ligne[] = [];
  for (const id of ids) out.push(...await lire(cle, chemin, { [nomParam]: id }));
  return out;
}

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
/** « BŒUF/PLEUROTE (CARTE) » → { plat: « BŒUF/PLEUROTE », version: « CARTE » } */
function decouper(nom: string): { plat: string; version: string } {
  const m = nom.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m ? { plat: m[1].trim(), version: m[2].trim().toUpperCase() } : { plat: nom.trim(), version: "" };
}

async function synchroniser(cle: string) {
  const voulues = (Deno.env.get("YOKITUP_ETIQUETTES") || "RECETTE CARTE,RECETTE MENU,RECETTE LUNCH")
    .split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
  const tags = await lire(cle, "/tags");
  const nomTag = new Map(tags.map(t => [s(t.id), s(t.name)]));
  const tagIds = tags.filter(t => voulues.includes(s(t.name).trim().toUpperCase())).map(t => s(t.id));
  if (!tagIds.length) throw new Error(`Aucune étiquette ${voulues.join(" / ")} trouvée dans Yokitup`);

  const liensTags = await lireParIds(cle, "/product_tags", "tag_ids", tagIds);
  const etiquettesDe = new Map<string, string[]>();
  for (const l of liensTags) {
    const p = s(l.product_id), n = nomTag.get(s(l.tag_id)) || "";
    if (tagIds.includes(s(l.tag_id))) etiquettesDe.set(p, [...(etiquettesDe.get(p) || []), n]);
  }
  // Tous les produits en une lecture (pages de 50), triés ici : moins de requêtes qu'un appel par produit.
  const produits = new Map((await lire(cle, "/products")).map(p => [s(p.id), p]));
  const recettes = [...etiquettesDe.keys()].map(id => produits.get(id))
    .filter((p): p is Ligne => !!p && s(p.type) === "recipe" && s(p.status) === "active");
  // Lecture vide = anomalie (clé limitée, filtre changé…) : on s'arrête sans effacer la copie existante.
  if (!recettes.length) {
    throw new Error(`Aucune recette lue (étiquettes trouvées : ${tagIds.length}, produits étiquetés : ${etiquettesDe.size}, ` +
      `liens lus : ${liensTags.length}, produits lus : ${produits.size}) : copie inchangée`);
  }
  const ingredients = await lireParIds(cle, "/recipe_ingredients", "recipe_product_ids", recettes.map(r => s(r.id)));
  const unites = new Map((await lire(cle, "/measurement_units")).map(u => [s(u.id), s(u.name)]));
  const idsIngr = new Set(ingredients.map(i => s(i.ingredient_product_id)));
  const allergenes = new Map((await lire(cle, "/allergens")).map(a => [s(a.id), s(a.name)]));
  const presences = (await lire(cle, "/product_allergens")).filter(x => idsIngr.has(s(x.product_id)));
  const allergenesDe = (pid: string, niveau: string) =>
    presences.filter(x => s(x.product_id) === pid && s(x.severity) === niveau).map(x => allergenes.get(s(x.allergen_id)) || "").filter(Boolean);

  const lu = new Date().toISOString();
  const lignes = recettes.map(r => {
    const nom = s(r.name), { plat, version } = decouper(nom);
    return {
      id: s(r.id), nom, plat, version, etiquettes: etiquettesDe.get(s(r.id)) || [], lu_le: lu,
      ingredients: ingredients.filter(i => s(i.recipe_product_id) === s(r.id)).map(i => {
        const pid = s(i.ingredient_product_id), p = produits.get(pid);
        return {
          id: pid, nom: s(p?.name) || s(i.name), quantite: s(i.quantity), unite: unites.get(s(i.measurement_unit_id)) || "",
          sous_recette: s(p?.type) === "recipe", allergenes: allergenesDe(pid, "contains"), traces: allergenesDe(pid, "may_contain"),
        };
      }),
    };
  });
  // La copie est remplacée : recettes lues mises à jour, recettes disparues (désactivées, étiquette retirée) effacées.
  if (lignes.length) {
    const { error } = await admin.from("yokitup_recettes").upsert(lignes);
    if (error) throw new Error("Enregistrement impossible : " + error.message);
  }
  const garder = lignes.map(l => l.id);
  const { data: anciennes } = await admin.from("yokitup_recettes").select("id");
  const aEffacer = (anciennes || []).map(a => a.id as string).filter(id => !garder.includes(id));
  if (aEffacer.length) await admin.from("yokitup_recettes").delete().in("id", aEffacer);
  return { recettes: lignes.length, plats: new Set(lignes.map(l => l.plat)).size, effacees: aEffacer.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let par = "";
  try {
    const corps = await req.json().catch(() => ({}));
    const jeton = req.headers.get("x-cron-token");
    if (jeton) {
      const { data } = await admin.from("perso_cron").select("jeton").eq("id", 1).maybeSingle();
      if (!data || data.jeton !== jeton || corps.auto !== true) return reply({ ok: false, message: "Jeton refusé" });
      par = "Lecture de la nuit";
    } else {
      const prenom = await callerAdmin(req);
      if (!prenom) return reply({ ok: false, message: "Réservé à l'administrateur" });
      par = prenom;
    }
    const cle = Deno.env.get("YOKITUP_API_KEY");
    if (!cle) return reply({ ok: false, message: "Clé Yokitup absente : à coller dans Supabase > Edge Functions > Secrets (YOKITUP_API_KEY)" });

    const r = await synchroniser(cle);
    await admin.from("yokitup_synchros").insert({ par, recettes: r.recettes, ok: true, message: `${r.plats} plats` });
    await admin.from("audit_log").insert({ ts: Date.now(), action: "lecture Yokitup", fiche_nom: "Yokitup", profil: par,
      detail: [`${r.recettes} recettes lues (${r.plats} plats)`, ...(r.effacees ? [`${r.effacees} recette(s) retirée(s) de Yokitup`] : [])] });
    return reply({ ok: true, recettes: r.recettes, plats: r.plats });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("yokitup_synchros").insert({ par, recettes: 0, ok: false, message }).then(() => {}, () => {});
    return reply({ ok: false, message });
  }
});
