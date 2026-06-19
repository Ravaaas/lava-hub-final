exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { base64, mediaType } = JSON.parse(event.body);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
    const data = await response.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
