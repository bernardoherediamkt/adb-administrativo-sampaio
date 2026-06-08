/**
 * ADAM DRIVE BRIDGE - ADB SAMPAIO
 * Cole este arquivo em um projeto do Google Apps Script logado na conta:
 * ministerioadbsampaio@gmail.com
 *
 * Deploy recomendado:
 * - Implantar > Nova implantação > App da Web
 * - Executar como: Eu
 * - Quem pode acessar: Qualquer pessoa com o link
 *
 * Segurança:
 * - Em Configurações do projeto > Propriedades do script, crie:
 *   ADAM_DRIVE_TOKEN = um token longo criado por você
 * - Use o mesmo token na Vercel em ADAM_DRIVE_TOKEN.
 */

const ADAM_RESOURCES = {
  folders: [
    { name: 'Documentos', id: '19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL', type: 'documentos administrativos' },
    { name: 'Controle Financeiro', id: '18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM', type: 'pasta financeira' },
    { name: 'Fotos dos Cultos', id: '1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6', type: 'mídia e fotos' }
  ],
  spreadsheets: [
    { name: 'Planilha de Membros', id: '1vX_lHJgylBPWtlGBJmVqABvPHuogv8EQYYIh1-zhj2Q', category: 'secretaria' },
    { name: 'Janeiro 2026', id: '13jof3g97AsQz26SRHmo53pOxidhZgXWSkWRqd3SFeBo', category: 'financeiro' },
    { name: 'Fevereiro 2026', id: '1sf_jfJ-PKsTN62WUwzAzpruwdaYVRFIeLeKV9h9Psqs', category: 'financeiro' },
    { name: 'Março 2026', id: '11irZSKrZQaIiNT78fLTAbp_WLrCCcOlKeUlcZVce7Hs', category: 'financeiro' },
    { name: 'Abril 2026', id: '1yHpksSYdCaXACUE16sb8gu2B1HZHySe1QqO0EJ1lnDc', category: 'financeiro' },
    { name: 'Maio 2026', id: '1wzhKhfRPRUa1ltTu3TTBliLm5c5611-qWniwrVxUfhk', category: 'financeiro' },
    { name: 'Junho 2026', id: '1jCBvXixmjT1fhdjYkQSNj806bwUcsfh6bo_mhLLFwEU', category: 'financeiro' }
  ]
};

function doGet(e) {
  return jsonResponse({
    connected: true,
    app: 'Adam Drive Bridge',
    account: Session.getActiveUser().getEmail() || 'Conta Google Apps Script',
    resources: {
      folders: ADAM_RESOURCES.folders.map(f => f.name),
      spreadsheets: ADAM_RESOURCES.spreadsheets.map(s => s.name)
    }
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validateToken(payload.token);

    const query = String(payload.query || '').trim();
    const mode = String(payload.mode || 'context');

    if (mode === 'health') {
      return jsonResponse({
        connected: true,
        message: 'Conector do Google Drive da ADB está online.',
        account: Session.getActiveUser().getEmail() || 'Conta Google Apps Script',
        checkedAt: new Date().toISOString()
      });
    }

    const context = buildAdamDriveContext(query);
    return jsonResponse({ connected: true, query, context });
  } catch (error) {
    return jsonResponse({ connected: false, error: String(error && error.message ? error.message : error) }, 400);
  }
}

function validateToken(token) {
  const saved = PropertiesService.getScriptProperties().getProperty('ADAM_DRIVE_TOKEN');
  if (!saved) throw new Error('ADAM_DRIVE_TOKEN não foi configurado nas Propriedades do Script.');
  if (!token || token !== saved) throw new Error('Token inválido para consultar o Drive.');
}

function jsonResponse(data, statusCode) {
  const out = ContentService.createTextOutput(JSON.stringify(data, null, 2));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function buildAdamDriveContext(query) {
  const q = normalize(query);
  const lines = [];
  lines.push('ECOSSISTEMA GOOGLE DRIVE - MINISTÉRIO ADB SAMPAIO');
  lines.push('Consulta: ' + (query || 'sem consulta específica'));
  lines.push('Gerado em: ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'));
  lines.push('');

  lines.push('RECURSOS CADASTRADOS NO CONECTOR:');
  ADAM_RESOURCES.folders.forEach(f => lines.push('- Pasta: ' + f.name + ' | ' + f.type + ' | ID: ' + f.id));
  ADAM_RESOURCES.spreadsheets.forEach(s => lines.push('- Planilha: ' + s.name + ' | ' + s.category));
  lines.push('');

  if (isFinanceQuery(q)) {
    lines.push('DADOS FINANCEIROS ENCONTRADOS:');
    lines.push(collectFinancialSheetsContext(q));
    lines.push('');
    lines.push('ARQUIVOS RECENTES DA PASTA FINANCEIRA:');
    lines.push(listFolderFilesSafe('18IlLgEjjGurn2PmEP1qieRvL9k-9vBGM', 35));
    lines.push('');
  }

  if (isSecretariaQuery(q)) {
    lines.push('DADOS DE SECRETARIA / MEMBROS:');
    lines.push(collectSheetContext('Planilha de Membros', '1vX_lHJgylBPWtlGBJmVqABvPHuogv8EQYYIh1-zhj2Q', 80));
    lines.push('');
    lines.push('DOCUMENTOS ADMINISTRATIVOS RECENTES:');
    lines.push(listFolderFilesSafe('19W25ZpV23G3LIXkRTIrN_9I0KuQYpUbL', 35));
    lines.push('');
  }

  if (isMediaQuery(q)) {
    lines.push('MÍDIA / FOTOS DOS CULTOS:');
    lines.push(listFolderFilesSafe('1gkAJXF4Tg5cMCSbEIDCbCO4mHv7HGVv6', 35));
    lines.push('');
  }

  lines.push('BUSCA GERAL NO DRIVE:');
  lines.push(searchDriveFiles(query, 25));
  lines.push('');

  lines.push('OBSERVAÇÃO: Se algum documento, PDF ou planilha não aparecer aqui, ele pode estar fora das pastas cadastradas, com permissão bloqueada, ou a consulta pode precisar de termos mais específicos.');

  return limitText(lines.join('\n'), 45000);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isFinanceQuery(q) {
  return /(finance|dizimo|dizimos|oferta|ofertas|entrada|entradas|saida|saidas|despesa|despesas|pagamento|saldo|movimento|caixa|relatorio|controle)/.test(q);
}

function isSecretariaQuery(q) {
  return /(secretaria|membro|membros|cadastro|visitante|documento|documentos|ata|relatorio|gabinete)/.test(q);
}

function isMediaQuery(q) {
  return /(midia|mídia|foto|fotos|culto|cultos|arte|artes|evento|eventos|drive)/.test(q);
}

function collectFinancialSheetsContext(q) {
  const selected = ADAM_RESOURCES.spreadsheets.filter(s => s.category === 'financeiro' && matchesMonth(q, s.name));
  const sheets = selected.length ? selected : ADAM_RESOURCES.spreadsheets.filter(s => s.category === 'financeiro');
  const lines = [];
  sheets.forEach(item => {
    lines.push(collectSheetContext(item.name, item.id, 120));
    lines.push('');
  });
  return lines.join('\n');
}

function matchesMonth(q, name) {
  const n = normalize(name);
  if (!q) return true;
  if (q.indexOf('janeiro') >= 0 || q.indexOf('jan') >= 0) return n.indexOf('janeiro') >= 0;
  if (q.indexOf('fevereiro') >= 0 || q.indexOf('fev') >= 0) return n.indexOf('fevereiro') >= 0;
  if (q.indexOf('marco') >= 0 || q.indexOf('março') >= 0 || q.indexOf('mar') >= 0) return n.indexOf('marco') >= 0;
  if (q.indexOf('abril') >= 0 || q.indexOf('abr') >= 0) return n.indexOf('abril') >= 0;
  if (q.indexOf('maio') >= 0 || q.indexOf('mai') >= 0) return n.indexOf('maio') >= 0;
  if (q.indexOf('junho') >= 0 || q.indexOf('jun') >= 0) return n.indexOf('junho') >= 0;
  return true;
}

function collectSheetContext(name, id, maxRowsPerTab) {
  try {
    const ss = SpreadsheetApp.openById(id);
    const lines = [];
    lines.push('PLANILHA: ' + name);
    lines.push('URL: ' + ss.getUrl());
    ss.getSheets().forEach(sheet => {
      const values = sheet.getDataRange().getDisplayValues();
      const rows = values.filter(r => r.join('').trim());
      lines.push('Aba: ' + sheet.getName() + ' | linhas com conteúdo: ' + rows.length);
      lines.push(analyzeRows(rows));
      rows.slice(0, maxRowsPerTab || 80).forEach((row, idx) => {
        lines.push('L' + (idx + 1) + ': ' + row.join(' | '));
      });
      if (rows.length > (maxRowsPerTab || 80)) lines.push('...[mais ' + (rows.length - (maxRowsPerTab || 80)) + ' linhas não enviadas para preservar limite]');
      lines.push('');
    });
    return limitText(lines.join('\n'), 18000);
  } catch (error) {
    return 'Não foi possível abrir a planilha ' + name + ': ' + error.message;
  }
}

function analyzeRows(rows) {
  let entradas = 0;
  let saidas = 0;
  let valores = 0;
  let countEntrada = 0;
  let countSaida = 0;

  rows.forEach(row => {
    const text = normalize(row.join(' '));
    const amount = findLargestMoneyValue(row);
    if (!amount) return;
    valores += amount;
    if (/(entrada|dizimo|dizimos|oferta|ofertas|receita|credito|crédito)/.test(text)) {
      entradas += amount;
      countEntrada++;
    }
    if (/(saida|saidas|despesa|debito|débito|pagamento|conta|compra|fornecedor)/.test(text)) {
      saidas += amount;
      countSaida++;
    }
  });

  const resumo = [];
  if (countEntrada || countSaida) {
    resumo.push('Resumo automático aproximado:');
    resumo.push('- Entradas identificadas: ' + countEntrada + ' lançamento(s), total aproximado R$ ' + formatMoney(entradas));
    resumo.push('- Saídas identificadas: ' + countSaida + ' lançamento(s), total aproximado R$ ' + formatMoney(saidas));
    resumo.push('- Saldo/movimento aproximado: R$ ' + formatMoney(entradas - saidas));
    resumo.push('Observação: cálculo automático feito por leitura textual das linhas; confirme com a estrutura oficial da planilha.');
  }
  return resumo.join('\n');
}

function findLargestMoneyValue(row) {
  let max = 0;
  row.forEach(cell => {
    const value = parseMoney(cell);
    if (Math.abs(value) > Math.abs(max)) max = value;
  });
  return max;
}

function parseMoney(value) {
  let s = String(value || '').trim();
  if (!s) return 0;
  s = s.replace(/R\$/g, '').replace(/\s/g, '');
  const hasComma = s.indexOf(',') >= 0;
  const hasDot = s.indexOf('.') >= 0;
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasComma) s = s.replace(',', '.');
  s = s.replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function listFolderFilesSafe(folderId, limit) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    return listFolderFiles(folder, limit || 30);
  } catch (error) {
    return 'Não foi possível listar a pasta ' + folderId + ': ' + error.message;
  }
}

function listFolderFiles(folder, limit) {
  const items = [];
  const files = folder.getFiles();
  while (files.hasNext() && items.length < limit) {
    const f = files.next();
    items.push(fileToLine(f));
  }
  const folders = folder.getFolders();
  while (folders.hasNext() && items.length < limit) {
    const sub = folders.next();
    items.push('[PASTA] ' + sub.getName() + ' | atualizado em ' + formatDate(sub.getLastUpdated()) + ' | ' + sub.getUrl());
  }
  return items.length ? items.join('\n') : 'Nenhum arquivo listado.';
}

function searchDriveFiles(query, limit) {
  try {
    const safeQuery = String(query || '').replace(/'/g, "\\'").trim();
    let driveQuery = 'trashed = false';
    if (safeQuery) {
      const terms = safeQuery.split(/\s+/).filter(t => t.length >= 3).slice(0, 5);
      if (terms.length) {
        driveQuery += ' and (' + terms.map(t => "fullText contains '" + t + "'").join(' or ') + ')';
      }
    }
    const files = DriveApp.searchFiles(driveQuery);
    const lines = [];
    while (files.hasNext() && lines.length < (limit || 25)) {
      const f = files.next();
      lines.push(fileToLine(f));
      const snippet = readTextSnippet(f);
      if (snippet) lines.push('  Trecho: ' + snippet.replace(/\n/g, ' ').slice(0, 700));
    }
    return lines.length ? lines.join('\n') : 'Nenhum arquivo encontrado na busca geral.';
  } catch (error) {
    return 'Erro na busca geral do Drive: ' + error.message;
  }
}

function fileToLine(f) {
  return '[' + f.getMimeType() + '] ' + f.getName() + ' | atualizado em ' + formatDate(f.getLastUpdated()) + ' | ' + f.getUrl();
}

function readTextSnippet(file) {
  try {
    const mime = file.getMimeType();
    if (mime === MimeType.GOOGLE_DOCS) {
      return limitText(DocumentApp.openById(file.getId()).getBody().getText(), 1200);
    }
    if (mime === MimeType.GOOGLE_SHEETS) {
      const ss = SpreadsheetApp.openById(file.getId());
      const sh = ss.getSheets()[0];
      const rows = sh.getDataRange().getDisplayValues().slice(0, 20).map(r => r.join(' | '));
      return limitText(rows.join('\n'), 1200);
    }
    return '';
  } catch (error) {
    return '';
  }
}

function formatDate(date) {
  return Utilities.formatDate(date, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm');
}

function limitText(text, max) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '\n...[conteúdo reduzido]...' : value;
}
