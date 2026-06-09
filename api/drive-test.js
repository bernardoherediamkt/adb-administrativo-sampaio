const { buildDriveContext } = require('./_drive-context');

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    const query = body.query || req.query?.query || 'teste de conexão Drive ADB Sampaio';
    const result = await buildDriveContext(query);
    return res.status(200).json({
      connected: true,
      method: 'service_account',
      message: 'Google Drive conectado via Service Account.',
      filesFound: Array.isArray(result.files) ? result.files.length : 0,
      preview: String(result.context || '').slice(0, 2500)
    });
  } catch (error) {
    return res.status(500).json({
      connected: false,
      method: 'service_account',
      error: error.message,
      help: 'Confira GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY e se as pastas/planilhas foram compartilhadas com o e-mail da Service Account.'
    });
  }
};
