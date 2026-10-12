import { AnimatePresence, motion } from "motion/react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { AppHeader } from "@/components/AppHeader"
import { Backdrop } from "@/components/Backdrop"
import { CartilhaCard } from "@/components/CartilhaCard"
import { CategoryFilterMobile, CategorySidebar, SidebarToggle, type CategoryFilter } from "@/components/CategorySidebar"
import { EmptyState } from "@/components/EmptyState"
import { ReadingDrawer } from "@/components/ReadingDrawer"
import { SearchBar } from "@/components/SearchBar"
import { SortToggle } from "@/components/SortToggle"
import cartilhasData from "@/data/cartilhas.json"
import { CATEGORY_ORDER } from "@/lib/categories"
import { EASE_OUT } from "@/lib/motion"
import { normalize } from "@/lib/utils"
import type { Category, Cartilha, SortDirection, SortField } from "@/types/cartilha"

const cartilhas = cartilhasData as Cartilha[]
const SIDEBAR_WIDTH = 272
const SIDEBAR_GAP = 32

function App() {
  const [query, setQuery] = useState("")
  // Colapsada por padrão - quem quer os gêneros abre pelo ícone de sanduíche.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [category, setCategory] = useState<CategoryFilter>("todos")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [activeId, setActiveId] = useState<number | null>(null)

  // A sidebar e o botão são `position: fixed` de verdade (ver
  // CategorySidebar.tsx) - precisam de um `top` em px medido de verdade,
  // não chutado, porque a altura do cabeçalho muda com o breakpoint da
  // fonte do título. Medido uma vez no mount e de novo a cada resize
  // (nunca em scroll - um elemento fixed não precisa saber da posição de
  // scroll atual, só de onde a linha "nasce" quando a página está no topo).
  const rowRef = useRef<HTMLDivElement>(null)
  const [topOffset, setTopOffset] = useState(140)

  useLayoutEffect(() => {
    function measure() {
      if (!rowRef.current) return
      setTopOffset(Math.round(rowRef.current.getBoundingClientRect().top + window.scrollY))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const searched = useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return cartilhas
    return cartilhas.filter(
      (c) => normalize(c.title).includes(needle) || normalize(c.body).includes(needle),
    )
  }, [query])

  const counts = useMemo(() => {
    const base = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<Category, number>
    for (const c of searched) base[c.category] += 1
    return base
  }, [searched])

  const visible = useMemo(() => {
    const filtered = category === "todos" ? searched : searched.filter((c) => c.category === category)

    return [...filtered].sort((a, b) => {
      const comparison =
        sortField === "alpha"
          ? a.title.localeCompare(b.title, "pt-BR")
          : a.dateISO.localeCompare(b.dateISO)
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [searched, category, sortField, sortDirection])

  const activeIndex = activeId === null ? -1 : visible.findIndex((c) => c.id === activeId)
  const activeCartilha = activeIndex >= 0 ? visible[activeIndex] : null

  function handleFieldChange(field: SortField) {
    if (field === sortField) return
    setSortField(field)
    setSortDirection(field === "date" ? "desc" : "asc")
  }

  function handleNavigate(direction: 1 | -1) {
    const nextIndex = activeIndex + direction
    if (nextIndex >= 0 && nextIndex < visible.length) {
      setActiveId(visible[nextIndex].id)
    }
  }

  const sidebarProps = { selected: category, onSelect: setCategory, counts, total: searched.length }

  return (
    <div className="relative min-h-dvh">
      <Backdrop />
      <CategoryFilterMobile {...sidebarProps} />

      {/* Painel fixed de verdade: fica numa camada própria, fora do fluxo
          do documento, então nunca é afetado pelo scroll da página (ver
          CategorySidebar.tsx para o porquê de não ser `sticky`). */}
      <CategorySidebar open={sidebarOpen} topOffset={topOffset} {...sidebarProps} />
      <div
        className="fixed z-20 hidden -translate-x-[60px] lg:block"
        style={{ top: topOffset, left: "max(2.5rem, calc((100vw - 1280px) / 2 + 2.5rem))" }}
      >
        <SidebarToggle open={sidebarOpen} onToggleOpen={() => setSidebarOpen((o) => !o)} />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-16 sm:px-10">
        {/* Cabeçalho em largura total, centralizado na página inteira - não
            dentro da coluna ao lado da sidebar (ver referências em
            Desktop/ro: o título fica centralizado mesmo com a barra aberta
            ou fechada, a barra vive na linha de baixo). */}
        <AppHeader />

        <div ref={rowRef} className="relative flex pb-16">
          {/* Espaçador: reserva o espaço que a sidebar fixed ocuparia,
              empurrando o conteúdo - a sidebar em si não está no fluxo
              (é fixed), então precisa de algo aqui pra abrir espaço. Anima
              suave junto com o slide da sidebar. */}
          <motion.div
            initial={false}
            animate={{ width: sidebarOpen ? SIDEBAR_WIDTH + SIDEBAR_GAP : 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="hidden shrink-0 lg:block"
          />

          <main className="min-w-0 flex-1">
            <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchBar value={query} onChange={setQuery} />
              <div className="flex justify-center sm:contents">
                <SortToggle
                  field={sortField}
                  direction={sortDirection}
                  onFieldChange={handleFieldChange}
                  onToggleDirection={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState query={query} onClear={() => setQuery("")} />
            ) : (
              <div className={`columns-1 gap-6 sm:columns-2 xl:columns-3 ${!sidebarOpen ? "2xl:columns-4" : ""}`}>
                <AnimatePresence>
                  {visible.map((cartilha, index) => (
                    <CartilhaCard
                      key={cartilha.id}
                      cartilha={cartilha}
                      index={index}
                      onOpen={(c) => setActiveId(c.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </main>
        </div>
      </div>

      <ReadingDrawer
        cartilha={activeCartilha}
        onClose={() => setActiveId(null)}
        onNavigate={handleNavigate}
        hasPrev={activeIndex > 0}
        hasNext={activeIndex >= 0 && activeIndex < visible.length - 1}
      />
    </div>
  )
}

export default App
