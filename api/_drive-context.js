const { getGoogleAccessToken } = require('./_google-auth');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const DEFAULT_FOLDER_IDS = [
  '19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL', // Documentos
  '18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM', // Controle Financeiro
  '1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6'  // Fotos dos Cultos
];

const FINANCE_SHEETS = [
  { month: 1, key: 'janeiro', label: 'Janeiro 2026', id: '13jof3g97AsQz26SRHmo53pOxidhZgXWSkWRqd3SFeBo' },
  { month: 2, key: 'fevereiro', label: 'Fevereiro 2026', id: '1sf_jfJ-PKsTN62WUwzAzpruwdaYVRFIeLeKV9h9Psqs' },
  { month: 3, key: 'marco', label: 'Março 2026', id: '11irZSKrZQaIiNT78fLTAbp_WLrCCcOlKeUlcZVce7Hs' },
  { month: 4, key: 'abril', label: 'Abril 2026', id: '1yHpksSYdCaXACUE16sb8gu2B1HZHySe1QqO0EJ1lnDc' },
  { month: 5, key: 'maio', label: 'Maio 2026', id: '1wzhKhfRPRUa1ltTu3TTBliLm5c5611-qWniwrVxUfhk' },
  { month: 6, key: 'junho', label: 'Junho 2026', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU' }
];

const KNOWN_SHEETS = [
  { name: 'Planilha de Membros', id: '1vX_lHJgylBPWtlGBJmVqABvPHuogv8EQYYIh1-zhj2Q', area: 'Secretaria' },
  ...FINANCE_SHEETS.map((sheet) => ({ name: sheet.label, id: sheet.id, area: 'Controle Financeiro 2026' }))
];

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
  const q = normalizeText(query);
  return /(financeir|entrada|saida|dizimo|oferta|saldo|movimento|receita|despesa|relatorio|gasto|insumo|cantina|campanha|kids|limpeza|descartave|bebida|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|semestre|2026)/.test(q);
}

function inferMembersQuestion(query) {
  const q = normalizeText(query);
  return /(membro|cadastro|visitante|secretaria|telefone|endereco|anivers|discipulado)/.test(q);
}

function inferRequestedFinanceSheets(query) {
  const q = normalizeText(query);
  const selected = [];
  for (const sheet of FINANCE_SHEETS) {
    if (q.includes(sheet.key)) selected.push(sheet);
  }
  if (/primeiro semestre|1 semestre|1o semestre|1º semestre|semestre/.test(q)) return FINANCE_SHEETS.slice(0, 6);
  if (/janeiro a junho|jan.*jun|primeiros seis meses/.test(q)) return FINANCE_SHEETS.slice(0, 6);
  if (selected.length) return selected;
  if (inferFinanceQuestion(query)) return FINANCE_SHEETS.slice(0, 6);
  return [];
}

async function getSheetTabs({ token, spreadsheetId }) {
  const params = new URLSearchParams({ fields: 'sheets.properties(title,hidden)' });
  const data = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`, token);
  return (data.sheets || [])
    .map((sheet) => sheet.properties)
    .filter((properties) => properties && !properties.hidden && properties.title)
    .map((properties) => properties.title);
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

async function batchReadSheet({ token, spreadsheetId, maxSheets = 10, maxRows = 1200, maxCols = 30 }) {
  const tabs = (await getSheetTabs({ token, spreadsheetId })).slice(0, maxSheets);
  const ranges = tabs.map((tab) => `${quoteSheetName(tab)}!A1:${columnName(maxCols)}${maxRows}`);
  if (!ranges.length) return [];

  const params = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const range of ranges) params.append('ranges', range);
  const data = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`, token);
  const valueRanges = data.valueRanges || [];

  return valueRanges.map((rangeData, index) => ({
    tab: tabs[index] || `Aba ${index + 1}`,
    rows: rangeData.values || []
  }));
}

async function readSheetPreview({ token, spreadsheetId, maxSheets = 4, maxRows = 80, maxCols = 18 }) {
  return batchReadSheet({ token, spreadsheetId, maxSheets, maxRows, maxCols });
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const original = String(value || '').trim();
  if (!original) return null;

  const hasCurrency = /r\$|\$/.test(normalizeText(original));
  const looksLikeBrazilianMoney = /^-?\s*\d{1,3}(?:\.\d{3})*,\d{2}$/.test(original) || /^-?\s*\d+,\d{2}$/.test(original);
  const looksLikePlainNumber = /^-?\s*\d+(?:\.\d+)?$/.test(original);

  if (!hasCurrency && !looksLikeBrazilianMoney && !looksLikePlainNumber) return null;
  if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(original)) return null;
  if (/^\d{4}$/.test(original) && Number(original) >= 1900 && Number(original) <= 2100) return null;

  let cleaned = original.replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;

  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  if (Math.abs(number) > 10000000) return null;
  return number;
}

function extractMoneyValues(row) {
  const values = [];
  for (const cell of row || []) {
    const parsed = parseMoney(cell);
    if (parsed !== null) values.push(parsed);
  }
  return values;
}

function lastMoney(row) {
  const values = extractMoneyValues(row);
  if (!values.length) return null;
  return values[values.length - 1];
}

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function detectCategory(rowText) {
  const text = normalizeText(rowText);
  if (/dizim/.test(text)) return 'Dízimos';
  if (/ofert/.test(text)) return 'Ofertas';
  if (/campanh/.test(text)) return 'Campanhas';
  if (/cantina/.test(text)) return 'Cantina';
  if (/bebid|descart/.test(text)) return 'Bebidas e descartáveis';
  if (/kids|crianc|infantil/.test(text)) return 'Kids';
  if (/limpez|higien/.test(text)) return 'Limpeza';
  if (/insumo|material/.test(text)) return 'Insumos gerais';
  if (/salario|salarios|folha|pagamento/.test(text)) return 'Salários/Folha';
  if (/aluguel|locacao|locaçao/.test(text)) return 'Aluguel/Locação';
  return null;
}

function analyzeFinanceTabs(tabs) {
  const categories = new Map();
  const relevantRows = [];
  let totalRows = 0;
  let nonEmptyRows = 0;

  for (const tab of tabs || []) {
    for (let i = 0; i < (tab.rows || []).length; i++) {
      const row = tab.rows[i] || [];
      totalRows++;
      if (row.some((cell) => String(cell || '').trim())) nonEmptyRows++;
      const rowText = row.map((cell) => String(cell || '').trim()).filter(Boolean).join(' | ');
      if (!rowText) continue;
      const category = detectCategory(rowText);
      const amount = lastMoney(row);
      const normalized = normalizeText(rowText);
      const hasFinanceKeyword = category || /(entrada|saida|receita|despesa|total|saldo|valor|insumo|gasto|dizimo|oferta)/.test(normalized);
      if (hasFinanceKeyword && relevantRows.length < 120) {
        relevantRows.push({ tab: tab.tab, rowNumber: i + 1, text: rowText.slice(0, 500), amount, category });
      }
      if (category && amount !== null) {
        if (!categories.has(category)) {
          categories.set(category, { category, lineSum: 0, lineCount: 0, totalCandidates: [], examples: [] });
        }
        const entry = categories.get(category);
        const isTotal = /total|soma|subtotal|consolidado|resumo/.test(normalized);
        if (isTotal) entry.totalCandidates.push({ amount, tab: tab.tab, rowNumber: i + 1, text: rowText.slice(0, 300) });
        else {
          entry.lineSum += amount;
          entry.lineCount += 1;
        }
        if (entry.examples.length < 5) entry.examples.push(`${tab.tab} L${i + 1}: ${rowText.slice(0, 250)}`);
      }
    }
  }

  const summary = Array.from(categories.values()).map((entry) => {
    let selectedValue = entry.lineSum;
    let source = `${entry.lineCount} linha(s) somada(s)`;
    if (entry.totalCandidates.length === 1) {
      selectedValue = entry.totalCandidates[0].amount;
      source = `total encontrado em ${entry.totalCandidates[0].tab} L${entry.totalCandidates[0].rowNumber}`;
    } else if (entry.totalCandidates.length > 1) {
      const sorted = [...entry.totalCandidates].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      selectedValue = sorted[0].amount;
      source = `maior total encontrado em ${sorted[0].tab} L${sorted[0].rowNumber}; havia ${entry.totalCandidates.length} candidatos de total`;
    }
    return {
      category: entry.category,
      value: selectedValue,
      formatted: brl(selectedValue),
      source,
      lineSum: entry.lineSum,
      lineCount: entry.lineCount,
      totalCandidates: entry.totalCandidates.slice(0, 5),
      examples: entry.examples
    };
  }).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return { totalRows, nonEmptyRows, categories: summary, relevantRows };
}

function rawRowsText(tabs, maxChars = 12000) {
  const lines = [];
  for (const tab of tabs || []) {
    lines.push(`Aba: ${tab.tab}`);
    const rows = tab.rows || [];
    for (let i = 0; i < rows.length; i++) {
      const rowText = rows[i].map((cell) => String(cell || '').trim()).filter(Boolean).join(' | ');
      if (rowText) lines.push(`L${i + 1}: ${rowText}`);
      if (lines.join('\n').length > maxChars) break;
    }
    if (lines.join('\n').length > maxChars) break;
    lines.push('');
  }
  return clip(lines.join('\n'), maxChars);
}

async function buildFinanceDeepContext({ token, query }) {
  const selectedSheets = inferRequestedFinanceSheets(query);
  if (!selectedSheets.length) return '';

  const sections = [];
  const semesterTotals = new Map();

  for (const sheet of selectedSheets) {
    try {
      const tabs = await batchReadSheet({ token, spreadsheetId: sheet.id, maxSheets: 12, maxRows: 1200, maxCols: 32 });
      const analysis = analyzeFinanceTabs(tabs);
      for (const cat of analysis.categories) {
        const current = semesterTotals.get(cat.category) || 0;
        semesterTotals.set(cat.category, current + Number(cat.value || 0));
      }

      const categoryText = analysis.categories.length
        ? analysis.categories.map((cat) => `• ${cat.category}: ${cat.formatted} (${cat.source})`).join('\n')
        : 'Nenhuma categoria financeira reconhecida automaticamente.';

      const evidence = analysis.relevantRows.slice(0, 30).map((row) => {
        const amount = row.amount !== null && row.amount !== undefined ? ` | valor detectado: ${brl(row.amount)}` : '';
        return `• ${row.tab} L${row.rowNumber}: ${row.text}${amount}`;
      }).join('\n');

      sections.push(`LEITURA FINANCEIRA DETALHADA: ${sheet.label}
Planilha ID: ${sheet.id}
Abas lidas: ${tabs.map((t) => t.tab).join(', ') || 'nenhuma'}
Linhas lidas: ${analysis.totalRows}; linhas não vazias: ${analysis.nonEmptyRows}

Totais/categorias detectadas por leitura técnica:
${categoryText}

Linhas financeiras relevantes encontradas:
${evidence || 'Nenhuma linha financeira relevante encontrada no recorte.'}

Recorte bruto para conferência:
${rawRowsText(tabs, selectedSheets.length === 1 ? 16000 : 6500)}`);
    } catch (error) {
      sections.push(`LEITURA FINANCEIRA DETALHADA: ${sheet.label}
Não foi possível ler esta planilha: ${error.message}
Verifique se a planilha foi compartilhada diretamente ou por pasta com o e-mail da Service Account.`);
    }
  }

  if (selectedSheets.length > 1 && semesterTotals.size) {
    const totalText = Array.from(semesterTotals.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([category, value]) => `• ${category}: ${brl(value)}`)
      .join('\n');
    sections.unshift(`CONSOLIDADO TÉCNICO DAS PLANILHAS SELECIONADAS:
Meses analisados: ${selectedSheets.map((s) => s.label).join(', ')}
${totalText}
Observação: estes totais foram extraídos por heurística técnica. Quando houver linha de total explícita, ela é priorizada; quando não houver, as linhas identificadas são somadas.`);
  }

  return sections.join('\n\n---\n\n');
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
      const previews = await readSheetPreview({ token, spreadsheetId: sheet.id, maxSheets: finance ? 6 : 4, maxRows: finance ? 220 : 90, maxCols: finance ? 24 : 18 });
      const tabsText = previews.map((tab) => `Aba: ${tab.tab}\n${rowsToText(tab.rows, finance ? 4200 : 2600)}`).join('\n\n');
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

  const finance = inferFinanceQuestion(query);

  const [matchingFiles, recentFiles, spreadsheetContext, financeDeepContext] = await Promise.all([
    listFilesInFolders({ token, folderIds: effectiveFolderIds, query, pageSize: 35 }).catch((error) => ({ files: [], error: error.message })),
    listRecentFiles({ token, folderIds: effectiveFolderIds, pageSize: 45 }).catch((error) => ({ files: [], error: error.message })),
    buildSpreadsheetContext({ token, sheets, query }).catch((error) => `Não foi possível ler planilhas: ${error.message}`),
    finance ? buildFinanceDeepContext({ token, query }).catch((error) => `Não foi possível montar leitura financeira detalhada: ${error.message}`) : Promise.resolve('')
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

LEITOR FINANCEIRO DETALHADO:
${financeDeepContext || 'Não acionado nesta pergunta.'}

DADOS DE PLANILHAS CONECTADAS / PRÉVIA GERAL:
${spreadsheetContext}
`, finance ? 52000 : 22000);

  return { connected, context, files, matchingFilesError: matchingFiles.error, recentFilesError: recentFiles.error };
}

module.exports = { buildDriveContext };
