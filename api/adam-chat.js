const fs = require('fs');
const path = require('path');
const { buildDriveContext } = require('./_drive-context');

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

function clip(text, max = 20000) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido por limite de contexto]...' : value;
}

function cleanAdamAnswer(text) {
  let value = String(text || '').replace(/\r/g, '');

  // Remove blocos e marcações comuns de Markdown, mantendo o conteúdo legível.
  value = value.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
  value = value.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  value = value.replace(/\*\*(.*?)\*\*/g, '$1');
  value = value.replace(/__(.*?)__/g, '$1');
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  value = value.replace(/^\s*[-*]\s+/gm, '• ');
  value = value.replace(/\n{3,}/g, '\n\n');

  return value.trim();
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
  try {
    return await buildDriveContext(query);
  } catch (error) {
    return {
      connected: false,
      context: 'Google Drive ainda não conectado via Service Account ou sem permissão nas pastas. Detalhe: ' + error.message
    };
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
- Use uma linguagem visual limpa, humana e agradável.
- Use emojis com moderação para organizar e trazer leveza, especialmente em títulos curtos, resumos e próximos passos.
- Não use Markdown bruto: não use **asteriscos**, ###, ---, crases, blocos de código, barras, cercas ou símbolos decorativos desnecessários. Entregue texto limpo para aparecer dentro de um widget pequeno de chat.
- Para listas, use preferencialmente bullets simples como “•” ou frases curtas em linhas separadas. Use no máximo 5 bullets por resposta, a não ser que o usuário peça detalhes.
- Títulos devem ser escritos em texto normal, sem #, sem negrito markdown e sem caracteres especiais.
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

  const isFinanceQuestion = /financeir|entrada|sa[ií]da|d[ií]zimo|oferta|saldo|movimento|receita|despesa|relat[oó]rio|gasto|insumo|semestre|janeiro|fevereiro|mar[cç]o|abril|maio|junho/i.test(message);

  const finalUserMessage = `
PERGUNTA DO USUÁRIO:
${message}

CONTEXTO ADMINISTRATIVO DO GOOGLE DRIVE / PLANILHAS:
${driveContext.context}

INSTRUÇÃO:
Responda usando a memória da ADB e, quando houver dados do Drive, use-os como base. Se a pergunta pedir análise financeira, use primeiro o bloco LEITOR FINANCEIRO DETALHADO. Quando houver valores calculados por leitura técnica, apresente esses valores com clareza. Se os dados estiverem incompletos, diga exatamente o que faltou, mas não diga que estão reduzidos se o leitor técnico informou abas e linhas lidas. Não invente valores que não estejam no contexto.

FORMATO DA RESPOSTA:
Escreva de forma limpa, como conversa de WhatsApp/chat. Não use **, ###, ---, crases, blocos de código ou caracteres de Markdown. Use emojis com moderação para facilitar a leitura. Se precisar listar itens, use “•”. Para relatórios financeiros, entregue um relatório completo o suficiente para decisão administrativa, com números encontrados, observações e próximos passos. Para perguntas simples, seja breve.
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
        maxOutputTokens: isFinanceQuestion ? 4200 : 2600
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
      if (answer) return { answer: cleanAdamAnswer(answer), model };
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
