module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  return res.status(200).json({
    status: 'ok',
    app: 'ADB Administrativo',
    assistant: 'Adam Assistente Virtual',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiTextModel: process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    driveConnectorConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    driveMethod: 'service_account',
    rootFoldersConfigured: {
      sampaio: Boolean(process.env.ADB_SAMPAIO_ROOT_FOLDER_ID),
      saquarema: Boolean(process.env.ADB_SAQUAREMA_ROOT_FOLDER_ID),
      porto: Boolean(process.env.ADB_PORTO_ROOT_FOLDER_ID)
    }
  });
};
