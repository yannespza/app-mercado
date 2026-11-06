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

  var api = { parseNotaHTML: parseNotaHTML, parseNotaDoc: parseNotaDoc, parseNotaText: parseNotaText, chaveFromUrl: chaveFromUrl, num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NotaParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
