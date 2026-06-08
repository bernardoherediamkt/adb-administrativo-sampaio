const fs = require('fs');
const path = require('path');

function readMemoryFile(relativePath, fallback = '') {
  try {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  } catch (error) {
    return fallback;
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

function clip(text, max = 14000) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido por limite de contexto]...' : value;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).map((item) => {
    const role = item.role === 'model' ? 'model' : 'user';
    const text = String(item.text || item.content || '').slice(0, 1500);
    return { role, parts: [{ text }] };
  }).filter((item) => item.parts[0].text.trim());
}

async function fetchDriveContext(query) {
  const url = process.env.ADAM_DRIVE_WEBAPP_URL;
  const token = process.env.ADAM_DRIVE_TOKEN;
  if (!url || !token) {
    return {
      connected: false,
      context: 'Google Drive ainda não conectado. Para respostas administrativas reais, configure ADAM_DRIVE_WEBAPP_URL e ADAM_DRIVE_TOKEN na Vercel.'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, query, mode: 'context' }),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { context: text }; }
    if (!response.ok) {
      return { connected: false, context: 'Erro ao consultar Google Drive: ' + (data.error || data.message || response.status) };
    }
    return {
      connected: Boolean(data.connected !== false),
      context: clip(data.context || data.summary || JSON.stringify(data, null, 2), 16000),
      raw: data
    };
  } catch (error) {
    return { connected: false, context: 'Erro ao conectar ao Google Drive: ' + error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt() {
  const base = readMemoryFile('memoria_adam/ADAM_SYSTEM_PROMPT_ADB_SAMPAIO.txt', 'Você é Adam, Assistente Virtual da ADB Sampaio.');
  const memoria = readMemoryFile('memoria_adam/ADAM_MEMORIA_COMPLETA_ADB_SAMPAIO.md', '');

  return clip(`
${base}

IDENTIDADE DO ADAM NO APP:
- Seu nome é Adam Assistente Virtual da ADB Sampaio.
- Você serve ao Pastor Bernardo e à equipe da ADB Sampaio.
- Responda em português do Brasil.
- Seja pastoral, claro, organizado, objetivo e confiável.
- Para assuntos bíblicos, mantenha Jesus no centro, Deus como protagonista e aplicação prática.
- Para assuntos administrativos, seja prático, cite limites dos dados e nunca invente números.
- Quando usar dados do Drive/planilhas, diga “com base nos dados encontrados” e destaque se os dados parecem incompletos.
- Se o Drive não estiver conectado ou se o dado não aparecer no contexto, diga isso com honestidade.
- Não exponha chaves de API, tokens, links sensíveis ou detalhes internos de segurança.

MEMÓRIA COMPLETA DA ADB SAMPAIO:
${memoria}
`, 26000);
}

async function callGemini({ systemPrompt, driveContext, message, history }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada na Vercel.');

  const requested = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const models = Array.from(new Set([
    requested,
    'gemini-3.5-flash',
    'gemini-3-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash'
  ].filter(Boolean)));

  const finalUserMessage = `
PERGUNTA DO USUÁRIO:
${message}

CONTEXTO ADMINISTRATIVO DO GOOGLE DRIVE / PLANILHAS:
${driveContext.context}

INSTRUÇÃO:
Responda usando a memória da ADB e, quando houver dados do Drive, use-os como base. Se a pergunta pedir análise financeira, organize em resumo, principais entradas, principais saídas, saldo/movimento quando possível, alertas e próximos passos. Não invente valores que não estejam no contexto.
`;

  let lastError = null;
  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...normalizeHistory(history),
        { role: 'user', parts: [{ text: finalUserMessage }] }
      ],
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        maxOutputTokens: 2600
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error((data.error && data.error.message) || `Erro Gemini ${response.status} no modelo ${model}`);
        continue;
      }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const answer = parts.map((part) => part.text || '').join('\n').trim();
      if (answer) return { answer, model };
      lastError = new Error(`O modelo ${model} não retornou texto.`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Não foi possível chamar o Gemini.');
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const body = await readJson(req);
    const message = String(body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Mensagem vazia.' });

    const [driveContext] = await Promise.all([
      fetchDriveContext(message)
    ]);

    const systemPrompt = buildSystemPrompt();
    const result = await callGemini({
      systemPrompt,
      driveContext,
      message,
      history: body.history || []
    });

    return res.status(200).json({
      answer: result.answer,
      model: result.model,
      driveConnected: driveContext.connected
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno no Adam.' });
  }
};
