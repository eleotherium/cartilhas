// API do Worker - só /api/* passa por aqui (ver `assets.run_worker_first` no
// wrangler.jsonc); tudo mais (incluindo /admin, uma rota client-side do React)
// serve direto dos assets estáticos sem invocar este código.
//
// Fonte de verdade dos textos: objetos `<id>.md` no bucket R2 (frontmatter YAML
// + corpo em Markdown). `_index.json` é um cache agregado, reconstruído a cada
// escrita/exclusão, pra GET /api/cartilhas (chamado em toda carga do site
// público) não precisar listar+ler todos os objetos a cada request.

type Category = "poema" | "cronica" | "conto" | "ensaio"

interface CartilhaFrontmatter {
  id: number
  title: string
  category: Category
  dateISO: string
  dateNote: string
}

interface CartilhaFull extends CartilhaFrontmatter {
  dateLabel: string
  body: string
  excerpt: string
  wordCount: number
}

const INDEX_KEY = "_index.json"
const MD_KEY_RE = /^(\d+)\.md$/

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  })
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
async function rebuildIndex(bucket: R2Bucket): Promise<CartilhaFull[]> {
  const listed = await bucket.list()
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
  const listed = await bucket.list()
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
  visitsByDay: Record<string, number>
  readsByDay: Record<string, number>
  readsByText: Record<string, number>
  /** id (string) -> { dia -> contagem } - granularidade por dia só por
   * texto, não por categoria/etc: é o que o seletor de período da página
   * de edição precisa pra calcular hoje/7d/30d/período personalizado de
   * UM texto só, sem ter que escanear todos os textos. */
  readsByTextByDay: Record<string, Record<string, number>>
}

function emptyStats(): StatsData {
  return { visitsTotal: 0, readsTotal: 0, visitsByDay: {}, readsByDay: {}, readsByText: {}, readsByTextByDay: {} }
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

async function trackRead(bucket: R2Bucket, id: number): Promise<void> {
  const stats = await loadStats(bucket)
  stats.readsTotal += 1
  const day = todayKey()
  stats.readsByDay[day] = (stats.readsByDay[day] ?? 0) + 1
  stats.readsByDay = pruneOldDays(stats.readsByDay)
  const key = String(id)
  stats.readsByText[key] = (stats.readsByText[key] ?? 0) + 1
  const byDay = stats.readsByTextByDay[key] ?? {}
  byDay[day] = (byDay[day] ?? 0) + 1
  stats.readsByTextByDay[key] = pruneOldDays(byDay)
  await saveStats(bucket, stats)
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
}

function isSavePayload(value: unknown): value is SavePayload {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.title === "string" &&
    typeof v.category === "string" &&
    typeof v.dateISO === "string" &&
    typeof v.dateNote === "string" &&
    typeof v.bodyMarkdown === "string"
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    const bucket = env.CARTILHAS_BUCKET

    if (pathname === "/api/cartilhas" && request.method === "GET") {
      const cached = await bucket.get(INDEX_KEY)
      if (cached) {
        return new Response(cached.body, { headers: { "content-type": "application/json; charset=utf-8" } })
      }
      return jsonResponse(await rebuildIndex(bucket))
    }

    // Pings de tracking - públicos de propósito (são só incremento de
    // contador, nada sensível) e tolerantes a payload ruim (nunca travam a
    // leitura/navegação do visitante por causa de uma falha aqui).
    if (pathname === "/api/track/visit" && request.method === "POST") {
      await trackVisit(bucket)
      return jsonResponse({ ok: true })
    }

    if (pathname === "/api/track/view" && request.method === "POST") {
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
      // `today`/`last7d`/`last30d` são sempre calculados (referência fixa);
      // `filtered` só vem preenchido se `from`/`to` forem passados (período
      // escolhido no seletor). `rank`/`total` consideram só textos com pelo
      // menos 1 leitura (sem isso todo texto zerado empataria em "último
      // lugar", um empate sem sentido de reportar).
      const statOneMatch = pathname.match(/^\/api\/admin\/stats\/(\d+)$/)
      if (statOneMatch && request.method === "GET") {
        const id = Number(statOneMatch[1])
        const key = String(id)
        const stats = await loadStats(bucket)
        const byDay = stats.readsByTextByDay[key] ?? {}
        const today = todayKey()
        const ranked = Object.entries(stats.readsByText)
          .map(([k, count]) => ({ id: Number(k), count }))
          .sort((a, b) => b.count - a.count)
        const position = ranked.findIndex((e) => e.id === id)

        const url = new URL(request.url)
        const from = url.searchParams.get("from")
        const to = url.searchParams.get("to")
        const filtered = from && to ? { from, to, count: sumRange(byDay, from, to) } : null

        return jsonResponse({
          today: sumRange(byDay, today, today),
          last7d: sumRange(byDay, addDaysStr(today, -6), today),
          last30d: sumRange(byDay, addDaysStr(today, -29), today),
          allTime: stats.readsByText[key] ?? 0,
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

      const putMatch = pathname.match(/^\/api\/admin\/cartilhas\/(new|\d+)$/)
      if (putMatch && request.method === "PUT") {
        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return jsonResponse({ error: "JSON inválido" }, { status: 400 })
        }
        if (!isSavePayload(payload)) {
          return jsonResponse({ error: "campos obrigatórios: title, category, dateISO, dateNote, bodyMarkdown" }, { status: 400 })
        }
        const id = putMatch[1] === "new" ? await nextId(bucket) : Number(putMatch[1])
        const meta: CartilhaFrontmatter = {
          id,
          title: payload.title,
          category: payload.category,
          dateISO: payload.dateISO,
          dateNote: payload.dateNote,
        }
        const raw = serializeFrontmatter(meta) + payload.bodyMarkdown.trim() + "\n"
        await bucket.put(`${id}.md`, raw, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } })
        const entries = await rebuildIndex(bucket)
        return jsonResponse(entries.find((e) => e.id === id))
      }

      const delMatch = pathname.match(/^\/api\/admin\/cartilhas\/(\d+)$/)
      if (delMatch && request.method === "DELETE") {
        await bucket.delete(`${delMatch[1]}.md`)
        await rebuildIndex(bucket)
        const stats = await loadStats(bucket)
        let statsChanged = false
        if (delMatch[1] in stats.readsByText) {
          delete stats.readsByText[delMatch[1]]
          statsChanged = true
        }
        if (delMatch[1] in stats.readsByTextByDay) {
          delete stats.readsByTextByDay[delMatch[1]]
          statsChanged = true
        }
        if (statsChanged) await saveStats(bucket, stats)
        return jsonResponse({ ok: true })
      }

      return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
    }

    return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
