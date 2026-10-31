import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpWideNarrow, CalendarDays } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"
import { cn } from "@/lib/utils"
import { DURATION, SPRING_TOGGLE } from "@/lib/motion"
import type { Category, CategoryFilter, SortDirection, SortField } from "@/types/cartilha"

interface GenreTabsRowProps {
  selected: CategoryFilter
  onSelect: (value: CategoryFilter) => void
  counts: Record<Category, number>
  total: number
  sortField: SortField
  sortDirection: SortDirection
  onFieldChange: (field: SortField) => void
  onToggleDirection: () => void
}

const SORT_OPTIONS: { field: SortField; label: string; icon: typeof ArrowDownAZ }[] = [
  { field: "alpha", label: "A a Z", icon: ArrowDownAZ },
  { field: "date", label: "Data", icon: CalendarDays },
]

// Gêneros + ordenar vivem na mesma linha/lista (pedido explícito) - o
// ordenar ganha um divisor fino antes dele pra marcar que é uma AÇÃO, não
// mais um filtro, mesmo compartilhando a linha. A UI completa de ordenação
// (campo A-Z/Data + direção, igual ao SortToggle de antes) mora num popover
// compacto ancorado no ícone - preserva 100% da função original num rótulo
// bem menor do que a barra de 72px que ocupava antes.
export const GenreTabsRow = forwardRef<HTMLElement, GenreTabsRowProps>(function GenreTabsRow(
  { selected, onSelect, counts, total, sortField, sortDirection, onFieldChange, onToggleDirection },
  ref,
) {
  const [sortOpen, setSortOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // Posição calculada à mão (não CSS `absolute` ancorado no próprio botão):
  // o popover precisa escapar do `<nav>` (ver portal abaixo), então vira
  // `position:fixed` com coordenadas de viewport medidas no botão.
  const [popPos, setPopPos] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!sortOpen || !anchorRef.current) return
    function measure() {
      const rect = anchorRef.current!.getBoundingClientRect()
      setPopPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [sortOpen])

  useEffect(() => {
    if (!sortOpen) return
    function handleClick(event: MouseEvent) {
      const target = event.target as Node
      if (anchorRef.current?.contains(target)) return
      if (popRef.current?.contains(target)) return
      setSortOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [sortOpen])

  const tabs: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "todos", label: "Todos", count: total },
    ...CATEGORY_ORDER.map((category) => ({
      value: category,
      label: CATEGORY_META[category].plural,
      count: counts[category],
    })),
  ]

  return (
    <nav ref={ref} className="flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = selected === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onSelect(tab.value)}
            aria-pressed={active}
            className={cn(
              "relative shrink-0 whitespace-nowrap py-1 text-[13px] font-medium transition-colors duration-200",
              active ? "font-semibold text-calendula-deep" : "text-ink-faint hover:text-ink",
            )}
          >
            {tab.label}
            <span className="ml-1 text-[10px] tabular-nums opacity-65">{tab.count}</span>
            {active && (
              <motion.span
                layoutId="genre-tab-underline"
                transition={SPRING_TOGGLE}
                className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-calendula-deep"
              />
            )}
          </button>
        )
      })}

      <span className="h-4 w-px shrink-0 bg-ink/15" />

      <div className="relative shrink-0" ref={anchorRef}>
        <button
          type="button"
          onClick={() => setSortOpen((o) => !o)}
          aria-label="Ordenar"
          aria-expanded={sortOpen}
          className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-colors duration-200 hover:bg-paper-deep hover:text-calendula-deep"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
        </button>

        {/* Portal pro body, não `position:absolute` dentro do `<nav>`: o
            nav precisa de `overflow-x-auto` pro scroll horizontal das abas
            no mobile, e isso força `overflow-y` pra `auto` também (regra do
            próprio CSS - não dá pra ter só um eixo com overflow controlado),
            o que CORTA qualquer conteúdo absoluto que escape verticalmente
            do nav. O popover "abria" (aria-expanded=true, no DOM) mas nunca
            aparecia - sumia cortado pelo clipping do nav. Com portal, vira
            `position:fixed` com coordenadas medidas em `anchorRef` (ver
            `popPos` acima), fora da árvore que tem overflow. */}
        {sortOpen &&
          popPos &&
          createPortal(
            <AnimatePresence>
              <motion.div
                ref={popRef}
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                style={{ transformOrigin: "top right", position: "fixed", top: popPos.top, right: popPos.right }}
                className="glass-card z-30 flex items-center gap-2 rounded-full p-1.5"
              >
                <div className="relative flex items-center">
                  {SORT_OPTIONS.map((option) => {
                    const Icon = option.icon
                    const active = sortField === option.field
                    return (
                      <button
                        key={option.field}
                        type="button"
                        onClick={() => onFieldChange(option.field)}
                        aria-pressed={active}
                        className="relative z-10 flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition-colors duration-200"
                      >
                        {active && (
                          <motion.span
                            layoutId="sort-indicator"
                            transition={SPRING_TOGGLE}
                            className="metal-coin absolute inset-0 -z-10 rounded-full"
                          />
                        )}
                        <Icon className={cn("h-3.5 w-3.5", active ? "text-ink" : "text-ink-faint")} strokeWidth={1.75} />
                        <span className={active ? "text-ink" : "text-ink-faint"}>{option.label}</span>
                      </button>
                    )
                  })}
                </div>

                <motion.button
                  type="button"
                  onClick={onToggleDirection}
                  aria-label={directionLabel(sortDirection)}
                  whileTap={{ scale: 0.92 }}
                  className="glass relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full text-ink-soft hover:text-calendula-deep"
                >
                  <AnimatePresence initial={false}>
                    {sortDirection === "asc" ? (
                      <motion.span
                        key="asc"
                        className="absolute inset-0 grid place-items-center"
                        initial={{ opacity: 0, scale: 0.75, rotate: -20 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.75, rotate: 20 }}
                        transition={{ duration: DURATION.iconMorph, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ArrowUpWideNarrow className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="desc"
                        className="absolute inset-0 grid place-items-center"
                        initial={{ opacity: 0, scale: 0.75, rotate: 20 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.75, rotate: -20 }}
                        transition={{ duration: DURATION.iconMorph, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ArrowDownWideNarrow className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            </AnimatePresence>,
            document.body,
          )}
      </div>
    </nav>
  )
})

function directionLabel(direction: SortDirection) {
  return direction === "asc" ? "Ordem crescente, trocar para decrescente" : "Ordem decrescente, trocar para crescente"
}
