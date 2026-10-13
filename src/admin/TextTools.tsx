import { BarChart3, Check, Share2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { PeriodValue } from "./periodRange"

interface StatsWindow {
  /** "Visualização": abriu o texto, sem condição nenhuma. */
  opens: number
  /** "Leitura": rolou até o fim ou ficou 5s aberto (ver ReadingDrawer.tsx). */
  reads: number
}

interface TextStats {
  today: StatsWindow
  last7d: StatsWindow
  last30d: StatsWindow
  allTime: StatsWindow
  rank: number | null
  total: number
  filtered: (StatsWindow & { from: string; to: string }) | null
}

const BUTTON_CLASS =
  "glass-card grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-[opacity,transform] duration-150 hover:text-calendula-deep active:scale-90"

// Botão "compartilhar" - não é Web Share API (pouco confiável em desktop,
// e o único consumidor aqui é o próprio admin copiando um link pra
// repostar em outro lugar): copia a URL pública do texto pro clipboard,
// com uma confirmação visual rápida (ícone vira check por 1.5s).
export function ShareButton({ id }: { id: number }) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const url = `${window.location.origin}/?t=${id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard indisponível (contexto não seguro, permissão negada) -
      // recurso secundário de conveniência, sem fallback.
    }
  }

  return (
    <button type="button" onClick={handleShare} aria-label="Copiar link público deste texto" className={BUTTON_CLASS}>
      {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Share2 className="h-4 w-4" strokeWidth={1.75} />}
    </button>
  )
}

// Botão "stats" - só existe em contexto admin (preview protegido e
// editor), nunca no leitor público (ver ReadingDrawer.tsx,
// `extraHeaderActions`). Busca sob demanda (só ao abrir o popover), não
// de cara - a maioria dos textos abertos no admin nunca tem esse popover
// clicado.
export function StatsButton({ id }: { id: number }) {
  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState<TextStats | null>(null)
  const [error, setError] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || stats || error) return
    fetch(`/api/admin/stats/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<TextStats>
      })
      .then(setStats)
      .catch(() => setError(true))
  }, [open, id, stats, error])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ver estatísticas deste texto"
        aria-expanded={open}
        className={BUTTON_CLASS}
      >
        <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
      </button>
      {open && (
        // `.glass-card` define `position: relative` na própria regra CSS -
        // combinado com `absolute` no mesmo elemento, a posição relativa
        // ganha (mesma especificidade, `.glass-card` vem depois na folha
        // final) e `right-0`/`top-full` não fazem nada - por isso o
        // posicionamento fica num wrapper à parte, só com `absolute`.
        <div className="absolute right-0 top-full z-10 mt-2 w-60 max-w-[calc(100vw-2rem)]">
          <div className="glass-card rounded-2xl p-4 text-left">
            {error ? (
              <p className="text-xs text-ink-faint">Não deu pra carregar.</p>
            ) : !stats ? (
              <p className="text-xs text-ink-faint">Carregando...</p>
            ) : (
              <>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <p className="font-serif text-2xl font-bold text-ink">{stats.allTime.opens.toLocaleString("pt-BR")}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.04em] text-ink-faint">Visualização</p>
                  </div>
                  <div className="h-9 w-px bg-ink/10" />
                  <div className="text-center">
                    <p className="font-serif text-2xl font-bold text-ink">{stats.allTime.reads.toLocaleString("pt-BR")}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.04em] text-ink-faint">Leitura</p>
                  </div>
                </div>
                <p className="mt-2 text-center text-xs text-ink-faint">
                  {stats.rank !== null ? `#${stats.rank} de ${stats.total} mais lidos` : "ainda sem leituras"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, metrics, highlight }: { label: string; metrics: StatsWindow; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-3", highlight ? "card-highlight-mixed" : "glass-card")}>
      <div className="flex items-center justify-center gap-3">
        <div className="text-center">
          <p className="font-serif text-xl font-bold text-ink">{metrics.opens.toLocaleString("pt-BR")}</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.04em] text-ink-faint">Visualização</p>
        </div>
        <div className="h-8 w-px shrink-0 bg-ink/10" />
        <div className="text-center">
          <p className="font-serif text-xl font-bold text-ink">{metrics.reads.toLocaleString("pt-BR")}</p>
          <p className="mt-0.5 text-[9px] uppercase tracking-[0.04em] text-ink-faint">Leitura</p>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] uppercase tracking-[0.05em] text-ink-faint">{label}</p>
    </div>
  )
}

// Faixa de cartões na página de edição (abaixo do formulário de
// metadados, antes do corpo rico) - padrão de referência fixa (hoje/7
// dias/30 dias sempre visíveis) + um cartão extra em destaque quando o
// PeriodSelector ao lado do botão de compartilhar está num período que
// não é redundante com os três fixos ("ontem" ou um intervalo
// personalizado - selecionar "hoje"/"7 dias"/"30 dias" não adiciona nada
// de novo, já está nos cartões fixos). Cada cartão é dividido em dois
// números - visualização (abriu) e leitura (terminou de ler) - não é só
// um total, pra dar uma noção real de quantos abrem vs. quantos lêem.
export function TextStatsStrip({ id, period }: { id: number; period: PeriodValue }) {
  const [stats, setStats] = useState<TextStats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setStats(null)
    setError(false)
    fetch(`/api/admin/stats/${id}?from=${period.from}&to=${period.to}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<TextStats>
      })
      .then(setStats)
      .catch(() => setError(true))
  }, [id, period])

  if (error) return null
  if (!stats) {
    return <div className="glass-card h-[104px] animate-pulse rounded-2xl" />
  }

  const showFiltered = stats.filtered !== null && (period.preset === "ontem" || period.preset === "custom")

  const cards: { key: string; label: string; window: StatsWindow; highlight?: boolean }[] = []
  if (showFiltered && stats.filtered) {
    cards.push({ key: "filtered", label: "No período filtrado", window: stats.filtered, highlight: true })
  }
  cards.push({ key: "hoje", label: "Hoje", window: stats.today })
  cards.push({ key: "7d", label: "7 dias", window: stats.last7d })
  cards.push({ key: "30d", label: "30 dias", window: stats.last30d })

  return (
    // `flex-wrap`: cada cartão precisa de espaço pra dois números lado a
    // lado ("visualização" + "leitura"), 3-4 cartões numa linha só estouram
    // a largura no mobile (visto de verdade) - `min-w-[150px]` garante uma
    // largura mínima legível antes de quebrar linha.
    <div className="flex flex-wrap gap-3">
      {cards.map((card) => (
        <div key={card.key} className="min-w-[150px] flex-1">
          <MetricCard label={card.label} metrics={card.window} highlight={card.highlight} />
        </div>
      ))}
    </div>
  )
}
