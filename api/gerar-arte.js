// ADB Mídia-Designer — API segura para geração de artes
// Vercel Serverless Function. Não coloque sua chave no index.html.
// Suporta dois modos:
// 1) Imagen 4 (gratuito no seu projeto): texto -> imagem, endpoint :predict v1beta
// 2) Gemini Image / Nano Banana: texto + imagens -> imagem, endpoint :generateContent

const DEFAULT_MODEL = 'imagen-4.0-fast-generate-001';
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

function normalizeAspectRatio(value) {
  const ratio = cleanText(value, '3:4');
  const allowed = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  return allowed.includes(ratio) ? ratio : '3:4';
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

function buildImagenPrompt(body) {
  const titulo = cleanText(body.titulo, 'Church Event');
  const subtitulo = cleanText(body.subtitulo, '');
  const tipo = cleanText(body.tipo_evento, 'Church service');
  const observacoes = cleanText(body.observacoes, '');

  // Imagen recomenda prompts em inglês e tem limite curto de tokens.
  // Por isso o prompt abaixo é focado no visual, sem depender de texto longo dentro da imagem.
  return `Premium modern church event poster background for ADB Sampaio church. Event theme: ${tipo}. Main headline context: ${titulo}. ${subtitulo ? `Secondary context: ${subtitulo}.` : ''} Editorial worship design, cinematic warm lighting, elegant black, off-white and brown color palette, subtle burnt gold and beige accents, spiritual atmosphere, clean strong composition, professional Instagram church banner, depth, soft shadows, refined typography-safe empty space for title and event details, no readable text, no logo, no emojis, not cartoon, not cyberpunk, not neon. ${observacoes ? `Creative note: ${observacoes}.` : ''}`;
}

function extractGeminiImage(json) {
  const outputParts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts
    ? json.candidates[0].content.parts
    : [];
  const imagePart = outputParts.find(part => part.inlineData && part.inlineData.data);
  const textPartObj = outputParts.find(part => part.text);
  return {
    data: imagePart && imagePart.inlineData ? imagePart.inlineData.data : '',
    mimeType: imagePart && imagePart.inlineData ? (imagePart.inlineData.mimeType || 'image/png') : 'image/png',
    text: textPartObj ? textPartObj.text : ''
  };
}

function extractImagenImage(json) {
  const prediction = json && Array.isArray(json.predictions) ? json.predictions[0] : null;
  if (!prediction) return { data: '', mimeType: 'image/png' };

  const data = prediction.bytesBase64Encoded
    || prediction.bytes_base64_encoded
    || (prediction.image && (prediction.image.bytesBase64Encoded || prediction.image.bytes_base64_encoded || prediction.image.imageBytes))
    || prediction.imageBytes
    || '';

  const mimeType = prediction.mimeType
    || prediction.mime_type
    || (prediction.image && (prediction.image.mimeType || prediction.image.mime_type))
    || 'image/png';

  return { data, mimeType };
}

async function callImagen({ apiKey, model, body }) {
  const prompt = buildImagenPrompt(body);
  const aspectRatio = normalizeAspectRatio(body.formato);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      instances: [
        { prompt }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio,
        personGeneration: 'allow_adult'
      }
    })
  });

  const json = await response.json();

  if (!response.ok) {
    const message = json && json.error && json.error.message ? json.error.message : 'Erro na API Imagen.';
    return { ok: false, status: response.status, detail: message, raw: json && json.error ? json.error : json };
  }

  const image = extractImagenImage(json);
  if (!image.data) {
    return { ok: false, status: 502, detail: 'Imagen respondeu, mas não retornou imagem.', raw: json };
  }

  return {
    ok: true,
    status: 200,
    data: {
      status: 'ok',
      provider: 'imagen',
      model,
      mime_type: image.mimeType,
      image_base64: image.data,
      text: 'Arte gerada com Imagen 4. Observação: neste modo gratuito, imagens enviadas como foto do preletor/referência não são usadas diretamente; elas ficam preparadas para o modo Nano Banana quando sua cota estiver liberada.'
    }
  };
}

async function callGeminiImage({ apiKey, model, apiVersion, body }) {
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
      inlineData: { mimeType, data }
    });
  }

  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts }]
    })
  });

  const json = await response.json();

  if (!response.ok) {
    const message = json && json.error && json.error.message ? json.error.message : 'Erro na API do Gemini.';
    return { ok: false, status: response.status, detail: message, raw: json && json.error ? json.error : null };
  }

  const image = extractGeminiImage(json);
  if (!image.data) {
    return { ok: false, status: 502, detail: image.text || 'O Gemini respondeu, mas não retornou imagem.', raw: json };
  }

  return {
    ok: true,
    status: 200,
    data: {
      status: 'ok',
      provider: 'gemini-image',
      model,
      mime_type: image.mimeType,
      image_base64: image.data,
      text: image.text
    }
  };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Use POST.' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ detail: 'GEMINI_API_KEY não foi configurada no servidor.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
    const apiVersion = process.env.GEMINI_API_VERSION || DEFAULT_API_VERSION;

    const result = String(model).startsWith('imagen-')
      ? await callImagen({ apiKey, model, body })
      : await callGeminiImage({ apiKey, model, apiVersion, body });

    if (!result.ok) {
      return res.status(result.status || 500).json({ detail: result.detail, raw: result.raw || null });
    }

    return res.status(200).json(result.data);
  } catch (error) {
    return res.status(500).json({ detail: error && error.message ? error.message : 'Erro interno ao gerar a arte.' });
  }
};
