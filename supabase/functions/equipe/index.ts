// Edge Function "equipe" — gère les comptes de connexion sans jamais exposer la clé secrète au navigateur.
// À déployer une seule fois : Supabase > Edge Functions > Deploy a new function > "Via Editor", nom : equipe.
// Laisser "Verify JWT" activé. SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
//
// Actions (POST JSON) :
//   activer       { email, password }  : publique, uniquement pour un profil actif qui n'a pas encore de compte
//   reinitialiser { email }            : admin — supprime le compte : la personne recrée son mot de passe à sa prochaine connexion
//   supprimer     { email }            : admin — supprime le compte et le profil
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
// Toujours HTTP 200 : l'app lit { ok, message }.
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });

// Renvoie l'email de l'appelant s'il est admin actif, sinon null.
async function callerAdmin(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  if (email === OWNER) return email;
  const { data: m } = await admin.from("membres").select("role,actif,doit_changer_mdp").eq("email", email).maybeSingle();
  return m && m.actif && !m.doit_changer_mdp && m.role === "admin" ? email : null;
}

async function findUser(email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (!data || data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { action, email: rawEmail, password } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email) return reply({ ok: false, message: "Identifiant manquant" });

    if (action === "activer") {
      if (String(password || "").length < 8) return reply({ ok: false, message: "8 caractères minimum" });
      const { data: m } = await admin.from("membres").select("actif,compte_cree").eq("email", email).maybeSingle();
      if (!(m && m.actif && !m.compte_cree)) return reply({ ok: false, message: "Première connexion non disponible pour ce profil" });
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return reply({ ok: false, message: "Création du compte impossible : " + error.message });
      await admin.from("membres").update({ compte_cree: true, doit_changer_mdp: false }).eq("email", email);
      return reply({ ok: true });
    }

    const caller = await callerAdmin(req);
    if (!caller) return reply({ ok: false, message: "Réservé à l'administrateur" });
    if (email === OWNER || email === caller) return reply({ ok: false, message: "Action impossible sur ce compte" });

    if (action === "reinitialiser" || action === "supprimer") {
      const u = await findUser(email);
      if (u) {
        const { error } = await admin.auth.admin.deleteUser(u.id);
        if (error) return reply({ ok: false, message: error.message });
      }
      if (action === "supprimer") {
        await admin.from("membres").delete().eq("email", email);
      } else {
        await admin.from("membres").update({ compte_cree: false, doit_changer_mdp: false }).eq("email", email);
      }
      return reply({ ok: true });
    }
    return reply({ ok: false, message: "Action inconnue" });
  } catch (e) {
    return reply({ ok: false, message: "Erreur : " + (e as Error).message });
  }
});
