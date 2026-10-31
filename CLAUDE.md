# Cartilhas

Site pessoal de literatura de Gabriel Eleoterio (`cartilhas.eleotherium.com`):
poemas, crônicas, contos e ensaios. Não é um site educacional nem corporativo
— é um acervo editorial pessoal com busca, filtro por categoria, ordenação,
leitor lateral com exportação em PDF, assinatura por email e um painel
`/admin` completo (editor rico, histórico de versões, estatísticas de
leitura). ~58 textos hoje.

**Não confie no README.md da raiz** — ele descreve uma arquitetura antiga
(`texts/*.txt` → `src/data/cartilhas.json` gerado em build-time) que foi
substituída pela arquitetura R2 + Worker descrita abaixo. Este CLAUDE.md é a
fonte de verdade sobre a arquitetura atual.

## Identidade visual

- **Cores** (`src/index.css`, `@theme` do Tailwind v4): fundo `--color-paper
  #faf7f1` (off-white quente), tinta `--color-ink #231f1a`. Duas cores de
  marca em gradiente de 3 pontas — **calêndula** (laranja, `#ff8a3d →
  #d44107 → #8f2a05`) para poema/ensaio, **violeta** (`#8b4fc9 → #5b2a86 →
  #211a28`) para crônica/conto. Contraste WCAG AA é tratado com rigor —
  respeitar os comentários existentes sobre quais tons passam 4.5:1 sobre
  qual fundo antes de trocar uma cor.
- **Tipografia**: `Outfit` (sans, UI) + `Cormorant Garamond` (serifada,
  títulos/corpo de leitura), via `@fontsource`.
- **Vibe**: "vidro líquido" (glassmorphism customizado, com variante sem
  `backdrop-filter` para listas grandes), medalhão metálico numerado, orbes
  de fundo animadas, grão sutil. Editorial/artista, não corporativo.
- **Motion**: gramática própria em `docs/motion-principles-web.md`,
  centralizada em `src/lib/motion.ts` (easings `EASE_OUT`/`EASE_IN_OUT`,
  springs "iOS" sem bounce cartunesco, durations nomeadas por contexto).
  Sempre `transform`/`opacity`; nunca animar propriedades de layout.

## Stack

- React 19 + Vite 8 + TypeScript + Tailwind v4 (`@tailwindcss/vite`, tokens
  em `@theme`) + `motion` (Framer Motion) + Radix UI (`Dialog`) +
  `lucide-react` + Tiptap (editor rico do admin, com extensão própria
  `CalloutExtension`) + `clsx`/`tailwind-merge` via helper `cn()`.
- Cloudflare Worker (`worker/index.ts`, roteamento manual por
  `pathname`/`method`, sem framework) — serve só `/api/*`
  (`run_worker_first: ["/api/*"]`); tudo o resto, incluindo `/admin`
  (rota client-side), serve direto dos assets estáticos do `dist/`.
- **R2** (`CARTILHAS_BUCKET` → bucket `cartilhas-content`) é a fonte de
  verdade do conteúdo. **D1** (`DB` → `cartilhas-subscribers`) só guarda a
  lista de assinantes de email.
- **Browser Rendering** (binding `BROWSER`, Puppeteer) gera o PDF de cada
  texto. **Email Sending** (binding `EMAIL`, remetente
  `novidades@eleotherium.com`) notifica assinantes.
- Lint: `oxlint` (não ESLint — regras mínimas, não assumir convenções de
  prettier/eslint padrão).
- Deploy automático via Cloudflare Workers Builds a cada push em `main`.

## Estrutura de pastas

```
content/*.md     Backup/seed do conteúdo versionado no git. NÃO é lido em
                 runtime — é só o que scripts/seed-r2.sh sobe pro R2.
                 Editar aqui sozinho não afeta produção.
docs/            Documentação viva do projeto (motion-principles-web.md).
public/          Assets estáticos crus (favicon, og-image, assinatura.png).
redirects/       Página antiga (bio pessoal), sem relação com o app atual.
scripts/         categorias.json (mapa id→categoria, manual),
                 migrate-txt-to-md.mjs (migração única já executada),
                 seed-r2.sh (repovoar R2 a partir de content/*.md).
tools/           HTML standalone fora do build: og-image.html (gera as
                 imagens de preview social — a SPA não roda JS para
                 crawlers), signature-align*.html (ajuste da assinatura).
src/
  App.tsx            shell do site público: busca/filtro/ordenação/grade/drawer.
  admin/             app /admin: AdminApp (lista+editor+stats, roteado via
                     pushState/popstate manual, sem react-router),
                     CartilhaEditor, RichEditor+CalloutExtension (Tiptap),
                     PeriodSelector, StatsPanel, TextTools, VersionHistory.
  components/        AppHeader, Backdrop, CartilhaCard, CategorySidebar,
                     EmptyState, FeaturedCartilha, ReadingDrawer (leitor
                     modal, PDF + tracking), SearchBar, Signature,
                     SortToggle, SubscribeForm.
  lib/               categories.ts (CATEGORY_META: ícone/gradiente/glow —
                     espelhado manualmente no worker para o PDF),
                     motion.ts, utils.ts (cn, normalize, readingTime, etc).
  types/cartilha.ts  tipo Cartilha, espelha CartilhaFull do worker por
                     design (bundles separados, sem import cruzado).
worker/index.ts      API inteira: parsing de frontmatter, rebuildIndex,
                     stats, auth, PDF, email, rotas.
```

## Modelo de dados

Frontmatter YAML simplificado (parser próprio, não YAML genérico) em cada
`<id>.md` no R2:

```
id, title, category (poema|cronica|conto|ensaio), dateISO, dateNote,
status (published|private|draft), publishedAt
```

Campos derivados em runtime por `toFull()` (nunca persistidos no `.md`):
`dateLabel`, `publishedLabel`, `body` (hard-breaks normalizados), `excerpt`,
`wordCount`.

`dateISO` = data do **poema** (composição). `publishedAt` = quando
**entrou no site** (usado para ordenação por atividade real, selo "novo",
agrupamento por mês), com fallback para `dateISO` nos textos migrados antes
dessa feature existir. Não confundir os dois.

## Fluxo de dados e o cache `_index.json` (cuidado crítico de deploy)

1. Fonte de verdade = objetos `<id>.md` no bucket R2 — não `content/*.md`.
2. `_index.json` no mesmo bucket é um **cache agregado**: todos os
   `CartilhaFull` já computados por `toFull()` **no momento em que foi
   gerado**.
3. `GET /api/cartilhas` (todo carregamento do site público) lê esse cache
   direto, sem recomputar nada — só filtra `status === "published"`.
4. `rebuildIndex()` só roda em: PUT/DELETE/restore via
   `/api/admin/cartilhas/*`, ou se o índice não existir ainda. Rota manual:
   `POST /api/admin/reindex`.

**A pegadinha**: um deploy que mude o formato de `CartilhaFull`/`toFull()`
(ex.: adicionar um campo novo) sobe o worker novo, mas o `_index.json` em
produção continua no formato antigo até alguém salvar/editar algo pelo
admin ou chamar o reindex manualmente. O frontend novo pode ler um campo
ausente sem guarda e quebrar (já aconteceu: tela branca pra todo visitante
até o próximo save). O mesmo vale depois de `scripts/seed-r2.sh` (sobe
`.md` crus direto, sem passar pelo PUT do worker — não dispara rebuild).

**Sempre que mudar `toFull`/`CartilhaFull`/parsing de frontmatter, reindexar
produção antes de considerar o deploy completo:**

- Caminho normal: `POST /api/admin/reindex` — mas exige Cloudflare Access
  na frente (`cartilhas.eleotherium.com/api/admin/*` redireciona pro login
  do Access; `wrangler whoami`/API token não ajudam, é uma barreira de edge
  separada da conta Cloudflare).
- Sem acesso ao Access: baixar os `.md` reais via `wrangler r2 object get
  cartilhas-content/<id>.md --remote --file=<caminho>` para cada id, rodar
  localmente uma função que replica `parseFrontmatter`+`toFull` do
  `worker/index.ts`, e subir o resultado como `_index.json` via `wrangler
  r2 object put cartilhas-content/_index.json --remote
  --file=<caminho> --content-type "application/json; charset=utf-8"`. Não
  existe `wrangler r2 object list` — descobrir ids pela API pública
  (`/api/cartilhas`) ou tentando ids sequenciais até 404 (para pegar
  drafts/privados que a API pública não mostra).

Histórico de versões: toda sobrescrita (PUT) arquiva a versão anterior em
`history/<id>/<timestamp>.md` antes de sobrescrever, sem poda.
`rebuildIndex`/`nextId` usam `bucket.list({ delimiter: "/" })` de propósito
para não incluir essas chaves de histórico na listagem de nível raiz.

## Deploy

- Automático: push em `main` → Cloudflare Workers Builds builda e publica
  (configurado no painel Cloudflare, não em arquivo deste repo).
- Manual: `npm run build && npx wrangler deploy`.
- **Conta Cloudflare certa**: `gabrieleleoterioptc@gmail.com` (account id
  `c0f08f1548b8564250b8fc8d1a73ed79`). O navegador padrão desta máquina às
  vezes já está logado como `admin@tironalua.com` (outro projeto do mesmo
  usuário), que **não** tem acesso ao worker `cartilhas`. Sempre conferir
  `npx wrangler whoami` antes de `wrangler deploy`.
- D1 schema (uma vez, só ao criar o banco): `npx wrangler d1 execute
  cartilhas-subscribers --remote --file=./schema.sql`.
- Domínio custom já configurado via `routes` no `wrangler.jsonc` — sem DNS
  manual.
- Auth do `/api/admin/*`: Cloudflare Access na frente (fora do repo) via
  header `Cf-Access-Jwt-Assertion`; em dev local, `.dev.vars` com
  `DEV_BYPASS_AUTH=true`.
- **Depois de qualquer deploy que mude `CartilhaFull`/`toFull`, reindexar
  produção** (ver seção acima) antes de considerar o deploy completo.

## Convenções de código

- Comentários em português, só quando o "porquê" não é óbvio (constraints,
  bugs específicos já corrigidos, decisões de performance) — nunca "o que o
  código faz". É um padrão denso e bem estabelecido no projeto; seguir o
  mesmo tom.
- Tipos duplicados de propósito entre `worker/index.ts` e
  `src/types/cartilha.ts`/`src/lib/categories.ts` (bundles separados — o
  Worker não usa Tailwind/JSX, então ícones lucide são reescritos como SVG
  puro para o PDF). Não tentar "unificar" isso com import cruzado.
- Medições de layout via `ref` + `getBoundingClientRect` + `ResizeObserver`
  em vez de valores chutados (ver `App.tsx`, offsets da sidebar).
- Estado de navegação do admin via `pushState`/`popstate` manual (sem
  `react-router`) — rotas `/admin`, `/admin/novo`, `/admin/:id`.
- `cn()` (clsx + tailwind-merge) é o helper padrão de classes condicionais.
- Mensagens de commit em português, descritivas e diretas ("Corrige X",
  "Aumenta Y") — sem prefixo de tipo (feat/fix).

## Cuidados não-óbvios

- **PDF** (`renderCartilhaPdf`/`buildPdfHtml`): gerado via Browser
  Rendering com HTML standalone que duplica a identidade visual do
  `ReadingDrawer`. Área frágil/recém-estabilizada — commits recentes
  corrigiram `@page margin` do Chromium não pintando fundo, margem lateral
  inconsistente via `pdfOptions.margin`, e tamanho da assinatura. Margem
  **lateral** vem do `padding` do body (não de `margin.left/right` do
  Puppeteer, que na prática é inconsistente); margem **vertical** vem de
  `pdfOptions.margin.top/bottom`. Qualquer mudança no HTML do PDF deve
  respeitar essa divisão.
- **Tracking de leitura**: "abertura" (`/api/track/open`, dispara sempre
  que o drawer monta) e "leitura" (`/api/track/read`, só após rolar até o
  fim ou 5s abertos) são eventos **distintos** com contadores separados —
  não colapsar.
- **Hard-breaks do Tiptap**: Shift+Enter serializa como hard-break Markdown
  (`\` + quebra de linha); `stripHardBreakMarkers` normaliza isso em toda
  leitura. Um commit recente corrigiu um caso em que a barra aparecia
  literalmente na exibição — cuidado ao tocar nessa função.
- `notifySubscribers` só dispara na transição real para `status:
  "published"` (nunca em re-edição de texto já publicado) e é best-effort
  (falha de envio não desfaz o save, que já ocorreu antes).
- `content/<id>.md` (git) e os objetos R2 podem divergir — editar
  `content/*.md` sozinho não afeta produção; só `seed-r2.sh` sobe isso pro
  bucket (e precisa de reindex depois, como qualquer escrita fora do PUT do
  admin).

## Scripts

- `npm run dev` / `npm run build` (`tsc -b && vite build`) / `npm run lint`
  (oxlint) / `npm run preview`.
- `scripts/seed-r2.sh` — repovoa o bucket R2 a partir de `content/*.md`
  (lembrar de reindexar depois).
- `scripts/migrate-txt-to-md.mjs` — migração única já executada, histórico.
- `tools/og-image.html` — gera as imagens de preview social estáticas.

## Verificação visual

Para qualquer mudança de UI, seguir a skill `pixel-verify` (screenshot real,
nunca CSS/DOM) antes de declarar um fix pronto — ver memória
`feedback_pixel_verify_discipline`.
