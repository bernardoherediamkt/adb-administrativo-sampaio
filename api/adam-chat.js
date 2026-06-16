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

function clip(text, max = 120000) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido por limite de contexto]...' : value;
}

function cleanAdamAnswer(text) {
  let value = String(text || '').replace(/\r/g, '');

  // Remove marcas visuais de Markdown que atrapalham o widget.
  value = value.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
  value = value.replace(/^\s{0,3}#{1,6}\s*/gm, '');
  value = value.replace(/\*\*(.*?)\*\*/g, '$1');
  value = value.replace(/__(.*?)__/g, '$1');
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  value = value.replace(/^\s*[-*]\s+/gm, '• ');

  // Bloqueia vazamento de instruções internas comuns.
  value = value.replace(/^.*No horizontal lines.*$/gmi, '');
  value = value.replace(/^.*No backticks.*$/gmi, '');
  value = value.replace(/^.*Clean text.*$/gmi, '');
  value = value.replace(/^.*Drafting the content.*$/gmi, '');
  value = value.replace(/^.*FORMATO DA RESPOSTA.*$/gmi, '');
  value = value.replace(/^.*INSTRUÇÃO INTERNA.*$/gmi, '');

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

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || 'Tempo limite excedido.')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function shouldUseDriveContext(query) {
  const q = String(query || '').toLowerCase();
  return /(financeir|d[íi]zimo|oferta|entrada|sa[íi]da|gasto|despesa|saldo|caixa|relat[óo]rio|planilha|sheet|membro|cadastro|secretaria|documento|drive|pasta|comprovante|agenda|evento|country|pink|zion|cantina|insumo|compara|trimestre|semestre|m[eê]s|janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i.test(q);
}

async function fetchDriveContext(query, churchId) {
  if (!shouldUseDriveContext(query)) {
    return {
      connected: false,
      skipped: true,
      church: { id: churchId },
      context: 'Consulta rápida: nenhuma leitura do Drive/Sheets foi necessária para esta mensagem. Responda usando a memória fixa e o contexto da igreja selecionada.'
    };
  }

  const timeoutMs = Number(process.env.ADAM_DRIVE_TIMEOUT_MS || 12000);

  try {
    return await withTimeout(
      buildDriveContext(query, { churchId }),
      timeoutMs,
      `A consulta ao Drive/Sheets passou de ${timeoutMs / 1000}s. Responda com honestidade e peça uma pergunta mais específica, sem inventar dados.`
    );
  } catch (error) {
    return {
      connected: false,
      church: { id: churchId },
      context: 'Não foi possível concluir a consulta ao Google Drive/Sheets dentro do tempo seguro. Detalhe técnico: ' + error.message + '\nRegra: se a pergunta pedir dados administrativos/financeiros, informe que a consulta não foi concluída e não invente valores.'
    };
  }
}

function buildSystemPrompt(churchName = 'ADB Sampaio') {
  const base = readMemoryFile('memoria_adam/ADAM_SYSTEM_PROMPT_ADB_SAMPAIO.txt', 'Você é Adam, Assistente Virtual da ADB Sampaio.');
  const memoria = readMemoryFile('memoria_adam/ADAM_MEMORIA_COMPLETA_ADB_SAMPAIO.md', '');

  return clip(`
${base}

IDENTIDADE DO ADAM NO APP:
- Seu nome é Adam, Assistente Virtual da ADB Administrativo Multi-Igrejas.
- Você serve ao Pastor Bernardo e à equipe da ADB.
- A igreja atualmente selecionada no app é: ${churchName}.
- Responda SOMENTE no contexto da igreja selecionada. Não misture dados de outras igrejas.
- Responda em português do Brasil.
- Seja pastoral, claro, organizado, objetivo e confiável.
- Use uma linguagem humana, simples e agradável.
- Use emojis com moderação quando ajudarem na leitura.
- Não use Markdown bruto: não use **asteriscos**, ###, ---, crases, blocos de código ou símbolos decorativos.
- Para listas, use bullets simples com “•”.
- Para assuntos bíblicos, mantenha Jesus no centro, Deus como protagonista e aplicação prática.

REGRAS DE PRECISÃO FINANCEIRA:
- Em assuntos financeiros, nunca chute valores.
- Nunca invente, ajuste ou complete valor que não esteja visível no contexto das planilhas.
- Se um valor não estiver explícito, diga que não encontrou com segurança.
- Ao calcular totais, some apenas valores claramente identificados no contexto.
- Se a linha/descrição estiver ambígua, separe como “pendente de conferência” e não some no total confirmado.
- Quando possível, informe mês, aba, linha, descrição e valor.
- Se o usuário pedir gastos de um evento, use a inteligência para identificar descrições relacionadas ao evento, mas mantenha dois grupos: confirmados e possíveis/pendentes.
- Não inclua despesas genéricas sem relação clara. Se uma despesa parecer relacionada, explique o motivo e marque como pendente.
- Se o usuário corrigir um valor, não invente outro valor; volte ao contexto, confira a linha e responda com cuidado.
- Se não houver contexto suficiente para uma resposta exata, diga isso com honestidade e peça o mês, aba ou descrição que deve ser conferida.

MEMÓRIA COMPLETA DA ADB SAMPAIO:
${memoria}
`, 120000);
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

CONTEXTO DO GOOGLE DRIVE E DAS PLANILHAS:
${driveContext.context}

INSTRUÇÃO PARA ESTA RESPOSTA:
Use a memória fixa da ADB para tom, estilo, visão bíblica e pastoral.
Use o contexto do Drive/Planilhas SOMENTE da igreja selecionada para dados administrativos e financeiros.
Para planilhas, use sempre os dados da seção “DADOS DE PLANILHAS LIDOS DIRETAMENTE PELA GOOGLE SHEETS API”. Essa seção é a fonte oficial dos valores.
Para financeiro, você pode interpretar as tabelas com inteligência, mas deve obedecer a precisão: só afirme e some valores visíveis no contexto da Sheets API. Nunca chute, nunca complete lacunas e nunca invente valores.
Se listar despesas, mostre os itens encontrados com mês, aba/linha quando disponível, descrição e valor.
Se houver itens relacionados por interpretação, deixe separado como “possíveis/pendentes de conferência” e não some no total confirmado.
Não forneça links de planilha, a menos que o usuário peça.

FORMATO:
Texto limpo, direto e legível no widget. Sem Markdown bruto. Use emojis com moderação e bullets simples.
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
        temperature: 0.18,
        topP: 0.85,
        maxOutputTokens: 5200
      }
    };

    try {
      const timeoutMs = Number(process.env.ADAM_GEMINI_TIMEOUT_MS || 25000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
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
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const body = await readJson(req);
    const message = String(body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Mensagem vazia.' });

    const churchId = String(body.churchId || 'sampaio').trim();
    const churchName = String(body.churchName || '').trim() || (churchId === 'saquarema' ? 'ADB Saquarema' : churchId === 'porto' ? 'ADB Porto da Roça' : 'ADB Sampaio');
    const driveContext = await fetchDriveContext(message, churchId);
    const systemPrompt = buildSystemPrompt(churchName);
    const result = await callGemini({
      systemPrompt,
      driveContext,
      message,
      history: body.history || []
    });

    return res.status(200).json({
      answer: result.answer,
      model: result.model,
      driveConnected: driveContext.connected,
      church: driveContext.church || { id: churchId, name: churchName }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erro interno no Adam.' });
  }
};
