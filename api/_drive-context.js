const { getGoogleAccessToken } = require('./_google-auth');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const CURRENT_YEAR = Number(process.env.ADAM_CURRENT_YEAR || new Date().getFullYear());

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
      { name: 'Junho 2026 - Sampaio', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 },
      { name: 'Julho 2026 - Sampaio', id: '1XGu_SdcaF-SuhJOOQFNvzUkYUV6S39y-9puRY01LMzg', area: 'Controle Financeiro 2026', type: 'finance', month: 7, year: 2026 }
    ]
  },
  saquarema: {
    id: 'saquarema',
    name: 'ADB Saquarema',
    rootNames: ['ADB Saquarema', 'ADB Sede', 'ADB Boqueirão', 'ADB Boqueirao'],
    envRoot: 'ADB_SAQUAREMA_ROOT_FOLDER_ID',
    knownSheets: [
      { name: 'Planilha de Membros - Saquarema', id: '1ZAzTXKlTEKsR8UsHkLenxrluZc2pAKvOXz8ylknOk9o', area: 'Secretaria', type: 'members' },
      { name: 'Junho 2026 - Saquarema', id: '1ijOYDwj7FNf8L4L86kEUWkFJOPG-uyKqbr_LZiKKVUE', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 },
      { name: 'Julho 2026 - Saquarema', id: '1zjzg3a_7nsI3YJngll-_4pg2beVzLWtjJGTRsr4Whcs', area: 'Controle Financeiro 2026', type: 'finance', month: 7, year: 2026 }
    ]
  },
  porto: {
    id: 'porto',
    name: 'ADB Porto da Roça',
    rootNames: ['ADB Porto da Roça', 'ADB Porto da Roca'],
    envRoot: 'ADB_PORTO_ROOT_FOLDER_ID',
    knownSheets: [
      { name: 'Planilha de Membros - Porto da Roça', id: '1avnGceb36i1Ohh3d-j5WBPOJMqFjBboSOxLOmt1WVSc', area: 'Secretaria', type: 'members' },
      { name: 'Junho 2026 - Porto da Roça', id: '1hnFlwQSK8hwHybqqVcIqxIKz1ofeAs_1Nooki-Wk8OI', area: 'Controle Financeiro 2026', type: 'finance', month: 6, year: 2026 },
      { name: 'Julho 2026 - Porto da Roça', id: '1cSqHXlC6JA5FUSueY8176jEA4IBMqGJ-2M6jIBoK_N0', area: 'Controle Financeiro 2026', type: 'finance', month: 7, year: 2026 }
    ]
  }
};

const STOPWORDS = new Set([
  'quanto','quero','saber','preciso','relatorio','relatório','comparar','compare','em','de','do','da','dos','das','esse','essa','este','esta','desse','dessa','deste','desta','ano','mes','mês','passado','atual','igreja','adb','sobre','com','para','pela','pelo','foi','foram','total','calcule','recalcule','liste','listar','todos','todas'
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

function getChurch(churchId) {
  return CHURCHES[churchId] || CHURCHES.sampaio;
}

function inferFinanceQuestion(query) {
  const q = normalizeText(query);
  return /(financeir|faturamento|receita|recebimento|arrecadacao|arrecadação|entrada|entradas|saida|saidas|saída|saídas|dizimo|dizimos|dízimo|dízimos|oferta|ofertas|saldo|movimento|despesa|despesas|gasto|gastos|relatorio|relatório|caixa|cantina|insumo|country|pink|zion|evento|touro|mecanico|mecânico|diesel|bebida|salgado|pastel|limpeza|kids|descartavel|descartável|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|trimestre|semestre|comparativo|comparar|compare|2025|2026|ano passado)/.test(q);
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

  const hasMonth = requestedMonths(query).length > 0;
  const asksCurrentPeriod = /(esse ano|este ano|desse ano|deste ano|ano atual|atual|esse mes|este mes|desse mes|deste mes|esse mês|este mês|desse mês|deste mês)/.test(q);
  const asksPreviousYear = /(ano passado|ano anterior|mesmo periodo do ano passado|mesmo período do ano passado|em relacao ao ano passado|em relação ao ano passado)/.test(q);
  const asksComparison = /(comparar|comparativo|compare|relacao|relação|em relacao|em relação)/.test(q);

  if (asksCurrentPeriod) years.add(CURRENT_YEAR);
  if (asksPreviousYear) years.add(CURRENT_YEAR - 1);

  // Caso muito comum:
  // “relatório desse mês de março em comparação com março do ano passado”
  // precisa carregar março do ano atual e março do ano anterior.
  if (hasMonth && asksPreviousYear && asksComparison) {
    years.add(CURRENT_YEAR);
    years.add(CURRENT_YEAR - 1);
  }

  // Se a pergunta menciona mês específico, é financeira e não cita ano,
  // assume o ano atual. Ex.: “relatório de março”.
  if (hasMonth && inferFinanceQuestion(query) && years.size === 0) {
    years.add(CURRENT_YEAR);
  }

  if (asksComparison && years.size === 1) {
    const onlyYear = Array.from(years)[0];
    if (onlyYear === CURRENT_YEAR) years.add(CURRENT_YEAR - 1);
    else years.add(onlyYear - 1);
  }

  return Array.from(years).filter(Boolean).sort();
}

function requestedMonths(query) {
  const q = normalizeText(query);
  const months = [];
  for (const [name, number] of MONTHS) {
    if (q.includes(normalizeText(name))) months.push(number);
  }

  // Se o usuário citou mês específico, lê somente esse mês.
  // Ex.: março deste ano em relação a março do ano passado = março/ano atual e março/ano anterior.
  if (months.length) return Array.from(new Set(months));

  if (/ultimo trimestre|último trimestre|ultimos tres meses|últimos três meses|ultimos 3 meses|últimos 3 meses/.test(q)) {
    const currentMonth = Number(process.env.ADAM_CURRENT_MONTH || (new Date().getMonth() + 1));
    const result = [];
    for (let i = 2; i >= 0; i--) {
      let m = currentMonth - i;
      if (m <= 0) m += 12;
      result.push(m);
    }
    return result;
  }
  if (/primeiro trimestre|1 trimestre|1o trimestre|1º trimestre/.test(q)) return [1, 2, 3];
  if (/segundo trimestre|2 trimestre|2o trimestre|2º trimestre/.test(q)) return [4, 5, 6];
  if (/terceiro trimestre|3 trimestre|3o trimestre|3º trimestre/.test(q)) return [7, 8, 9];
  if (/quarto trimestre|4 trimestre|4o trimestre|4º trimestre/.test(q)) return [10, 11, 12];
  if (/primeiro semestre|1 semestre|1o semestre|1º semestre/.test(q)) return [1, 2, 3, 4, 5, 6];
  if (/segundo semestre|2 semestre|2o semestre|2º semestre/.test(q)) return [7, 8, 9, 10, 11, 12];
  if (/ano|2026|2025|este ano|esse ano|deste ano|desse ano|ano passado/.test(q) && inferFinanceQuestion(query)) return [1,2,3,4,5,6,7,8,9,10,11,12];
  return months;
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

async function findRootFolders({ token, church }) {
  const envRoots = envList(church.envRoot);
  if (envRoots.length) return envRoots.map((id) => ({ id, name: `${church.name} (env)`, depth: 0 }));

  const nameClauses = church.rootNames.map((name) => `name = '${escapeDriveQuery(name)}'`).join(' or ');
  const params = new URLSearchParams({
    q: `trashed = false and mimeType = 'application/vnd.google-apps.folder' and (${nameClauses})`,
    pageSize: '10',
    fields: 'files(id,name,mimeType,parents,modifiedTime,webViewLink)'
  });

  const data = await googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  return (data.files || []).map((f) => ({ ...f, depth: 0 }));
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

      const children = await listChildren({
        token,
        parentId: folder.id,
        mimeType: 'application/vnd.google-apps.folder',
        pageSize: 100
      }).catch(() => []);

      for (const child of children) next.push({ ...child, depth: folder.depth + 1 });
    }

    frontier = next;
  }

  return allFolders;
}

async function listSpreadsheetsFromFolders({ token, folderTree, limit = 180 }) {
  const files = [];
  const folderNameById = new Map(folderTree.map((f) => [f.id, f.name]));

  for (const folder of folderTree.slice(0, 160)) {
    const children = await listChildren({
      token,
      parentId: folder.id,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      pageSize: 100
    }).catch(() => []);

    for (const child of children) {
      const parentNames = (child.parents || []).map((id) => folderNameById.get(id)).filter(Boolean).join(' ');
      files.push({
        ...child,
        folderNames: parentNames,
        pathHint: `${folder.name} ${parentNames}`.trim()
      });
    }

    if (files.length >= limit) break;
  }

  const byId = new Map();
  for (const file of files) byId.set(file.id, file);
  return Array.from(byId.values()).slice(0, limit);
}

function inferSheetMeta(file, church) {
  const text = normalizeText([file.name, file.folderNames || '', file.pathHint || ''].join(' '));
  const monthMatch = MONTHS.find(([name]) => text.includes(normalizeText(name)));
  const yearMatch = text.match(/20\d{2}/);
  const type = /(membro|cadastro|visitante|secretaria)/.test(text)
    ? 'members'
    : /(financeir|faturamento|receita|arrecadacao|arrecadação|recebimento|dizimo|dizimos|dízimo|dízimos|oferta|entrada|saida|saída|caixa|controle|relatorio|relatório|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|2025|2026)/.test(text)
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
    folderNames: file.folderNames || '',
    pathHint: file.pathHint || '',
    discovered: true
  };
}

function mergeSheets(known, discovered, church) {
  const byId = new Map();

  for (const sheet of [...known.map((s) => ({ ...s, churchId: church.id })), ...discovered]) {
    const existing = byId.get(sheet.id);

    if (existing) {
      byId.set(sheet.id, {
        ...existing,
        ...sheet,
        type: existing.type && existing.type !== 'discovered' ? existing.type : sheet.type,
        month: existing.month || sheet.month,
        year: existing.year || sheet.year
      });
    } else {
      byId.set(sheet.id, sheet);
    }
  }

  return Array.from(byId.values());
}

function sheetText(sheet) {
  return normalizeText([sheet.name, sheet.area, sheet.folderNames, sheet.pathHint, sheet.type, sheet.year, sheet.month].join(' '));
}

function sheetSearchScore(sheet, query) {
  const q = normalizeText(query);
  const text = sheetText(sheet);
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const months = requestedMonths(query);
  const years = requestedYears(query);

  let score = 0;

  if (finance && sheet.type === 'finance') score += 30;
  if (members && sheet.type === 'members') score += 35;

  for (const y of years) {
    if (sheet.year === y || text.includes(String(y))) score += 28;
  }

  for (const m of months) {
    const monthNames = MONTHS.filter(([, n]) => n === m).map(([mn]) => normalizeText(mn));
    if (sheet.month === m || monthNames.some((mn) => text.includes(mn))) score += 28;
  }

  const terms = extractQueryTerms(query);
  for (const term of terms) {
    if (text.includes(normalizeText(term))) score += 4;
  }

  if (sheet.discovered) score += 1;
  return score;
}

function selectSpreadsheets({ sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const spreadsheet = inferSpreadsheetQuestion(query);
  if (!spreadsheet) return [];

  const months = requestedMonths(query);
  const years = requestedYears(query);

  const scored = sheets.map((s) => ({ ...s, score: sheetSearchScore(s, query) }));

  let filtered = scored.filter((s) => {
    const text = sheetText(s);

    if (members) return s.type === 'members' || /(membro|cadastro|visitante|secretaria)/.test(text);

    if (finance) {
      if (!(s.type === 'finance' || /(financeir|faturamento|receita|entrada|saida|dizimo|oferta|caixa|controle|relatorio|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|2025|2026)/.test(text))) {
        return false;
      }

      const yearKnown = Boolean(s.year);
      const monthKnown = Boolean(s.month);
      const yearMatches = !years.length || (yearKnown && years.includes(s.year)) || (!yearKnown && years.length && years.some((y) => text.includes(String(y))));
      const monthMatches = !months.length || (monthKnown && months.includes(s.month)) || (!monthKnown && months.some((m) => MONTHS.filter(([, n]) => n === m).some(([mn]) => text.includes(normalizeText(mn)))));

      // Planilha anual: tem ano no nome/pasta, mas o mês está em abas internas.
      const annualWorkbookCandidate = finance && years.length && yearMatches && !monthKnown;

      // Planilha mensal: tem mês no nome/pasta, mas talvez o ano esteja na pasta pai.
      const monthlyWorkbookCandidate = finance && months.length && monthMatches && !yearKnown;

      if (years.length && months.length) return (yearMatches && monthMatches) || annualWorkbookCandidate || monthlyWorkbookCandidate;
      if (years.length) return yearMatches || s.score >= 40;
      if (months.length) return monthMatches || s.score >= 40;

      return s.score >= 20;
    }

    return s.score >= 15;
  });

  // Se a filtragem ficou vazia, usa os mais pontuados do tipo correto.
  if (!filtered.length) {
    filtered = scored.filter((s) => {
      if (finance) return s.type === 'finance';
      if (members) return s.type === 'members';
      return s.score > 0;
    });
  }

  filtered.sort((a, b) => b.score - a.score || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));

  const focused = Boolean(months.length || years.length);
  const limit = finance
    ? Number(process.env.ADAM_SELECTED_FINANCE_SHEETS || (focused ? 10 : 16))
    : members
      ? Number(process.env.ADAM_SELECTED_MEMBER_SHEETS || 8)
      : 8;

  // Para comparações mês/ano, garantir que todos os anos pedidos entrem,
  // mesmo que uma planilha tenha pontuação menor por nome/aba.
  if (finance && months.length && years.length) {
    const mustHave = scored.filter((s) => {
      const text = sheetText(s);
      const isFinance = s.type === 'finance' || /(financeir|faturamento|receita|entrada|saida|dizimo|oferta|caixa|controle|relatorio|2025|2026)/.test(text);
      if (!isFinance) return false;

      const yearMatch = years.some((y) => s.year === y || text.includes(String(y)));
      const monthMatch = months.some((m) => s.month === m || MONTHS.filter(([, n]) => n === m).some(([mn]) => text.includes(normalizeText(mn))));

      // Planilha anual: ano bate; mês pode estar em aba interna.
      // Planilha mensal: mês bate; ano pode estar na pasta.
      return yearMatch && (monthMatch || !s.month);
    });

    const merged = new Map();
    for (const item of [...mustHave, ...filtered]) merged.set(item.id, item);
    filtered = Array.from(merged.values()).sort((a, b) => b.score - a.score || String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
  }

  return filtered.slice(0, limit);
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

function rowToLine(rowIndex, row) {
  return `Linha ${rowIndex + 1}: ` + (row || []).map((cell, index) => `${columnName(index + 1)}=${compactCell(cell)}`).join(' | ');
}

function extractQueryTerms(query) {
  const q = normalizeText(query)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  const terms = Array.from(new Set(q));
  const normalized = normalizeText(query);

  if (normalized.includes('faturamento')) terms.push('faturamento', 'receita', 'recebimento', 'entrada', 'dizimo', 'dizimos', 'oferta', 'ofertas');
  if (normalized.includes('receita')) terms.push('receita', 'recebimento', 'entrada', 'dizimo', 'oferta');
  if (normalized.includes('festa country')) terms.push('country', 'touro', 'festa');
  if (normalized.includes('pink')) terms.push('pink', 'conference', 'mulheres');
  if (normalized.includes('cantina')) terms.push('cantina', 'bebida', 'salgado', 'pastel', 'massa', 'alimento');
  if (normalized.includes('membro') || normalized.includes('cadastro')) terms.push('membro', 'cadastro', 'nome', 'data');

  return Array.from(new Set(terms)).slice(0, 24);
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

function tabMatchesMonths(tabTitle, months) {
  if (!months.length) return true;
  const t = normalizeText(tabTitle);
  return months.some((m) => {
    const names = MONTHS.filter(([, n]) => n === m).map(([mn]) => normalizeText(mn));
    return names.some((name) => t.includes(name)) || t.includes(String(m).padStart(2, '0')) || t === String(m);
  });
}

function selectTabs(tabs, query, { finance = false, members = false } = {}) {
  const months = requestedMonths(query);
  const maxTabs = finance
    ? Number(process.env.ADAM_SHEETS_MAX_TABS_FINANCE || (months.length ? 6 : 12))
    : members
      ? Number(process.env.ADAM_SHEETS_MAX_TABS_MEMBERS || 8)
      : 6;

  if (finance && months.length) {
    const monthTabs = tabs.filter((tab) => tabMatchesMonths(tab.title, months));
    if (monthTabs.length) return monthTabs.slice(0, maxTabs);
  }

  return tabs.slice(0, maxTabs);
}

async function readSheetDataViaSheetsApi({ token, spreadsheetId, query, finance = false, members = false }) {
  const tabs = await getSheetTabs({ token, spreadsheetId });
  const selectedTabs = selectTabs(tabs, query, { finance, members });

  const maxRows = finance
    ? Number(process.env.ADAM_SHEETS_MAX_ROWS || 1200)
    : members
      ? Number(process.env.ADAM_MEMBERS_MAX_ROWS || 1800)
      : 500;

  const maxCols = finance
    ? Number(process.env.ADAM_SHEETS_MAX_COLS || 60)
    : members
      ? 52
      : 32;

  const ranges = selectedTabs.map((tab) =>
    `${quoteSheetName(tab.title)}!A1:${columnName(Math.min(Math.max(tab.columnCount || 26, 12), maxCols))}${Math.min(Math.max(tab.rowCount || 200, 100), maxRows)}`
  );

  if (!ranges.length) return [];

  const params = new URLSearchParams();
  for (const range of ranges) params.append('ranges', range);
  params.set('majorDimension', 'ROWS');
  params.set('valueRenderOption', 'FORMATTED_VALUE');
  params.set('dateTimeRenderOption', 'FORMATTED_STRING');

  const data = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`, token);

  return (data.valueRanges || []).map((vr, index) => ({
    tab: selectedTabs[index]?.title || vr.range || `Aba ${index + 1}`,
    range: vr.range,
    rows: vr.values || []
  }));
}

function rowsToText(rows, maxChars = 26000) {
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

function relevantRowsToText(tabs, query, maxLines = 160, maxChars = 38000) {
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

async function buildSpreadsheetContext({ token, sheets, query }) {
  const finance = inferFinanceQuestion(query);
  const members = inferMembersQuestion(query);
  const selected = selectSpreadsheets({ sheets, query });

  if (!selected.length) {
    return 'Nenhuma planilha compatível foi localizada para esta pergunta dentro da igreja selecionada. A leitura por Sheets API não foi executada.';
  }

  const sections = [];

  const months = requestedMonths(query);
  const years = requestedYears(query);
  const requestedPeriodText = `PERÍODOS SOLICITADOS/INFERIDOS: anos=[${years.join(', ') || 'não especificado'}], meses=[${months.join(', ') || 'não especificado'}].`;

  sections.push(`FONTE OFICIAL DOS DADOS: GOOGLE SHEETS API.
Observação: o Drive API foi usado apenas para localizar IDs/metadados das planilhas quando necessário. O conteúdo abaixo foi lido diretamente pela Google Sheets API.
${requestedPeriodText}

ÍNDICE DE PLANILHAS SELECIONADAS PARA ESTA PERGUNTA:
${selected.map((s, i) => `${i + 1}. ${s.name} | ID: ${s.id} | tipo: ${s.type || 'não classificado'} | ano: ${s.year || 'não identificado'} | mês: ${s.month || 'não identificado'} | score: ${s.score || 0} | caminho/pasta: ${s.pathHint || s.folderNames || ''}`).join('\n')}`);

  for (const sheet of selected) {
    try {
      const tabs = await readSheetDataViaSheetsApi({
        token,
        spreadsheetId: sheet.id,
        query,
        finance,
        members
      });

      const relevant = relevantRowsToText(tabs, query, finance ? 120 : 100, finance ? 30000 : 26000);
      const rawLimit = finance ? Number(process.env.ADAM_RAW_SHEET_CHARS || 38000) : 24000;
      const tabsText = tabs.map((tab) => `Aba: ${tab.tab}\nIntervalo lido pela Sheets API: ${tab.range || 'não informado'}\n${rowsToText(tab.rows, rawLimit)}`).join('\n\n');

      sections.push(`PLANILHA: ${sheet.name}
Área: ${sheet.area || ''}
ID: ${sheet.id}
Ano inferido: ${sheet.year || 'não identificado'}
Mês inferido: ${sheet.month || 'não identificado'}
FONTE: Google Sheets API direta.
ORIENTAÇÃO: para financeiro, conferir cabeçalhos, colunas, tipo de lançamento, descrição, data e valor antes de afirmar ou somar.

LINHAS POTENCIALMENTE RELEVANTES:
${relevant}

DADOS BRUTOS LIDOS DA PLANILHA PELA SHEETS API:
${tabsText}`);
    } catch (error) {
      sections.push(`PLANILHA: ${sheet.name}
ID: ${sheet.id}
Não foi possível ler esta planilha pela Google Sheets API: ${error.message}`);
    }
  }

  return sections.join('\n\n---\n\n');
}

async function listNonSpreadsheetFiles({ token, folderTree, limit = 60 }) {
  const files = [];

  for (const folder of folderTree.slice(0, 60)) {
    const children = await listChildren({ token, parentId: folder.id, mimeType: null, pageSize: 60 }).catch(() => []);
    files.push(...children.filter((file) => file.mimeType !== 'application/vnd.google-apps.spreadsheet'));
    if (files.length >= limit) break;
  }

  const byId = new Map();
  for (const file of files) byId.set(file.id, file);
  return Array.from(byId.values()).slice(0, limit);
}

async function exportGoogleDocText({ token, fileId }) {
  const params = new URLSearchParams({ mimeType: 'text/plain' });
  return await googleFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?${params}`, token);
}

async function buildDriveContext(query, options = {}) {
  const church = getChurch(options.churchId);
  const spreadsheetQuestion = inferSpreadsheetQuestion(query);
  const financeQuestion = inferFinanceQuestion(query);
  const token = await getGoogleAccessToken([DRIVE_SCOPE, SHEETS_SCOPE]);

  const rootFolders = await findRootFolders({ token, church }).catch(() => []);
  const folderDepth = Number(process.env.ADAM_CHURCH_FOLDER_DEPTH || 4);
  const folderTree = rootFolders.length ? await listFolderTree({ token, rootFolders, maxDepth: folderDepth }) : [];

  let discoveredSheets = [];
  let spreadsheetContext = 'Nenhuma leitura de planilha foi necessária.';

  if (spreadsheetQuestion) {
    const spreadsheetLimit = Number(process.env.ADAM_CHURCH_SHEETS_LIMIT || 180);
    const spreadsheetFiles = folderTree.length
      ? await listSpreadsheetsFromFolders({ token, folderTree, limit: spreadsheetLimit }).catch(() => [])
      : [];

    discoveredSheets = spreadsheetFiles.map((file) => inferSheetMeta(file, church));

    const extraSheets = envList('GOOGLE_EXTRA_SPREADSHEET_IDS').map((id, index) => ({
      name: `Planilha extra ${index + 1}`,
      id,
      area: church.name,
      type: 'extra',
      churchId: church.id
    }));

    const sheets = mergeSheets([...church.knownSheets, ...extraSheets], discoveredSheets, church);
    spreadsheetContext = await buildSpreadsheetContext({ token, sheets, query });
  }

  let nonSpreadsheetFiles = [];
  let docs = [];

  if (!spreadsheetQuestion) {
    nonSpreadsheetFiles = await listNonSpreadsheetFiles({ token, folderTree, limit: 60 }).catch(() => []);

    for (const file of nonSpreadsheetFiles.filter((f) => f.mimeType === 'application/vnd.google-apps.document').slice(0, 4)) {
      try {
        const text = await exportGoogleDocText({ token, fileId: file.id });
        docs.push(`DOCUMENTO: ${file.name}\nModificado em: ${file.modifiedTime}\n${clip(text, 2200)}`);
      } catch (error) {
        docs.push(`DOCUMENTO: ${file.name}\nNão foi possível exportar texto: ${error.message}`);
      }
    }
  }

  const foldersIndex = folderTree
    .filter((f) => !spreadsheetQuestion || /(financeir|controle|caixa|2025|2026|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|secretaria|membro|cadastro)/.test(normalizeText(f.name)))
    .slice(0, 100)
    .map((f) => `- ${'  '.repeat(Math.min(f.depth || 0, 4))}${f.name} | ID: ${f.id}`)
    .join('\n');

  const sheetIndex = discoveredSheets.slice(0, 120).map((s) => `- ${s.name} | ID: ${s.id} | tipo: ${s.type} | ano: ${s.year || 'não identificado'} | mês: ${s.month || 'não identificado'} | caminho: ${s.pathHint || s.folderNames || ''}`).join('\n');
  const fileList = nonSpreadsheetFiles.slice(0, 80).map((file) => `- ${file.name} | ID: ${file.id} | tipo: ${file.mimeType} | modificado: ${file.modifiedTime}`).join('\n');

  const context = clip(`
CONEXÃO GOOGLE: ativa via Service Account.
IGREJA SELECIONADA PELO USUÁRIO: ${church.name} (${church.id}).
REGRA DE ESCOPO: responda SOMENTE com base nos arquivos, pastas, documentos e planilhas desta igreja selecionada. Não misture dados de outras igrejas.

REGRA DE FONTE:
- Se a pergunta envolver planilhas, financeiro, membros, cadastro ou tabelas, o conteúdo deve ser lido e interpretado a partir da GOOGLE SHEETS API.
- O Google Drive API pode aparecer aqui somente como mecanismo de localização de pastas/IDs. Ele não é a fonte do conteúdo financeiro.

PASTAS RAIZ ENCONTRADAS:
${rootFolders.map((f) => `- ${f.name} | ID: ${f.id}`).join('\n') || 'Nenhuma pasta raiz encontrada. Verifique a variável ' + church.envRoot + ' na Vercel e o compartilhamento com a Service Account.'}

ÁRVORE DE PASTAS RELEVANTE:
${foldersIndex || 'Nenhuma subpasta relevante listada.'}

PLANILHAS DESCOBERTAS POR METADADOS DO DRIVE, PARA LEITURA PELA SHEETS API:
${sheetIndex || 'Nenhuma planilha descoberta por Drive API. As planilhas fixas/configuradas ainda podem ser lidas diretamente pela Sheets API.'}

DADOS DE PLANILHAS LIDOS DIRETAMENTE PELA GOOGLE SHEETS API:
${spreadsheetContext}

ARQUIVOS NÃO-PLANILHA:
${fileList || (spreadsheetQuestion ? 'Pulados nesta pergunta porque o assunto está em planilhas e deve usar Sheets API.' : 'Nenhum arquivo adicional encontrado.')}

CONTEÚDO DE DOCUMENTOS GOOGLE DOCS:
${docs.join('\n\n---\n\n') || (spreadsheetQuestion ? 'Pulados nesta pergunta porque o assunto está em planilhas e deve usar Sheets API.' : 'Nenhum Google Docs textual encontrado no recorte atual.')}
`, financeQuestion ? 125000 : 85000);

  return {
    connected: true,
    church,
    context,
    files: nonSpreadsheetFiles,
    discoveredSheets: discoveredSheets.length,
    folders: folderTree.length
  };
}


function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/[0-9]/.test(raw)) return null;

  let s = raw.replace(/\s/g, '').replace(/R\$/gi, '');
  const negative = /^\-/.test(s) || /\(\s*R?\$?\s*[\d.,]+\s*\)/.test(raw);

  s = s.replace(/[()]/g, '').replace(/^\-/, '');

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // padrão brasileiro: 1.234,56
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // padrão brasileiro decimal: 1234,56
    s = s.replace(',', '.');
  } else if (hasDot) {
    const dotParts = s.split('.');
    const last = dotParts[dotParts.length - 1];

    // Se o ponto parece separador de milhar: 3.500, 20.765, 1.234.567
    if (last.length === 3 && dotParts.every((part, index) => index === 0 ? /^\d{1,3}$/.test(part) : /^\d{3}$/.test(part))) {
      s = dotParts.join('');
    }
    // Caso contrário, mantém como decimal internacional.
  }

  s = s.replace(/[^\d.]/g, '');
  if (!s || s === '.') return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function formatBRL(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthNamePt(monthNumber) {
  const item = MONTHS.find(([, n]) => n === Number(monthNumber));
  if (!item) return String(monthNumber || '');
  return item[0].charAt(0).toUpperCase() + item[0].slice(1);
}

function isDateText(value) {
  const s = String(value || '').trim();
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
}

function rowMoneyValues(row) {
  return (row || [])
    .map((cell, index) => ({ value: parseMoney(cell), index, raw: compactCell(cell) }))
    .filter((item) => item.value !== null && Math.abs(item.value) > 0);
}

function bestAmountFromRow(row) {
  const values = rowMoneyValues(row);
  if (!values.length) return null;
  // Normalmente o valor financeiro está nas últimas colunas ou formatado em R$.
  const withCurrency = values.filter((v) => /R\$/i.test(String(v.raw)));
  const candidates = withCurrency.length ? withCurrency : values;
  return candidates[candidates.length - 1].value;
}

function bestTextFromRow(row, mode = 'entry') {
  const blocked = /(total|saldo|caixa|valor|data|hora|timestamp|carimbo|forma|pagamento|pix|dinheiro|cart[aã]o|tipo|categoria|entrada|sa[ií]da|d[ií]zimo|oferta|campanha|cantina|descri[cç][aã]o|observa)/i;

  const cells = (row || [])
    .map((cell) => compactCell(cell))
    .filter(Boolean)
    .filter((cell) => !isDateText(cell))
    .filter((cell) => parseMoney(cell) === null)
    .filter((cell) => !blocked.test(cell));

  if (!cells.length) {
    const fallback = (row || [])
      .map((cell) => compactCell(cell))
      .filter(Boolean)
      .filter((cell) => !isDateText(cell))
      .filter((cell) => parseMoney(cell) === null);
    return fallback[0] || (mode === 'expense' ? 'Despesa sem descrição' : 'Contribuinte não identificado');
  }

  // Para saída, costuma ser melhor uma descrição maior; para entrada, o nome costuma ser a primeira célula textual boa.
  if (mode === 'expense') return cells.sort((a, b) => b.length - a.length)[0];
  return cells[0];
}

function addGrouped(map, key, amount, meta = {}) {
  const cleanKey = compactCell(key || 'Não identificado');
  if (!cleanKey || amount === null || !Number.isFinite(amount)) return;
  const current = map.get(cleanKey) || { name: cleanKey, total: 0, count: 0, rows: [] };
  current.total += Number(amount);
  current.count += 1;
  if (meta.rowNumber || meta.tab) current.rows.push(meta);
  map.set(cleanKey, current);
}

function findSummaryValue(rows, patterns) {
  for (let i = 0; i < (rows || []).length; i++) {
    const row = rows[i] || [];
    const text = normalizeText(row.join(' '));
    if (!patterns.some((p) => p.test(text))) continue;
    const values = rowMoneyValues(row);
    if (values.length) return { value: values[values.length - 1].value, rowNumber: i + 1 };
  }
  return null;
}

function analyzeFinanceTabs(tabs, sheet) {
  const summary = {
    sheetName: sheet.name,
    year: sheet.year || null,
    month: sheet.month || null,
    totals: {},
    topTithers: [],
    topExpenses: [],
    notes: []
  };

  const tithers = new Map();
  const expenses = new Map();
  let entryRowsTotal = 0;
  let expenseRowsTotal = 0;

  for (const tab of tabs || []) {
    const tabName = normalizeText(tab.tab || '');
    const rows = tab.rows || [];

    const totalEntradas = findSummaryValue(rows, [/total de entradas/, /total entradas/, /total receita/, /total recebido/]);
    const totalDizimos = findSummaryValue(rows, [/total de dizimos/, /total de dizimo/, /total dizimos/, /total dizimo/]);
    const totalOfertas = findSummaryValue(rows, [/total de ofertas/, /total ofertas/]);
    const totalSaidas = findSummaryValue(rows, [/total de saidas/, /total saidas/, /total despesas/, /total de despesas/]);
    const saldoAnterior = findSummaryValue(rows, [/saldo anterior/]);
    const saldoFinal = findSummaryValue(rows, [/saldo final/, /caixa/, /saldo em caixa/]);

    if (totalEntradas && summary.totals.entradas == null) summary.totals.entradas = totalEntradas.value;
    if (totalDizimos && summary.totals.dizimos == null) summary.totals.dizimos = totalDizimos.value;
    if (totalOfertas && summary.totals.ofertas == null) summary.totals.ofertas = totalOfertas.value;
    if (totalSaidas && summary.totals.saidas == null) summary.totals.saidas = totalSaidas.value;
    if (saldoAnterior && summary.totals.saldoAnterior == null) summary.totals.saldoAnterior = saldoAnterior.value;
    if (saldoFinal && summary.totals.saldoFinal == null) summary.totals.saldoFinal = saldoFinal.value;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!row.length) continue;

      const rowText = normalizeText(row.join(' '));
      if (!rowText || /total|saldo|caixa/.test(rowText)) continue;

      const amount = bestAmountFromRow(row);
      if (amount === null || Math.abs(amount) < 1) continue;

      const isEntryTab = /entrada|receita|dizimo|dizimos|oferta/.test(tabName);
      const isExpenseTab = /saida|saidas|despesa|gasto/.test(tabName);

      const isTithe = /dizimo|dizimos|dízimo|dízimos/.test(rowText) || (/dizimo|dizimos/.test(tabName) && isEntryTab);
      const isOffer = /oferta|ofertas/.test(rowText);
      const isExpense = isExpenseTab || /saida|saidas|despesa|gasto|pagamento|salario|aluguel|luz|agua|internet|compra|material/.test(rowText);

      if (isTithe) {
        const name = bestTextFromRow(row, 'entry');
        addGrouped(tithers, name, amount, { tab: tab.tab, rowNumber: i + 1 });
        entryRowsTotal += amount;
      } else if (isEntryTab && !isOffer && !/campanha|cantina/.test(rowText)) {
        // Fallback cuidadoso: algumas planilhas têm aba Entradas e uma coluna de tipo não visível no print.
        // Se não houver palavra “dízimo” na linha, não classifica como dizimista.
      }

      if (isExpense) {
        const desc = bestTextFromRow(row, 'expense');
        addGrouped(expenses, desc, amount, { tab: tab.tab, rowNumber: i + 1 });
        expenseRowsTotal += amount;
      }
    }
  }

  summary.topTithers = Array.from(tithers.values())
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  summary.topExpenses = Array.from(expenses.values())
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Não preencher totais gerais por soma automática de linhas sem certeza.
  // Isso evita números errados quando a estrutura da planilha muda.

  return summary;
}

function buildFinanceAnswer({ church, query, reports, selectedSheets }) {
  const months = requestedMonths(query);
  const years = requestedYears(query);
  const monthLabel = months.length === 1 ? monthNamePt(months[0]) : 'Período solicitado';

  const lines = [];
  lines.push(`Relatório financeiro — ${church.name}`);
  lines.push(`Período analisado: ${monthLabel}${years.length ? ' de ' + years.join(' e ') : ''}.`);
  lines.push('');

  if (!reports.length) {
    lines.push('Não consegui localizar planilhas financeiras compatíveis com esse período dentro da igreja selecionada.');
    lines.push('Planilhas verificadas:');
    lines.push(...selectedSheets.slice(0, 12).map((s) => `• ${s.name} (${s.year || 'ano não identificado'} / mês ${s.month || 'não identificado'})`));
    return lines.join('\n');
  }

  for (const report of reports) {
    const titleBits = [];
    if (report.month) titleBits.push(monthNamePt(report.month));
    if (report.year) titleBits.push(String(report.year));
    lines.push(`${titleBits.join(' ') || report.sheetName}`);
    lines.push(`Planilha: ${report.sheetName}`);

    const t = report.totals || {};
    if (t.entradas != null) lines.push(`• Total de entradas/faturamento: ${formatBRL(t.entradas)}`);
    if (t.dizimos != null) lines.push(`• Total de dízimos: ${formatBRL(t.dizimos)}`);
    if (t.ofertas != null) lines.push(`• Total de ofertas: ${formatBRL(t.ofertas)}`);
    if (t.saidas != null) lines.push(`• Total de saídas/gastos: ${formatBRL(t.saidas)}`);
    if (t.saldoAnterior != null) lines.push(`• Saldo anterior: ${formatBRL(t.saldoAnterior)}`);
    if (t.saldoFinal != null) lines.push(`• Saldo final/caixa: ${formatBRL(t.saldoFinal)}`);

    lines.push('');

    lines.push('Principais dizimistas:');
    if (report.topTithers.length) {
      for (const item of report.topTithers) {
        lines.push(`• ${item.name}: ${formatBRL(item.total)}${item.count > 1 ? ` (${item.count} lançamentos)` : ''}`);
      }
    } else {
      lines.push('• Não identifiquei os dizimistas individualmente com segurança nos dados lidos.');
    }

    lines.push('');

    lines.push('Principais gastos:');
    if (report.topExpenses.length) {
      for (const item of report.topExpenses) {
        lines.push(`• ${item.name}: ${formatBRL(item.total)}${item.count > 1 ? ` (${item.count} lançamentos)` : ''}`);
      }
    } else {
      lines.push('• Não identifiquei gastos individualmente com segurança nos dados lidos.');
    }

    lines.push('');
  }

  if (reports.length >= 2) {
    const sorted = [...reports].sort((a, b) => (a.year || 0) - (b.year || 0));
    const older = sorted[0];
    const newer = sorted[sorted.length - 1];

    lines.push('Comparativo rápido:');

    function diffLine(label, key) {
      const a = older.totals?.[key];
      const b = newer.totals?.[key];
      if (a == null || b == null) return;
      const diff = b - a;
      const pct = a ? (diff / a) * 100 : null;
      const direction = diff >= 0 ? 'aumentou' : 'reduziu';
      lines.push(`• ${label}: ${direction} ${formatBRL(Math.abs(diff))}${pct !== null ? ` (${Math.abs(pct).toFixed(1).replace('.', ',')}%)` : ''}, de ${formatBRL(a)} para ${formatBRL(b)}.`);
    }

    diffLine('Entradas/faturamento', 'entradas');
    diffLine('Dízimos', 'dizimos');
    diffLine('Ofertas', 'ofertas');
    diffLine('Saídas/gastos', 'saidas');
    diffLine('Saldo final', 'saldoFinal');
    lines.push('');
  }

  lines.push('Observação: quando alguma linha não deixa claro se é dízimo, oferta ou outro tipo de entrada, eu não classifico como dizimista para evitar erro.');
  return lines.join('\n');
}


function inferExpenseCategoryQuery(query) {
  const q = normalizeText(query);
  return /(insumo|insumos|categoria|tipo de gasto|tipos de gasto|quais tipos|por tipo|cantina|limpeza|kids|descartav|papelaria|recepcao|recepção|material|materiais)/.test(q);
}

function expenseSearchTerms(query) {
  const q = normalizeText(query);
  const terms = new Set(extractQueryTerms(query));

  if (/insumo|insumos/.test(q)) {
    [
      'insumo','insumos','limpeza','kids','infantil','crianca','criança','biscoito','papel','papelaria',
      'descartavel','descartável','copo','prato','talher','guardanapo','recepcao','recepção',
      'cafe','café','agua','água','material','materiais','higiene','cozinha'
    ].forEach((t) => terms.add(t));
  }

  if (/cantina/.test(q)) {
    ['cantina','bebida','salgado','pastel','massa','alimento','refrigerante','agua','água','lanche'].forEach((t) => terms.add(t));
  }

  return Array.from(terms).map(normalizeText).filter(Boolean);
}

function classifyExpenseType(description) {
  const d = normalizeText(description);
  if (/(limpeza|detergente|desinfetante|sabao|sabão|agua sanitaria|água sanitária|higiene|papel higienico|papel higiênico)/.test(d)) return 'Limpeza e higiene';
  if (/(kids|crianca|criança|infantil|biscoito|suco|lanche)/.test(d)) return 'Kids / Infantil';
  if (/(descartavel|descartável|copo|prato|talher|guardanapo|sacola)/.test(d)) return 'Descartáveis';
  if (/(papelaria|papel|caneta|impressao|impressão|toner|cartucho|etiqueta)/.test(d)) return 'Papelaria';
  if (/(recepcao|recepção|visitante|convidado|cafe|café|agua|água)/.test(d)) return 'Recepção';
  if (/(cozinha|cantina|bebida|salgado|pastel|refrigerante|alimento|mercado)/.test(d)) return 'Cozinha / Cantina';
  if (/(material|materiais|insumo|insumos)/.test(d)) return 'Materiais / Insumos';
  return 'Outros insumos';
}

function rowLooksLikeExpense(row, tabName) {
  const text = normalizeText((row || []).join(' '));
  const tab = normalizeText(tabName || '');
  return /saida|saidas|despesa|gasto|pagamento|compra/.test(tab) || /saida|saidas|despesa|gasto|pagamento|compra/.test(text);
}

function rowMatchesTerms(row, terms) {
  const text = normalizeText((row || []).join(' '));
  if (!terms.length) return false;
  return terms.some((term) => term && text.includes(term));
}

function buildCategoryExpenseReport({ church, query, reports }) {
  const months = requestedMonths(query);
  const years = requestedYears(query);
  const monthNames = months.map(monthNamePt).join(', ') || 'período solicitado';
  const yearNames = years.join(', ') || String(CURRENT_YEAR);

  const allItems = [];
  const byType = new Map();
  const byMonth = new Map();

  for (const report of reports) {
    for (const item of report.items || []) {
      allItems.push(item);
      addGrouped(byType, item.type, item.amount, {});
      addGrouped(byMonth, `${monthNamePt(report.month)} ${report.year}`, item.amount, {});
    }
  }

  const total = allItems.reduce((sum, item) => sum + item.amount, 0);
  const typeList = Array.from(byType.values()).sort((a, b) => b.total - a.total);
  const monthList = Array.from(byMonth.values()).sort((a, b) => a.name.localeCompare(b.name));

  const lines = [];
  lines.push(`Relatório de gastos com insumos — ${church.name}`);
  lines.push(`Período: ${monthNames} de ${yearNames}.`);
  lines.push('');

  if (!allItems.length) {
    lines.push('Não encontrei lançamentos de insumos nesse período com segurança.');
    lines.push('Tente informar uma palavra específica, como limpeza, descartáveis, kids, papelaria, recepção ou cantina.');
    return lines.join('\n');
  }

  lines.push(`Total encontrado em insumos: ${formatBRL(total)}`);
  lines.push('');

  lines.push('Gastos por tipo:');
  for (const item of typeList.slice(0, 10)) {
    lines.push(`• ${item.name}: ${formatBRL(item.total)}`);
  }

  lines.push('');
  lines.push('Gastos por mês:');
  for (const item of monthList) {
    lines.push(`• ${item.name}: ${formatBRL(item.total)}`);
  }

  lines.push('');
  lines.push('Principais lançamentos:');
  allItems
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12)
    .forEach((item) => {
      lines.push(`• ${item.description}: ${formatBRL(item.amount)} (${monthNamePt(item.month)} ${item.year})`);
    });

  lines.push('');
  lines.push('Observação: considerei apenas linhas que continham termos relacionados a insumos. Se algum item foi lançado com outro nome, posso buscar por essa palavra específica.');
  return lines.join('\n');
}

async function buildFastCategoryExpenseReport(query, options = {}) {
  const church = getChurch(options.churchId);
  const token = await getGoogleAccessToken([DRIVE_SCOPE, SHEETS_SCOPE]);

  const rootFolders = await findRootFolders({ token, church }).catch(() => []);
  const folderTree = rootFolders.length ? await listFolderTree({ token, rootFolders, maxDepth: Number(process.env.ADAM_CHURCH_FOLDER_DEPTH || 4) }) : [];

  const spreadsheetFiles = folderTree.length
    ? await listSpreadsheetsFromFolders({ token, folderTree, limit: Number(process.env.ADAM_CHURCH_SHEETS_LIMIT || 180) }).catch(() => [])
    : [];

  const discoveredSheets = spreadsheetFiles.map((file) => inferSheetMeta(file, church));
  const sheets = mergeSheets([...church.knownSheets], discoveredSheets, church);
  const selectedSheets = selectSpreadsheets({ sheets, query }).filter((s) => s.type === 'finance' || /finance|controle|20\d{2}|janeiro|fevereiro|marco|março|abril|maio|junho/.test(sheetText(s)));

  const terms = expenseSearchTerms(query);
  const reports = [];

  for (const sheet of selectedSheets.slice(0, Number(process.env.ADAM_FAST_REPORT_MAX_SHEETS || 6))) {
    try {
      const tabs = await readSheetDataViaSheetsApi({ token, spreadsheetId: sheet.id, query, finance: true, members: false });
      const report = { sheetName: sheet.name, year: sheet.year, month: sheet.month, items: [] };

      for (const tab of tabs || []) {
        for (let i = 0; i < (tab.rows || []).length; i++) {
          const row = tab.rows[i] || [];
          if (!row.length) continue;
          const rowText = normalizeText(row.join(' '));
          if (/total|saldo|caixa/.test(rowText)) continue;
          if (!rowLooksLikeExpense(row, tab.tab)) continue;
          if (!rowMatchesTerms(row, terms)) continue;

          const amountRaw = bestAmountFromRow(row);
          if (amountRaw === null) continue;
          const amount = Math.abs(amountRaw);
          if (!amount || amount < 1) continue;

          const description = bestTextFromRow(row, 'expense');
          report.items.push({
            description,
            amount,
            type: classifyExpenseType(description + ' ' + row.join(' ')),
            month: sheet.month,
            year: sheet.year
          });
        }
      }

      reports.push(report);
    } catch (error) {
      reports.push({ sheetName: sheet.name, year: sheet.year, month: sheet.month, items: [] });
    }
  }

  return {
    answer: buildCategoryExpenseReport({ church, query, reports }),
    church,
    reports,
    selectedSheets: selectedSheets.map((s) => ({ name: s.name, id: s.id, year: s.year, month: s.month, type: s.type }))
  };
}


async function buildFastFinanceReport(query, options = {}) {
  const church = getChurch(options.churchId);
  const token = await getGoogleAccessToken([DRIVE_SCOPE, SHEETS_SCOPE]);

  const rootFolders = await findRootFolders({ token, church }).catch(() => []);
  const folderTree = rootFolders.length ? await listFolderTree({ token, rootFolders, maxDepth: Number(process.env.ADAM_CHURCH_FOLDER_DEPTH || 4) }) : [];

  const spreadsheetFiles = folderTree.length
    ? await listSpreadsheetsFromFolders({ token, folderTree, limit: Number(process.env.ADAM_CHURCH_SHEETS_LIMIT || 180) }).catch(() => [])
    : [];

  const discoveredSheets = spreadsheetFiles.map((file) => inferSheetMeta(file, church));
  const extraSheets = envList('GOOGLE_EXTRA_SPREADSHEET_IDS').map((id, index) => ({
    name: `Planilha extra ${index + 1}`,
    id,
    area: church.name,
    type: 'extra',
    churchId: church.id
  }));

  const sheets = mergeSheets([...church.knownSheets, ...extraSheets], discoveredSheets, church);
  const selectedSheets = selectSpreadsheets({ sheets, query }).filter((s) => s.type === 'finance' || /finance|controle|20\d{2}|janeiro|fevereiro|marco|março|abril|maio|junho/.test(sheetText(s)));

  const reports = [];
  for (const sheet of selectedSheets.slice(0, Number(process.env.ADAM_FAST_REPORT_MAX_SHEETS || 4))) {
    try {
      const tabs = await readSheetDataViaSheetsApi({ token, spreadsheetId: sheet.id, query, finance: true, members: false });
      reports.push(analyzeFinanceTabs(tabs, sheet));
    } catch (error) {
      reports.push({
        sheetName: sheet.name,
        year: sheet.year,
        month: sheet.month,
        totals: {},
        topTithers: [],
        topExpenses: [],
        notes: [`Não foi possível ler pela Sheets API: ${error.message}`]
      });
    }
  }

  return {
    answer: buildFinanceAnswer({ church, query, reports, selectedSheets }),
    church,
    reports,
    selectedSheets: selectedSheets.map((s) => ({ name: s.name, id: s.id, year: s.year, month: s.month, type: s.type }))
  };
}


module.exports = {
  buildDriveContext,
  CHURCHES,
  inferSpreadsheetQuestion,
  inferFinanceQuestion,
  requestedMonths,
  requestedYears,
  buildFastFinanceReport,
  buildFastCategoryExpenseReport,
  inferExpenseCategoryQuery
};
