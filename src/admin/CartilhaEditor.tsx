import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { ArrowLeft, ChevronDown, Trash2, Save } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"
import { cn } from "@/lib/utils"
import { PeriodSelector } from "./PeriodSelector"
import { defaultPeriod, type PeriodValue } from "./periodRange"
import { RichEditor } from "./RichEditor"
import { ShareButton, TextStatsStrip } from "./TextTools"
import { VersionHistory } from "./VersionHistory"
import type { Category, Status } from "@/types/cartilha"

interface CartilhaEditorProps {
  id: number | "new"
  onBack: () => void
  onSaved: () => void
}

interface FormState {
  title: string
  category: Category
  dateISO: string
  dateNote: string
  status: Status
}

// Rascunho por padrão num texto novo - não sai publicado (e não dispara
// notificação por email) só porque o admin esqueceu de escolher o status
// antes do primeiro save.
const EMPTY_FORM: FormState = { title: "", category: "poema", dateISO: "", dateNote: "", status: "draft" }

const STATUS_META: Record<Status, { label: string; bg: string; fg: string }> = {
  published: { label: "Publicado", bg: "bg-calendula-soft", fg: "text-calendula-deep" },
  private: { label: "Privado", bg: "bg-violeta-soft", fg: "text-violeta-deep" },
  draft: { label: "Rascunho", bg: "bg-ink/8", fg: "text-ink-soft" },
}
const STATUS_ORDER: Status[] = ["published", "private", "draft"]

// Mesmo padrão do `CategoryPillSelect` logo abaixo (pílula clicável com
// dropdown) - status e categoria são os dois metadados "de identidade" do
// texto, então compartilham a mesma linguagem de interação.
function StatusPillSelect({ value, onChange }: { value: Status; onChange: (status: Status) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const meta = STATUS_META[value]

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs font-semibold uppercase tracking-[0.08em] transition-transform duration-150 active:scale-95",
          meta.bg,
          meta.fg,
        )}
      >
        {meta.label}
        <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-40">
          <div className="flex flex-col gap-1 rounded-2xl border border-ink/10 bg-paper p-2 shadow-[0_24px_60px_-16px_rgb(35_31_26_/_0.4)]">
            {STATUS_ORDER.map((status) => {
              const m = STATUS_META[status]
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    onChange(status)
                    setOpen(false)
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-[0.06em] transition-colors duration-150",
                    status === value ? cn(m.bg, m.fg) : "text-ink-soft hover:bg-ink/6",
                  )}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Pílula de categoria clicável (mesma cor/forma do badge que aparece no
// card da lista e no leitor público) que abre um menu pra trocar - troca o
// `<select>` caixudo de formulário por algo que já parece parte da
// composição, não um controle de admin genérico.
function CategoryPillSelect({ value, onChange }: { value: Category; onChange: (category: Category) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const meta = CATEGORY_META[value]

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-xs font-semibold uppercase tracking-[0.08em] transition-transform duration-150 active:scale-95",
          meta.bg,
          meta.fg,
        )}
      >
        {meta.label}
        <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-40">
          <div className="flex flex-col gap-1 rounded-2xl border border-ink/10 bg-paper p-2 shadow-[0_24px_60px_-16px_rgb(35_31_26_/_0.4)]">
            {CATEGORY_ORDER.map((cat) => {
              const m = CATEGORY_META[cat]
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    onChange(cat)
                    setOpen(false)
                  }}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-[0.06em] transition-colors duration-150",
                    cat === value ? cn(m.bg, m.fg) : "text-ink-soft hover:bg-ink/6",
                  )}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// O `.md` cru (frontmatter + corpo) vem da API só pra alimentar o formulário
// de edição - parser mínimo espelhando o do worker (ver worker/index.ts),
// não vale a pena compartilhar módulo por só um uso de cada lado.
function parseRawMarkdown(raw: string): { form: FormState; bodyMarkdown: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { form: EMPTY_FORM, bodyMarkdown: raw }
  const [, block, body] = match
  const fields: Record<string, string> = {}
  for (const line of block.split("\n")) {
    const fieldMatch = line.match(/^(\w+):\s*(.*)$/)
    if (!fieldMatch) continue
    let [, key, value] = fieldMatch
    value = value.trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"')
    fields[key] = value
  }
  return {
    form: {
      title: fields.title ?? "",
      category: (fields.category as Category) ?? "poema",
      dateISO: fields.dateISO ?? "",
      dateNote: fields.dateNote ?? "",
      // Mesmo fallback do worker (ver worker/index.ts, parseFrontmatter) -
      // textos salvos antes dessa feature existir não têm o campo.
      status: (fields.status as Status) ?? "published",
    },
    bodyMarkdown: body.trim(),
  }
}

export function CartilhaEditor({ id, onBack, onSaved }: CartilhaEditorProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [initialMarkdown, setInitialMarkdown] = useState("")
  const [loading, setLoading] = useState(id !== "new")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod())
  // Força remontar o RichEditor depois de restaurar uma versão antiga -
  // `useEditor` (RichEditor.tsx) só lê `initialMarkdown` na montagem, não
  // reage a ela mudando depois, então trocar só o estado não atualiza o
  // conteúdo já renderizado no editor.
  const [editorKey, setEditorKey] = useState(0)
  const editorRef = useRef<Editor | null>(null)

  function loadRaw() {
    if (id === "new") return
    setLoading(true)
    fetch(`/api/admin/cartilhas/${id}/raw`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.text()
      })
      .then((raw) => {
        const { form, bodyMarkdown } = parseRawMarkdown(raw)
        setForm(form)
        setInitialMarkdown(bodyMarkdown)
        setEditorKey((k) => k + 1)
      })
      .catch(() => setError("Não deu pra carregar esse texto."))
      .finally(() => setLoading(false))
  }

  useEffect(loadRaw, [id])

  async function handleSave() {
    if (!editorRef.current) return
    if (!form.title.trim() || !form.dateISO) {
      setError("Título e data são obrigatórios.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const storage = editorRef.current.storage as unknown as { markdown: { getMarkdown: () => string } }
      const bodyMarkdown = storage.markdown.getMarkdown()
      const res = await fetch(`/api/admin/cartilhas/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, bodyMarkdown }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      onSaved()
    } catch {
      setError("Não deu pra salvar. Tenta de novo.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (id === "new") return
    if (!window.confirm(`Excluir "${form.title}" de verdade? Não dá pra desfazer.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/cartilhas/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`status ${res.status}`)
      onSaved()
    } catch {
      setError("Não deu pra excluir. Tenta de novo.")
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-ink-faint">Carregando...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Hero continua centralizado na página (igual o site público - não
          pode "sair do centro"), compacto e dividindo a linha com as ações
          em vez de uma faixa cheia só pra ele: grid de 3 colunas, a ponta
          esquerda fica vazia só pra equilibrar a largura da direita (onde
          ficam Excluir/Salvar numa linha e período/compartilhar na outra),
          garantindo que a coluna do meio (hero) continue matematicamente
          centralizada. No mobile vira uma coluna só empilhada. */}
      <div className="grid grid-cols-1 items-center justify-items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:justify-items-stretch lg:gap-6">
        <div aria-hidden className="hidden lg:block" />
        <div className="text-center">
          <AppHeader variant="compact" />
          <button
            type="button"
            onClick={onBack}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint transition-colors duration-150 hover:text-calendula-deep"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Voltar
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 lg:items-end lg:justify-self-end">
          <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-end">
            {id !== "new" && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="glass-card flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                Excluir
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="gradient-calendula flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-paper shadow-[0_8px_20px_-6px_rgb(212_65_7_/_0.5)] disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={2} />
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
          {id !== "new" && (
            <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-end">
              <PeriodSelector value={period} onChange={setPeriod} />
              <VersionHistory id={id} onRestored={loadRaw} />
              <ShareButton id={id} />
            </div>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-100 px-4 py-2 text-sm text-red-800">{error}</p>}

      {/* Mesma hierarquia visual do leitor público (badge de categoria,
          título grande em serif, data em caption) - editável, mas sem cara
          de formulário de admin (pedido explícito: nada de caixa com
          borda + label acima de cada campo). */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryPillSelect value={form.category} onChange={(category) => setForm((f) => ({ ...f, category }))} />
          <StatusPillSelect value={form.status} onChange={(status) => setForm((f) => ({ ...f, status }))} />
        </div>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Título do texto"
          className="-mx-2 rounded-lg border-none bg-transparent px-2 py-1 font-serif text-4xl font-bold leading-tight text-ink transition-colors duration-150 placeholder:text-ink-faint/50 focus:bg-ink/[0.03] focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-[0.08em] text-ink-faint">
          <input
            type="date"
            value={form.dateISO}
            onChange={(e) => setForm((f) => ({ ...f, dateISO: e.target.value }))}
            className="-mx-1 rounded border-none bg-transparent px-1 text-ink-faint transition-colors duration-150 focus:bg-ink/[0.04] focus:outline-none"
          />
          <span aria-hidden className="text-ink-faint/50">
            ·
          </span>
          <input
            type="text"
            value={form.dateNote}
            onChange={(e) => setForm((f) => ({ ...f, dateNote: e.target.value }))}
            placeholder='nota da data (ex.: "composição", "publicação; data não registrada")'
            className="-mx-1 min-w-0 flex-1 rounded border-none bg-transparent px-1 normal-case italic tracking-normal text-ink-faint transition-colors duration-150 placeholder:text-ink-faint/60 focus:bg-ink/[0.04] focus:outline-none"
          />
        </div>
      </div>

      {id !== "new" && <TextStatsStrip id={id} period={period} />}

      <RichEditor key={editorKey} initialMarkdown={initialMarkdown} onReady={(editor) => (editorRef.current = editor)} />
    </div>
  )
}
