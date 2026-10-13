import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eye, Filter, Pencil, Plus } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { Backdrop } from "@/components/Backdrop"
import { ReadingDrawer } from "@/components/ReadingDrawer"
import { SearchBar } from "@/components/SearchBar"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"
import { cn, normalize } from "@/lib/utils"
import type { Category, Cartilha } from "@/types/cartilha"
import { CartilhaEditor } from "./CartilhaEditor"
import { PeriodSelector } from "./PeriodSelector"
import { defaultPeriod, type PeriodValue } from "./periodRange"
import { StatsPanel } from "./StatsPanel"
import { ShareButton, StatsButton } from "./TextTools"

type View = { name: "list" } | { name: "edit"; id: number | "new" }

const ALL_CATEGORIES = new Set<Category>(CATEGORY_ORDER)

// Ícone de filtro (não mais um label por categoria) - abre um popover de
// seleção múltipla, pedido explícito. Mostra uma bolinha com a contagem
// quando o filtro está ativo (nem todas as categorias selecionadas), pra
// dar pra perceber de relance que a lista está filtrada sem abrir o
// popover.
function CategoryFilterButton({ selected, onChange }: { selected: Set<Category>; onChange: (next: Set<Category>) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const isFiltered = selected.size < ALL_CATEGORIES.size

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  function toggle(cat: Category) {
    const next = new Set(selected)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    // Nunca deixa esvaziar de vez - a lista simplesmente sumiria sem
    // explicação nenhuma. Pelo menos uma categoria fica marcada.
    if (next.size > 0) onChange(next)
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filtrar por categoria"
        aria-expanded={open}
        className={cn(
          "glass relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:text-calendula-deep",
          isFiltered && "text-calendula-deep",
        )}
      >
        <Filter className="h-5 w-5" strokeWidth={2} />
        {isFiltered && (
          <span className="gradient-calendula absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-paper">
            {selected.size}
          </span>
        )}
      </button>
      {open && (
        // Fundo sólido de propósito (mesmo motivo do PeriodSelector) - é um
        // popover de controle/dado, não decorativo.
        <div className="absolute right-0 top-full z-20 mt-2 w-56 max-w-[calc(100vw-2rem)]">
          <div className="rounded-2xl border border-ink/10 bg-paper p-3 text-left shadow-[0_24px_60px_-16px_rgb(35_31_26_/_0.4)]">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">Categorias</p>
              {isFiltered && (
                <button type="button" onClick={() => onChange(new Set(ALL_CATEGORIES))} className="text-xs font-medium text-calendula-deep hover:underline">
                  Todas
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {CATEGORY_ORDER.map((cat) => {
                const meta = CATEGORY_META[cat]
                const checked = selected.has(cat)
                return (
                  <label
                    key={cat}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-ink/5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(cat)}
                      className="h-4 w-4 shrink-0 rounded border-ink/20 text-calendula accent-calendula focus:ring-calendula/40"
                    />
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]", meta.bg, meta.fg)}>
                      {meta.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function AdminApp() {
  const [view, setView] = useState<View>({ name: "list" })
  const [items, setItems] = useState<Cartilha[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState("")
  const [categories, setCategories] = useState<Set<Category>>(() => new Set(ALL_CATEGORIES))
  // Pré-visualização protegida: reaproveita o mesmo ReadingDrawer do site
  // público, só que montado aqui dentro do /admin (atrás do Zero Trust) -
  // é por isso que os ícones de stats (TextTools.tsx) só aparecem nesta
  // versão, nunca na do App.tsx.
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod())

  const load = useCallback(() => {
    setItems(null)
    setError(false)
    fetch("/api/admin/cartilhas")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<Cartilha[]>
      })
      .then((data) => setItems([...data].sort((a, b) => b.dateISO.localeCompare(a.dateISO))))
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    if (view.name === "list") load()
  }, [view, load])

  const filtered = useMemo(() => {
    const all = items ?? []
    const needle = normalize(query.trim())
    return all.filter((item) => {
      const matchesCategory = categories.has(item.category)
      const matchesQuery = !needle || normalize(item.title).includes(needle) || normalize(item.body).includes(needle)
      return matchesCategory && matchesQuery
    })
  }, [items, query, categories])

  const previewIndex = previewId === null ? -1 : filtered.findIndex((c) => c.id === previewId)
  const previewCartilha = previewIndex >= 0 ? filtered[previewIndex] : null

  function handlePreviewNavigate(direction: 1 | -1) {
    const nextIndex = previewIndex + direction
    if (nextIndex >= 0 && nextIndex < filtered.length) {
      setPreviewId(filtered[nextIndex].id)
    }
  }

  return (
    <div className="relative min-h-dvh">
      <Backdrop />
      <div className="relative mx-auto max-w-7xl px-6 py-16 sm:px-10">
        <AppHeader />

        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">Painel administrativo</p>
            <a href="/" className="text-sm text-ink-faint underline hover:text-calendula-deep">
              Ver site público
            </a>
          </div>
          {view.name === "list" && (
            <div className="flex items-center gap-2">
              <PeriodSelector value={period} onChange={setPeriod} />
              <button
                type="button"
                onClick={() => setView({ name: "edit", id: "new" })}
                className="gradient-calendula flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-paper shadow-[0_8px_20px_-6px_rgb(212_65_7_/_0.5)]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Novo texto
              </button>
            </div>
          )}
        </div>

        {view.name === "edit" ? (
          <CartilhaEditor id={view.id} onBack={() => setView({ name: "list" })} onSaved={() => setView({ name: "list" })} />
        ) : error ? (
          <p className="text-ink-faint">Não deu pra carregar os textos. Recarregue a página.</p>
        ) : items === null ? (
          <p className="text-ink-faint">Carregando...</p>
        ) : (
          // Dados numa coluna à parte da listagem - não dividem o mesmo
          // fluxo vertical (pedido explícito: a visualização padrão tava
          // lendo como uma tela mobile de coluna única mesmo no desktop).
          // Busca/filtro ficam na coluna da listagem, não na de dados -
          // são controles DESSA lista, não métricas.
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <aside className="lg:w-[320px] lg:shrink-0">
              <StatsPanel period={period} />
            </aside>

            <main className="min-w-0 flex-1">
              <div className="mb-6 flex items-center gap-3">
                {/* `min-w-0 flex-1` no wrapper, não no SearchBar em si -
                    o próprio componente usa `shrink-0` + só `sm:flex-1`
                    (pensado pra empilhar em coluna no mobile, como faz a
                    página pública), então sozinho não encolhe nessa linha
                    sempre-horizontal e estourava a tela estreita (visto de
                    verdade no mobile - 25px de overflow). */}
                <div className="min-w-0 flex-1">
                  <SearchBar value={query} onChange={setQuery} />
                </div>
                <CategoryFilterButton selected={categories} onChange={setCategories} />
              </div>

              {filtered.length === 0 ? (
                <p className="text-ink-faint">Nenhum texto encontrado.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {filtered.map((item) => {
                    const meta = CATEGORY_META[item.category]
                    return (
                      <li
                        key={item.id}
                        className="glass-card flex items-center gap-1 rounded-[20px] pr-3 transition-shadow duration-150 hover:shadow-[0_12px_30px_-16px_rgb(212_65_7_/_0.4)]"
                      >
                        <button
                          type="button"
                          onClick={() => setView({ name: "edit", id: item.id })}
                          className="flex min-w-0 flex-1 items-center justify-between gap-4 px-5 py-4 text-left"
                        >
                          <div className="min-w-0">
                            <div className="mb-1 flex items-center gap-2">
                              <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", meta.bg, meta.fg)}>
                                {meta.label}
                              </span>
                              <span className="text-xs text-ink-faint">{item.dateLabel}</span>
                            </div>
                            <p className="truncate font-serif text-lg font-bold text-ink">{item.title}</p>
                          </div>
                          <Pencil className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewId(item.id)}
                          aria-label={`Pré-visualizar "${item.title}"`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint transition-colors duration-150 hover:text-calendula-deep"
                        >
                          <Eye className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </main>
          </div>
        )}
      </div>

      <ReadingDrawer
        cartilha={previewCartilha}
        onClose={() => setPreviewId(null)}
        onNavigate={handlePreviewNavigate}
        hasPrev={previewIndex > 0}
        hasNext={previewIndex >= 0 && previewIndex < filtered.length - 1}
        extraHeaderActions={
          previewCartilha && (
            <>
              <StatsButton id={previewCartilha.id} />
              <ShareButton id={previewCartilha.id} />
            </>
          )
        }
      />
    </div>
  )
}
