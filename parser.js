/* Leitor da página da NFC-e (layout padrão usado pelo Paraná e vários estados).
   Funciona no navegador (DOMParser) e no Node (para testes). */
(function (root) {
  function num(s) {
    if (s == null) return NaN;
    s = String(s).replace(/[^\d,.-]/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
  }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function afterColon(s) { s = clean(s); var i = s.indexOf(':'); return clean(i >= 0 ? s.slice(i + 1) : s); }

  // Chave de acesso (44 dígitos) a partir do link do QR Code
  function chaveFromUrl(url) {
    var m = String(url || '').match(/(\d{44})/);
    return m ? m[1] : null;
  }

  function parseDate(str) {
    var m = String(str || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return m[3] + '-' + m[2] + '-' + m[1] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00');
  }

  function parseNotaDoc(doc) {
    var q = function (sel, el) { return (el || doc).querySelector(sel); };
    var qa = function (sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); };
    var mercado = clean((q('.txtTopo') || {}).textContent);
    var texts = qa('.txtCenter .text');
    var cnpj = texts[0] ? afterColon(texts[0].textContent) : '';
    var endereco = texts[1] ? clean(texts[1].textContent).replace(/\s*,\s*(,\s*)*/g, ', ') : '';

    var itens = qa('#tabResult tr').map(function (tr) {
      var nome = clean((q('.txtTit2', tr) || q('.txtTit', tr) || {}).textContent);
      if (!nome) return null;
      var cod = clean((q('.RCod', tr) || {}).textContent).replace(/[^\dA-Za-z]/g, '').replace(/^C[oó]digo/i, '');
      var codm = clean((q('.RCod', tr) || {}).textContent).match(/:\s*([^)]+)/);
      return {
        nome: nome,
        codigo: codm ? clean(codm[1]) : cod,
        qtd: num(afterColon((q('.Rqtd', tr) || {}).textContent)),
        un: afterColon((q('.RUN', tr) || {}).textContent).toUpperCase(),
        vUnit: num(afterColon((q('.RvlUnit', tr) || {}).textContent)),
        vTotal: num((q('.valor', tr) || {}).textContent)
      };
    }).filter(Boolean);

    var total = NaN, bruto = NaN, desconto = 0, pagamento = '';
    qa('#totalNota #linhaTotal, #totalNota .linhaShade, #totalNota div').forEach(function (div) {
      var label = clean((q('label', div) || {}).textContent).toLowerCase();
      var val = num((q('.totalNumb', div) || {}).textContent);
      if (label.indexOf('valor a pagar') >= 0) total = val;
      else if (label.indexOf('valor total') >= 0) bruto = val;
      else if (label.indexOf('desconto') >= 0) desconto = val || 0;
      if (q('label.tx', div) && !pagamento) pagamento = clean(q('label.tx', div).textContent);
    });
    if (isNaN(total)) total = isNaN(bruto) ? itens.reduce(function (a, i) { return a + (i.vTotal || 0); }, 0) : bruto - desconto;

    var bodyText = clean((doc.body && clean(doc.body.textContent)) || (doc.documentElement || doc).textContent);
    var em = bodyText.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i);
    var data = parseDate(em ? em[1] : bodyText);
    var chaveEl = q('.chave');
    var chave = chaveEl ? clean(chaveEl.textContent).replace(/\D/g, '') : '';
    if (chave.length !== 44) { var cm = bodyText.replace(/\s/g, '').match(/\d{44}/); chave = cm ? cm[0] : ''; }

    return { mercado: mercado, cnpj: cnpj, endereco: endereco, data: data, itens: itens,
      total: Math.round(total * 100) / 100, desconto: desconto, pagamento: pagamento, chave: chave };
  }

  function parseNotaHTML(html, DOMParserImpl) {
    var P = DOMParserImpl || root.DOMParser;
    var doc = new P().parseFromString(html, 'text/html');
    return parseNotaDoc(doc);
  }

  // Plano B: texto copiado da página da nota (selecionar tudo > copiar > colar no app)
  function parseNotaText(text) {
    var t = String(text || '').replace(/\u00a0/g, ' ');
    var flat = t.replace(/\s+/g, ' ');
    var lined = t.replace(/[ \t\r]+/g, ' ');
    var itens = [];
    var re = /\(C[óo]digo:\s*([^)]+)\)\s*Qtde\.?:\s*([\d.,]+)\s*UN:\s*(\S+)\s*Vl\.?\s*Unit\.?:\s*([\d.,]+)\s*Vl\.?\s*Total\s*([\d.,]+)/gi;
    var m, last = 0;
    while ((m = re.exec(lined))) {
      // o nome é o trecho entre o item anterior e este; se houver quebras de linha, a última linha
      var seg = lined.slice(last, m.index).split('\n').map(clean).filter(Boolean);
      var nome = seg.length ? seg[seg.length - 1] : '';
      if (!last && seg.length <= 1 && nome.length > 60) nome = nome.split(/\s{2,}|PR\s/).pop();
      itens.push({ nome: clean(nome), codigo: clean(m[1]), qtd: num(m[2]), un: m[3].toUpperCase(), vUnit: num(m[4]), vTotal: num(m[5]) });
      last = re.lastIndex;
    }
    // nome do mercado: primeira linha com texto antes de "CNPJ"
    var lines = t.split(/\n/).map(clean).filter(Boolean);
    var mercado = '';
    for (var i = 0; i < lines.length; i++) {
      if (/CNPJ/i.test(lines[i])) { mercado = lines[i].replace(/CNPJ.*$/i, '').trim() || lines[i - 1] || ''; break; }
    }
    var cnpjm = flat.match(/CNPJ:?\s*([\d./-]{14,18})/i);
    var totm = flat.match(/Valor a pagar R\$:?\s*([\d.,]+)/i) || flat.match(/Valor total R\$:?\s*([\d.,]+)/i);
    var em = flat.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i);
    var ch = flat.replace(/\s/g, '').match(/\d{44}/);
    var total = totm ? num(totm[1]) : itens.reduce(function (a, i) { return a + i.vTotal; }, 0);
    return { mercado: mercado, cnpj: cnpjm ? cnpjm[1] : '', endereco: '', data: parseDate(em ? em[1] : ''),
      itens: itens, total: Math.round(total * 100) / 100, desconto: 0, pagamento: '', chave: ch ? ch[0] : '' };
  }


  /* ---------- Chave de acesso (44 números): NF-e (Amazon, Mercado Livre...) e NFC-e ---------- */
  var UFS = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};
  function chaveValida(c) {
    c = String(c || '').replace(/\D/g, ''); if (c.length !== 44) return false;
    var soma = 0, peso = 2;
    for (var i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
    var dv = 11 - (soma % 11); if (dv >= 10) dv = 0;
    return dv === Number(c[43]);
  }
  function lerChave(c) {
    c = String(c || '').replace(/\D/g, '');
    if (c.length !== 44) return null;
    return { chave: c, uf: UFS[Number(c.slice(0, 2))] || '', ano: 2000 + Number(c.slice(2, 4)), mes: Number(c.slice(4, 6)),
      cnpj: c.slice(6, 20), modelo: c.slice(20, 22), serie: Number(c.slice(22, 25)), numero: Number(c.slice(25, 34)), valida: chaveValida(c) };
  }
  function fmtCnpj(c) { c = String(c || '').replace(/\D/g, ''); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c; }
  var PAG = {'01':'Dinheiro','02':'Cheque','03':'Cartão de Crédito','04':'Cartão de Débito','05':'Crédito Loja','10':'Vale Alimentação','11':'Vale Refeição','15':'Boleto','16':'Depósito','17':'Pix','18':'Transferência','19':'Cashback','90':'Sem pagamento','99':'Outros'};

  /* ---------- Arquivo XML da nota (NF-e ou NFC-e) ---------- */
  function parseNotaXML(xml, DOMParserImpl) {
    var P = DOMParserImpl || root.DOMParser;
    var doc = new P().parseFromString(String(xml), 'text/xml');
    var g = function (el, tag) { var x = (el || doc).getElementsByTagName(tag); return x && x[0] ? clean(x[0].textContent) : ''; };
    var all = function (el, tag) { return Array.prototype.slice.call((el || doc).getElementsByTagName(tag)); };
    var inf = all(doc, 'infNFe')[0];
    if (!inf) return null;
    var emit = all(inf, 'emit')[0], ende = emit && all(emit, 'enderEmit')[0], ide = all(inf, 'ide')[0];
    var nf = function (s) { var v = parseFloat(s); return isNaN(v) ? 0 : v; };
    var itens = all(inf, 'det').map(function (det) {
      var pr = all(det, 'prod')[0]; if (!pr) return null;
      var ean = g(pr, 'cEAN'), vDesc = nf(g(pr, 'vDesc'));
      var qtd = nf(g(pr, 'qCom')), vProd = nf(g(pr, 'vProd'));
      return { nome: g(pr, 'xProd'), codigo: /^\d{8,14}$/.test(ean) ? ean : g(pr, 'cProd'), qtd: qtd, un: g(pr, 'uCom').toUpperCase(),
        vUnit: nf(g(pr, 'vUnCom')), vTotal: Math.round((vProd - vDesc) * 100) / 100 };
    }).filter(Boolean);
    var tot = all(inf, 'ICMSTot')[0];
    var total = tot ? nf(g(tot, 'vNF')) : itens.reduce(function (a, i) { return a + i.vTotal; }, 0);
    var dh = g(ide, 'dhEmi') || g(ide, 'dEmi');
    var chave = (inf.getAttribute('Id') || '').replace(/\D/g, '');
    var tp = g(doc, 'tPag');
    return {
      mercado: g(emit, 'xFant') || g(emit, 'xNome'), razao: g(emit, 'xNome'), cnpj: fmtCnpj(g(emit, 'CNPJ') || g(emit, 'CPF')),
      endereco: ende ? [g(ende, 'xLgr'), g(ende, 'nro'), g(ende, 'xBairro'), g(ende, 'xMun'), g(ende, 'UF')].filter(Boolean).join(', ') : '',
      data: dh ? (dh.length >= 19 ? dh.slice(0, 19) : dh.slice(0, 10) + 'T12:00:00') : null,
      itens: itens, total: Math.round(total * 100) / 100, desconto: tot ? nf(g(tot, 'vDesc')) : 0,
      pagamento: PAG[tp] || '', chave: chave.length === 44 ? chave : '', modelo: g(ide, 'mod')
    };
  }

  /* ---------- Texto do PDF da nota (DANFE): melhor esforço ---------- */
  function parseDanfeText(text) {
    var t = String(text || '').replace(/ /g, ' ');
    var flat = t.replace(/\s+/g, ' ');
    var ch = (flat.match(/(?:\d{4}\s?){10}\d{4}/) || [''])[0].replace(/\s/g, '');
    if (!chaveValida(ch)) { var cs = flat.replace(/[^\d]/g, ' ').match(/\d{44}/g) || []; ch = cs.filter(chaveValida)[0] || ch; }
    var dm = flat.match(/EMISS[ÃA]O[^0-9]{0,40}(\d{2}\/\d{2}\/\d{4})/i) || flat.match(/(\d{2}\/\d{2}\/\d{4})/);
    var data = dm ? dm[1].split('/').reverse().join('-') + 'T12:00:00' : null;
    var tm = flat.match(/VALOR TOTAL DA NOTA[^0-9]{0,80}([\d.]+,\d{2})/i) || flat.match(/V(?:ALOR|L)\.? TOTAL[^0-9]{0,40}([\d.]+,\d{2})/i);
    // linhas de produto: ... NCM(8) CST(3-4) CFOP(4) UN QTD V.UNIT V.TOTAL
    var itens = [];
    t.split(/\n/).forEach(function (ln) {
      var m = clean(ln).match(/^(.*?)\s(\d{8})\s+\d{2,4}\s+[1-7]\d{3}\s+([A-Za-z]{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
      if (!m) return;
      var q = num(m[4]), vu = num(m[5]), vt = num(m[6]);
      if (!(q > 0) || !(vt > 0)) return;
      if (Math.abs(q * vu - vt) > Math.max(0.05, vt * 0.03)) { if (Math.abs(vu - vt) < 0.01 && q === 1) { } else return; }
      var desc = clean(m[1]).replace(/^[A-Z0-9.\-\/]*\d[A-Z0-9.\-\/]*\s+/i, '');
      itens.push({ nome: desc || 'Produto', codigo: '', qtd: q, un: m[3].toUpperCase(), vUnit: vu, vTotal: vt });
    });
    var total = tm ? num(tm[1]) : itens.reduce(function (a, i) { return a + i.vTotal; }, 0);
    return { mercado: '', cnpj: '', endereco: '', data: data, itens: itens, total: Math.round((total || 0) * 100) / 100, desconto: 0, pagamento: '', chave: chaveValida(ch) ? ch : '' };
  }

  var api = { parseNotaHTML: parseNotaHTML, parseNotaDoc: parseNotaDoc, parseNotaText: parseNotaText, chaveFromUrl: chaveFromUrl, num: num,
    lerChave: lerChave, chaveValida: chaveValida, fmtCnpj: fmtCnpj, parseNotaXML: parseNotaXML, parseDanfeText: parseDanfeText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NotaParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
