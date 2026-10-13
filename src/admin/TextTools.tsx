import { BarChart3, Check, Share2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface TextStats {
  count: number
  rank: number | null
  total: number
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
        <div className="glass-card absolute right-0 top-full z-10 mt-2 w-52 rounded-2xl p-4 text-left">
          {error ? (
            <p className="text-xs text-ink-faint">Não deu pra carregar.</p>
          ) : !stats ? (
            <p className="text-xs text-ink-faint">Carregando...</p>
          ) : (
            <>
              <p className="font-serif text-2xl font-bold text-ink">{stats.count.toLocaleString("pt-BR")}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {stats.rank !== null ? `leituras · #${stats.rank} de ${stats.total} mais lidos` : "ainda sem leituras"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
