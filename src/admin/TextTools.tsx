import { BarChart3, Check, Share2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { PeriodValue } from "./periodRange"

interface TextStats {
  today: number
  last7d: number
  last30d: number
  allTime: number
  rank: number | null
  total: number
  filtered: { from: string; to: string; count: number } | null
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
        <div className="absolute right-0 top-full z-10 mt-2 w-52 max-w-[calc(100vw-2rem)]">
          <div className="glass-card rounded-2xl p-4 text-left">
            {error ? (
              <p className="text-xs text-ink-faint">Não deu pra carregar.</p>
            ) : !stats ? (
              <p className="text-xs text-ink-faint">Carregando...</p>
            ) : (
              <>
                <p className="font-serif text-2xl font-bold text-ink">{stats.allTime.toLocaleString("pt-BR")}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {stats.rank !== null ? `leituras · #${stats.rank} de ${stats.total} mais lidos` : "ainda sem leituras"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Faixa de cartões na página de edição (abaixo do formulário de
// metadados, antes do corpo rico) - padrão de referência fixa (hoje/7
// dias/30 dias sempre visíveis) + um cartão extra em destaque quando o
// PeriodSelector ao lado do botão de compartilhar está num período que
// não é redundante com os três fixos ("ontem" ou um intervalo
// personalizado - selecionar "hoje"/"7 dias"/"30 dias" não adiciona nada
// de novo, já está nos cartões fixos).
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
    return <div className="glass-card h-[88px] animate-pulse rounded-2xl" />
  }

  const showFiltered = stats.filtered !== null && (period.preset === "ontem" || period.preset === "custom")

  const cards: { key: string; label: string; value: number; highlight?: boolean }[] = []
  if (showFiltered && stats.filtered) {
    cards.push({ key: "filtered", label: "No período filtrado", value: stats.filtered.count, highlight: true })
  }
  cards.push({ key: "hoje", label: "Hoje", value: stats.today })
  cards.push({ key: "7d", label: "7 dias", value: stats.last7d })
  cards.push({ key: "30d", label: "30 dias", value: stats.last30d })

  return (
    <div className="flex gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className={cn("flex-1 rounded-2xl px-4 py-3 text-center", card.highlight ? "card-highlight-mixed" : "glass-card")}
        >
          <p className="font-serif text-2xl font-bold text-ink">{card.value.toLocaleString("pt-BR")}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.05em] text-ink-faint">{card.label}</p>
        </div>
      ))}
    </div>
  )
}
