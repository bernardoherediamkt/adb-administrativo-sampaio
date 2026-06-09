const { getGoogleAccessToken } = require('./_google-auth');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const DEFAULT_FOLDER_IDS = [
  '19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL', // Documentos
  '18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM', // Controle Financeiro
  '1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6'  // Fotos dos Cultos
];

const KNOWN_SHEETS = [
  { name: 'Planilha de Membros', id: '1vX_lHJgylBPWtlGBJmVqABvPHuogv8EQYYIh1-zhj2Q', area: 'Secretaria', type: 'members' },
  { name: 'Janeiro 2026', id: '13jof3g97AsQz26SRHmo53pOxidhZgXWSkWRqd3SFeBo', area: 'Controle Financeiro 2026', type: 'finance', month: 1 },
  { name: 'Fevereiro 2026', id: '1sf_jfJ-PKsTN62WUwzAzpruwdaYVRFIeLeKV9h9Psqs', area: 'Controle Financeiro 2026', type: 'finance', month: 2 },
  { name: 'Março 2026', id: '11irZSKrZQaIiNT78fLTAbp_WLrCCcOlKeUlcZVce7Hs', area: 'Controle Financeiro 2026', type: 'finance', month: 3 },
  { name: 'Abril 2026', id: '1yHpksSYdCaXACUE16sb8gu2B1HZHySe1QqO0EJ1lnDc', area: 'Controle Financeiro 2026', type: 'finance', month: 4 },
  { name: 'Maio 2026', id: '1wzhKhfRPRUa1ltTu3TTBliLm5c5611-qWniwrVxUfhk', area: 'Controle Financeiro 2026', type: 'finance', month: 5 },
  { name: 'Junho 2026', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU', area: 'Controle Financeiro 2026', type: 'finance', month: 6 }
];

const MONTHS = [
  ['janeiro', 1], ['fevereiro', 2], ['marco', 3], ['abril', 4], ['maio', 5], ['junho', 6],
  ['julho', 7], ['agosto', 8], ['setembro', 9], ['outubro', 10], ['novembro', 11], ['dezembro', 12]
];

const STOPWORDS = new Set([
  'quanto','gastei','gasto','gastos','despesa','despesas','saida','saidas','entrada','entradas','valor','valores','relatorio','relatório','esse','essa','este','esta','deste','desta','dessa','desse','ano','mes','mês','semestre','primeiro','segundo','todos','todas','listar','liste','encontrou','encontrados','total','recalcule','calcule','com','para','pela','pelo','das','dos','que','foi','foram','minha','meu','meus','minhas','quero','saber','2026','igreja','adb','sampaio'
]);

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function clip(text, max = 7000) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido por limite de contexto]...' : value;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compactCell(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function googleFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text();
  if (!response.ok) {
    const message = typeof data === 'string' ? data : (data.error?.message || JSON.stringify(data));
    throw new Error(message || `Erro Google API ${response.status}`);
  }
  return data;
}

async function listFilesInFolders({ token, folderIds, query, pageSize = 35 }) {
  const terms = [];
  const cleanQuery = String(query || '').trim();
  if (cleanQuery) {
    const words = cleanQuery
      .replace(/[.,;:!?()[\]{}]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 8);
    for (const word of words) terms.push(`name contains '${escapeDriveQuery(word)}'`);
  }

  const folderClause = folderIds.length
    ? `(${folderIds.map((id) => `'${escapeDriveQuery(id)}' in parents`).join(' or ')})`
    : '';

  const qParts = ['trashed = false'];
  if (folderClause) qParts.push(folderClause);
  if (terms.length) qParts.push(`(${terms.join(' or ')})`);

  const params = new URLSearchParams({
    q: qParts.join(' and '),
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,size)'
  });

  return googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
}

async function listRecentFiles({ token, folderIds, pageSize = 50 }) {
  const folderClause = folderIds.length
    ? ` and (${folderIds.map((id) => `'${escapeDriveQuery(id)}' in parents`).join(' or ')})`
    : '';
  const params = new URLSearchParams({
    q: `trashed = false${folderClause}`,
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,size)'
  });
  return googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
}

function inferFinanceQuestion(query) {
  const q = normalizeText(query);
  return /(financeir|entrada|saida|dizimo|oferta|saldo|movimento|receita|despesa|gasto|relatorio|cantina|insumo|country|pink|zion|evento|touro|mecanico|diesel|bebida|salgado|pastel|limpeza|kids|descartav|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|semestre|2026)/.test(q);
}

function inferMembersQuestion(query) {
  const q = normalizeText(query);
  return /(membro|cadastro|visitante|secretaria|telefone|endereco|anivers|discipulado)/.test(q);
}

function inferSpreadsheetQuestion(query) {
  const q = normalizeText(query);
  return inferFinanceQuestion(query) || inferMembersQuestion(query) || /(planilha|tabela|linha|coluna|sheet|sheets)/.test(q);
}

function requestedMonths(query) {
  const q = normalizeText(query);
  const months = [];
  for (const [name, number] of MONTHS) if (q.includes(name)) months.push(number);
  if (/primeiro semestre|1 semestre|1o semestre|1º semestre|semestre/.test(q)) return [1, 2, 3, 4, 5, 6];
  if (/ano|2026|este ano|esse ano|deste ano|desse ano/.test(q) && inferFinanceQuestion(query)) return [1, 2, 3, 4, 5, 6];
  return months;
}

async function getSheetTabs({ token, spreadsheetId }) {
  const params = new URLSearchParams({ fields: 'sheets.properties(title,gridProperties(rowCount,columnCount))' });
  const data = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`, token);
  return (data.sheets || []).map((sheet) => ({
    title: sheet.properties?.title,
    rowCount: sheet.properties?.gridProperties?.rowCount || 1000,
    columnCount: sheet.properties?.gridProperties?.columnCount || 26
  })).filter((sheet) => sheet.title);
}

function quoteSheetName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function columnName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function extractQueryTerms(query) {
  const q = normalizeText(query)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  const terms = Array.from(new Set(q));
  // Termos administrativos úteis para ampliar busca sem obrigar soma automática.
  const normalized = normalizeText(query);
  if (normalized.includes('festa country')) terms.push('country');
  if (normalized.includes('pink')) terms.push('pink');
  if (normalized.includes('cantina')) terms.push('cantina', 'bebida', 'salgado', 'pastel');
  if (normalized.includes('insumo')) terms.push('limpeza', 'kids', 'biscoito', 'papelaria', 'descartavel', 'recepcao');
  return Array.from(new Set(terms)).slice(0, 12);
}

async function readSheetDataViaSheetsApi({ token, spreadsheetId, finance = false, members = false }) {
  const tabs = await getSheetTabs({ token, spreadsheetId });
  const maxSheets = finance ? 14 : 6;
  const maxRows = finance ? Number(process.env.ADAM_SHEETS_MAX_ROWS || 1200) : (members ? 700 : 300);
  const maxCols = finance ? Number(process.env.ADAM_SHEETS_MAX_COLS || 52) : (members ? 32 : 26);

  const selectedTabs = tabs.slice(0, maxSheets);
  const ranges = selectedTabs.map((tab) => {
    const cols = Math.min(Math.max(tab.columnCount || 26, 12), maxCols);
    const rows = Math.min(Math.max(tab.rowCount || 200, 100), maxRows);
    return `${quoteSheetName(tab.title)}!A1:${columnName(cols)}${rows}`;
  });

  if (!ranges.length) return [];

  // Leitura oficial por Google Sheets API. Esta é a fonte principal para planilhas.
  const params = new URLSearchParams();
  for (const range of ranges) params.append('ranges', range);
  params.set('majorDimension', 'ROWS');
  params.set('valueRenderOption', 'FORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`;
  const data = await googleFetch(url, token);

  return (data.valueRanges || []).map((vr, index) => ({
    tab: selectedTabs[index]?.title || vr.range || `Aba ${index + 1}`,
    range: vr.range,
    rows: vr.values || []
  }));
}

function rowToLine(rowIndex, row) {
  return `Linha ${rowIndex + 1}: ` + (row || []).map((cell, index) => `${columnName(index + 1)}=${compactCell(cell)}`).join(' | ');
}

function rowsToText(rows, maxChars = 12000) {
  const lines = [];
  let total = 0;
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i] || [];
    if (!row.length || row.every((cell) => compactCell(cell) === '')) continue;
    const line = rowToLine(i, row);
    total += line.length + 1;
    if (total > maxChars) {
      lines.push('...[linhas restantes reduzidas por limite de contexto]...');
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function relevantRowsToText(tabs, query, maxLines = 80, maxChars = 22000) {
  const terms = extractQueryTerms(query);
  if (!terms.length) return '';

  const matches = [];
  for (const tab of tabs) {
    const rows = tab.rows || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowText = normalizeText(row.join(' '));
      if (terms.some((term) => rowText.includes(term))) {
        matches.push(`Aba ${tab.tab} | ${rowToLine(i, row)}`);
        if (matches.length >= maxLines) break;
      }
    }
    if (matches.length >= maxLines) break;
  }

  if (!matches.length) {
    return `Nenhuma linha encontrada por busca textual automática com os termos: ${terms.join(', ')}.`;
  }

  return clip(matches.join('\n'), maxChars);
}

async function exportGoogleDocText({ token, fileId, mimeType }) {
  let exportMime = null;
  if (mimeType === 'application/vnd.google-apps.document') exportMime = 'text/plain';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return null;
  if (!exportMime) return null;

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  return googleFetch(url, token);
}

function selectSpreadsheets({ sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const months = requestedMonths(query);

  let selected = sheets;

  if (finance) {
    selected = sheets.filter((s) => s.type === 'finance' || /financeiro|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|2026/i.test(`${s.name} ${s.area}`));
    // Se a pergunta citar mês específico, lê apenas esses meses. Se citar ano/semestre/evento sem mês, lê todos os meses conhecidos.
    if (months.length) selected = selected.filter((s) => !s.month || months.includes(s.month));
  } else if (members) {
    selected = sheets.filter((s) => s.type === 'members' || /membros|secretaria/i.test(`${s.name} ${s.area}`));
  } else if (inferSpreadsheetQuestion(query)) {
    selected = sheets.slice(0, 6);
  } else {
    selected = [];
  }

  return selected.slice(0, finance ? 12 : 5);
}

async function buildSpreadsheetContext({ token, sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const selected = selectSpreadsheets({ sheets, query });

  if (!selected.length) {
    return 'Nenhuma leitura de planilha foi necessária para esta pergunta.';
  }

  const sections = [];
  for (const sheet of selected) {
    try {
      const tabs = await readSheetDataViaSheetsApi({ token, spreadsheetId: sheet.id, finance, members });
      const relevant = finance ? relevantRowsToText(tabs, query) : '';
      const tabsText = tabs
        .map((tab) => `Aba: ${tab.tab}\nIntervalo lido pela Sheets API: ${tab.range || 'não informado'}\n${rowsToText(tab.rows, finance ? 18000 : 5000)}`)
        .join('\n\n');

      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nID: ${sheet.id}\nFONTE: Google Sheets API direta, não preview do Drive.\nORIENTAÇÃO: para valores financeiros, conferir linha, coluna, descrição e tipo de lançamento antes de afirmar ou somar.\n${relevant ? `\nLINHAS POTENCIALMENTE RELEVANTES ENCONTRADAS PELA BUSCA TEXTUAL:\n${relevant}\n` : ''}\nDADOS BRUTOS LIDOS DA PLANILHA:\n${tabsText}`);
    } catch (error) {
      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nNão foi possível ler esta planilha pela Google Sheets API: ${error.message}`);
    }
  }
  return sections.join('\n\n---\n\n');
}

async function buildDriveContext(query) {
  const token = await getGoogleAccessToken([DRIVE_SCOPE, SHEETS_SCOPE]);
  const folderIds = envList('GOOGLE_DRIVE_FOLDER_IDS');
  const effectiveFolderIds = folderIds.length ? folderIds : DEFAULT_FOLDER_IDS;

  const extraSheets = envList('GOOGLE_EXTRA_SPREADSHEET_IDS').map((id, index) => ({
    name: `Planilha extra ${index + 1}`,
    id,
    area: 'Google Drive',
    type: 'extra'
  }));
  const sheets = [...KNOWN_SHEETS, ...extraSheets];

  const finance = inferFinanceQuestion(query);
  const spreadsheetQuestion = inferSpreadsheetQuestion(query);

  const spreadsheetContextPromise = buildSpreadsheetContext({ token, sheets, query }).catch((error) => `Não foi possível ler planilhas pela Google Sheets API: ${error.message}`);

  // Para perguntas de planilha/financeiro, priorizamos Sheets API e reduzimos leitura de arquivos do Drive para evitar confusão.
  const matchingFilesPromise = spreadsheetQuestion
    ? Promise.resolve({ files: [], note: 'Busca de arquivos do Drive reduzida para priorizar Google Sheets API.' })
    : listFilesInFolders({ token, folderIds: effectiveFolderIds, query, pageSize: 35 }).catch((error) => ({ files: [], error: error.message }));

  const recentFilesPromise = spreadsheetQuestion
    ? Promise.resolve({ files: [], note: 'Lista recente omitida em pergunta de planilha.' })
    : listRecentFiles({ token, folderIds: effectiveFolderIds, pageSize: 45 }).catch((error) => ({ files: [], error: error.message }));

  const [matchingFiles, recentFiles, spreadsheetContext] = await Promise.all([
    matchingFilesPromise,
    recentFilesPromise,
    spreadsheetContextPromise
  ]);

  const files = (matchingFiles.files || []).length ? matchingFiles.files : (recentFiles.files || []);
  const docs = [];
  for (const file of files.slice(0, finance ? 2 : 8)) {
    if (file.mimeType === 'application/vnd.google-apps.document') {
      try {
        const text = await exportGoogleDocText({ token, fileId: file.id, mimeType: file.mimeType });
        docs.push(`DOCUMENTO: ${file.name}\nModificado em: ${file.modifiedTime}\n${clip(text, 2200)}`);
      } catch (error) {
        docs.push(`DOCUMENTO: ${file.name}\nNão foi possível exportar texto: ${error.message}`);
      }
    }
  }

  const fileList = files.map((file) => `- ${file.name} | tipo: ${file.mimeType} | modificado: ${file.modifiedTime}`).join('\n');

  const connected = true;
  const context = clip(`
CONEXÃO GOOGLE: ativa via Service Account.
Observação: o Adam só enxerga arquivos compartilhados com o e-mail da Service Account.

MODO DE LEITURA DE PLANILHAS:
Google Sheets API direta está habilitada como fonte principal para todas as leituras de planilha. Para assuntos financeiros, os valores abaixo vêm de células reais retornadas pela Sheets API, com linha, coluna e aba quando disponíveis.

DADOS DE PLANILHAS LIDOS DIRETAMENTE PELA GOOGLE SHEETS API:
${spreadsheetContext}

ARQUIVOS/Pastas relevantes encontrados pelo Drive API:
${fileList || (spreadsheetQuestion ? 'Busca de arquivos omitida para priorizar planilhas via Sheets API.' : 'Nenhum arquivo encontrado nas pastas compartilhadas.')}

CONTEÚDO DE DOCUMENTOS GOOGLE DOCS:
${docs.join('\n\n---\n\n') || 'Nenhum Google Docs textual encontrado no recorte atual.'}
`, finance ? 150000 : 45000);

  return { connected, context, files, matchingFilesError: matchingFiles.error, recentFilesError: recentFiles.error };
}

module.exports = { buildDriveContext };
