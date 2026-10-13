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

    if (pathname.startsWith("/api/admin/")) {
      if (!isAuthed(request, env)) return jsonResponse({ error: "não autenticado" }, { status: 401 })

      if (pathname === "/api/admin/cartilhas" && request.method === "GET") {
        return jsonResponse(await rebuildIndex(bucket))
      }

      if (pathname === "/api/admin/reindex" && request.method === "POST") {
        const entries = await rebuildIndex(bucket)
        return jsonResponse({ ok: true, count: entries.length })
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
        return jsonResponse({ ok: true })
      }

      return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
    }

    return jsonResponse({ error: "rota não encontrada" }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
