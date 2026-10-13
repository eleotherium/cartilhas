import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { ArrowLeft, Trash2, Save } from "lucide-react"
import { RichEditor } from "./RichEditor"
import { ShareButton, StatsButton } from "./TextTools"
import type { Category } from "@/types/cartilha"

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
}

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "poema", label: "Poema" },
  { value: "cronica", label: "Crônica" },
  { value: "conto", label: "Conto" },
  { value: "ensaio", label: "Ensaio" },
]

const EMPTY_FORM: FormState = { title: "", category: "poema", dateISO: "", dateNote: "" }

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
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    if (id === "new") return
    fetch(`/api/admin/cartilhas/${id}/raw`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.text()
      })
      .then((raw) => {
        const { form, bodyMarkdown } = parseRawMarkdown(raw)
        setForm(form)
        setInitialMarkdown(bodyMarkdown)
      })
      .catch(() => setError("Não deu pra carregar esse texto."))
      .finally(() => setLoading(false))
  }, [id])

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
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="glass-card flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:text-calendula-deep"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Voltar
        </button>
        <div className="flex items-center gap-2">
          {id !== "new" && (
            <>
              <StatsButton id={id} />
              <ShareButton id={id} />
              <span className="mx-1 h-5 w-px bg-ink/10" />
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="glass-card flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} />
                Excluir
              </button>
            </>
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
      </div>

      {error && <p className="rounded-xl bg-red-100 px-4 py-2 text-sm text-red-800">{error}</p>}

      <div className="glass-card grid grid-cols-1 gap-4 rounded-[24px] p-5 sm:grid-cols-3">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Título</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-calendula/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Categoria</span>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
            className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-calendula/40"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">Data</span>
          <input
            type="date"
            value={form.dateISO}
            onChange={(e) => setForm((f) => ({ ...f, dateISO: e.target.value }))}
            className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-calendula/40"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
            Nota da data (ex.: "composição", "publicação; data de composição não registrada")
          </span>
          <input
            type="text"
            value={form.dateNote}
            onChange={(e) => setForm((f) => ({ ...f, dateNote: e.target.value }))}
            className="rounded-xl border border-ink/10 bg-white/70 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-calendula/40"
          />
        </label>
      </div>

      <RichEditor initialMarkdown={initialMarkdown} onReady={(editor) => (editorRef.current = editor)} />
    </div>
  )
}
