const { getGoogleAccessToken } = require('./_google-auth');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const DEFAULT_FOLDER_IDS = [
  '19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL', // Documentos
  '18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM', // Controle Financeiro
  '1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6'  // Fotos dos Cultos
];

const KNOWN_SHEETS = [
  { name: 'Planilha de Membros', id: '1vX_lHJgylBPWtlGBJmVqABvPHuogv8EQYYIh1-zhj2Q', area: 'Secretaria' },
  { name: 'Janeiro 2026', id: '13jof3g97AsQz26SRHmo53pOxidhZgXWSkWRqd3SFeBo', area: 'Controle Financeiro 2026' },
  { name: 'Fevereiro 2026', id: '1sf_jfJ-PKsTN62WUwzAzpruwdaYVRFIeLeKV9h9Psqs', area: 'Controle Financeiro 2026' },
  { name: 'Março 2026', id: '11irZSKrZQaIiNT78fLTAbp_WLrCCcOlKeUlcZVce7Hs', area: 'Controle Financeiro 2026' },
  { name: 'Abril 2026', id: '1yHpksSYdCaXACUE16sb8gu2B1HZHySe1QqO0EJ1lnDc', area: 'Controle Financeiro 2026' },
  { name: 'Maio 2026', id: '1wzhKhfRPRUa1ltTu3TTBliLm5c5611-qWniwrVxUfhk', area: 'Controle Financeiro 2026' },
  { name: 'Junho 2026', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU', area: 'Controle Financeiro 2026' }
];

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function clip(text, max = 3500) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido]...' : value;
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
  const q = String(query || '').toLowerCase();
  return /(financeir|entrada|sa[ií]da|d[ií]zimo|oferta|saldo|movimento|receita|despesa|relat[oó]rio|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|2026)/.test(q);
}

function inferMembersQuestion(query) {
  const q = String(query || '').toLowerCase();
  return /(membro|cadastro|visitante|secretaria|telefone|endereço|anivers|discipulado)/.test(q);
}

async function getSheetTabs({ token, spreadsheetId }) {
  const params = new URLSearchParams({ fields: 'sheets.properties.title' });
  const data = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`, token);
  return (data.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean);
}

function quoteSheetName(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

async function readSheetPreview({ token, spreadsheetId, maxSheets = 4, maxRows = 80, maxCols = 18 }) {
  const tabs = await getSheetTabs({ token, spreadsheetId });
  const selectedTabs = tabs.slice(0, maxSheets);
  const result = [];

  for (const tab of selectedTabs) {
    const range = `${quoteSheetName(tab)}!A1:${columnName(maxCols)}${maxRows}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const data = await googleFetch(url, token);
    const rows = data.values || [];
    result.push({ tab, rows });
  }
  return result;
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

async function exportGoogleDocText({ token, fileId, mimeType }) {
  let exportMime = null;
  if (mimeType === 'application/vnd.google-apps.document') exportMime = 'text/plain';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return null;
  if (!exportMime) return null;

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  return googleFetch(url, token);
}

function rowsToText(rows, maxChars = 3500) {
  const lines = [];
  for (const row of rows || []) {
    lines.push((row || []).map((cell) => String(cell || '').trim()).join(' | '));
    if (lines.join('\n').length > maxChars) break;
  }
  return clip(lines.join('\n'), maxChars);
}

async function buildSpreadsheetContext({ token, sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  let selected = sheets;

  if (finance) selected = sheets.filter((s) => /financeiro|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|2026/i.test(`${s.name} ${s.area}`));
  if (members) selected = sheets.filter((s) => /membros|secretaria/i.test(`${s.name} ${s.area}`));
  if (!selected.length) selected = sheets.slice(0, 4);
  selected = selected.slice(0, finance ? 6 : 4);

  const sections = [];
  for (const sheet of selected) {
    try {
      const previews = await readSheetPreview({ token, spreadsheetId: sheet.id, maxSheets: 4, maxRows: 90, maxCols: 18 });
      const tabsText = previews.map((tab) => `Aba: ${tab.tab}\n${rowsToText(tab.rows, 2600)}`).join('\n\n');
      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nID: ${sheet.id}\n${tabsText}`);
    } catch (error) {
      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nNão foi possível ler esta planilha: ${error.message}`);
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
    area: 'Google Drive'
  }));
  const sheets = [...KNOWN_SHEETS, ...extraSheets];

  const [matchingFiles, recentFiles, spreadsheetContext] = await Promise.all([
    listFilesInFolders({ token, folderIds: effectiveFolderIds, query, pageSize: 35 }).catch((error) => ({ files: [], error: error.message })),
    listRecentFiles({ token, folderIds: effectiveFolderIds, pageSize: 45 }).catch((error) => ({ files: [], error: error.message })),
    buildSpreadsheetContext({ token, sheets, query }).catch((error) => `Não foi possível ler planilhas: ${error.message}`)
  ]);

  const files = (matchingFiles.files || []).length ? matchingFiles.files : (recentFiles.files || []);
  const docs = [];
  for (const file of files.slice(0, 8)) {
    if (file.mimeType === 'application/vnd.google-apps.document') {
      try {
        const text = await exportGoogleDocText({ token, fileId: file.id, mimeType: file.mimeType });
        docs.push(`DOCUMENTO: ${file.name}\nModificado em: ${file.modifiedTime}\n${clip(text, 2000)}`);
      } catch (error) {
        docs.push(`DOCUMENTO: ${file.name}\nNão foi possível exportar texto: ${error.message}`);
      }
    }
  }

  const fileList = files.map((file) => `- ${file.name} | tipo: ${file.mimeType} | modificado: ${file.modifiedTime} | link: ${file.webViewLink || ''}`).join('\n');

  const connected = true;
  const context = clip(`
CONEXÃO GOOGLE DRIVE: ativa via Service Account.
Observação: o Adam só enxerga pastas e arquivos compartilhados com o e-mail da Service Account.

ARQUIVOS/Pastas relevantes encontrados:
${fileList || 'Nenhum arquivo encontrado nas pastas compartilhadas.'}

CONTEÚDO DE DOCUMENTOS GOOGLE DOCS:
${docs.join('\n\n---\n\n') || 'Nenhum Google Docs textual encontrado no recorte atual.'}

DADOS DE PLANILHAS CONECTADAS:
${spreadsheetContext}
`, 22000);

  return { connected, context, files, matchingFilesError: matchingFiles.error, recentFilesError: recentFiles.error };
}

module.exports = { buildDriveContext };
