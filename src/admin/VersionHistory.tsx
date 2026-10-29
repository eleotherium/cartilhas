import { History } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface HistoryVersion {
  timestamp: string
  title: string
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Corpo cru vem com frontmatter na frente (mesmo formato de `/raw`) - só
// o corpo interessa pro preview de "Ver".
function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim()
}

// Painel de versões anteriores (popover, mesmo padrão visual do
// `StatsButton` em TextTools.tsx) - busca sob demanda ao abrir, "Ver"
// expande um preview inline do corpo daquela versão, "Restaurar" sobrescreve
// o texto atual com ela (o estado atual também vira uma entrada de
// histórico antes disso, ver rota `restore` no worker - nunca perde dado).
export function VersionHistory({ id, onRestored }: { id: number; onRestored: () => void }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<HistoryVersion[] | null>(null)
  const [error, setError] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [viewingBody, setViewingBody] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || versions || error) return
    fetch(`/api/admin/cartilhas/${id}/history`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<HistoryVersion[]>
      })
      .then(setVersions)
      .catch(() => setError(true))
  }, [open, id, versions, error])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setViewing(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  async function handleView(timestamp: string) {
    if (viewing === timestamp) {
      setViewing(null)
      return
    }
    setViewing(timestamp)
    setViewingBody(null)
    try {
      const res = await fetch(`/api/admin/cartilhas/${id}/history/${timestamp}/raw`)
      if (!res.ok) throw new Error(`status ${res.status}`)
      setViewingBody(stripFrontmatter(await res.text()))
    } catch {
      setViewingBody("Não deu pra carregar essa versão.")
    }
  }

  async function handleRestore(timestamp: string) {
    if (!window.confirm("Restaurar essa versão? O conteúdo atual também fica guardado no histórico antes de ser substituído.")) return
    setRestoring(timestamp)
    try {
      const res = await fetch(`/api/admin/cartilhas/${id}/history/${timestamp}/restore`, { method: "POST" })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setOpen(false)
      setViewing(null)
      setVersions(null)
      onRestored()
    } catch {
      window.alert("Não deu pra restaurar essa versão. Tenta de novo.")
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="glass-card flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:text-calendula-deep"
      >
        <History className="h-4 w-4" strokeWidth={2} />
        Histórico
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)]">
          <div className="glass-card max-h-[60vh] overflow-y-auto rounded-2xl p-3 text-left">
            {error ? (
              <p className="px-1 py-2 text-xs text-ink-faint">Não deu pra carregar o histórico.</p>
            ) : !versions ? (
              <p className="px-1 py-2 text-xs text-ink-faint">Carregando...</p>
            ) : versions.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-faint">Nenhuma versão anterior ainda - toda edição salva a partir de agora fica guardada aqui.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {versions.map((v) => (
                  <li key={v.timestamp} className="rounded-xl px-2 py-2 hover:bg-ink/4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink">{v.title}</p>
                        <p className="text-[10px] uppercase tracking-[0.05em] text-ink-faint">{formatTimestamp(v.timestamp)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleView(v.timestamp)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-soft transition-colors duration-150 hover:bg-ink/8",
                            viewing === v.timestamp && "bg-ink/8",
                          )}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestore(v.timestamp)}
                          disabled={restoring === v.timestamp}
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-calendula-deep transition-colors duration-150 hover:bg-calendula-soft disabled:opacity-50"
                        >
                          {restoring === v.timestamp ? "..." : "Restaurar"}
                        </button>
                      </div>
                    </div>
                    {viewing === v.timestamp && (
                      <p className="quiet-scroll mt-2 max-h-40 overflow-y-auto whitespace-pre-line rounded-lg bg-ink/4 p-2.5 text-xs leading-relaxed text-ink-soft">
                        {viewingBody ?? "Carregando..."}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
