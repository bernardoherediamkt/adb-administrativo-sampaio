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
  { name: 'Janeiro 2026', id: '13jof3g97AsQz26SRHmo53pOxidhZgXWSkWRqd3SFeBo', area: 'Controle Financeiro 2026', type: 'finance', month: 1, year: 2026 },
  { name: 'Fevereiro 2026', id: '1sf_jfJ-PKsTN62WUwzAzpruwdaYVRFIeLeKV9h9Psqs', area: 'Controle Financeiro 2026', type: 'finance', month: 2, year: 2026 },
  { name: 'Março 2026', id: '11irZSKrZQaIiNT78fLTAbp_WLrCCcOlKeUlcZVce7Hs', area: 'Controle Financeiro 2026', type: 'finance', month: 3, year: 2026 },
  { name: 'Abril 2026', id: '1yHpksSYdCaXACUE16sb8gu2B1HZHySe1QqO0EJ1lnDc', area: 'Controle Financeiro 2026', type: 'finance', month: 4, year: 2026 },
  { name: 'Maio 2026', id: '1wzhKhfRPRUa1ltTu3TTBliLm5c5611-qWniwrVxUfhk', area: 'Controle Financeiro 2026', type: 'finance', month: 5, year: 2026 },
  { name: 'Junho 2026', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 }
];

const MONTHS = [
  ['janeiro', 1], ['fevereiro', 2], ['marco', 3], ['março', 3], ['abril', 4], ['maio', 5], ['junho', 6],
  ['julho', 7], ['agosto', 8], ['setembro', 9], ['outubro', 10], ['novembro', 11], ['dezembro', 12]
];

const STOPWORDS = new Set([
  'quanto','gastei','gasto','gastos','despesa','despesas','saida','saidas','entrada','entradas','valor','valores','relatorio','relatório','esse','essa','este','esta','deste','desta','dessa','desse','ano','mes','mês','semestre','primeiro','segundo','todos','todas','listar','liste','encontrou','encontrados','total','recalcule','calcule','com','para','pela','pelo','das','dos','que','foi','foram','minha','meu','meus','minhas','quero','saber','igreja','adb','sampaio','voce','você','pode','preciso','ultimos','últimos','mais','recentes'
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

async function listAllAccessibleSpreadsheets({ token, pageSize = 120 }) {
  const q = "trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'";
  const params = new URLSearchParams({
    q,
    pageSize: String(Number(process.env.ADAM_DISCOVER_SHEETS_LIMIT || pageSize)),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)'
  });
  const data = await googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  return data.files || [];
}

function inferSheetMeta(file) {
  const text = normalizeText(file.name);
  const monthMatch = MONTHS.find(([name]) => text.includes(normalizeText(name)));
  const yearMatch = text.match(/20\d{2}/);
  const type = /(membro|cadastro|visitante|secretaria)/.test(text)
    ? 'members'
    : /(financeir|dizimo|dizimos|oferta|entrada|saida|caixa|controle|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/.test(text)
      ? 'finance'
      : 'discovered';
  return {
    name: file.name,
    id: file.id,
    area: 'Planilhas descobertas no Drive',
    type,
    month: monthMatch ? monthMatch[1] : null,
    year: yearMatch ? Number(yearMatch[0]) : null,
    modifiedTime: file.modifiedTime,
    discovered: true
  };
}

function mergeSheets(known, discovered) {
  const byId = new Map();
  for (const sheet of [...known, ...discovered]) {
    const existing = byId.get(sheet.id);
    if (!existing) byId.set(sheet.id, sheet);
    else byId.set(sheet.id, { ...existing, ...sheet, type: existing.type !== 'discovered' ? existing.type : sheet.type });
  }
  return Array.from(byId.values());
}

function inferFinanceQuestion(query) {
  const q = normalizeText(query);
  return /(financeir|entrada|saida|dizimo|dizimos|oferta|saldo|movimento|receita|despesa|gasto|relatorio|cantina|insumo|country|pink|zion|evento|touro|mecanico|diesel|bebida|salgado|pastel|limpeza|kids|descartav|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|trimestre|semestre|faturamento|comparar|comparativo|2025|2026|ano passado)/.test(q);
}

function inferMembersQuestion(query) {
  const q = normalizeText(query);
  return /(membro|membros|cadastro|cadastraram|cadastrado|visitante|secretaria|telefone|endereco|anivers|discipulado)/.test(q);
}

function inferSpreadsheetQuestion(query) {
  const q = normalizeText(query);
  return inferFinanceQuestion(query) || inferMembersQuestion(query) || /(planilha|tabela|linha|coluna|sheet|sheets)/.test(q);
}

function requestedYears(query) {
  const q = normalizeText(query);
  const years = new Set();
  for (const match of q.matchAll(/20\d{2}/g)) years.add(Number(match[0]));
  if (/ano passado|ano anterior|passado/.test(q)) years.add(2025);
  if (/esse ano|este ano|desse ano|deste ano|atual|2026/.test(q)) years.add(2026);
  if (/comparar|comparativo/.test(q) && years.size === 1) {
    const y = Array.from(years)[0];
    years.add(y - 1);
  }
  return Array.from(years).sort();
}

function requestedMonths(query) {
  const q = normalizeText(query);
  const months = [];
  for (const [name, number] of MONTHS) if (q.includes(normalizeText(name))) months.push(number);
  if (/primeiro trimestre|1 trimestre|1o trimestre|1º trimestre/.test(q)) return [1, 2, 3];
  if (/segundo trimestre|2 trimestre|2o trimestre|2º trimestre/.test(q)) return [4, 5, 6];
  if (/primeiro semestre|1 semestre|1o semestre|1º semestre|semestre/.test(q)) return [1, 2, 3, 4, 5, 6];
  if (/ano|2026|2025|este ano|esse ano|deste ano|desse ano|ano passado/.test(q) && inferFinanceQuestion(query)) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
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
  const normalized = normalizeText(query);
  if (normalized.includes('festa country')) terms.push('country');
  if (normalized.includes('pink')) terms.push('pink');
  if (normalized.includes('cantina')) terms.push('cantina', 'bebida', 'salgado', 'pastel');
  if (normalized.includes('insumo')) terms.push('limpeza', 'kids', 'biscoito', 'papelaria', 'descartavel', 'recepcao');
  if (normalized.includes('membro') || normalized.includes('cadastro')) terms.push('membro', 'cadastro', 'nome', 'data');
  return Array.from(new Set(terms)).slice(0, 18);
}

async function readSheetDataViaSheetsApi({ token, spreadsheetId, finance = false, members = false }) {
  const tabs = await getSheetTabs({ token, spreadsheetId });
  const maxSheets = finance ? Number(process.env.ADAM_SHEETS_MAX_TABS_FINANCE || 16) : (members ? 12 : 8);
  const maxRows = finance ? Number(process.env.ADAM_SHEETS_MAX_ROWS || 1600) : (members ? Number(process.env.ADAM_MEMBERS_MAX_ROWS || 2000) : 500);
  const maxCols = finance ? Number(process.env.ADAM_SHEETS_MAX_COLS || 60) : (members ? 45 : 32);

  const selectedTabs = tabs.slice(0, maxSheets);
  const ranges = selectedTabs.map((tab) => {
    const cols = Math.min(Math.max(tab.columnCount || 26, 12), maxCols);
    const rows = Math.min(Math.max(tab.rowCount || 200, 100), maxRows);
    return `${quoteSheetName(tab.title)}!A1:${columnName(cols)}${rows}`;
  });

  if (!ranges.length) return [];

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

function relevantRowsToText(tabs, query, maxLines = 120, maxChars = 30000) {
  const terms = extractQueryTerms(query);
  if (!terms.length) return '';

  const matches = [];
  for (const tab of tabs) {
    const rows = tab.rows || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowText = normalizeText(row.join(' '));
      if (terms.some((term) => rowText.includes(normalizeText(term)))) {
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

function sheetSearchScore(sheet, query) {
  const q = normalizeText(query);
  const name = normalizeText(`${sheet.name} ${sheet.area || ''}`);
  let score = 0;
  for (const term of extractQueryTerms(query)) {
    if (name.includes(normalizeText(term))) score += 8;
  }
  for (const y of requestedYears(query)) {
    if (sheet.year === y || name.includes(String(y))) score += 10;
  }
  for (const m of requestedMonths(query)) {
    if (sheet.month === m) score += 6;
    const monthNames = MONTHS.filter(([, n]) => n === m).map(([mn]) => normalizeText(mn));
    if (monthNames.some((mn) => name.includes(mn))) score += 4;
  }
  if (inferFinanceQuestion(query) && (sheet.type === 'finance' || /(financeir|controle|caixa|entrada|saida|dizimo|oferta)/.test(name))) score += 8;
  if (inferMembersQuestion(query) && (sheet.type === 'members' || /(membro|cadastro|visitante|secretaria|form)/.test(name))) score += 12;
  if (sheet.discovered) score += 1;
  return score;
}

function selectSpreadsheets({ sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const months = requestedMonths(query);
  const years = requestedYears(query);

  let selected = [];
  if (finance) {
    selected = sheets
      .map((s) => ({ ...s, score: sheetSearchScore(s, query) }))
      .filter((s) => {
        if (s.score >= 8) return true;
        const name = normalizeText(`${s.name} ${s.area || ''}`);
        if (months.length && months.some((m) => MONTHS.filter(([, n]) => n === m).some(([mn]) => name.includes(normalizeText(mn))))) return true;
        if (years.length && years.some((y) => name.includes(String(y)))) return true;
        return false;
      })
      .sort((a, b) => b.score - a.score || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  } else if (members) {
    selected = sheets
      .map((s) => ({ ...s, score: sheetSearchScore(s, query) }))
      .filter((s) => s.score >= 8 || /(membro|cadastro|visitante|secretaria|form)/.test(normalizeText(`${s.name} ${s.area || ''}`)))
      .sort((a, b) => b.score - a.score || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  } else if (inferSpreadsheetQuestion(query)) {
    selected = sheets
      .map((s) => ({ ...s, score: sheetSearchScore(s, query) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  }

  const limit = finance ? Number(process.env.ADAM_MAX_FINANCE_SHEETS || 24) : (members ? Number(process.env.ADAM_MAX_MEMBER_SHEETS || 10) : 8);
  return selected.slice(0, limit);
}

async function buildSpreadsheetContext({ token, sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const selected = selectSpreadsheets({ sheets, query });

  if (!selected.length) {
    return 'Nenhuma leitura de planilha foi necessária ou nenhuma planilha compatível foi localizada na lista de arquivos acessíveis pela Service Account.';
  }

  const sections = [];
  sections.push(`ÍNDICE DE PLANILHAS SELECIONADAS PARA ESTA PERGUNTA:\n${selected.map((s, i) => `${i + 1}. ${s.name} | ID: ${s.id} | tipo: ${s.type || 'não classificado'} | ano: ${s.year || 'não identificado'} | mês: ${s.month || 'não identificado'} | origem: ${s.discovered ? 'descoberta no Drive' : 'fixa no app'}`).join('\n')}`);

  for (const sheet of selected) {
    try {
      const tabs = await readSheetDataViaSheetsApi({ token, spreadsheetId: sheet.id, finance, members });
      const relevant = relevantRowsToText(tabs, query, finance ? 140 : 120, finance ? 35000 : 30000);
      const tabsText = tabs
        .map((tab) => `Aba: ${tab.tab}\nIntervalo lido pela Sheets API: ${tab.range || 'não informado'}\n${rowsToText(tab.rows, finance ? 20000 : 16000)}`)
        .join('\n\n');

      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nID: ${sheet.id}\nFONTE: Google Sheets API direta.\nORIENTAÇÃO: conferir cabeçalhos, colunas, tipo de lançamento, descrição, data e valor antes de afirmar ou somar. Para membros, identificar a coluna de data de cadastro e ordenar do mais recente para o mais antigo.\n${relevant ? `\nLINHAS POTENCIALMENTE RELEVANTES ENCONTRADAS PELA BUSCA TEXTUAL:\n${relevant}\n` : ''}\nDADOS BRUTOS LIDOS DA PLANILHA:\n${tabsText}`);
    } catch (error) {
      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nID: ${sheet.id}\nNão foi possível ler esta planilha pela Google Sheets API: ${error.message}`);
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

  const discoveredFiles = await listAllAccessibleSpreadsheets({ token }).catch((error) => {
    console.warn('Não foi possível descobrir planilhas globais:', error.message);
    return [];
  });
  const discoveredSheets = discoveredFiles.map(inferSheetMeta);
  const sheets = mergeSheets([...KNOWN_SHEETS, ...extraSheets], discoveredSheets);

  const finance = inferFinanceQuestion(query);
  const spreadsheetQuestion = inferSpreadsheetQuestion(query);

  const spreadsheetContextPromise = buildSpreadsheetContext({ token, sheets, query }).catch((error) => `Não foi possível ler planilhas pela Google Sheets API: ${error.message}`);

  const matchingFilesPromise = spreadsheetQuestion
    ? Promise.resolve({ files: discoveredFiles.slice(0, 60), note: 'Planilhas descobertas globalmente pelo Drive API para seleção via Sheets API.' })
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

  const fileList = files.map((file) => `- ${file.name} | ID: ${file.id} | tipo: ${file.mimeType} | modificado: ${file.modifiedTime}`).join('\n');
  const allSheetsIndex = discoveredSheets.slice(0, 100).map((s) => `- ${s.name} | ID: ${s.id} | tipo inferido: ${s.type} | ano: ${s.year || 'não identificado'} | mês: ${s.month || 'não identificado'} | modificado: ${s.modifiedTime || ''}`).join('\n');

  const connected = true;
  const context = clip(`
CONEXÃO GOOGLE: ativa via Service Account.
Observação: a Service Account só enxerga arquivos compartilhados com ela, diretamente ou por pastas compartilhadas. O Adam agora faz descoberta global de planilhas visíveis para a Service Account, não apenas as planilhas fixas de 2026.

ÍNDICE GLOBAL DE PLANILHAS VISÍVEIS PARA A SERVICE ACCOUNT:
${allSheetsIndex || 'Nenhuma planilha descoberta globalmente. Verifique se as planilhas foram compartilhadas com a Service Account.'}

MODO DE LEITURA DE PLANILHAS:
Google Sheets API direta é a fonte principal. Para assuntos financeiros e de membros, a seleção agora combina planilhas fixas + planilhas descobertas no Drive por nome, ano, mês e termos da pergunta.

DADOS DE PLANILHAS LIDOS DIRETAMENTE PELA GOOGLE SHEETS API:
${spreadsheetContext}

ARQUIVOS/Planilhas relevantes encontrados pelo Drive API:
${fileList || (spreadsheetQuestion ? 'Nenhum arquivo adicional encontrado.' : 'Nenhum arquivo encontrado nas pastas compartilhadas.')}

CONTEÚDO DE DOCUMENTOS GOOGLE DOCS:
${docs.join('\n\n---\n\n') || 'Nenhum Google Docs textual encontrado no recorte atual.'}
`, finance ? 180000 : 70000);

  return { connected, context, files, discoveredSheets: discoveredSheets.length, matchingFilesError: matchingFiles.error, recentFilesError: recentFiles.error };
}

module.exports = { buildDriveContext };
