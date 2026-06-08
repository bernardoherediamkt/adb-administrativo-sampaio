// ADB Mídia-Designer — API segura para geração de artes com Gemini
// Vercel Serverless Function. Não coloque sua chave no index.html.

const DEFAULT_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_API_VERSION = 'v1';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function cleanText(value, fallback = '') {
  return String(value || fallback).replace(/[<>]/g, '').trim();
}

function buildPrompt(body) {
  const promptFromApp = cleanText(body.prompt);
  if (promptFromApp) return promptFromApp;

  const titulo = cleanText(body.titulo, 'Evento da Igreja ADB Sampaio');
  const subtitulo = cleanText(body.subtitulo, '');
  const data = cleanText(body.data, 'Data a definir');
  const horario = cleanText(body.horario, 'Horário a definir');
  const local = cleanText(body.local, 'Igreja ADB Sampaio');
  const tipo = cleanText(body.tipo_evento, 'Culto');
  const formato = cleanText(body.formato, '3:4');
  const observacoes = cleanText(body.observacoes, 'Nenhuma observação extra.');

  return `Crie uma arte para evento da Igreja ADB Sampaio.

Projeto: ADB Mídia-Designer
Tipo de evento: ${tipo}
Título principal: ${titulo}
Subtítulo/frase: ${subtitulo || 'Sem subtítulo definido'}
Data: ${data}
Horário: ${horario}
Local: ${local}
Formato: ${formato}
Observações criativas: ${observacoes}

Estilo visual obrigatório:
- moderno, premium, editorial, worship e cinematográfico;
- identidade de igreja cristã contemporânea;
- cores principais: preto, off-white e marrom;
- detalhes discretos em dourado queimado, bege, areia ou âmbar;
- iluminação quente, atmosfera espiritual, profundidade e contraste elegante;
- composição limpa, forte e acolhedora;
- estética de culto, presença de Deus, comunhão e excelência;
- visual próprio para Instagram da ADB Sampaio;
- manter espaço de respiro para textos;
- não usar emojis;
- não usar estética infantil, cartoon, cyberpunk ou neon exagerado;
- não distorcer logotipos;
- não inventar informações além das fornecidas.

Se houver foto do preletor enviada, preserve a identidade visual da pessoa e use a imagem como elemento principal quando fizer sentido. Se houver logo da igreja enviada, utilize-a como referência oficial. Se houver imagens de referência, absorva estilo, clima e composição sem copiar de forma literal.`;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ detail: 'Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      detail: 'GEMINI_API_KEY não foi configurada no servidor.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
    const apiVersion = process.env.GEMINI_API_VERSION || DEFAULT_API_VERSION;
    const prompt = buildPrompt(body);

    const referenceImages = Array.isArray(body.reference_images) ? body.reference_images.slice(0, 6) : [];

    const parts = [
      { text: prompt + '\n\nUse as imagens enviadas como referência direta quando existirem. Preserve a aparência real do preletor sem transformar a pessoa em caricatura. Gere uma arte final limpa, premium e adequada para divulgação de igreja.' }
    ];

    for (const img of referenceImages) {
      const data = cleanText(img.data_base64);
      if (!data) continue;
      const mimeType = cleanText(img.mime_type, 'image/jpeg');
      const role = cleanText(img.role, 'Imagem de referência');
      parts.push({ text: `A próxima imagem deve ser considerada como: ${role}.` });
      parts.push({
        inlineData: {
          mimeType,
          data
        }
      });
    }

    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`;

    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    const json = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const message = json && json.error && json.error.message ? json.error.message : 'Erro na API do Gemini.';
      return res.status(geminiResponse.status).json({ detail: message, raw: json && json.error ? json.error : null });
    }

    const outputParts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts
      ? json.candidates[0].content.parts
      : [];
    const imagePart = outputParts.find(part => part.inlineData && part.inlineData.data);
    const textPartObj = outputParts.find(part => part.text);
    const textPart = textPartObj ? textPartObj.text : '';

    if (!imagePart) {
      return res.status(502).json({
        detail: textPart || 'O Gemini respondeu, mas não retornou imagem.',
        raw: json
      });
    }

    return res.status(200).json({
      status: 'ok',
      mime_type: imagePart.inlineData.mimeType || 'image/png',
      image_base64: imagePart.inlineData.data,
      text: textPart
    });
  } catch (error) {
    return res.status(500).json({
      detail: error && error.message ? error.message : 'Erro interno ao gerar a arte.'
    });
  }
};
