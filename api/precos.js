// "Ponte" de preços: pesquisa produtos nos sites de mercados de Curitiba e devolve preço, código de barras e disponibilidade.
// Só conversa com os mercados da lista abaixo (não é um proxy aberto).
// Muffato: cada loja tem seu próprio preço (canal de venda "sc").
// Angeloni: preço da loja online de Curitiba (Bigorrilho).
// Atacadão: o preço do catálogo é nacional; o preço regional vem de uma simulação de carrinho com o CEP.
const LOJAS = {
  'muffato-champagnat': { host: 'https://www.supermuffato.com.br', sc: 8 },
  'muffato-portao': { host: 'https://www.supermuffato.com.br', sc: 13 },
  'muffato-santafelicidade': { host: 'https://www.supermuffato.com.br', sc: 19 },
  'muffato-taruma': { host: 'https://www.supermuffato.com.br', sc: 18 },
  'muffato-sjp': { host: 'https://www.supermuffato.com.br', sc: 11 },
  'angeloni': { host: 'https://super.angeloni.com.br', sc: 1 },
  'atacadao': { host: 'https://www.atacadao.com.br', sc: 1, simular: true },
  // Festval: o preço e o estoque reais vêm da loja online de Curitiba (vendedor "meufestvaldark")
  'festval': { host: 'https://www.festval.com', sc: 1, simular: true, seller: 'meufestvaldark' }
};
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'pt-BR,pt;q=0.9'
};

async function getJSON(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, Object.assign({ headers: HEADERS, signal: ctrl.signal, redirect: 'follow' }, opts || {}));
    if (!r.ok && r.status !== 206) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(t); }
}

function converte(p) {
  const it = (p.items || [])[0]; if (!it) return null;
  const s = (it.sellers || []).find(x => x.commertialOffer && x.commertialOffer.Price > 0) || (it.sellers || [])[0];
  const o = s && s.commertialOffer; if (!o || !(o.Price > 0)) return null;
  const img = it.images && it.images[0] && it.images[0].imageUrl;
  return {
    nome: p.productName, marca: p.brand || '', ean: it.ean || '', sku: it.itemId, seller: s.sellerId,
    preco: o.Price, de: o.ListPrice > o.Price ? o.ListPrice : null, disp: o.AvailableQuantity > 0,
    un: (it.measurementUnit || 'un').toLowerCase(), mult: it.unitMultiplier || 1,
    link: p.link || '', img: img || ''
  };
}

async function busca(L, filtro) {
  const url = L.host + '/api/catalog_system/pub/products/search?' + filtro + '&_from=0&_to=7&sc=' + L.sc;
  const j = await getJSON(url);
  return Array.isArray(j) ? j.map(converte).filter(Boolean) : [];
}

async function simula(L, cands, cep) {
  if (!cands.length) return;
  const body = { items: cands.map(c => ({ id: c.sku, quantity: 1, seller: L.seller || c.seller || '1' })), country: 'BRA', postalCode: cep };
  const j = await getJSON(L.host + '/api/checkout/pub/orderForms/simulation?sc=' + L.sc, {
    method: 'POST', headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }), body: JSON.stringify(body)
  });
  if (!j || !j.items) return;
  j.items.forEach((i, k) => {
    const c = cands[i.requestIndex != null ? i.requestIndex : k]; if (!c) return;
    if (i.sellingPrice > 0) c.preco = i.sellingPrice / 100;
    c.disp = i.availability === 'available';
    if (L.seller && !(i.sellingPrice > 0)) c.disp = false;
  });
}

async function emLotes(lista, n, fn) {
  const out = new Array(lista.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (i < lista.length) { const k = i++; out[k] = await fn(lista[k]); }
  }));
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || !LOJAS[b.loja] || !Array.isArray(b.itens)) { res.status(400).json({ erro: 'Pedido inválido.' }); return; }
  const L = LOJAS[b.loja];
  const cep = String(b.cep || '80010000').replace(/\D/g, '').slice(0, 8) || '80010000';
  const itens = b.itens.slice(0, 40).map(x => ({ id: String(x.id || ''), q: String(x.q || '').slice(0, 80), ean: String(x.ean || '').replace(/\D/g, '').slice(0, 14) }));
  const resultado = await emLotes(itens, 4, async (x) => {
    let cands = [];
    if (x.ean) cands = await busca(L, 'fq=alternateIds_Ean:' + x.ean);
    if (!cands.length && x.q) cands = await busca(L, 'ft=' + encodeURIComponent(x.q));
    return { id: x.id, cands };
  });
  if (L.simular) {
    const todos = []; resultado.forEach(r => r.cands.forEach(c => todos.push(c)));
    for (let i = 0; i < todos.length; i += 40) await simula(L, todos.slice(i, i + 40), cep);
  }
  res.status(200).json({ loja: b.loja, quando: new Date().toISOString(), itens: resultado });
};
