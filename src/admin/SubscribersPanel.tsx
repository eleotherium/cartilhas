import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { SearchBar } from "@/components/SearchBar"
import { cn, normalize } from "@/lib/utils"

type SubscriberStatus = "confirmed" | "pending" | "unsubscribed"

interface Subscriber {
  id: number
  email: string
  status: SubscriberStatus
  createdAt: string
  confirmedAt: string | null
}

interface SubscribersResponse {
  items: Subscriber[]
  counts: Record<SubscriberStatus, number>
}

const STATUS_META: Record<SubscriberStatus, { label: string; bg: string; fg: string }> = {
  // Mesma linguagem de cor do resto do admin (ver CartilhaEditor.tsx,
  // STATUS_META): calêndula = ativo/em dia, violeta = ainda em trânsito
  // (aguardando confirmação), ink/8 = inativo.
  confirmed: { label: "Confirmado", bg: "bg-calendula-soft", fg: "text-calendula-deep" },
  pending: { label: "Pendente", bg: "bg-violeta-soft", fg: "text-violeta-deep" },
  unsubscribed: { label: "Cancelado", bg: "bg-ink/8", fg: "text-ink-soft" },
}

const STATUS_ORDER: SubscriberStatus[] = ["confirmed", "pending", "unsubscribed"]

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
}

export function SubscribersPanel({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<SubscribersResponse | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<Set<SubscriberStatus>>(() => new Set(STATUS_ORDER))

  useEffect(() => {
    fetch("/api/admin/subscribers")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<SubscribersResponse>
      })
      .then(setData)
      .catch(() => setError(true))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const needle = normalize(query.trim())
    return data.items.filter((item) => statusFilter.has(item.status) && (!needle || normalize(item.email).includes(needle)))
  }, [data, query, statusFilter])

  function toggleStatus(status: SubscriberStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      // Nunca esvazia de vez - mesma regra do filtro de categoria em
      // AdminApp.tsx (a lista simplesmente sumiria sem explicação).
      return next.size > 0 ? next : prev
    })
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Mesmo grid de 3 colunas do cabeçalho do CartilhaEditor (hero
          continua matematicamente centralizado) - a ponta direita fica
          vazia só pra equilibrar a esquerda, já que esta tela não tem
          ações de topo. */}
      <div className="grid grid-cols-1 items-center justify-items-center gap-4 lg:grid-cols-[1fr_auto_1fr] lg:justify-items-stretch lg:gap-6">
        <div aria-hidden className="hidden lg:block" />
        <div className="text-center">
          <AppHeader variant="compact" />
          <button
            type="button"
            onClick={onBack}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-[0.06em] text-ink-faint transition-colors duration-150 hover:text-calendula-deep"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
            Voltar
          </button>
        </div>
        <div aria-hidden className="hidden lg:block" />
      </div>

      {error ? (
        <p className="text-ink-faint">Não deu pra carregar os assinantes. Recarregue a página.</p>
      ) : !data ? (
        <p className="text-ink-faint">Carregando...</p>
      ) : (
        <>
          {/* Contagem por status funciona também como filtro (clique
              liga/desliga, igual CategoryFilterButton em AdminApp.tsx) -
              evita duplicar o mesmo dado num resumo E num controle à parte. */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {STATUS_ORDER.map((status) => {
              const meta = STATUS_META[status]
              const active = statusFilter.has(status)
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  aria-pressed={active}
                  className={cn(
                    "glass-card flex flex-col items-start gap-2 rounded-[20px] p-4 text-left transition-opacity duration-150",
                    !active && "opacity-40",
                  )}
                >
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]", meta.bg, meta.fg)}>
                    {meta.label}
                  </span>
                  <span className="font-serif text-2xl font-bold text-ink">{data.counts[status].toLocaleString("pt-BR")}</span>
                </button>
              )
            })}
          </div>

          <SearchBar value={query} onChange={setQuery} placeholder="Buscar por email" />

          {filtered.length === 0 ? (
            <p className="text-ink-faint">Nenhum assinante encontrado.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((item) => {
                const meta = STATUS_META[item.status]
                return (
                  <li key={item.id} className="glass-card flex items-center gap-4 rounded-[20px] px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{item.email}</p>
                      <p className="text-xs text-ink-faint">
                        Inscrito em {formatDate(item.createdAt)}
                        {item.confirmedAt && ` · confirmado em ${formatDate(item.confirmedAt)}`}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]", meta.bg, meta.fg)}>
                      {meta.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
