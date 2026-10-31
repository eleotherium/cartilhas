import { AnimatePresence } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AppHeader } from "@/components/AppHeader"
import { Backdrop } from "@/components/Backdrop"
import { CartilhaCard } from "@/components/CartilhaCard"
import { EmptyState } from "@/components/EmptyState"
import { FeaturedQuote } from "@/components/FeaturedQuote"
import { GenreTabsRow } from "@/components/GenreTabsRow"
import { ReadingDrawer } from "@/components/ReadingDrawer"
import { SearchBar } from "@/components/SearchBar"
import { SubscribeModal } from "@/components/SubscribeModal"
import { CATEGORY_ORDER } from "@/lib/categories"
import { cn, distributeRoundRobin, monthKey, monthLabel, normalize } from "@/lib/utils"
import type { Category, CategoryFilter, Cartilha, SortDirection, SortField } from "@/types/cartilha"

// Mede a largura real do nó referenciado e a mantém em sync - usado pra
// igualar a largura da busca à da lista de gêneros ao lado dela (pedido
// explícito: "a busca com a mesma largura desse conjunto"). Só no layout de
// 2 colunas (>=1024px, breakpoint `lg`); abaixo disso a busca já vira
// width:100% via classe no próprio SearchBar.
function useSyncedWidth(sourceRef: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    function measure() {
      if (!sourceRef.current || window.innerWidth < 1024) {
        setWidth(undefined)
        return
      }
      setWidth(sourceRef.current.scrollWidth)
    }
    measure()
    document.fonts?.ready.then(measure)
    window.addEventListener("resize", measure)
    const observer = new ResizeObserver(measure)
    if (sourceRef.current) observer.observe(sourceRef.current)
    return () => {
      window.removeEventListener("resize", measure)
      observer.disconnect()
    }
  }, [sourceRef])
  return width
}

// Mede a distância real entre a borda esquerda da viewport e o nó
// referenciado - usada pra calcular o gap da régua do destaque como
// proporção real do gap até a busca (pedido explícito: 70% desse valor),
// não um px fixo chutado (o gap até a busca varia com a largura da tela,
// por causa da margem automática do container centralizado `max-w-`).
// Observa o <body>, não só o próprio nó: a posição pode mudar por reflow
// de layout (ex: alternar `showFeatured`) sem o nó em si mudar de
// tamanho - um ResizeObserver só nele não pegaria isso.
function useLeftOffset(sourceRef: React.RefObject<HTMLElement | null>) {
  const [left, setLeft] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    function measure() {
      if (!sourceRef.current) return
      setLeft(sourceRef.current.getBoundingClientRect().left)
    }
    measure()
    document.fonts?.ready.then(measure)
    window.addEventListener("resize", measure)
    const observer = new ResizeObserver(measure)
    observer.observe(document.body)
    if (sourceRef.current) observer.observe(sourceRef.current)
    return () => {
      window.removeEventListener("resize", measure)
      observer.disconnect()
    }
  }, [sourceRef])
  return left
}

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
  const [category, setCategory] = useState<CategoryFilter>("todos")
  const [sortField, setSortField] = useState<SortField>("date")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [activeId, setActiveId] = useState<number | null>(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)

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

  // Largura da janela, rastreada só pro nº de colunas da grade.
  const [windowWidth, setWindowWidth] = useState(1280)
  useEffect(() => {
    function measure() {
      setWindowWidth(window.innerWidth)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const columnCount = windowWidth >= 1536 ? 4 : windowWidth >= 1280 ? 3 : windowWidth >= 640 ? 2 : 1

  // Busca com a mesma largura da lista de gêneros ao lado - medida de
  // verdade (ver `useSyncedWidth`), não chutada.
  const genreTabsRef = useRef<HTMLElement>(null)
  const searchWidth = useSyncedWidth(genreTabsRef)

  // Gap da régua do destaque (ver FeaturedQuote) = 70% do gap real entre a
  // borda esquerda da tela e a busca (pedido explícito do usuário) - medido
  // de verdade (ver `useLeftOffset`), não um px fixo.
  const searchBarRef = useRef<HTMLDivElement>(null)
  const searchLeftOffset = useLeftOffset(searchBarRef)
  const featuredBarGap = searchLeftOffset === undefined ? undefined : searchLeftOffset * 0.7

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
      // "Data" aqui é quando o texto ENTROU NO SITE (`publishedAt`), não a
      // data do poema (`dateISO`) - é o que dá a ordem de atividade real
      // do feed (ver worker/index.ts, fallback pra `dateISO` já embutido
      // nessa mesma string pros textos antigos).
      const comparison =
        sortField === "alpha"
          ? a.title.localeCompare(b.title, "pt-BR")
          : a.publishedAt.localeCompare(b.publishedAt)
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [searched, category, sortField, sortDirection])

  // Destaque do texto mais recente (ver FeaturedQuote) - sempre o mais
  // recente de VERDADE, entre todos os publicados, nunca afetado por busca
  // ou filtro de gênero (sem isso, filtrar por "conto" podia destacar um
  // conto velho em vez de deixar claro que não há atividade recente ali).
  // Só aparece na navegação "neutra" (sem busca, sem filtro) - ver
  // `showFeatured` abaixo.
  const heroCartilha = useMemo(() => {
    if (!cartilhas || cartilhas.length === 0) return null
    return [...cartilhas].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0]
  }, [cartilhas])

  const showFeatured = query.trim() === "" && category === "todos"

  // O texto em destaque não se repete embaixo, só quando ele de fato
  // apareceria aí (ver `showFeatured`) - buscando/filtrando, a lista
  // completa aparece normalmente, sem exclusão nenhuma.
  const listItems = useMemo(() => {
    if (!showFeatured || !heroCartilha) return visible
    return visible.filter((c) => c.id !== heroCartilha.id)
  }, [visible, showFeatured, heroCartilha])

  // Agrupamento por mês de publicação - só faz sentido ordenado por data
  // (A-Z não tem relação nenhuma com "quando saiu"). Preserva a ordem que
  // `listItems` já traz (asc/desc já aplicado acima), só quebra em blocos.
  // Cada grupo distribui em MENOS colunas que a grade cheia quando tem
  // poucos textos (`Math.min`) - sem isso, um mês com 2 textos numa grade
  // de 4 colunas sobrava duas colunas vazias ao lado, grade quebrada.
  const monthGroups = useMemo(() => {
    if (sortField !== "date") return null
    const order: string[] = []
    const byMonth = new Map<string, Cartilha[]>()
    for (const cartilha of listItems) {
      const key = monthKey(cartilha.publishedAt)
      if (!byMonth.has(key)) {
        byMonth.set(key, [])
        order.push(key)
      }
      byMonth.get(key)!.push(cartilha)
    }
    return order.map((key) => {
      const items = byMonth.get(key)!
      const pairs = items.map((cartilha, index) => ({ cartilha, index }))
      return { key, label: monthLabel(key), items, columns: distributeRoundRobin(pairs, Math.min(columnCount, items.length)) }
    })
  }, [listItems, sortField, columnCount])

  // Distribuição round-robin em colunas (não CSS multi-coluna via
  // `columns-*`): aquilo preenche cada coluna inteira de cima a baixo antes
  // de passar pra próxima, então o 2º texto mais recente caía embaixo do
  // 1º, na mesma coluna, em vez de do lado - ordem de leitura errada. Aqui
  // o item 0 vai pra coluna 0, o item 1 pra coluna 1, etc., voltando pra
  // coluna 0 quando dá a volta - cada card mantém sua altura orgânica
  // (ainda não é um grid de alturas iguais), só a ORDEM de distribuição
  // muda, garantindo que a sequência cronológica/alfabética flua da
  // esquerda pra direita antes de descer. Usada só sem agrupamento por mês
  // (ordenado A-Z) - com agrupamento, cada mês tem sua própria distribuição
  // (ver `monthGroups` acima).
  const columns = useMemo(() => {
    const pairs = listItems.map((cartilha, index) => ({ cartilha, index }))
    return distributeRoundRobin(pairs, columnCount)
  }, [listItems, columnCount])

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

  return (
    <div className="relative min-h-dvh">
      <Backdrop />

      <div className="relative mx-auto max-w-[1360px] px-6 pb-16 pt-12 sm:px-10">
        {/* Identidade + controles (esquerda) e destaque do texto mais
            recente (direita) - grid de 2 colunas só a partir de `lg`
            (1024px) e só quando há destaque pra mostrar (ver `showFeatured`
            logo abaixo: sem ele, a coluna de controles ocupa a largura
            inteira, não fica "w-fit" sozinha com um vão vazio do lado). */}
        <div
          className={cn(
            "mb-9 flex flex-col gap-8",
            showFeatured && "lg:grid lg:grid-cols-[auto_1fr] lg:items-stretch lg:gap-9",
          )}
        >
          <div className={cn("flex flex-col", showFeatured && "lg:w-fit")}>
            {/* `lg:flex-1` só tem efeito quando o grid acima impõe uma
                altura (via `items-stretch`, quando `showFeatured`) - centra
                a logo na metade do espaço entre o topo e a busca, em vez
                de grudada no topo. */}
            <div className="flex items-center justify-center py-2 lg:flex-1 lg:py-0">
              <AppHeader />
            </div>
            <div className="flex flex-col gap-4">
              <SearchBar ref={searchBarRef} value={query} onChange={setQuery} width={searchWidth} />
              <GenreTabsRow
                ref={genreTabsRef}
                selected={category}
                onSelect={setCategory}
                counts={counts}
                total={searched.length}
                sortField={sortField}
                sortDirection={sortDirection}
                onFieldChange={handleFieldChange}
                onToggleDirection={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
              />
            </div>
          </div>

          {showFeatured && heroCartilha && (
            <FeaturedQuote
              cartilha={heroCartilha}
              barGap={featuredBarGap}
              onOpen={(c) => setActiveId(c.id)}
              onSubscribeClick={() => setSubscribeOpen(true)}
            />
          )}
        </div>

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
        ) : monthGroups ? (
          <div className="flex flex-col gap-12">
            {monthGroups.map((group) => (
              <section key={group.key}>
                {/* Cabeçalho do mês em caixa normal (não a mesma pílula
                    uppercase/tracked dos selos de categoria) - de
                    propósito, pra não repetir a mesma cadência visual duas
                    vezes na página e ler como uma divisória de arquivo, não
                    mais um rótulo. */}
                <div className="mb-5 flex items-baseline gap-4">
                  <h2 className="whitespace-nowrap font-serif text-xl font-semibold text-ink-soft">
                    {group.label}
                  </h2>
                  <span className="h-px flex-1 bg-ink/10" />
                  <span className="text-xs text-ink-faint">
                    {group.items.length === 1 ? "1 texto" : `${group.items.length} textos`}
                  </span>
                </div>
                <div className="flex gap-6">
                  {group.columns.map((col, colIndex) => (
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
              </section>
            ))}
          </div>
        ) : (
          <div className="flex gap-6">
            {columns.map((col, colIndex) => (
              <div key={colIndex} className="flex min-w-0 flex-1 flex-col gap-6">
                <AnimatePresence>
                  {col.map(({ cartilha, index }) => (
                    <CartilhaCard key={cartilha.id} cartilha={cartilha} index={index} onOpen={(c) => setActiveId(c.id)} />
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      <SubscribeModal open={subscribeOpen} onOpenChange={setSubscribeOpen} />

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
