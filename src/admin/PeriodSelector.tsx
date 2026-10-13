import { CalendarRange } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { PRESET_LABELS, periodLabel, presetRange, todayUTCDate, type PeriodPreset, type PeriodValue } from "./periodRange"

// Seletor único (mesmo componente, mesmo comportamento) usado na página
// geral do admin (ao lado de "Novo texto") e na página de edição de cada
// texto (ao lado do botão de compartilhar) - um botão compacto que abre um
// popover com os presets + um intervalo personalizado, cabe tanto no
// cabeçalho espaçoso da lista quanto no apertado do editor.
export function PeriodSelector({ value, onChange }: { value: PeriodValue; onChange: (value: PeriodValue) => void }) {
  const [open, setOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo, setCustomTo] = useState(value.to)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  function selectPreset(preset: Exclude<PeriodPreset, "custom">) {
    onChange({ preset, ...presetRange(preset) })
    setOpen(false)
  }

  function applyCustom() {
    if (!customFrom || !customTo || customFrom > customTo) return
    onChange({ preset: "custom", from: customFrom, to: customTo })
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="glass-card flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-ink-soft hover:text-calendula-deep"
      >
        <CalendarRange className="h-4 w-4" strokeWidth={2} />
        {periodLabel(value)}
      </button>
      {open && (
        // `.glass-card` define `position: relative` na própria regra CSS -
        // combinar com `absolute` no MESMO elemento faz a posição relativa
        // ganhar da utilitária (mesma especificidade, `.glass-card` vem
        // depois na folha final), e `right-0`/`top-full` não fazem nada -
        // bug real visto no mobile (popover saindo da viewport). Por isso
        // o posicionamento vive num wrapper à parte, só com `absolute`.
        <div className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)]">
          <div className="glass-card rounded-2xl p-3 text-left">
            <div className="flex flex-col gap-1">
              {(Object.keys(PRESET_LABELS) as Exclude<PeriodPreset, "custom">[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={cn(
                    "rounded-xl px-3 py-2 text-left text-sm transition-colors duration-150",
                    value.preset === preset ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/6",
                  )}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-ink/10 pt-2">
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
                Período personalizado
              </p>
              <div className="flex items-center gap-2 px-1">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white/70 px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-calendula/40"
                />
                <span className="text-ink-faint">–</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayUTCDate()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white/70 px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-calendula/40"
                />
              </div>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customFrom || !customTo || customFrom > customTo}
                className="gradient-calendula mt-2 w-full rounded-xl py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
