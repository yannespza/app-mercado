// "Ponte": busca a página da nota no site da Fazenda e devolve o HTML ao app.
// Só aceita endereços de sites do governo (.gov.br), para não virar um proxy aberto.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const url = String((req.query && req.query.url) || '');
  let target;
  try { target = new URL(url); } catch (e) {
    res.status(400).json({ erro: 'Link inválido.' }); return;
  }
  if (!/^https?:$/.test(target.protocol) || !/(^|\.)gov\.br$/i.test(target.hostname)) {
    res.status(400).json({ erro: 'Esse link não é de uma nota fiscal (site do governo).' }); return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(target.toString(), {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      }
    });
    clearTimeout(timer);
    const buf = Buffer.from(await r.arrayBuffer());
    const type = r.headers.get('content-type') || '';
    let html = buf.toString('utf8');
    if (/iso-8859-1|latin1|windows-1252/i.test(type + html.slice(0, 600))) html = buf.toString('latin1');
    res.status(200).json({ status: r.status, url: r.url, html });
  } catch (e) {
    res.status(502).json({ erro: 'Não consegui abrir a página da Fazenda agora. Tente de novo em alguns minutos.' });
  }
};
