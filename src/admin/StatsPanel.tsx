import { useEffect, useState } from "react"
import { Eye, Flame, Users } from "lucide-react"
import { CATEGORY_META } from "@/lib/categories"
import { cn } from "@/lib/utils"
import type { Category } from "@/types/cartilha"

interface DaySeries {
  date: string
  count: number
}

interface TopRead {
  id: number
  title: string
  category: Category | null
  count: number
}

interface Stats {
  visitsTotal: number
  readsTotal: number
  visitsSeries: DaySeries[]
  readsSeries: DaySeries[]
  topReads: TopRead[]
}

// Mini gráfico de barras à mão, sem lib nova - só duas séries de ~30
// pontos, uma dependência inteira de gráfico seria overkill. `title` em
// cada barra serve de tooltip nativo (sem JS extra pra isso).
function MiniBarChart({ data, colorVar }: { data: DaySeries[]; colorVar: string }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="flex h-16 items-end gap-[2px]">
      {data.map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count}`}
          className="min-w-[3px] flex-1 rounded-t-sm"
          style={{
            height: `${Math.max(3, (d.count / max) * 100)}%`,
            backgroundColor: colorVar,
            opacity: d.count === 0 ? 0.25 : 1,
          }}
        />
      ))}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  series,
  colorVar,
}: {
  icon: typeof Eye
  label: string
  value: number
  series: DaySeries[]
  colorVar: string
}) {
  return (
    <div className="glass-card flex flex-col gap-4 rounded-[24px] p-5">
      <div className="flex items-center gap-2 text-ink-faint">
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span className="text-xs font-semibold uppercase tracking-[0.06em]">{label}</span>
      </div>
      <p className="font-serif text-3xl font-bold text-ink">{value.toLocaleString("pt-BR")}</p>
      <MiniBarChart data={series} colorVar={colorVar} />
      <p className="text-[11px] text-ink-faint">Últimos 30 dias</p>
    </div>
  )
}

export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return res.json() as Promise<Stats>
      })
      .then(setStats)
      .catch(() => setError(true))
  }, [])

  if (error) return null
  if (!stats) {
    return <div className="glass-card mb-8 h-[220px] animate-pulse rounded-[24px]" />
  }

  return (
    <div className="mb-10 flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Users} label="Visitas" value={stats.visitsTotal} series={stats.visitsSeries} colorVar="var(--color-calendula)" />
        <StatCard icon={Eye} label="Leituras" value={stats.readsTotal} series={stats.readsSeries} colorVar="var(--color-violeta)" />
      </div>

      {stats.topReads.length > 0 && (
        <div className="glass-card rounded-[24px] p-5">
          <div className="mb-3 flex items-center gap-2 text-ink-faint">
            <Flame className="h-4 w-4" strokeWidth={2} />
            <span className="text-xs font-semibold uppercase tracking-[0.06em]">Mais lidos</span>
          </div>
          <ul className="flex flex-col gap-2">
            {stats.topReads.map((item, i) => {
              const meta = item.category ? CATEGORY_META[item.category] : null
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-faint">{i + 1}</span>
                  {meta && (
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]", meta.bg, meta.fg)}>
                      {meta.label}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.title}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-faint">{item.count}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
