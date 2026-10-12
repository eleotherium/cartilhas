# Cartilhas

Interface para os textos reunidos em `texts/`: busca, ordenação por título ou
data, grade orgânica de blocos e um painel lateral de leitura. React + Vite +
Tailwind v4, tema claro off-white + laranja, com vidro líquido, metal e orbes
de fundo.

`redirects/` guarda uma página antiga (protótipo de bio pessoal) que já
ocupava este mesmo repositório antes do site de poesias existir - mantida
por histórico, não faz parte do app.

## Rodando

```bash
npm install
npm run dev
```

## Atualizando os textos

Os dados exibidos (`src/data/cartilhas.json`) são gerados a partir dos `.txt`
em `texts/`. Sempre que um texto novo for adicionado, removido ou editado
(inclusive a linha `Data: DD/MM/AAAA (nota)` no fim de cada arquivo, de onde
vem a data exibida), rode:

```bash
npm run generate:data
```

Isso reescreve `src/data/cartilhas.json`. O script está em
`scripts/generate-cartilhas.mjs`.

A categoria de cada texto (poema, crônica, conto, ensaio) não é derivável
automaticamente do arquivo — é uma classificação literária feita por leitura
e mantida manualmente em `scripts/categorias.json` (mapa `id -> categoria`).
Um texto novo precisa de uma entrada lá antes do `generate:data` rodar sem
erro; o script recusa gerar o JSON se faltar categoria para algum id.

## Deploy

Publicado como Cloudflare Worker (assets estáticos) em
**cartilhas.eleotherium.com**, configurado em `wrangler.jsonc`. Deploy
automático via Workers Builds: todo push em `main` builda e publica sozinho
(ver configuração no painel Cloudflare, Worker `cartilhas` → Settings →
Builds).

Pra publicar manualmente (sem passar pelo git):

```bash
npm run build
npx wrangler deploy
```

Exige estar logado (`npx wrangler whoami`) na conta dona do domínio
`eleotherium.com`. O domínio customizado já está configurado via `routes` no
`wrangler.jsonc`; não precisa mexer no DNS manualmente.

## Motion

A gramática de animação do site (easings, durações, o painel lateral de
leitura, os ícones que trocam) está documentada e justificada em
`docs/motion-principles-web.md` — inclui o raciocínio de como princípios de
motion de vídeo foram adaptados para uma interface sem timeline fixa.
