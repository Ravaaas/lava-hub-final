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
            { type: 'text', text: `Tu es un assistant cuisine expert. Analyse cette photo de brouillon de recette et extrait en JSON strict uniquement (aucun texte avant/après) :
{"nom":"","categorie":"Base|Sauce|Garniture|Dessert|Autre","quantiteNette":"","conditionnement":"","ingredients":[{"nom":"","quantite":"","unite":""}],"process":["étape 1..."]}
Si une info est illisible, mets "". Réponds UNIQUEMENT avec le JSON valide.` }
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
