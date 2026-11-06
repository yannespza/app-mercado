# Meu Mercado

App pessoal para controlar e comparar gastos de mercado lendo o QR Code da nota fiscal (NFC-e).

- **Leitura da nota:** câmera lê o QR Code e o app busca na Fazenda o mercado, a data, os produtos, os preços e o total.
- **Divisão mensal:** gasto do mês, comparação com o mês anterior, gráfico dos últimos 6 meses e divisão por mercado.
- **Preços:** variação de cada produto em relação à compra anterior e histórico por mercado.
- **Onde vale mais a pena:** índice de cesta que compara os mercados nos produtos que você comprou em mais de um deles.

Os dados ficam salvos só no celular. Use *Ajustes → Salvar backup* de vez em quando.

## Arquivos
- `index.html`: o app (telas, gráficos, cálculos)
- `parser.js`: leitor da página da nota fiscal
- `api/nota.js`: "ponte" que busca a página da nota na Fazenda (roda na Vercel)
- `sw.js` e `manifest.json`: permitem instalar o app no celular
- `vendor/jsQR.js`: leitor de QR Code para iPhone

## Publicar (Vercel, grátis)
1. Entre em vercel.com com a conta do GitHub.
2. *Add New → Project*, escolha `app-mercado` e clique em *Deploy*.
3. Abra o endereço gerado no celular e instale pela tela inicial.
