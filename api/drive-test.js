const { buildDriveContext } = require('./_drive-context');

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    const churchId = body.churchId || req.query?.churchId || 'sampaio';
    const query = body.query || req.query?.query || 'teste de conexão Drive e Sheets da igreja selecionada';
    const result = await buildDriveContext(query, { churchId });
    return res.status(200).json({
      connected: true,
      method: 'service_account',
      church: result.church,
      message: `Google Drive conectado via Service Account para ${result.church?.name || churchId}.`,
      foldersFound: result.folders || 0,
      spreadsheetsFound: result.discoveredSheets || 0,
      filesFound: Array.isArray(result.files) ? result.files.length : 0,
      preview: String(result.context || '').slice(0, 3000)
    });
  } catch (error) {
    return res.status(500).json({
      connected: false,
      method: 'service_account',
      error: error.message,
      help: 'Confira as credenciais da Service Account, se a pasta-mãe da igreja foi compartilhada e, se necessário, configure ADB_SAMPAIO_ROOT_FOLDER_ID, ADB_SAQUAREMA_ROOT_FOLDER_ID ou ADB_PORTO_ROOT_FOLDER_ID na Vercel.'
    });
  }
};
