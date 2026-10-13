import { AnimatePresence, motion } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AppHeader } from "@/components/AppHeader"
import { Backdrop } from "@/components/Backdrop"
import { CartilhaCard } from "@/components/CartilhaCard"
import { CategoryFilterMobile, CategorySidebar, SidebarToggle, type CategoryFilter } from "@/components/CategorySidebar"
import { EmptyState } from "@/components/EmptyState"
import { ReadingDrawer } from "@/components/ReadingDrawer"
import { SearchBar } from "@/components/SearchBar"
import { SortToggle } from "@/components/SortToggle"
import { CATEGORY_ORDER } from "@/lib/categories"
import { EASE_OUT } from "@/lib/motion"
import { normalize } from "@/lib/utils"
import type { Category, Cartilha, SortDirection, SortField } from "@/types/cartilha"

const SIDEBAR_WIDTH = 272
const SIDEBAR_GAP = 32

function App() {
  // Antes era um `import` estático de JSON gerado em build-time; agora os
  // textos vivem no R2, editáveis pelo /admin, então precisam ser buscados em
  // runtime. `null` = ainda carregando (distinto de `[]`, que seria "carregou
  // e não tem nenhum texto" - sem essa distinção o loading piscaria a tela de
  // "nenhum texto encontrado" por engano).
  const [cartilhas, setCartilhas] = useState<Cartilha[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    fetch("/api/cartilhas")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<Cartilha[]>
      })
      .then(setCartilhas)
      .catch(() => setLoadError(true))
  }, [])

  // Ping de visita, uma vez por carregamento da página - "fire-and-forget"
  // de propósito, nunca bloqueia a UI nem precisa de retry se falhar (ver
  // worker/index.ts, contadores simples no R2, consumidos pelo painel
  // admin).
  useEffect(() => {
    fetch("/api/track/visit", { method: "POST" }).catch(() => {})
  }, [])

  const [query, setQuery] = useState("")
  // Colapsada por padrão - quem quer os gêneros abre pelo ícone de sanduíche.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [category, setCategory] = useState<CategoryFilter>("todos")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [activeId, setActiveId] = useState<number | null>(null)

  // Ping de leitura: ver ReadingDrawer.tsx - rolar até o fim conta como
  // leitura (ou, se o texto já cabe na tela sem rolar, ficar 5s aberto já
  // conta). Não é mais "abriu = leu" feito aqui.

  // Captura o texto compartilhado na URL original de forma síncrona
  // (inicializador "preguiçoso" do useState, roda durante o render, antes
  // de qualquer efeito) - se isso fosse lido dentro de um efeito comum, o
  // efeito de `replaceState` logo abaixo (que roda toda vez que `activeId`
  // é null, inclusive no mount) já teria apagado o `t`/rota da URL antes
  // da leitura. Aceita os dois formatos: a rota própria `/t/<id>` (nova,
  // o que o botão de compartilhar gera agora) e o `?t=<id>` antigo (links
  // já compartilhados antes de existir rota - continuam abrindo).
  const [initialSharedId] = useState<number | null>(() => {
    const pathMatch = window.location.pathname.match(/^\/t\/(\d+)$/)
    if (pathMatch) return Number(pathMatch[1])
    const queryId = Number(new URLSearchParams(window.location.search).get("t"))
    return Number.isInteger(queryId) ? queryId : null
  })

  // Reflete o texto aberto na URL (`/t/<id>`) pra permitir compartilhar um
  // link direto pra um texto específico (ver botão de compartilhar no
  // admin) - `replaceState`, não `pushState`, pra não empilhar o
  // histórico do navegador a cada abertura/fechamento/navegação dentro
  // do leitor. Um link antigo em `?t=` é canonizado pra `/t/<id>` assim que
  // abre.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete("t")
    url.pathname = activeId === null ? "/" : `/t/${activeId}`
    window.history.replaceState(null, "", url)
  }, [activeId])

  // Abre o texto indicado em `?t=<id>` assim que os dados carregam - só
  // uma vez (o ref evita reabrir sozinho se o visitante fechar o leitor
  // depois, já que `cartilhas` não muda mais após o carregamento inicial).
  const openedFromUrlRef = useRef(false)
  useEffect(() => {
    if (openedFromUrlRef.current || !cartilhas || initialSharedId === null) return
    openedFromUrlRef.current = true
    if (cartilhas.some((c) => c.id === initialSharedId)) {
      setActiveId(initialSharedId)
    }
  }, [cartilhas, initialSharedId])

  // A sidebar e o botão são `position: fixed` de verdade (ver
  // CategorySidebar.tsx) - precisam de um `top` em px medido de verdade,
  // não chutado, porque a altura do cabeçalho muda com o breakpoint da
  // fonte do título. Medido uma vez no mount e de novo a cada resize
  // (nunca em scroll - um elemento fixed não precisa saber da posição de
  // scroll atual, só de onde a linha "nasce" quando a página está no topo).
  const rowRef = useRef<HTMLDivElement>(null)
  const [topOffset, setTopOffset] = useState(140)

  // O ÍCONE (não o painel) fica centralizado no vão vazio entre a linha de
  // busca/ordenação e o topo da grade de cards - não alinhado com o topo da
  // busca como o painel. Precisa de dois pontos medidos de verdade (borda
  // de baixo da linha de busca, borda de cima do conteúdo seguinte), não
  // metade de uma margem chutada - `-translate-y-1/2` no elemento fixed faz
  // a centralização final sem precisar saber a altura do ícone.
  const searchRowRef = useRef<HTMLDivElement>(null)
  const contentTopRef = useRef<HTMLDivElement>(null)
  const [toggleOffset, setToggleOffset] = useState(140)

  // Largura da janela, rastreada pra derivar tudo que depende de breakpoint
  // (gap lateral, nº de colunas da grade) sem precisar de um listener de
  // resize por coisa - um estado só, tudo recalculado no corpo do render.
  const [windowWidth, setWindowWidth] = useState(1280)

  useLayoutEffect(() => {
    function measure() {
      if (!rowRef.current) return
      setTopOffset(Math.round(rowRef.current.getBoundingClientRect().top + window.scrollY))
      if (searchRowRef.current && contentTopRef.current) {
        const searchBottom = searchRowRef.current.getBoundingClientRect().bottom
        const contentTop = contentTopRef.current.getBoundingClientRect().top
        setToggleOffset(Math.round((searchBottom + contentTop) / 2 + window.scrollY))
      }
      setWindowWidth(window.innerWidth)
    }
    measure()
    // fonts.ready: a fonte serifada do título carrega async e muda a altura
    // do cabeçalho depois da primeira medição (mesmo motivo do AppHeader) -
    // sem isso o vão fica medido contra a fonte de fallback.
    document.fonts?.ready.then(measure)
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  // Gap esquerdo da página (mesma regra que já existia pro posicionamento
  // da sidebar/ícone: padding base de 2.5rem, ou metade do espaço sobrando
  // além de max-w-7xl + 2.5rem, o que for maior) - calculado por fórmula,
  // não medido do próprio container, porque o container agora usa esse
  // valor pra montar sua PRÓPRIA margem; medir dele seria circular. Gap
  // direito: o mesmo, só que reduzido em 2/3 (pedido explícito). Os dois só
  // valem a partir de `lg` (1024px), onde a sidebar/ícone existem; abaixo
  // disso o container volta a usar padding simples via classe Tailwind.
  const leftGap = Math.round(Math.max(40, (windowWidth - 1280) / 2 + 40))
  const rightGap = Math.round(leftGap / 3)
  const isDesktop = windowWidth >= 1024

  // Nº de colunas da grade, espelhando os breakpoints usados antes em
  // `columns-*` do Tailwind - só que agora pra distribuir os cards em
  // round-robin (ver `columns` abaixo), não pra um layout CSS multi-coluna.
  const columnCount = windowWidth >= 1536 && !sidebarOpen ? 4 : windowWidth >= 1280 ? 3 : windowWidth >= 640 ? 2 : 1

  const searched = useMemo(() => {
    const all = cartilhas ?? []
    const needle = normalize(query.trim())
    if (!needle) return all
    return all.filter(
      (c) => normalize(c.title).includes(needle) || normalize(c.body).includes(needle),
    )
  }, [cartilhas, query])

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

  // Distribuição round-robin em colunas (não CSS multi-coluna via
  // `columns-*`): aquilo preenche cada coluna inteira de cima a baixo antes
  // de passar pra próxima, então o 2º texto mais recente caía embaixo do
  // 1º, na mesma coluna, em vez de do lado - ordem de leitura errada. Aqui
  // o item 0 vai pra coluna 0, o item 1 pra coluna 1, etc., voltando pra
  // coluna 0 quando dá a volta - cada card mantém sua altura orgânica
  // (ainda não é um grid de alturas iguais), só a ORDEM de distribuição
  // muda, garantindo que a sequência cronológica/alfabética flua da
  // esquerda pra direita antes de descer.
  const columns = useMemo(() => {
    const cols: { cartilha: Cartilha; index: number }[][] = Array.from({ length: columnCount }, () => [])
    visible.forEach((cartilha, index) => cols[index % columnCount].push({ cartilha, index }))
    return cols
  }, [visible, columnCount])

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
        className="fixed z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
        style={{ top: toggleOffset, left: leftGap / 2 }}
      >
        <SidebarToggle open={sidebarOpen} onToggleOpen={() => setSidebarOpen((o) => !o)} />
      </div>

      <div
        className="relative px-6 pt-16 sm:px-10 lg:px-0"
        style={isDesktop ? { marginLeft: leftGap, marginRight: rightGap } : undefined}
      >
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
            <div ref={searchRowRef} className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center">
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

            <div ref={contentTopRef}>
              {cartilhas === null ? (
                <div className="glass mx-auto flex max-w-md flex-col items-center gap-3 rounded-[28px] px-10 py-16 text-center">
                  <p className="font-serif text-xl font-bold text-ink">
                    {loadError ? "Não deu pra carregar os textos" : "Carregando os textos…"}
                  </p>
                  <p className="text-sm text-ink-faint">
                    {loadError ? "Recarregue a página pra tentar de novo." : "Só um instante."}
                  </p>
                </div>
              ) : visible.length === 0 ? (
                <EmptyState query={query} onClear={() => setQuery("")} />
              ) : (
                <div className="flex gap-6">
                  {columns.map((col, colIndex) => (
                    <div key={colIndex} className="flex min-w-0 flex-1 flex-col gap-6">
                      <AnimatePresence>
                        {col.map(({ cartilha, index }) => (
                          <CartilhaCard
                            key={cartilha.id}
                            cartilha={cartilha}
                            index={index}
                            onOpen={(c) => setActiveId(c.id)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
