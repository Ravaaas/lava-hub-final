exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { action, payload, base64, mediaType } = JSON.parse(event.body);

  // ── CHECK PASSWORD (server-side) ──
  if (action === 'check_password') {
    const pw = process.env.ADMIN_PASSWORD || 'lava2026';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: payload.password === pw })
    };
  }

  // ── CLAUDE VISION ──
  if (action === 'vision') {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Tu es un chef cuisinier expert en fiches techniques de cuisine professionnelle. Analyse cette photo et extrais TOUTES les informations visibles avec le maximum de précision.

Réponds UNIQUEMENT avec ce JSON valide, sans aucun texte avant ou après :
{
  "nom": "nom de la recette en majuscules",
  "categorie": "une valeur parmi : Base, Sauce, Garniture, Dessert, Autre",
  "quantiteNette": "quantité totale produite ex: 5.06 kg ou 1 L",
  "conditionnement": "une valeur parmi : Sac sous vide, Siphon, Petite boite, Moyenne boite, Grande boite, Poche à pâtisserie, Pipette — ou vide si non précisé",
  "conditionnementQte": "poids ou volume du contenant ex: 850g ou 500ml — ou vide",
  "ingredients": [
    {"nom": "nom exact de l'ingrédient", "quantite": "nombre uniquement ex: 3.60", "unite": "g ou kg ou cl ou L ou cs ou cc ou pièce ou ml"}
  ],
  "process": [
    "étape complète et précise"
  ]
}

Règles importantes :
- Extrais TOUS les ingrédients visibles même partiellement lisibles
- Normalise les unités : grammes→g, kilogrammes→kg, centilitres→cl, litres→L, millilitres→ml
- Les quantités doivent être des nombres décimaux (ex: 3.60 pas "3kg600")
- Pour le process : chaque étape est une phrase complète et actionnable
- Si quelque chose est illisible mets ""
- Respecte la casse professionnelle pour les noms d'ingrédients` }
          ]}]
        })
      });
      const data = await res.json();
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    } catch(err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── SUPABASE WRITES (avec clé admin) ──
  const SUPABASE_URL = 'https://qmvxmxzsmpigvseuidcd.supabase.co';
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY manquante' }) };
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
  };

  try {
    let res, data;

    if (action === 'insert_fiche') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/fiches`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      data = await res.json();

    } else if (action === 'update_fiche') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/fiches?id=eq.${payload.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload.data)
      });
      data = await res.json();

    } else if (action === 'delete_fiche') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/fiches?id=eq.${payload.id}`, {
        method: 'DELETE',
        headers
      });
      data = { deleted: true };

    } else if (action === 'insert_plat') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/plats`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
      data = await res.json();

    } else if (action === 'update_plat') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/plats?id=eq.${payload.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(payload.data)
      });
      data = await res.json();

    } else if (action === 'delete_plat') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/plats?id=eq.${payload.id}`, {
        method: 'DELETE',
        headers
      });
      data = { deleted: true };

    } else if (action === 'get_config') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/lava_config?id=eq.main`, { headers });
      const rows = await res.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows[0] || null)
      };

    } else if (action === 'save_config') {
      res = await fetch(`${SUPABASE_URL}/rest/v1/lava_config`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id: 'main', data: payload })
      });
      data = await res.json();

    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Action inconnue' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
