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

const QUERY_STOPWORDS = new Set([
  'quanto','gasto','gastos','gastou','com','das','dos','de','do','da','desse','deste','dessa','desta','ano','mes','mês','semestre','primeiro','segundo','relatorio','relatório','detalhado','detalhe','detalhes','inclua','incluir','recalcule','recalcular','valor','exato','exata','financeiro','pode','me','dar','um','uma','os','as','o','a','no','na','nos','nas','para','por','foi','foram','esse','essa','este','esta','adam','pastor','bernardo','verifique','verificar','chute','chutar','valores','liste','listar','todas','todos','despesas','despesa','encontrou','encontradas','desconheco','desconheço','explique','detalhadamente'
]);

const MONTH_WORDS = /(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/;
const EXPENSE_WORDS = /(gasto|gastos|gastou|saida|saidas|saída|saídas|despesa|despesas|custo|custou|investido|pago|pagamento|pagamentos|compra|compras|relatorio de gastos|relatório de gastos)/;
const INCOME_WORDS = /(entrada|entradas|receita|receitas|dizimo|dizimos|dízimo|dízimos|oferta|ofertas|campanha|cantina|pix|maquininha|dinheiro|recebido|recebimento)/;

function queryTerms(query) {
  const q = normalizeText(query);
  const tokens = q
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));

  const important = [];
  for (const token of tokens) {
    if (!important.includes(token)) important.push(token);
  }
  return important.slice(0, 12);
}

function inferEventTerms(query) {
  const q = normalizeText(query);
  const events = [];
  const add = (label, terms) => {
    if (!events.some((event) => event.label === label)) events.push({ label, terms });
  };

  if (/country|festa country/.test(q)) add('Festa Country', ['country']);
  if (/pink|pink conference/.test(q)) add('Pink', ['pink']);
  if (/zion/.test(q)) add('Zion', ['zion']);
  if (/power/.test(q)) add('Power', ['power']);
  if (/ceia/.test(q)) add('Santa Ceia', ['ceia']);
  if (/conferencia|conference/.test(q)) add('Conferência', ['conferencia', 'conference']);
  if (/retiro/.test(q)) add('Retiro', ['retiro']);

  const terms = queryTerms(query).filter((term) => !MONTH_WORDS.test(term) && !/(diesel|caminhao|caminhao|touro|mecanico|mecanico|bebida|bebidas|salgado|salgados|insumo|insumos|cantina|limpeza|kids|papelaria|descartavel|descartaveis|massa|pastel|material|escolar|recepcao|recepção)/.test(term));
  if (!events.length && /festa|evento|congresso|confraternizacao|confraternização|campanha/.test(q)) {
    const eventSpecific = terms.filter((term) => !/(festa|evento|congresso|confraternizacao|confraternização|campanha)/.test(term)).slice(0, 3);
    if (eventSpecific.length) add(eventSpecific.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' '), eventSpecific);
  }

  return events;
}

function inferQuestionFocus(query) {
  const q = normalizeText(query);
  const eventTerms = inferEventTerms(query);
  const wantsExpenses = EXPENSE_WORDS.test(q) || /quanto foi.*com|quanto.*custou/.test(q);
  const wantsIncome = INCOME_WORDS.test(q);
  const asksCantinaExpenses = /cantina/.test(q) && (wantsExpenses || /gasto|despesa|saida|saída/.test(q));
  const asksInsumos = /insumo|insumos/.test(q);
  const asksTithesOfferings = /dizim|dízim|ofert/.test(q);
  let strictType = null;

  if (eventTerms.length && wantsExpenses) strictType = 'event_expenses';
  else if (asksCantinaExpenses) strictType = 'cantina_expenses';
  else if (asksInsumos && (wantsExpenses || /movimento|relatorio|relatório|semestre|mensal|mes|mês/.test(q))) strictType = 'insumos_expenses';
  else if (asksTithesOfferings && (wantsIncome || /quanto|total|semestre|relatorio|relatório/.test(q))) strictType = 'tithes_offerings_income';

  return {
    terms: queryTerms(query),
    eventTerms,
    strictMode: Boolean(strictType),
    strictType,
    isEventLike: eventTerms.length > 0 || /festa|evento|congresso|conferencia|confraternizacao|retiro|culto|campanha/.test(q),
    isFinanceTotal: /quanto|total|soma|gasto|gastou|entrada|saida|relatorio|relatório|movimento/.test(q),
    wantsExpenses,
    wantsIncome: strictType === 'tithes_offerings_income' ? true : wantsIncome,
    wantsOnlyExpenses: strictType === 'event_expenses' || strictType === 'cantina_expenses' || strictType === 'insumos_expenses',
    label: eventTerms[0]?.label || (strictType === 'cantina_expenses' ? 'Cantina' : strictType === 'insumos_expenses' ? 'Insumos' : strictType === 'tithes_offerings_income' ? 'Dízimos e Ofertas' : 'Busca financeira')
  };
}

function inferHeaders(rows) {
  const maxCols = Math.max(0, ...((rows || []).slice(0, 30).map((row) => (row || []).length)));
  const headers = Array(maxCols).fill('');
  const sectionByCol = Array(maxCols).fill('');

  for (let i = 0; i < Math.min((rows || []).length, 18); i++) {
    const row = rows[i] || [];
    const markers = [];
    for (let c = 0; c < row.length; c++) {
      const cell = normalizeText(row[c]);
      if (!cell || parseMoney(row[c]) !== null) continue;
      if (/(^|\b)(entradas?|receitas?|recebimentos?|dizimos?|dízimos?|ofertas?)(\b|$)/.test(cell)) markers.push({ c, section: 'entrada' });
      if (/(^|\b)(saidas?|saídas?|despesas?|pagamentos?|custos?)(\b|$)/.test(cell)) markers.push({ c, section: 'saida' });
    }
    if (markers.length) {
      markers.sort((a, b) => a.c - b.c);
      for (let m = 0; m < markers.length; m++) {
        const start = markers[m].c;
        const end = m + 1 < markers.length ? markers[m + 1].c : Math.min(maxCols, start + 6);
        for (let c = start; c < end; c++) sectionByCol[c] = markers[m].section;
      }
    }
  }

  for (let i = 0; i < Math.min((rows || []).length, 30); i++) {
    const row = rows[i] || [];
    const normalizedCells = row.map((cell) => normalizeText(cell));
    const joined = normalizedCells.join(' ');
    if (/(data|descricao|descrição|historico|histórico|valor|entrada|saida|saída|despesa|receita|saldo|categoria|forma|tipo)/.test(joined)) {
      for (let c = 0; c < row.length; c++) {
        const h = normalizedCells[c] || '';
        if (!h) continue;
        const section = sectionByCol[c] ? `${sectionByCol[c]} ` : '';
        headers[c] = `${section}${h}`.trim();
      }
    }
  }

  for (let c = 0; c < headers.length; c++) {
    if (!headers[c] && sectionByCol[c]) headers[c] = sectionByCol[c];
  }

  return headers;
}

function valuesWithColumns(row, headers = []) {
  const values = [];
  for (let c = 0; c < (row || []).length; c++) {
    const parsed = parseMoney(row[c]);
    if (parsed !== null) {
      values.push({ amount: parsed, column: c + 1, header: headers[c] || '', raw: String(row[c] || '') });
    }
  }
  return values;
}

function isExpenseHeader(header) {
  return /(saida|saída|despesa|pagamento|pago|debito|débito|custo)/.test(normalizeText(header));
}

function isIncomeHeader(header) {
  return /(entrada|receita|credito|crédito|dizimo|dízimo|oferta|campanha|cantina|pix|maquininha|dinheiro|recebimento)/.test(normalizeText(header));
}

function rowLooksLikeTotal(rowText) {
  const text = normalizeText(rowText);
  return /(total geral|total de|soma|subtotal|saldo|caixa atual|resumo|consolidado)/.test(text);
}

function selectFinancialAmount(row, headers = [], focus = {}, tabName = '') {
  const values = valuesWithColumns(row, headers);
  const rowText = (row || []).map((cell) => String(cell || '').trim()).filter(Boolean).join(' | ');
  const normRow = normalizeText(rowText);
  const normTab = normalizeText(tabName);
  if (!values.length) return { amount: null, confidence: 'none', reason: 'nenhum valor monetário detectado', values, kind: 'none' };
  if (rowLooksLikeTotal(rowText)) return { amount: null, confidence: 'ignored_total', reason: 'linha de total/saldo/resumo não é lançamento individual', values, kind: 'ignored' };

  const desired = focus.wantsOnlyExpenses ? 'expense' : (focus.wantsIncome && !focus.wantsExpenses ? 'income' : (focus.wantsIncome ? 'income' : (focus.wantsExpenses ? 'expense' : 'any')));

  const scored = values.map((v) => {
    const h = normalizeText(v.header);
    let kind = 'unknown';
    if (isExpenseHeader(h)) kind = 'expense';
    if (isIncomeHeader(h)) kind = 'income';
    if (kind === 'unknown' && /saida|saída|despesa|pagamento|pago|compra/.test(normTab)) kind = 'expense';
    if (kind === 'unknown' && /entrada|receita|dizimo|oferta/.test(normTab)) kind = 'income';

    let score = 0;
    if (desired === kind) score += 20;
    if (desired === 'any') score += 2;
    if (/valor/.test(h)) score += 5;
    if (/(data|dia|mes|mês|ano|telefone|cpf|cnpj|id)/.test(h)) score -= 15;
    if (/(saldo|total acumulado|acumulado|caixa)/.test(h)) score -= 20;
    if (kind === 'income' && desired === 'expense') score -= 40;
    if (kind === 'expense' && desired === 'income') score -= 40;
    if (Math.abs(v.amount) > 0) score += 1;
    return { ...v, kind, score };
  }).sort((a, b) => (b.score - a.score) || (b.column - a.column));

  const best = scored[0];
  if (desired !== 'any') {
    const sameKind = scored.filter((v) => v.kind === desired && v.score >= 15);
    if (sameKind.length === 1) {
      const v = sameKind[0];
      return { amount: v.amount, confidence: 'high', reason: `coluna ${v.column}${v.header ? ` (${v.header})` : ''}`, values, kind: desired };
    }
    if (sameKind.length > 1) {
      const valueHeaders = sameKind.filter((v) => /valor/.test(normalizeText(v.header)));
      const chosen = valueHeaders[0] || sameKind[0];
      return { amount: chosen.amount, confidence: 'medium', reason: `melhor candidato de ${desired === 'expense' ? 'saída' : 'entrada'} na coluna ${chosen.column}${chosen.header ? ` (${chosen.header})` : ''}; havia ${sameKind.length} valores do mesmo tipo`, values, kind: desired };
    }

    // Sem coluna identificável: só aceita como pendente/ambígua, nunca soma automaticamente.
    if (values.length === 1) {
      const opposite = desired === 'expense' ? /(dizim|dízim|ofert|receita|entrada)/.test(normRow) : /(saida|saída|despesa|pagamento|pago|compra)/.test(normRow);
      if (!opposite && /(saida|saída|despesa|pagamento|pago|compra|entrada|receita|dizim|dízim|ofert)/.test(normRow + ' ' + normTab)) {
        return { amount: values[0].amount, confidence: 'medium', reason: `único valor monetário em contexto de ${desired === 'expense' ? 'saída' : 'entrada'}, coluna ${values[0].column}`, values, kind: desired };
      }
    }
    return { amount: null, confidence: 'ambiguous', reason: `não encontrei uma coluna confiável de ${desired === 'expense' ? 'saída/despesa' : 'entrada/receita'} nesta linha; não somado`, values, kind: 'ambiguous' };
  }

  if (best.score >= 5) return { amount: best.amount, confidence: 'medium', reason: `melhor valor monetário na coluna ${best.column}${best.header ? ` (${best.header})` : ''}`, values, kind: best.kind };
  if (values.length === 1) return { amount: values[0].amount, confidence: 'medium', reason: `único valor monetário na linha, coluna ${values[0].column}`, values, kind: 'unknown' };
  return { amount: null, confidence: 'ambiguous', reason: `linha tem ${values.length} valores monetários e nenhuma coluna confiável; requer conferência`, values, kind: 'ambiguous' };
}

function rowMatchesQuery(rowText, focus) {
  const text = normalizeText(rowText);

  if (focus.strictType === 'event_expenses') {
    const terms = focus.eventTerms.flatMap((event) => event.terms || []);
    return terms.length > 0 && terms.some((term) => text.includes(term));
  }

  if (focus.strictType === 'cantina_expenses') {
    return /(cantina|bebida|bebidas|salgado|salgados|massa de pastel|pastel|refrigerante|coca|guarana|guaraná|agua|água|suco|alimento|alimentacao|alimentação|lanche|lanches|descartavel|descartáveis|descartaveis|copo|copos|prato|pratos|talher|talheres|guardanapo)/.test(text);
  }

  if (focus.strictType === 'insumos_expenses') {
    return /(insumo|insumos|limpeza|material escolar|biscoito|kids|crianca|criança|infantil|papelaria|descartavel|descartáveis|descartaveis|recepcao|recepção|higiene|higienico|higiênico|sabonete|alcool|álcool|detergente|desinfetante|saco de lixo|lixo)/.test(text);
  }

  if (focus.strictType === 'tithes_offerings_income') {
    return /(dizimo|dízimo|dizimos|dízimos|oferta|ofertas)/.test(text);
  }

  const terms = focus.terms || [];
  if (!terms.length) return false;
  return terms.some((t) => text.includes(t));
}

function inferMatchCategory(rowText, focus) {
  const text = normalizeText(rowText);
  if (focus.strictType === 'tithes_offerings_income') {
    if (/dizim|dízim/.test(text)) return 'Dízimos';
    if (/ofert/.test(text)) return 'Ofertas';
  }
  if (focus.strictType === 'cantina_expenses') {
    if (/bebida|refrigerante|coca|guarana|guaraná|agua|água|suco/.test(text)) return 'Bebidas';
    if (/salgado|salgados/.test(text)) return 'Salgados';
    if (/massa de pastel|pastel/.test(text)) return 'Massa de pastel/Pastel';
    if (/descartavel|descartáveis|descartaveis|copo|copos|prato|talher|guardanapo/.test(text)) return 'Materiais de venda/descartáveis';
    return 'Cantina';
  }
  if (focus.strictType === 'insumos_expenses') {
    if (/limpeza|higiene|detergente|desinfetante|saco de lixo|lixo|alcool|álcool/.test(text)) return 'Limpeza';
    if (/material escolar|papelaria/.test(text)) return 'Material escolar/Papelaria';
    if (/kids|crianca|criança|infantil|biscoito/.test(text)) return 'Kids';
    if (/descartavel|descartáveis|descartaveis/.test(text)) return 'Descartáveis';
    if (/recepcao|recepção/.test(text)) return 'Insumo de recepção';
    return 'Insumos';
  }
  if (focus.strictType === 'event_expenses') return focus.label || 'Evento';
  return detectCategory(rowText) || 'Outros';
}

function buildQueryAudit(tabs, query) {
  const focus = inferQuestionFocus(query);
  if (!focus.terms.length && !focus.strictMode) return null;

  const matches = [];
  let selectedTotal = 0;
  let selectedCount = 0;
  let ambiguousCount = 0;

  for (const tab of tabs || []) {
    const headers = inferHeaders(tab.rows || []);
    for (let i = 0; i < (tab.rows || []).length; i++) {
      const row = tab.rows[i] || [];
      const rowText = row.map((cell) => String(cell || '').trim()).filter(Boolean).join(' | ');
      if (!rowText || !rowMatchesQuery(rowText, focus)) continue;

      const selected = selectFinancialAmount(row, headers, focus, tab.tab);
      const category = inferMatchCategory(rowText, focus);
      const canSum = selected.amount !== null && selected.confidence !== 'ambiguous' && selected.confidence !== 'ignored_total' && (!focus.wantsOnlyExpenses || selected.kind === 'expense') && (!(focus.strictType === 'tithes_offerings_income') || selected.kind === 'income');
      if (canSum) {
        selectedTotal += selected.amount;
        selectedCount += 1;
      } else if (selected.values.length) {
        ambiguousCount += 1;
      }

      matches.push({
        tab: tab.tab,
        rowNumber: i + 1,
        text: rowText.slice(0, 650),
        amount: canSum ? selected.amount : null,
        rawAmount: selected.amount,
        category,
        confidence: selected.confidence,
        reason: selected.reason,
        kind: selected.kind,
        included: canSum,
        allValues: selected.values.map((v) => `${brl(v.amount)} na coluna ${v.column}${v.header ? ` (${v.header})` : ''}`)
      });
    }
  }

  return {
    focus,
    matches,
    selectedTotal,
    selectedCount,
    ambiguousCount
  };
}

function auditToText(audit, monthLabel) {
  if (!audit) return '';
  const lines = [];
  lines.push(`CÁLCULO TÉCNICO DE LINHAS ENCONTRADAS: ${monthLabel}`);
  lines.push(`Tipo de busca: ${audit.focus.strictType || 'geral'} | Critério: ${audit.focus.label || audit.focus.terms.join(', ') || 'termos do usuário'}`);
  lines.push(`Regra aplicada: somente ${audit.focus.wantsOnlyExpenses ? 'SAÍDAS/DESPESAS' : audit.focus.strictType === 'tithes_offerings_income' ? 'ENTRADAS/RECEITAS' : 'linhas financeiras'} com descrição compatível são somadas. Entradas não entram em relatório de gastos. Despesas genéricas sem o nome do evento não entram em gastos de evento.`);
  if (!audit.matches.length) {
    lines.push('Nenhuma linha encontrada com estes critérios na leitura completa das abas processadas.');
    return lines.join('\n');
  }
  lines.push(`Linhas encontradas: ${audit.matches.length}`);
  lines.push(`Linhas somadas com segurança: ${audit.selectedCount}`);
  lines.push(`Linhas pendentes/ambíguas/não somadas: ${audit.ambiguousCount}`);
  lines.push(`Total técnico confirmado: ${brl(audit.selectedTotal)}`);
  lines.push('Evidências linha a linha:');
  for (const m of audit.matches.slice(0, 100)) {
    const amount = m.included ? brl(m.amount) : 'NÃO SOMADO';
    const all = m.allValues && m.allValues.length ? ` | valores detectados: ${m.allValues.join('; ')}` : '';
    lines.push(`• ${m.included ? 'INCLUÍDA' : 'PENDENTE'} | ${m.tab} L${m.rowNumber} | ${m.category}: ${m.text} | valor considerado: ${amount} | tipo: ${m.kind} | confiança: ${m.confidence} | critério: ${m.reason}${all}`);
  }
  return lines.join('\n');
}

function buildStrictFinanceAnswerFromAudits(query, auditItems) {
  const focus = inferQuestionFocus(query);
  if (!focus.strictMode) return '';

  const included = [];
  const pending = [];
  for (const item of auditItems) {
    for (const match of item.audit.matches || []) {
      const record = { ...match, monthLabel: item.label };
      if (match.included) included.push(record);
      else pending.push(record);
    }
  }

  const total = included.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byMonth = new Map();
  const byCategory = new Map();
  for (const item of included) {
    byMonth.set(item.monthLabel, (byMonth.get(item.monthLabel) || 0) + Number(item.amount || 0));
    byCategory.set(item.category, (byCategory.get(item.category) || 0) + Number(item.amount || 0));
  }

  const lines = [];
  lines.push(`Olá, Pastor Bernardo. Fiz uma conferência técnica nas planilhas conectadas e apliquei uma regra de precisão: eu só somei lançamentos que consegui identificar como ${focus.wantsOnlyExpenses ? 'saída/despesa' : 'entrada/receita'} e que tinham descrição compatível com “${focus.label}”.`);
  lines.push('');
  lines.push(`Resumo confirmado ${focus.strictType === 'event_expenses' ? `de gastos com ${focus.label}` : `de ${focus.label}`}:`);
  lines.push(`• Total confirmado: ${brl(total)}`);
  lines.push(`• Linhas somadas: ${included.length}`);
  lines.push(`• Linhas pendentes/não somadas: ${pending.length}`);

  if (byMonth.size) {
    lines.push('');
    lines.push('Totais por mês:');
    for (const [month, value] of Array.from(byMonth.entries())) lines.push(`• ${month}: ${brl(value)}`);
  }

  if (byCategory.size && (focus.strictType === 'cantina_expenses' || focus.strictType === 'insumos_expenses' || focus.strictType === 'tithes_offerings_income')) {
    lines.push('');
    lines.push('Totais por categoria:');
    for (const [category, value] of Array.from(byCategory.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) lines.push(`• ${category}: ${brl(value)}`);
  }

  if (included.length) {
    lines.push('');
    lines.push('Itens considerados no cálculo:');
    for (const item of included.slice(0, 80)) {
      lines.push(`• ${item.monthLabel} | ${item.tab} L${item.rowNumber}: ${item.text} — ${brl(item.amount)}`);
    }
  } else {
    lines.push('');
    lines.push('Não encontrei nenhum lançamento seguro para somar com esses critérios.');
  }

  if (pending.length) {
    lines.push('');
    lines.push('Itens encontrados, mas não somados por segurança:');
    for (const item of pending.slice(0, 30)) {
      lines.push(`• ${item.monthLabel} | ${item.tab} L${item.rowNumber}: ${item.text} — motivo: ${item.reason}`);
    }
  }

  lines.push('');
  lines.push('Observação: não incluí contas gerais, entradas, totais de saldo, linhas de resumo ou despesas sem o termo do evento/categoria solicitado.');
  return lines.join('\n');
}

async function buildStrictFinanceAnswer({ token, query }) {
  const focus = inferQuestionFocus(query);
  if (!focus.strictMode) return '';
  const selectedSheets = inferRequestedFinanceSheets(query);
  if (!selectedSheets.length) return '';

  const auditItems = [];
  for (const sheet of selectedSheets) {
    try {
      const tabs = await batchReadSheet({ token, spreadsheetId: sheet.id, maxSheets: 12, maxRows: 1600, maxCols: 38 });
      const audit = buildQueryAudit(tabs, query);
      auditItems.push({ label: sheet.label, audit: audit || { matches: [], selectedTotal: 0, selectedCount: 0, ambiguousCount: 0 } });
    } catch (error) {
      auditItems.push({ label: sheet.label, audit: { matches: [{ tab: 'Erro de leitura', rowNumber: 0, text: `Não foi possível ler esta planilha: ${error.message}`, amount: null, included: false, confidence: 'error', reason: error.message, allValues: [] }], selectedTotal: 0, selectedCount: 0, ambiguousCount: 1 } });
    }
  }
  return buildStrictFinanceAnswerFromAudits(query, auditItems);
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
  const queryAudits = [];

  for (const sheet of selectedSheets) {
    try {
      const tabs = await batchReadSheet({ token, spreadsheetId: sheet.id, maxSheets: 12, maxRows: 1200, maxCols: 32 });
      const analysis = analyzeFinanceTabs(tabs);
      const audit = buildQueryAudit(tabs, query);
      if (audit) queryAudits.push({ label: sheet.label, audit });
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

${auditToText(audit, sheet.label)}

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

  if (queryAudits.length) {
    const grand = queryAudits.reduce((sum, item) => sum + Number(item.audit.selectedTotal || 0), 0);
    const count = queryAudits.reduce((sum, item) => sum + Number(item.audit.selectedCount || 0), 0);
    const ambiguous = queryAudits.reduce((sum, item) => sum + Number(item.audit.ambiguousCount || 0), 0);
    const auditSummary = queryAudits.map((item) => `• ${item.label}: ${brl(item.audit.selectedTotal)} (${item.audit.selectedCount} linha(s) somada(s), ${item.audit.ambiguousCount} ambígua(s))`).join('\n');
    sections.unshift(`CÁLCULO TÉCNICO CONSOLIDADO DA BUSCA ESPECÍFICA DO USUÁRIO:
Meses verificados: ${queryAudits.map((item) => item.label).join(', ')}
Total técnico confiável: ${brl(grand)}
Linhas somadas: ${count}
Linhas ambíguas/não somadas: ${ambiguous}
${auditSummary}
Regra: somente valores com confiança high ou medium foram somados. Linhas ambíguas devem ser citadas como pendentes de conferência, não incluídas no total.`);
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

  const financeFocus = inferQuestionFocus(query);
  if (inferFinanceQuestion(query) && financeFocus.strictMode) {
    const strictFinanceAnswer = await buildStrictFinanceAnswer({ token, query });
    return {
      connected: true,
      context: `CONEXÃO GOOGLE DRIVE: ativa via Service Account.\n\nRESPOSTA FINANCEIRA TÉCNICA JÁ CALCULADA:\n${strictFinanceAnswer}`,
      strictFinanceAnswer,
      files: []
    };
  }

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
