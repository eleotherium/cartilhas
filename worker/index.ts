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
// `_index.json`. `visitsByDay`/`readsByDay` ficam só com os últimos
// STATS_RETENTION_DAYS dias (podados a cada escrita) pra não crescer sem
// limite; os totais (`visitsTotal`/`readsTotal`) são permanentes.
const STATS_KEY = "_stats.json"
const STATS_RETENTION_DAYS = 30

interface StatsData {
  visitsTotal: number
  readsTotal: number
  visitsByDay: Record<string, number>
  readsByDay: Record<string, number>
  readsByText: Record<string, number>
}

function emptyStats(): StatsData {
  return { visitsTotal: 0, readsTotal: 0, visitsByDay: {}, readsByDay: {}, readsByText: {} }
}

// Dia em UTC (não pt-BR local) - só serve de chave de agrupamento pro
// gráfico do admin, não precisa bater com o fuso do visitante.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function pruneOldDays(byDay: Record<string, number>): Record<string, number> {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - STATS_RETENTION_DAYS)
  const cutoffKey = cutoff.toISOString().slice(0, 10)
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
  await saveStats(bucket, stats)
}

// Preenche os últimos `n` dias com 0 nos dias sem evento - sem isso o
// gráfico do admin teria buracos em vez de barras na altura zero.
function lastNDaysSeries(byDay: Record<string, number>, n: number): { date: string; count: number }[] {
  const series: { date: string; count: number }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    series.push({ date: key, count: byDay[key] ?? 0 })
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

      if (pathname === "/api/admin/stats" && request.method === "GET") {
        const stats = await loadStats(bucket)
        const cached = await bucket.get(INDEX_KEY)
        const index: CartilhaFull[] = cached
          ? ((await cached.json()) as CartilhaFull[])
          : await rebuildIndex(bucket)
        const byId = new Map(index.map((e) => [e.id, e]))
        const topReads = Object.entries(stats.readsByText)
          .map(([id, count]) => {
            const entry = byId.get(Number(id))
            return {
              id: Number(id),
              count,
              title: entry?.title ?? "(texto removido)",
              category: entry?.category ?? null,
            }
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
        return jsonResponse({
          visitsTotal: stats.visitsTotal,
          readsTotal: stats.readsTotal,
          visitsSeries: lastNDaysSeries(stats.visitsByDay, STATS_RETENTION_DAYS),
          readsSeries: lastNDaysSeries(stats.readsByDay, STATS_RETENTION_DAYS),
          topReads,
        })
      }

      // Stats de um texto só (botão de stats no preview admin e no editor -
      // ver TextTools.tsx). `rank`/`total` só consideram textos com pelo
      // menos 1 leitura (sem isso, todo texto sem leitura nenhuma empataria
      // em "último lugar", um empate sem sentido de reportar).
      const statOneMatch = pathname.match(/^\/api\/admin\/stats\/(\d+)$/)
      if (statOneMatch && request.method === "GET") {
        const id = Number(statOneMatch[1])
        const stats = await loadStats(bucket)
        const ranked = Object.entries(stats.readsByText)
          .map(([key, count]) => ({ id: Number(key), count }))
          .sort((a, b) => b.count - a.count)
        const position = ranked.findIndex((e) => e.id === id)
        return jsonResponse({
          count: stats.readsByText[String(id)] ?? 0,
          rank: position >= 0 ? position + 1 : null,
          total: ranked.length,
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
        if (delMatch[1] in stats.readsByText) {
          delete stats.readsByText[delMatch[1]]
          await saveStats(bucket, stats)
        }
        return jsonResponse({ ok: true })
      }

      return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
    }

    return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
