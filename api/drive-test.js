async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const url = process.env.ADAM_DRIVE_WEBAPP_URL;
  const token = process.env.ADAM_DRIVE_TOKEN;
  if (!url || !token) {
    return res.status(200).json({
      connected: false,
      message: 'Conector do Google Drive ainda não configurado. Configure ADAM_DRIVE_WEBAPP_URL e ADAM_DRIVE_TOKEN na Vercel.'
    });
  }

  const body = req.method === 'POST' ? await readJson(req) : {};
  const query = body.query || req.query?.query || 'teste de conexão';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, query, mode: 'health' })
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    return res.status(500).json({ connected: false, error: error.message });
  }
};
