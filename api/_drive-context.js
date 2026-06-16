const { getGoogleAccessToken } = require('./_google-auth');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const MONTHS = [
  ['janeiro', 1], ['fevereiro', 2], ['marco', 3], ['março', 3], ['abril', 4], ['maio', 5], ['junho', 6],
  ['julho', 7], ['agosto', 8], ['setembro', 9], ['outubro', 10], ['novembro', 11], ['dezembro', 12]
];

const CHURCHES = {
  sampaio: {
    id: 'sampaio',
    name: 'ADB Sampaio',
    rootNames: ['ADB Sampaio'],
    envRoot: 'ADB_SAMPAIO_ROOT_FOLDER_ID',
    knownSheets: [
      { name: 'Planilha de Membros - Sampaio', id: '1vX_lHJgylBPWtlGBJmVqABvPHuogv8EQYYIh1-zhj2Q', area: 'Secretaria', type: 'members' },
      { name: 'Janeiro 2026 - Sampaio', id: '13jof3g97AsQz26SRHmo53pOxidhZgXWSkWRqd3SFeBo', area: 'Controle Financeiro 2026', type: 'finance', month: 1, year: 2026 },
      { name: 'Fevereiro 2026 - Sampaio', id: '1sf_jfJ-PKsTN62WUwzAzpruwdaYVRFIeLeKV9h9Psqs', area: 'Controle Financeiro 2026', type: 'finance', month: 2, year: 2026 },
      { name: 'Março 2026 - Sampaio', id: '11irZSKrZQaIiNT78fLTAbp_WLrCCcOlKeUlcZVce7Hs', area: 'Controle Financeiro 2026', type: 'finance', month: 3, year: 2026 },
      { name: 'Abril 2026 - Sampaio', id: '1yHpksSYdCaXACUE16sb8gu2B1HZHySe1QqO0EJ1lnDc', area: 'Controle Financeiro 2026', type: 'finance', month: 4, year: 2026 },
      { name: 'Maio 2026 - Sampaio', id: '1wzhKhfRPRUa1ltTu3TTBliLm5c5611-qWniwrVxUfhk', area: 'Controle Financeiro 2026', type: 'finance', month: 5, year: 2026 },
      { name: 'Junho 2026 - Sampaio', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 }
    ]
  },
  saquarema: {
    id: 'saquarema',
    name: 'ADB Saquarema',
    rootNames: ['ADB Saquarema'],
    envRoot: 'ADB_SAQUAREMA_ROOT_FOLDER_ID',
    knownSheets: [
      { name: 'Planilha de Membros - Saquarema', id: '1ZAzTXKlTEKsR8UsHkLenxrluZc2pAKvOXz8ylknOk9o', area: 'Secretaria', type: 'members' },
      { name: 'Junho 2026 - Saquarema', id: '1ijOYDwj7FNf8L4L86kEUWkFJOPG-uyKqbr_LZiKKVUE', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 }
    ]
  },
  porto: {
    id: 'porto',
    name: 'ADB Porto da Roça',
    rootNames: ['ADB Porto da Roça', 'ADB Porto da Roca'],
    envRoot: 'ADB_PORTO_ROOT_FOLDER_ID',
    knownSheets: [
      { name: 'Planilha de Membros - Porto da Roça', id: '1avnGceb36i1Ohh3d-j5WBPOJMqFjBboSOxLOmt1WVSc', area: 'Secretaria', type: 'members' },
      { name: 'Junho 2026 - Porto da Roça', id: '1hnFlwQSK8hwHybqqVcIqxIKz1ofeAs_1Nooki-Wk8OI', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 }
    ]
  }
};

const STOPWORDS = new Set([
  'quanto','gastei','gasto','gastos','despesa','despesas','saida','saidas','entrada','entradas','valor','valores','relatorio','relatório','esse','essa','este','esta','deste','desta','dessa','desse','ano','mes','mês','semestre','primeiro','segundo','todos','todas','listar','liste','encontrou','encontrados','total','recalcule','calcule','com','para','pela','pelo','das','dos','que','foi','foram','minha','meu','meus','minhas','quero','saber','igreja','adb','voce','você','pode','preciso','ultimos','últimos','mais','recentes','comparar','compare','relacione'
]);

function envList(name) {
  return String(process.env[name] || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function clip(text, max = 90000) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido por limite de contexto]...' : value;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function compactCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function googleFetch(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const message = typeof data === 'string' ? data : (data.error?.message || JSON.stringify(data));
    throw new Error(message || `Erro Google API ${response.status}`);
  }
  return data;
}

function getChurch(churchId) {
  return CHURCHES[churchId] || CHURCHES.sampaio;
}

async function findRootFolders({ token, church }) {
  const envRoots = envList(church.envRoot);
  if (envRoots.length) return envRoots.map((id) => ({ id, name: `${church.name} (env)` }));

  const nameClauses = church.rootNames.map((name) => `name = '${escapeDriveQuery(name)}'`).join(' or ');
  const params = new URLSearchParams({
    q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and (${nameClauses})`,
    pageSize: '10',
    fields: 'files(id,name,mimeType,parents,modifiedTime,webViewLink)'
  });
  const data = await googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  return data.files || [];
}

async function listChildren({ token, parentId, mimeType = null, pageSize = 100 }) {
  const qParts = [`trashed = false`, `'${escapeDriveQuery(parentId)}' in parents`];
  if (mimeType) qParts.push(`mimeType = '${mimeType}'`);
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: qParts.join(' and '),
      pageSize: String(pageSize),
      fields: 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,size)',
      orderBy: 'folder,name'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken && files.length < 1000);
  return files;
}

async function listFolderTree({ token, rootFolders, maxDepth = 4 }) {
  const seen = new Set();
  const allFolders = [];
  let frontier = rootFolders.map((f) => ({ ...f, depth: 0 }));

  while (frontier.length) {
    const next = [];
    for (const folder of frontier) {
      if (!folder.id || seen.has(folder.id)) continue;
      seen.add(folder.id);
      allFolders.push(folder);
      if (folder.depth >= maxDepth) continue;
      const children = await listChildren({ token, parentId: folder.id, mimeType: 'application/vnd.google-apps.folder', pageSize: 100 }).catch(() => []);
      for (const child of children) next.push({ ...child, depth: folder.depth + 1 });
    }
    frontier = next;
  }
  return allFolders;
}

async function listFilesInsideFolders({ token, folderIds, mimeType = null, limit = 240 }) {
  const files = [];
  for (const folderId of folderIds.slice(0, 120)) {
    const children = await listChildren({ token, parentId: folderId, mimeType, pageSize: 100 }).catch(() => []);
    files.push(...children);
    if (files.length >= limit) break;
  }
  const byId = new Map();
  for (const file of files) byId.set(file.id, file);
  return Array.from(byId.values()).slice(0, limit);
}

function inferSheetMeta(file, church) {
  const text = normalizeText(file.name);
  const monthMatch = MONTHS.find(([name]) => text.includes(normalizeText(name)));
  const yearMatch = text.match(/20\d{2}/);
  const type = /(membro|cadastro|visitante|secretaria)/.test(text)
    ? 'members'
    : /(financeir|dizimo|dizimos|oferta|entrada|saida|caixa|controle|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|relatorio|relatório)/.test(text)
      ? 'finance'
      : 'discovered';
  return {
    name: file.name,
    id: file.id,
    area: `Planilhas de ${church.name}`,
    churchId: church.id,
    type,
    month: monthMatch ? monthMatch[1] : null,
    year: yearMatch ? Number(yearMatch[0]) : null,
    modifiedTime: file.modifiedTime,
    discovered: true
  };
}

function mergeSheets(known, discovered, church) {
  const byId = new Map();
  for (const sheet of [...known.map((s) => ({ ...s, churchId: church.id })), ...discovered]) {
    const existing = byId.get(sheet.id);
    byId.set(sheet.id, existing ? { ...existing, ...sheet, type: existing.type !== 'discovered' ? existing.type : sheet.type } : sheet);
  }
  return Array.from(byId.values());
}

function inferFinanceQuestion(query) {
  const q = normalizeText(query);
  return /(financeir|entrada|saida|saída|dizimo|dizimos|oferta|saldo|movimento|receita|despesa|gasto|relatorio|relatório|cantina|insumo|country|pink|zion|evento|touro|mecanico|mecânico|diesel|bebida|salgado|pastel|limpeza|kids|descartav|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|trimestre|semestre|faturamento|comparar|comparativo|2025|2026|ano passado)/.test(q);
}

function inferMembersQuestion(query) {
  const q = normalizeText(query);
  return /(membro|membros|cadastro|cadastraram|cadastrado|visitante|secretaria|telefone|endereco|endereço|anivers|discipulado)/.test(q);
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
  if (/comparar|comparativo|compare/.test(q) && years.size === 1) years.add(Array.from(years)[0] - 1);
  return Array.from(years).sort();
}

function requestedMonths(query) {
  const q = normalizeText(query);
  const months = [];
  for (const [name, number] of MONTHS) if (q.includes(normalizeText(name))) months.push(number);
  if (/primeiro trimestre|1 trimestre|1o trimestre|1º trimestre/.test(q)) return [1, 2, 3];
  if (/segundo trimestre|2 trimestre|2o trimestre|2º trimestre/.test(q)) return [4, 5, 6];
  if (/primeiro semestre|1 semestre|1o semestre|1º semestre|semestre/.test(q)) return [1, 2, 3, 4, 5, 6];
  if (/ano|2026|2025|este ano|esse ano|deste ano|desse ano|ano passado/.test(q) && inferFinanceQuestion(query)) return [1,2,3,4,5,6,7,8,9,10,11,12];
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

function quoteSheetName(name) { return `'${String(name).replace(/'/g, "''")}'`; }
function columnName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); } return s; }
function rowToLine(rowIndex, row) { return `Linha ${rowIndex + 1}: ` + (row || []).map((cell, index) => `${columnName(index + 1)}=${compactCell(cell)}`).join(' | '); }

function extractQueryTerms(query) {
  const q = normalizeText(query).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const terms = Array.from(new Set(q));
  const normalized = normalizeText(query);
  if (normalized.includes('festa country')) terms.push('country', 'touro', 'festa');
  if (normalized.includes('pink')) terms.push('pink', 'conference', 'mulheres');
  if (normalized.includes('cantina')) terms.push('cantina', 'bebida', 'salgado', 'pastel', 'massa', 'alimento');
  if (normalized.includes('insumo')) terms.push('limpeza', 'kids', 'biscoito', 'papelaria', 'descartavel', 'recepcao', 'recepção');
  if (normalized.includes('membro') || normalized.includes('cadastro')) terms.push('membro', 'cadastro', 'nome', 'data');
  return Array.from(new Set(terms)).slice(0, 24);
}

async function readSheetDataViaSheetsApi({ token, spreadsheetId, finance = false, members = false }) {
  const tabs = await getSheetTabs({ token, spreadsheetId });
  const maxSheets = finance ? Number(process.env.ADAM_SHEETS_MAX_TABS_FINANCE || 18) : (members ? 14 : 8);
  const maxRows = finance ? Number(process.env.ADAM_SHEETS_MAX_ROWS || 1800) : (members ? Number(process.env.ADAM_MEMBERS_MAX_ROWS || 2500) : 700);
  const maxCols = finance ? Number(process.env.ADAM_SHEETS_MAX_COLS || 64) : (members ? 52 : 36);
  const selectedTabs = tabs.slice(0, maxSheets);
  const ranges = selectedTabs.map((tab) => `${quoteSheetName(tab.title)}!A1:${columnName(Math.min(Math.max(tab.columnCount || 26, 12), maxCols))}${Math.min(Math.max(tab.rowCount || 200, 100), maxRows)}`);
  if (!ranges.length) return [];
  const params = new URLSearchParams();
  for (const range of ranges) params.append('ranges', range);
  params.set('majorDimension', 'ROWS');
  params.set('valueRenderOption', 'FORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');
  const data = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`, token);
  return (data.valueRanges || []).map((vr, index) => ({ tab: selectedTabs[index]?.title || vr.range || `Aba ${index + 1}`, range: vr.range, rows: vr.values || [] }));
}

function rowsToText(rows, maxChars = 14000) {
  const lines = [];
  let total = 0;
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i] || [];
    if (!row.length || row.every((cell) => compactCell(cell) === '')) continue;
    const line = rowToLine(i, row);
    total += line.length + 1;
    if (total > maxChars) { lines.push('...[linhas restantes reduzidas por limite de contexto]...'); break; }
    lines.push(line);
  }
  return lines.join('\n');
}

function relevantRowsToText(tabs, query, maxLines = 160, maxChars = 40000) {
  const terms = extractQueryTerms(query);
  if (!terms.length) return '';
  const matches = [];
  for (const tab of tabs) {
    const rows = tab.rows || [];
    for (let i = 0; i < rows.length; i++) {
      const rowText = normalizeText((rows[i] || []).join(' '));
      if (terms.some((term) => rowText.includes(normalizeText(term)))) {
        matches.push(`Aba ${tab.tab} | ${rowToLine(i, rows[i])}`);
        if (matches.length >= maxLines) break;
      }
    }
    if (matches.length >= maxLines) break;
  }
  return matches.length ? clip(matches.join('\n'), maxChars) : `Nenhuma linha encontrada por busca textual automática com os termos: ${terms.join(', ')}.`;
}

async function exportGoogleDocText({ token, fileId, mimeType }) {
  if (mimeType !== 'application/vnd.google-apps.document') return null;
  return googleFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent('text/plain')}`, token);
}

function sheetSearchScore(sheet, query) {
  const name = normalizeText(`${sheet.name} ${sheet.area || ''}`);
  let score = 0;
  for (const term of extractQueryTerms(query)) if (name.includes(normalizeText(term))) score += 8;
  for (const y of requestedYears(query)) if (sheet.year === y || name.includes(String(y))) score += 10;
  for (const m of requestedMonths(query)) {
    if (sheet.month === m) score += 6;
    const monthNames = MONTHS.filter(([, n]) => n === m).map(([mn]) => normalizeText(mn));
    if (monthNames.some((mn) => name.includes(mn))) score += 4;
  }
  if (inferFinanceQuestion(query) && (sheet.type === 'finance' || /(financeir|controle|caixa|entrada|saida|dizimo|oferta|relatorio)/.test(name))) score += 8;
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
  if (finance || members || inferSpreadsheetQuestion(query)) {
    selected = sheets.map((s) => ({ ...s, score: sheetSearchScore(s, query) })).filter((s) => {
      const name = normalizeText(`${s.name} ${s.area || ''}`);
      if (s.score >= 8) return true;
      if (finance && (s.type === 'finance' || /(financeir|controle|caixa|entrada|saida|dizimo|oferta|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|2025|2026)/.test(name))) return true;
      if (members && (s.type === 'members' || /(membro|cadastro|visitante|secretaria|form)/.test(name))) return true;
      if (months.length && months.some((m) => MONTHS.filter(([, n]) => n === m).some(([mn]) => name.includes(normalizeText(mn))))) return true;
      if (years.length && years.some((y) => name.includes(String(y)))) return true;
      return false;
    }).sort((a, b) => b.score - a.score || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  }
  const limit = finance ? Number(process.env.ADAM_MAX_FINANCE_SHEETS || 28) : (members ? Number(process.env.ADAM_MAX_MEMBER_SHEETS || 14) : 10);
  return selected.slice(0, limit);
}

async function buildSpreadsheetContext({ token, sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const selected = selectSpreadsheets({ sheets, query });
  if (!selected.length) return 'Nenhuma leitura de planilha foi necessária ou nenhuma planilha compatível foi localizada dentro da igreja selecionada.';

  const sections = [];
  sections.push(`ÍNDICE DE PLANILHAS SELECIONADAS PARA ESTA PERGUNTA:\n${selected.map((s, i) => `${i + 1}. ${s.name} | ID: ${s.id} | tipo: ${s.type || 'não classificado'} | ano: ${s.year || 'não identificado'} | mês: ${s.month || 'não identificado'} | score: ${s.score || 0}`).join('\n')}`);
  for (const sheet of selected) {
    try {
      const tabs = await readSheetDataViaSheetsApi({ token, spreadsheetId: sheet.id, finance, members });
      const relevant = relevantRowsToText(tabs, query, finance ? 170 : 140, finance ? 45000 : 36000);
      const tabsText = tabs.map((tab) => `Aba: ${tab.tab}\nIntervalo lido pela Sheets API: ${tab.range || 'não informado'}\n${rowsToText(tab.rows, finance ? 24000 : 18000)}`).join('\n\n');
      sections.push(`PLANILHA: ${sheet.name}\nÁrea: ${sheet.area}\nID: ${sheet.id}\nFONTE: Google Sheets API direta.\nORIENTAÇÃO: conferir cabeçalhos, colunas, tipo de lançamento, descrição, data e valor antes de afirmar ou somar.\n\nLINHAS POTENCIALMENTE RELEVANTES:\n${relevant}\n\nDADOS BRUTOS LIDOS DA PLANILHA:\n${tabsText}`);
    } catch (error) {
      sections.push(`PLANILHA: ${sheet.name}\nID: ${sheet.id}\nNão foi possível ler esta planilha pela Google Sheets API: ${error.message}`);
    }
  }
  return sections.join('\n\n---\n\n');
}

async function buildDriveContext(query, options = {}) {
  const church = getChurch(options.churchId);
  const token = await getGoogleAccessToken([DRIVE_SCOPE, SHEETS_SCOPE]);

  const rootFolders = await findRootFolders({ token, church }).catch(() => []);
  const folderTree = rootFolders.length ? await listFolderTree({ token, rootFolders, maxDepth: Number(process.env.ADAM_CHURCH_FOLDER_DEPTH || 4) }) : [];
  const folderIds = folderTree.map((f) => f.id);

  const spreadsheetFiles = folderIds.length
    ? await listFilesInsideFolders({ token, folderIds, mimeType: 'application/vnd.google-apps.spreadsheet', limit: Number(process.env.ADAM_CHURCH_SHEETS_LIMIT || 260) }).catch(() => [])
    : [];
  const docsFiles = folderIds.length
    ? await listFilesInsideFolders({ token, folderIds, mimeType: null, limit: 180 }).catch(() => [])
    : [];

  const discoveredSheets = spreadsheetFiles.map((file) => inferSheetMeta(file, church));
  const extraSheets = envList('GOOGLE_EXTRA_SPREADSHEET_IDS').map((id, index) => ({ name: `Planilha extra ${index + 1}`, id, area: church.name, type: 'extra', churchId: church.id }));
  const sheets = mergeSheets([...church.knownSheets, ...extraSheets], discoveredSheets, church);

  const spreadsheetContext = await buildSpreadsheetContext({ token, sheets, query }).catch((error) => `Não foi possível ler planilhas pela Google Sheets API: ${error.message}`);

  const docs = [];
  for (const file of docsFiles.filter((f) => f.mimeType === 'application/vnd.google-apps.document').slice(0, 8)) {
    try {
      const text = await exportGoogleDocText({ token, fileId: file.id, mimeType: file.mimeType });
      docs.push(`DOCUMENTO: ${file.name}\nModificado em: ${file.modifiedTime}\n${clip(text, 2600)}`);
    } catch (error) {
      docs.push(`DOCUMENTO: ${file.name}\nNão foi possível exportar texto: ${error.message}`);
    }
  }

  const foldersIndex = folderTree.map((f) => `- ${'  '.repeat(Math.min(f.depth || 0, 4))}${f.name} | ID: ${f.id}`).join('\n');
  const sheetsIndex = sheets.slice(0, 180).map((s) => `- ${s.name} | ID: ${s.id} | tipo inferido: ${s.type} | ano: ${s.year || 'não identificado'} | mês: ${s.month || 'não identificado'} | origem: ${s.discovered ? 'descoberta na pasta da igreja' : 'fixa/configurada'} | modificado: ${s.modifiedTime || ''}`).join('\n');
  const fileList = docsFiles.slice(0, 120).map((file) => `- ${file.name} | ID: ${file.id} | tipo: ${file.mimeType} | modificado: ${file.modifiedTime}`).join('\n');

  const context = clip(`
CONEXÃO GOOGLE: ativa via Service Account.
IGREJA SELECIONADA PELO USUÁRIO: ${church.name} (${church.id}).
REGRA DE ESCOPO: responda SOMENTE com base nos arquivos, pastas, documentos e planilhas desta igreja selecionada. Não misture dados de outras igrejas.

PASTAS RAIZ ENCONTRADAS:
${rootFolders.map((f) => `- ${f.name} | ID: ${f.id}`).join('\n') || 'Nenhuma pasta raiz encontrada automaticamente. Configure opcionalmente ' + church.envRoot + ' na Vercel com o ID da pasta-mãe.'}

ÁRVORE DE PASTAS DA IGREJA SELECIONADA:
${foldersIndex || 'Nenhuma subpasta listada.'}

ÍNDICE DE PLANILHAS VISÍVEIS DENTRO DA IGREJA SELECIONADA:
${sheetsIndex || 'Nenhuma planilha descoberta dentro da pasta da igreja. Verifique se as planilhas estão dentro da pasta-mãe e compartilhadas com a Service Account.'}

MODO DE LEITURA DE PLANILHAS:
A Google Sheets API direta é a fonte principal para planilhas. Para assuntos financeiros e membros, use somente dados da igreja selecionada.

DADOS DE PLANILHAS LIDOS DIRETAMENTE PELA GOOGLE SHEETS API:
${spreadsheetContext}

ARQUIVOS RELEVANTES ENCONTRADOS NA IGREJA SELECIONADA:
${fileList || 'Nenhum arquivo adicional encontrado no recorte atual.'}

CONTEÚDO DE DOCUMENTOS GOOGLE DOCS:
${docs.join('\n\n---\n\n') || 'Nenhum Google Docs textual encontrado no recorte atual.'}
`, inferFinanceQuestion(query) ? 190000 : 85000);

  return { connected: true, church, context, files: docsFiles, discoveredSheets: discoveredSheets.length, folders: folderTree.length };
}

module.exports = { buildDriveContext, CHURCHES };
