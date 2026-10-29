// API do Worker - só /api/* passa por aqui (ver `assets.run_worker_first` no
// wrangler.jsonc); tudo mais (incluindo /admin, uma rota client-side do React)
// serve direto dos assets estáticos sem invocar este código.
//
// Fonte de verdade dos textos: objetos `<id>.md` no bucket R2 (frontmatter YAML
// + corpo em Markdown). `_index.json` é um cache agregado, reconstruído a cada
// escrita/exclusão, pra GET /api/cartilhas (chamado em toda carga do site
// público) não precisar listar+ler todos os objetos a cada request.

type Category = "poema" | "cronica" | "conto" | "ensaio"
type Status = "published" | "private" | "draft"

interface CartilhaFrontmatter {
  id: number
  title: string
  category: Category
  dateISO: string
  dateNote: string
  status: Status
}

interface CartilhaFull extends CartilhaFrontmatter {
  dateLabel: string
  body: string
  excerpt: string
  wordCount: number
}

const INDEX_KEY = "_index.json"
const MD_KEY_RE = /^(\d+)\.md$/

// Prefixo das versões antigas no R2: `history/<id>/<timestamp-ISO>.md`,
// snapshot completo (frontmatter + corpo) do conteúdo ANTERIOR a cada
// sobrescrita (ver `PUT /api/admin/cartilhas/:id`). Sem poda/limite -
// escala de blog pessoal, mesmo espírito do resto do R2 aqui.
function historyPrefix(id: number): string {
  return `history/${id}/`
}
function historyKey(id: number, timestamp: string): string {
  return `${historyPrefix(id)}${timestamp}.md`
}

function slugify(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "texto"
  )
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  })
}

// Resposta HTML mínima e autônoma pros links de confirmação/cancelamento
// de assinatura (clicados direto do email, fora do SPA - não precisa
// round-trip pelo React só pra mostrar uma frase).
function htmlResponse(message: string): Response {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cartilhas</title>
<style>
  body { font-family: Georgia, serif; background: #faf7f1; color: #231f1a; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
  p { max-width: 420px; font-size: 18px; line-height: 1.5; }
  a { color: #8f2a05; }
</style></head>
<body><p>${message} <a href="https://cartilhas.eleotherium.com">Voltar ao Cartilhas</a></p></body></html>`
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })
}

// Parser de frontmatter mínimo (só os 5 campos conhecidos, cada um numa linha,
// valores sempre entre aspas exceto `id` e `category`) - não é um parser YAML
// genérico de propósito, o formato é escrito por `serializeFrontmatter` logo
// abaixo e nunca por mão livre.
function parseFrontmatter(raw: string): { meta: CartilhaFrontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) throw new Error("frontmatter ausente ou malformado")
  const [, block, rest] = match
  const fields: Record<string, string> = {}
  for (const line of block.split("\n")) {
    const fieldMatch = line.match(/^(\w+):\s*(.*)$/)
    if (!fieldMatch) continue
    let [, key, value] = fieldMatch
    value = value.trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"')
    }
    fields[key] = value
  }
  const meta: CartilhaFrontmatter = {
    id: Number(fields.id),
    title: fields.title ?? "",
    category: (fields.category as Category) ?? "poema",
    dateISO: fields.dateISO ?? "",
    dateNote: fields.dateNote ?? "",
    // Ausente = texto salvo antes dessa feature existir - trata como
    // publicado (comportamento de sempre), sem precisar de migração dos
    // 58 textos já existentes no bucket.
    status: (fields.status as Status) ?? "published",
  }
  return { meta, body: rest.trim() }
}

function serializeFrontmatter(meta: CartilhaFrontmatter): string {
  const esc = (v: string) => `"${v.replace(/"/g, '\\"')}"`
  return [
    "---",
    `id: ${meta.id}`,
    `title: ${esc(meta.title)}`,
    `category: ${meta.category}`,
    `dateISO: ${esc(meta.dateISO)}`,
    `dateNote: ${esc(meta.dateNote)}`,
    `status: ${meta.status}`,
    "---",
    "",
  ].join("\n")
}

function buildExcerpt(body: string, maxLen = 150): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
  if (line.length <= maxLen) return line
  return `${line.slice(0, maxLen).trimEnd()}…`
}

function dateLabel(dateISO: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(`${dateISO}T00:00:00`),
  )
}

function toFull(meta: CartilhaFrontmatter, body: string): CartilhaFull {
  return {
    ...meta,
    dateLabel: dateLabel(meta.dateISO),
    body,
    excerpt: buildExcerpt(body),
    wordCount: body.split(/\s+/).filter(Boolean).length,
  }
}

// Reconstrói `_index.json` inteiro a partir dos objetos `<id>.md` do bucket.
// Só roda em escrita/exclusão (ou no primeiro GET se o índice ainda não
// existir) - a leitura pública normal usa o cache já pronto. Os `get`
// rodam em paralelo (não um `for await` sequencial) - com ~58 objetos, ler
// um de cada vez chegava a levar vários segundos no admin.
//
// `delimiter: "/"` faz o R2 tratar "/" como separador de "pasta" e listar
// só as chaves de nível raiz (`1.md`, `_index.json`, ...) - sem isso, as
// versões de histórico (`history/<id>/<timestamp>.md`, que só crescem a
// cada save) entrariam nessa mesma listagem sem prefixo e, cedo ou tarde,
// estourariam o limite de 1000 objetos por página do R2, truncando o
// índice de verdade silenciosamente.
async function rebuildIndex(bucket: R2Bucket): Promise<CartilhaFull[]> {
  const listed = await bucket.list({ delimiter: "/" })
  const keys = listed.objects.map((obj) => obj.key).filter((key) => MD_KEY_RE.test(key))
  const results = await Promise.all(
    keys.map(async (key) => {
      const got = await bucket.get(key)
      if (!got) return null
      const { meta, body } = parseFrontmatter(await got.text())
      return toFull(meta, body)
    }),
  )
  const entries = results.filter((e): e is CartilhaFull => e !== null)
  entries.sort((a, b) => a.id - b.id)
  await bucket.put(INDEX_KEY, JSON.stringify(entries), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  })
  return entries
}

async function nextId(bucket: R2Bucket): Promise<number> {
  const listed = await bucket.list({ delimiter: "/" })
  let max = 0
  for (const obj of listed.objects) {
    const m = obj.key.match(MD_KEY_RE)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

// Contadores simples no R2 (não Analytics Engine - escolha explícita do
// usuário: sem serviço novo pra configurar, aceitando o risco pequeno de
// perder uma contagem sob concorrência real, irrelevante pro tráfego de um
// site pessoal). Um objeto só, reescrito a cada ping - mesmo padrão de
// `_index.json`. `visitsByDay`/`readsByDay`/`readsByTextByDay` ficam só com
// os últimos STATS_RETENTION_DAYS dias (podados a cada escrita) pra não
// crescer sem limite - retenção generosa (~13 meses) pra cobrir qualquer
// período personalizado razoável que o admin escolha no seletor; os totais
// (`visitsTotal`/`readsTotal`/`readsByText`) são permanentes, nunca podados.
const STATS_KEY = "_stats.json"
const STATS_RETENTION_DAYS = 400

interface StatsData {
  visitsTotal: number
  readsTotal: number
  /** "Visualização": o leitor abriu o texto (ReadingDrawer montou), sem
   * nenhuma condição - distinto de "leitura" (`reads*` abaixo), que só
   * conta depois de rolar até o fim ou ficar 5s aberto (ver
   * ReadingDrawer.tsx). As duas juntas dão uma noção de taxa de
   * conclusão (quantos abriram vs. quantos realmente leram). */
  opensTotal: number
  visitsByDay: Record<string, number>
  readsByDay: Record<string, number>
  opensByDay: Record<string, number>
  readsByText: Record<string, number>
  opensByText: Record<string, number>
  /** id (string) -> { dia -> contagem } - granularidade por dia só por
   * texto, não por categoria/etc: é o que o seletor de período da página
   * de edição precisa pra calcular hoje/7d/30d/período personalizado de
   * UM texto só, sem ter que escanear todos os textos. */
  readsByTextByDay: Record<string, Record<string, number>>
  opensByTextByDay: Record<string, Record<string, number>>
}

function emptyStats(): StatsData {
  return {
    visitsTotal: 0,
    readsTotal: 0,
    opensTotal: 0,
    visitsByDay: {},
    readsByDay: {},
    opensByDay: {},
    readsByText: {},
    opensByText: {},
    readsByTextByDay: {},
    opensByTextByDay: {},
  }
}

// Dia em UTC (não pt-BR local) - só serve de chave de agrupamento, não
// precisa bater com o fuso do visitante. O cliente (PeriodSelector.tsx)
// calcula "hoje"/"ontem"/"7 dias"/"30 dias" com a mesma convenção UTC, pra
// as chaves baterem certinho dos dois lados.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function pruneOldDays(byDay: Record<string, number>): Record<string, number> {
  const cutoffKey = addDaysStr(todayKey(), -STATS_RETENTION_DAYS)
  const pruned: Record<string, number> = {}
  for (const [day, count] of Object.entries(byDay)) {
    if (day >= cutoffKey) pruned[day] = count
  }
  return pruned
}

async function loadStats(bucket: R2Bucket): Promise<StatsData> {
  const obj = await bucket.get(STATS_KEY)
  if (!obj) return emptyStats()
  try {
    const data = await obj.json<Partial<StatsData>>()
    return { ...emptyStats(), ...data }
  } catch {
    return emptyStats()
  }
}

async function saveStats(bucket: R2Bucket, stats: StatsData): Promise<void> {
  await bucket.put(STATS_KEY, JSON.stringify(stats), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  })
}

async function trackVisit(bucket: R2Bucket): Promise<void> {
  const stats = await loadStats(bucket)
  stats.visitsTotal += 1
  const day = todayKey()
  stats.visitsByDay[day] = (stats.visitsByDay[day] ?? 0) + 1
  stats.visitsByDay = pruneOldDays(stats.visitsByDay)
  await saveStats(bucket, stats)
}

// `trackRead`/`trackOpen` têm o mesmo formato (total + por-dia + por-texto +
// por-texto-por-dia) - uma função genérica evita duplicar essa lógica pros
// dois eventos (ver `StatsData`: `reads*` = leitura qualificada, `opens*` =
// abertura incondicional).
async function trackEvent(
  bucket: R2Bucket,
  id: number,
  totalKey: "readsTotal" | "opensTotal",
  byDayKey: "readsByDay" | "opensByDay",
  byTextKey: "readsByText" | "opensByText",
  byTextByDayKey: "readsByTextByDay" | "opensByTextByDay",
): Promise<void> {
  const stats = await loadStats(bucket)
  stats[totalKey] += 1
  const day = todayKey()
  stats[byDayKey][day] = (stats[byDayKey][day] ?? 0) + 1
  stats[byDayKey] = pruneOldDays(stats[byDayKey])
  const key = String(id)
  stats[byTextKey][key] = (stats[byTextKey][key] ?? 0) + 1
  const byDay = stats[byTextByDayKey][key] ?? {}
  byDay[day] = (byDay[day] ?? 0) + 1
  stats[byTextByDayKey][key] = pruneOldDays(byDay)
  await saveStats(bucket, stats)
}

async function trackRead(bucket: R2Bucket, id: number): Promise<void> {
  await trackEvent(bucket, id, "readsTotal", "readsByDay", "readsByText", "readsByTextByDay")
}

async function trackOpen(bucket: R2Bucket, id: number): Promise<void> {
  await trackEvent(bucket, id, "opensTotal", "opensByDay", "opensByText", "opensByTextByDay")
}

function sumRange(byDay: Record<string, number>, from: string, to: string): number {
  let sum = 0
  for (const [day, count] of Object.entries(byDay)) {
    if (day >= from && day <= to) sum += count
  }
  return sum
}

// Preenche cada dia de `from` até `to` (inclusive) com 0 nos dias sem
// evento - sem isso o gráfico do admin teria buracos em vez de barras na
// altura zero. Limitado a STATS_RETENTION_DAYS+1 iterações como rede de
// segurança contra um intervalo absurdamente grande ou invertido vindo
// de query string malformada.
function seriesForRange(byDay: Record<string, number>, from: string, to: string): { date: string; count: number }[] {
  const series: { date: string; count: number }[] = []
  let cursor = from
  for (let i = 0; i <= STATS_RETENTION_DAYS && cursor <= to; i++) {
    series.push({ date: cursor, count: byDay[cursor] ?? 0 })
    cursor = addDaysStr(cursor, 1)
  }
  return series
}

// A aplicação Access (configurada no painel Cloudflare, fora deste código) é a
// barreira de verdade - intercepta a requisição antes dela sequer chegar
// aqui. Esta checagem é só rede de segurança: confere que o header que o
// Access injeta em requests autenticadas está presente, sem validar a
// assinatura do JWT (isso exigiria buscar o JWKS do Cloudflare à parte).
//
// DEV_BYPASS_AUTH só existe em `.dev.vars` (gitignored, nunca vai pra
// produção - não está em `vars` no wrangler.jsonc) - permite testar o
// admin via `wrangler dev` sem um Access de verdade na frente.
function isAuthed(request: Request, env: Env): boolean {
  if ((env as unknown as Record<string, string | undefined>).DEV_BYPASS_AUTH === "true") return true
  return request.headers.has("Cf-Access-Jwt-Assertion")
}

interface SavePayload {
  title: string
  category: Category
  dateISO: string
  dateNote: string
  bodyMarkdown: string
  status: Status
}

function isSavePayload(value: unknown): value is SavePayload {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.title === "string" &&
    typeof v.category === "string" &&
    typeof v.dateISO === "string" &&
    typeof v.dateNote === "string" &&
    typeof v.bodyMarkdown === "string" &&
    (v.status === "published" || v.status === "private" || v.status === "draft")
  )
}

// Casca visual compartilhada pelos 3 emails transacionais (confirmação,
// agradecimento, novo texto) - email não é Chromium, então nada de fonte
// web/CSS externo (a maioria dos clientes bloqueia): só estilo inline e
// pilha de fontes seguras (Georgia pro serif do site, Arial pro sans),
// mas com as mesmas cores da marca. `cta` é opcional (o email de
// agradecimento não precisa de botão).
function emailShellHtml(opts: { heading: string; bodyHtml: string; cta?: { label: string; url: string }; footerHtml: string }): string {
  const ctaHtml = opts.cta
    ? `<tr><td style="padding:4px 36px 8px;">
         <a href="${opts.cta.url}" style="display:inline-block;background:#d44107;color:#faf7f1;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:999px;">${escapeHtml(opts.cta.label)}</a>
       </td></tr>`
    : ""
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1ece2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1ece2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#faf7f1;border-radius:20px;">
        <tr><td style="padding:36px 36px 4px;text-align:center;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;color:#8f2a05;letter-spacing:-0.01em;">Cartilhas</span>
        </td></tr>
        <tr><td style="padding:20px 36px 4px;">
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#231f1a;margin:0 0 14px;">${escapeHtml(opts.heading)}</h1>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#55504a;">${opts.bodyHtml}</div>
        </td></tr>
        ${ctaHtml}
        <tr><td style="padding:28px 36px 36px;">
          <img src="https://cartilhas.eleotherium.com/assinatura.png" width="110" alt="" style="display:block;opacity:0.85;" />
        </td></tr>
      </table>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#948c7a;margin-top:18px;max-width:480px;">${opts.footerHtml}</div>
    </td></tr>
  </table>
</body>
</html>`
}

// Dispara ao SALVAR um texto que estava draft/private e virou published
// (ver chamada no handler PUT) - nunca num texto já publicado sendo só
// editado de novo. Best-effort: uma falha de envio não derruba o save
// (o texto já foi gravado no R2 antes disso rodar).
async function notifySubscribers(env: Env, cartilha: CartilhaFull): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT email, unsubscribe_token FROM subscribers WHERE status = 'confirmed'",
  ).all<{ email: string; unsubscribe_token: string }>()
  if (results.length === 0) return
  const url = `https://cartilhas.eleotherium.com/t/${cartilha.id}`
  const unsubBase = "https://cartilhas.eleotherium.com/api/subscribe/unsubscribe"
  await Promise.allSettled(
    results.map(async ({ email, unsubscribe_token }) => {
      const unsubUrl = `${unsubBase}?token=${encodeURIComponent(unsubscribe_token)}`
      await env.EMAIL.send({
        from: { name: "Cartilhas", email: "novidades@eleotherium.com" },
        to: email,
        subject: `Novo texto: ${cartilha.title}`,
        text: `${cartilha.title}\n${cartilha.dateLabel}\n\n${cartilha.excerpt}\n\nLer na íntegra: ${url}\n\nCancelar inscrição: ${unsubUrl}`,
        html: emailShellHtml({
          heading: cartilha.title,
          bodyHtml: `<p style="margin:0 0 4px;text-transform:uppercase;letter-spacing:0.06em;font-size:11px;color:#8f2a05;">${escapeHtml(cartilha.dateLabel)}</p><p style="margin:0;">${escapeHtml(cartilha.excerpt)}</p>`,
          cta: { label: "Ler na íntegra", url },
          footerHtml: `Você recebeu esse email por ser assinante do Cartilhas. <a href="${unsubUrl}" style="color:#8f2a05;">Cancelar inscrição</a>.`,
        }),
      })
    }),
  )
}

// Mesmos tokens de cor/gradiente de src/index.css e mesmos ícones (lucide)
// de src/lib/categories.ts - duplicado aqui (não importado) porque o
// worker roda num bundle à parte do app React, sem Tailwind nem JSX; cada
// SVG é o markup exato de lucide-static, só com os `<path>`/`<rect>`
// internos (a tag <svg> é montada em `badgeHtml` com os atributos certos).
const CATEGORY_PDF_META: Record<Category, { label: string; badgeBg: string; badgeFg: string; icon: string; glow: string; glowComplement: string }> = {
  poema: {
    label: "Poema",
    badgeBg: "linear-gradient(135deg, #ff8a3d 0%, #d44107 55%, #8f2a05 100%)",
    badgeFg: "#faf7f1",
    glow: "rgb(212 65 7 / 0.4)",
    glowComplement: "rgb(91 42 134 / 0.3)",
    icon: '<path d="M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z"/><path d="M16 8 2 22"/><path d="M17.488 15H9"/>',
  },
  cronica: {
    label: "Crônica",
    badgeBg: "linear-gradient(135deg, #8b4fc9 0%, #5b2a86 55%, #211a28 100%)",
    badgeFg: "#faf7f1",
    glow: "rgb(91 42 134 / 0.4)",
    glowComplement: "rgb(212 65 7 / 0.28)",
    icon: '<path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/>',
  },
  conto: {
    label: "Conto",
    badgeBg: "linear-gradient(150deg, #211a28 0%, #4a1d6e 70%, #5b2a86 100%)",
    badgeFg: "#faf7f1",
    glow: "rgb(33 26 40 / 0.35)",
    glowComplement: "rgb(91 42 134 / 0.3)",
    icon: '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
  },
  ensaio: {
    label: "Ensaio",
    badgeBg: "#faf7f1",
    badgeFg: "#231f1a",
    glow: "rgb(212 65 7 / 0.3)",
    glowComplement: "rgb(91 42 134 / 0.24)",
    icon: '<path d="m18 13-.654-4.736a4 4 0 00-2.756-3.266l-9.163-2.9a2 2 0 00-2.017.493l-.82.819a2 2 0 00-.492 2.017l2.9 9.163a4 4 0 003.266 2.756L13 18"/><path d="M18.648 12.352a1.205 1.205 0 011.704 0l1.296 1.296a1.205 1.205 0 010 1.704l-6.296 6.296a1.205 1.205 0 01-1.704 0l-1.296-1.296a1.205 1.205 0 010-1.704z"/><path d="m3 3 6.586 6.586"/><circle cx="11" cy="11" r="2"/>',
  },
}

// HTML autônomo (não o SPA) pro Browser Rendering gerar o PDF - mesma
// identidade visual do leitor (ReadingDrawer.tsx: fundo paper com as duas
// luzes coloridas da categoria, selo com ícone, serif de verdade no corpo,
// assinatura em máscara CSS no final), só que como documento de impressão.
// `signatureDataUri` vem já em base64 (ver rota do PDF, que busca
// `assinatura.png` dos assets estáticos).
function buildPdfHtml(cartilha: CartilhaFull, signatureDataUri: string): string {
  const meta = CATEGORY_PDF_META[cartilha.category]
  const paragraphs = cartilha.body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n")
  const ensaioBorder =
    cartilha.category === "ensaio"
      ? `border: 1.5px solid transparent; background: linear-gradient(#faf7f1, #faf7f1) padding-box, linear-gradient(120deg, #d44107 0%, #5b2a86 55%, #211a28 100%) border-box;`
      : `background: ${meta.badgeBg};`
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(cartilha.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  /* margin:0 aqui de propósito - CSS @page margin é uma "margin box" de
     verdade (spec de Paged Media): nada pintado pelo documento (nem fundo,
     nem position:fixed, nada) aparece dentro dela, em hipótese nenhuma.
     A área segura que se repete em toda página vem do margin nativo do
     Puppeteer (ver pdfOptions em renderCartilhaPdf) - mecanismo diferente,
     que só encolhe a área de conteúdo sem criar essa exclusão de pintura,
     então o fundo definido abaixo (html/body) ainda sangra até a borda. */
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  html {
    background: #faf7f1;
    min-height: 100%;
  }
  body {
    position: relative;
    min-height: 100vh;
    color: #231f1a;
    font-family: "Outfit", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    z-index: 0;
  }
  .glow-a { top: -80px; right: -120px; width: 380px; height: 380px; background: ${meta.glow}; }
  .glow-b { bottom: -100px; left: -90px; width: 320px; height: 320px; background: ${meta.glowComplement}; }
  .content { position: relative; z-index: 1; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    ${ensaioBorder}
    color: ${meta.badgeFg};
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .badge svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  h1 {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-weight: 700;
    font-size: 36px;
    line-height: 1.15;
    margin: 0 0 6px;
  }
  .date {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6e6758;
    margin: 0 0 28px;
  }
  p {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 19px;
    line-height: 1.6;
    white-space: pre-line;
    margin: 0 0 16px;
  }
  .signature {
    margin-top: 40px;
    height: 100px;
    width: ${Math.round(100 * (1191 / 878))}px;
    background-color: #8f2a05;
    -webkit-mask-image: url(${signatureDataUri});
    mask-image: url(${signatureDataUri});
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
  }
</style>
</head>
<body>
  <span class="glow glow-a"></span>
  <span class="glow glow-b"></span>
  <div class="content">
    <span class="badge"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${meta.icon}</svg>${escapeHtml(meta.label)}</span>
    <h1>${escapeHtml(cartilha.title)}</h1>
    <p class="date">${escapeHtml(cartilha.dateLabel)}</p>
    ${paragraphs}
    <div class="signature"></div>
  </div>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function signatureAsDataUri(env: Env): Promise<string> {
  // Caminho estável em `public/assinatura.png` (ver cópia do asset) -
  // `env.ASSETS.fetch` serve os assets estáticos do próprio deploy, URL
  // real precisa bater com o domínio de produção (não importa pro
  // roteamento interno, mas evita qualquer validação de origem estranha).
  const res = await env.ASSETS.fetch(new Request("https://cartilhas.eleotherium.com/assinatura.png"))
  const buf = await res.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:image/png;base64,${btoa(binary)}`
}

async function renderCartilhaPdf(env: Env, cartilha: CartilhaFull): Promise<Response> {
  const signatureDataUri = await signatureAsDataUri(env)
  const html = buildPdfHtml(cartilha, signatureDataUri)
  const pdf = await env.BROWSER.quickAction("pdf", {
    html,
    // `networkidle0` espera a folha de estilo do Google Fonts (Cormorant
    // Garamond/Outfit) terminar de baixar antes de capturar - sem isso o
    // PDF às vezes sai com a fonte de fallback por pegar a página antes
    // da fonte web carregar.
    gotoOptions: { waitUntil: "networkidle0" },
    // `margin` do Puppeteer, não `@page` do CSS: os dois criam uma área
    // segura que se repete em toda página, mas só o `margin` daqui deixa o
    // fundo (printBackground) sangrar até a borda física - `@page` margin
    // é uma "margin box" de verdade da spec de Paged Media, onde nada que
    // o documento pinta (nem position:fixed) aparece, ponto final.
    pdfOptions: { printBackground: true, format: "a4", margin: { top: "28mm", bottom: "28mm", left: "24mm", right: "24mm" } },
  })
  const headers = new Headers(pdf.headers)
  headers.set("content-disposition", `attachment; filename="${cartilha.id}-${slugify(cartilha.title)}.pdf"`)
  return new Response(pdf.body, { status: pdf.status, headers })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url)
    const bucket = env.CARTILHAS_BUCKET

    if (pathname === "/api/cartilhas" && request.method === "GET") {
      // `_index.json` guarda TODOS os status (o admin precisa deles) - a
      // filtragem pro público acontece só aqui, na única porta de entrada
      // de dados do leitor público (App.tsx busca tudo de uma vez e acha
      // o texto do `/t/:id` nesse mesmo array, então um id privado/rascunho
      // simplesmente não aparece nele, sem lógica extra em lugar nenhum).
      const cached = await bucket.get(INDEX_KEY)
      const entries: CartilhaFull[] = cached ? ((await cached.json()) as CartilhaFull[]) : await rebuildIndex(bucket)
      return jsonResponse(entries.filter((e) => e.status === "published"))
    }

    // PDF público - só serve textos publicados (mesmo filtro da rota
    // acima); rascunho/privado só pela rota admin logo abaixo.
    const publicPdfMatch = pathname.match(/^\/api\/cartilhas\/(\d+)\/pdf$/)
    if (publicPdfMatch && request.method === "GET") {
      const obj = await bucket.get(`${publicPdfMatch[1]}.md`)
      if (!obj) return jsonResponse({ error: "não encontrado" }, { status: 404 })
      const { meta, body } = parseFrontmatter(await obj.text())
      if (meta.status !== "published") return jsonResponse({ error: "não encontrado" }, { status: 404 })
      return renderCartilhaPdf(env, toFull(meta, body))
    }

    if (pathname === "/api/subscribe" && request.method === "POST") {
      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return jsonResponse({ error: "JSON inválido" }, { status: 400 })
      }
      const email = (payload as Record<string, unknown> | null)?.email
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: "email inválido" }, { status: 400 })
      }
      const confirmToken = crypto.randomUUID()
      const unsubscribeToken = crypto.randomUUID()
      const result = await env.DB.prepare(
        `INSERT INTO subscribers (email, status, confirm_token, unsubscribe_token, created_at)
         VALUES (?, 'pending', ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET confirm_token = excluded.confirm_token, status = 'pending'
         WHERE status != 'confirmed'`,
      )
        .bind(email, confirmToken, unsubscribeToken, new Date().toISOString())
        .run()
      // `changes = 0` só acontece quando o email já está confirmed (a
      // cláusula WHERE acima barra o upsert) - já é assinante, não manda
      // outro email de confirmação com um token que não foi de fato salvo.
      if (result.meta.changes === 0) return jsonResponse({ ok: true, alreadySubscribed: true })
      const confirmUrl = `https://cartilhas.eleotherium.com/api/subscribe/confirm?token=${encodeURIComponent(confirmToken)}`
      await env.EMAIL.send({
        from: { name: "Cartilhas", email: "novidades@eleotherium.com" },
        to: email,
        subject: "Confirme sua assinatura",
        text: `Clique pra confirmar que quer receber novidades do Cartilhas: ${confirmUrl}`,
        html: emailShellHtml({
          heading: "Confirme sua assinatura",
          bodyHtml: "<p style=\"margin:0;\">Clique no botão abaixo pra confirmar que você quer receber um email sempre que um texto novo for publicado no Cartilhas.</p>",
          cta: { label: "Confirmar assinatura", url: confirmUrl },
          footerHtml: "Se você não pediu essa assinatura, pode ignorar este email.",
        }),
      })
      return jsonResponse({ ok: true })
    }

    if (pathname === "/api/subscribe/confirm" && request.method === "GET") {
      const token = new URL(request.url).searchParams.get("token") ?? ""
      // RETURNING traz o email/token na mesma query do UPDATE - precisa
      // dos dois pra mandar o email de agradecimento com o link de
      // cancelar inscrição (e saber se o token era válido: `row` nulo =
      // link já usado ou inválido).
      const row = await env.DB.prepare(
        "UPDATE subscribers SET status = 'confirmed', confirmed_at = ? WHERE confirm_token = ? AND status != 'confirmed' RETURNING email, unsubscribe_token",
      )
        .bind(new Date().toISOString(), token)
        .first<{ email: string; unsubscribe_token: string }>()
      if (row) {
        const unsubUrl = `https://cartilhas.eleotherium.com/api/subscribe/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`
        await env.EMAIL.send({
          from: { name: "Cartilhas", email: "novidades@eleotherium.com" },
          to: row.email,
          subject: "Assinatura confirmada - obrigado!",
          text: `Obrigado por acompanhar o Cartilhas! A partir de agora você recebe um email sempre que um texto novo for publicado.\n\nLer os textos: https://cartilhas.eleotherium.com\n\nCancelar inscrição: ${unsubUrl}`,
          html: emailShellHtml({
            heading: "Obrigado por assinar!",
            bodyHtml:
              '<p style="margin:0;">Sua assinatura está confirmada. A partir de agora você recebe um email sempre que um texto novo for publicado no Cartilhas.</p>',
            cta: { label: "Ver o Cartilhas", url: "https://cartilhas.eleotherium.com" },
            footerHtml: `Mudou de ideia? <a href="${unsubUrl}" style="color:#8f2a05;">Cancelar inscrição</a>.`,
          }),
        })
      }
      return htmlResponse(
        row
          ? "Assinatura confirmada! Agora você recebe um email sempre que um texto novo for publicado."
          : "Esse link já foi usado ou não é válido.",
      )
    }

    if (pathname === "/api/subscribe/unsubscribe" && request.method === "GET") {
      const token = new URL(request.url).searchParams.get("token") ?? ""
      await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE unsubscribe_token = ?").bind(token).run()
      return htmlResponse("Assinatura cancelada. Você não vai mais receber emails de novos textos.")
    }

    // Pings de tracking - públicos de propósito (são só incremento de
    // contador, nada sensível) e tolerantes a payload ruim (nunca travam a
    // leitura/navegação do visitante por causa de uma falha aqui).
    if (pathname === "/api/track/visit" && request.method === "POST") {
      await trackVisit(bucket)
      return jsonResponse({ ok: true })
    }

    // "Abertura" (visualização) - incondicional, dispara assim que o
    // ReadingDrawer monta um texto. "Leitura" - só depois de rolar até o
    // fim ou ficar 5s aberto (ver ReadingDrawer.tsx). São eventos
    // DIFERENTES, não um rename do outro - por isso duas rotas.
    if (pathname === "/api/track/open" && request.method === "POST") {
      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return jsonResponse({ error: "JSON inválido" }, { status: 400 })
      }
      const id = (payload as Record<string, unknown> | null)?.id
      if (typeof id !== "number" || !Number.isInteger(id)) {
        return jsonResponse({ error: "id inválido" }, { status: 400 })
      }
      await trackOpen(bucket, id)
      return jsonResponse({ ok: true })
    }

    if (pathname === "/api/track/read" && request.method === "POST") {
      let payload: unknown
      try {
        payload = await request.json()
      } catch {
        return jsonResponse({ error: "JSON inválido" }, { status: 400 })
      }
      const id = (payload as Record<string, unknown> | null)?.id
      if (typeof id !== "number" || !Number.isInteger(id)) {
        return jsonResponse({ error: "id inválido" }, { status: 400 })
      }
      await trackRead(bucket, id)
      return jsonResponse({ ok: true })
    }

    if (pathname.startsWith("/api/admin/")) {
      if (!isAuthed(request, env)) return jsonResponse({ error: "não autenticado" }, { status: 401 })

      if (pathname === "/api/admin/cartilhas" && request.method === "GET") {
        return jsonResponse(await rebuildIndex(bucket))
      }

      if (pathname === "/api/admin/reindex" && request.method === "POST") {
        const entries = await rebuildIndex(bucket)
        return jsonResponse({ ok: true, count: entries.length })
      }

      // Período vem sempre explícito do cliente (PeriodSelector.tsx calcula
      // hoje/ontem/7d/30d/personalizado em UTC e manda from/to prontos) -
      // o worker não precisa saber de presets, só soma o intervalo pedido.
      // Sem from/to (chamada antiga ou direta), cai num padrão de 30 dias.
      if (pathname === "/api/admin/stats" && request.method === "GET") {
        const url = new URL(request.url)
        const to = url.searchParams.get("to") ?? todayKey()
        const from = url.searchParams.get("from") ?? addDaysStr(to, -29)
        const stats = await loadStats(bucket)
        const cached = await bucket.get(INDEX_KEY)
        const index: CartilhaFull[] = cached
          ? ((await cached.json()) as CartilhaFull[])
          : await rebuildIndex(bucket)
        const byId = new Map(index.map((e) => [e.id, e]))
        const topReads = Object.entries(stats.readsByTextByDay)
          .map(([id, byDay]) => ({ id: Number(id), count: sumRange(byDay, from, to) }))
          .filter((e) => e.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map((e) => {
            const entry = byId.get(e.id)
            return { ...e, title: entry?.title ?? "(texto removido)", category: entry?.category ?? null }
          })
        return jsonResponse({
          from,
          to,
          visitsTotal: sumRange(stats.visitsByDay, from, to),
          readsTotal: sumRange(stats.readsByDay, from, to),
          visitsSeries: seriesForRange(stats.visitsByDay, from, to),
          readsSeries: seriesForRange(stats.readsByDay, from, to),
          topReads,
        })
      }

      // Stats de um texto só (StatsButton no preview admin, e a faixa de 3/4
      // cartões na página de edição - ver TextTools.tsx e PeriodSelector.tsx).
      // Cada janela (today/last7d/last30d/filtered) traz os dois números -
      // `opens` (visualização, abriu) e `reads` (leitura, qualificada) -
      // não um só, pra UI poder mostrar a dupla lado a lado em cada cartão.
      // `rank`/`total` consideram só textos com pelo menos 1 leitura (sem
      // isso todo texto zerado empataria em "último lugar", um empate sem
      // sentido de reportar).
      const statOneMatch = pathname.match(/^\/api\/admin\/stats\/(\d+)$/)
      if (statOneMatch && request.method === "GET") {
        const id = Number(statOneMatch[1])
        const key = String(id)
        const stats = await loadStats(bucket)
        const readsByDay = stats.readsByTextByDay[key] ?? {}
        const opensByDay = stats.opensByTextByDay[key] ?? {}
        const today = todayKey()
        const ranked = Object.entries(stats.readsByText)
          .map(([k, count]) => ({ id: Number(k), count }))
          .sort((a, b) => b.count - a.count)
        const position = ranked.findIndex((e) => e.id === id)

        const window = (from: string, to: string) => ({
          opens: sumRange(opensByDay, from, to),
          reads: sumRange(readsByDay, from, to),
        })

        const url = new URL(request.url)
        const from = url.searchParams.get("from")
        const to = url.searchParams.get("to")
        const filtered = from && to ? { from, to, ...window(from, to) } : null

        return jsonResponse({
          today: window(today, today),
          last7d: window(addDaysStr(today, -6), today),
          last30d: window(addDaysStr(today, -29), today),
          allTime: { opens: stats.opensByText[key] ?? 0, reads: stats.readsByText[key] ?? 0 },
          rank: position >= 0 ? position + 1 : null,
          total: ranked.length,
          filtered,
        })
      }

      const rawMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)\/raw$/)
      if (rawMatch && request.method === "GET") {
        const obj = await bucket.get(`${rawMatch[1]}.md`)
        if (!obj) return jsonResponse({ error: "não encontrado" }, { status: 404 })
        return new Response(await obj.text(), { headers: { "content-type": "text/markdown; charset=utf-8" } })
      }

      const pdfMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)\/pdf$/)
      if (pdfMatch && request.method === "GET") {
        const obj = await bucket.get(`${pdfMatch[1]}.md`)
        if (!obj) return jsonResponse({ error: "não encontrado" }, { status: 404 })
        const { meta, body } = parseFrontmatter(await obj.text())
        return renderCartilhaPdf(env, toFull(meta, body))
      }

      const historyListMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)\/history$/)
      if (historyListMatch && request.method === "GET") {
        const id = Number(historyListMatch[1])
        const listed = await bucket.list({ prefix: historyPrefix(id) })
        const versions = await Promise.all(
          listed.objects.map(async (obj) => {
            const timestamp = obj.key.slice(historyPrefix(id).length, -".md".length)
            const got = await bucket.get(obj.key)
            const title = got ? parseFrontmatter(await got.text()).meta.title : "(sem título)"
            return { timestamp, title }
          }),
        )
        versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        return jsonResponse(versions)
      }

      const historyRawMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)\/history\/([^/]+)\/raw$/)
      if (historyRawMatch && request.method === "GET") {
        const [, id, timestamp] = historyRawMatch
        const obj = await bucket.get(historyKey(Number(id), timestamp))
        if (!obj) return jsonResponse({ error: "não encontrado" }, { status: 404 })
        return new Response(await obj.text(), { headers: { "content-type": "text/markdown; charset=utf-8" } })
      }

      const historyRestoreMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)\/history\/([^/]+)\/restore$/)
      if (historyRestoreMatch && request.method === "POST") {
        const [, idStr, timestamp] = historyRestoreMatch
        const id = Number(idStr)
        const oldVersion = await bucket.get(historyKey(id, timestamp))
        if (!oldVersion) return jsonResponse({ error: "não encontrado" }, { status: 404 })
        const oldRaw = await oldVersion.text()
        // Restaurar nunca perde dado: a versão ATUAL (antes de ser
        // sobrescrita pela restauração) também vira uma entrada de
        // histórico, com o mesmo padrão usado em cada save normal.
        const current = await bucket.get(`${id}.md`)
        if (current) {
          await bucket.put(historyKey(id, new Date().toISOString()), await current.text(), {
            httpMetadata: { contentType: "text/markdown; charset=utf-8" },
          })
        }
        await bucket.put(`${id}.md`, oldRaw, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } })
        const entries = await rebuildIndex(bucket)
        return jsonResponse(entries.find((e) => e.id === id))
      }

      const putMatch = pathname.match(/^\/api\/admin\/cartilhas\/(new|\d+)$/)
      if (putMatch && request.method === "PUT") {
        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return jsonResponse({ error: "JSON inválido" }, { status: 400 })
        }
        if (!isSavePayload(payload)) {
          return jsonResponse(
            { error: "campos obrigatórios: title, category, dateISO, dateNote, bodyMarkdown, status" },
            { status: 400 },
          )
        }
        const id = putMatch[1] === "new" ? await nextId(bucket) : Number(putMatch[1])

        // Arquiva a versão atual em history/ ANTES de sobrescrever (feature
        // de histórico), e guarda o status anterior pra saber se esse save
        // é uma transição pra "published" (feature de notificação por
        // email) - um texto `new` não tem versão anterior nenhuma.
        const previous = putMatch[1] === "new" ? null : await bucket.get(`${id}.md`)
        let previousStatus: Status | null = null
        if (previous) {
          const previousRaw = await previous.text()
          previousStatus = parseFrontmatter(previousRaw).meta.status
          await bucket.put(historyKey(id, new Date().toISOString()), previousRaw, {
            httpMetadata: { contentType: "text/markdown; charset=utf-8" },
          })
        }

        const meta: CartilhaFrontmatter = {
          id,
          title: payload.title,
          category: payload.category,
          dateISO: payload.dateISO,
          dateNote: payload.dateNote,
          status: payload.status,
        }
        const raw = serializeFrontmatter(meta) + payload.bodyMarkdown.trim() + "\n"
        await bucket.put(`${id}.md`, raw, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } })
        const entries = await rebuildIndex(bucket)
        const saved = entries.find((e) => e.id === id)

        // Notifica assinantes só na transição PRA published - nunca ao só
        // reeditar um texto que já era público (ver notifySubscribers).
        // Best-effort: uma falha aqui não desfaz o save, que já aconteceu.
        if (saved && previousStatus !== "published" && meta.status === "published") {
          ctx.waitUntil(notifySubscribers(env, saved).catch(() => {}))
        }

        return jsonResponse(saved)
      }

      const delMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)$/)
      if (delMatch && request.method === "DELETE") {
        await bucket.delete(`${delMatch[1]}.md`)
        await rebuildIndex(bucket)
        const stats = await loadStats(bucket)
        let statsChanged = false
        for (const bucketKey of ["readsByText", "opensByText", "readsByTextByDay", "opensByTextByDay"] as const) {
          if (delMatch[1] in stats[bucketKey]) {
            delete stats[bucketKey][delMatch[1]]
            statsChanged = true
          }
        }
        if (statsChanged) await saveStats(bucket, stats)
        return jsonResponse({ ok: true })
      }

      return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
    }

    return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
