import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { Backdrop } from "@/components/Backdrop"
import { SearchBar } from "@/components/SearchBar"
import type { CategoryFilter } from "@/components/CategorySidebar"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"
import { cn, normalize } from "@/lib/utils"
import type { Cartilha } from "@/types/cartilha"
import { CartilhaEditor } from "./CartilhaEditor"
import { StatsPanel } from "./StatsPanel"

type View = { name: "list" } | { name: "edit"; id: number | "new" }

function CategoryPills({ selected, onSelect }: { selected: CategoryFilter; onSelect: (value: CategoryFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect("todos")}
        aria-pressed={selected === "todos"}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150",
          selected === "todos" ? "bg-ink text-paper" : "bg-ink/6 text-ink-soft hover:bg-ink/10",
        )}
      >
        Todos
      </button>
      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_META[cat]
        const active = selected === cat
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(cat)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150",
              active ? cn(meta.bg, meta.fg) : "bg-ink/6 text-ink-soft hover:bg-ink/10",
            )}
          >
            {meta.plural}
          </button>
        )
      })}
    </div>
  )
}

export function AdminApp() {
  const [view, setView] = useState<View>({ name: "list" })
  const [items, setItems] = useState<Cartilha[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<CategoryFilter>("todos")

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
      const matchesCategory = category === "todos" || item.category === category
      const matchesQuery = !needle || normalize(item.title).includes(needle) || normalize(item.body).includes(needle)
      return matchesCategory && matchesQuery
    })
  }, [items, query, category])

  return (
    <div className="relative min-h-dvh">
      <Backdrop />
      <div className="relative mx-auto max-w-4xl px-6 py-16 sm:px-10">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-4xl font-bold text-calendula-deep">Cartilhas · Admin</h1>
            <p className="mt-1 text-sm text-ink-faint">
              <a href="/" className="underline hover:text-calendula-deep">
                Ver site público
              </a>
            </p>
          </div>
          {view.name === "list" && (
            <button
              type="button"
              onClick={() => setView({ name: "edit", id: "new" })}
              className="gradient-calendula flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-paper shadow-[0_8px_20px_-6px_rgb(212_65_7_/_0.5)]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Novo texto
            </button>
          )}
        </header>

        {view.name === "edit" ? (
          <CartilhaEditor id={view.id} onBack={() => setView({ name: "list" })} onSaved={() => setView({ name: "list" })} />
        ) : error ? (
          <p className="text-ink-faint">Não deu pra carregar os textos. Recarregue a página.</p>
        ) : items === null ? (
          <p className="text-ink-faint">Carregando...</p>
        ) : (
          <>
            <StatsPanel />

            <div className="mb-6 flex flex-col gap-3">
              <SearchBar value={query} onChange={setQuery} />
              <CategoryPills selected={category} onSelect={setCategory} />
            </div>

            {filtered.length === 0 ? (
              <p className="text-ink-faint">Nenhum texto encontrado.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {filtered.map((item) => {
                  const meta = CATEGORY_META[item.category]
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setView({ name: "edit", id: item.id })}
                        className="glass-card flex w-full items-center justify-between gap-4 rounded-[20px] px-5 py-4 text-left transition-shadow duration-150 hover:shadow-[0_12px_30px_-16px_rgb(212_65_7_/_0.4)]"
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
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
