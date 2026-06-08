module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({
    status: 'ok',
    app: 'ADB Administrativo',
    assistant: 'Adam Assistente Virtual',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    driveConnectorConfigured: Boolean(process.env.ADAM_DRIVE_WEBAPP_URL && process.env.ADAM_DRIVE_TOKEN)
  });
};
