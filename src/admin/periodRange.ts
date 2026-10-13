export type PeriodPreset = "hoje" | "ontem" | "7d" | "30d" | "custom"

export interface PeriodValue {
  preset: PeriodPreset
  /** Sempre resolvido (mesmo pra presets) - quem usa o valor nunca precisa
   * recalcular o intervalo, só ler `from`/`to`. */
  from: string
  to: string
}

export const PRESET_LABELS: Record<Exclude<PeriodPreset, "custom">, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
}

// Dia em UTC, mesma convenção do worker (ver worker/index.ts, `todayKey`) -
// as chaves de `from`/`to` batem certinho com os buckets diários gravados
// no R2, sem depender do fuso do navegador de quem está usando o admin.
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysUTC(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export function presetRange(preset: Exclude<PeriodPreset, "custom">): { from: string; to: string } {
  const today = todayUTC()
  switch (preset) {
    case "hoje":
      return { from: today, to: today }
    case "ontem": {
      const yesterday = addDaysUTC(today, -1)
      return { from: yesterday, to: yesterday }
    }
    case "7d":
      return { from: addDaysUTC(today, -6), to: today }
    case "30d":
      return { from: addDaysUTC(today, -29), to: today }
  }
}

export function defaultPeriod(preset: Exclude<PeriodPreset, "custom"> = "30d"): PeriodValue {
  return { preset, ...presetRange(preset) }
}

function formatShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-")
  return `${d}/${m}`
}

export function periodLabel(value: PeriodValue): string {
  if (value.preset !== "custom") return PRESET_LABELS[value.preset]
  return value.from === value.to ? formatShort(value.from) : `${formatShort(value.from)} – ${formatShort(value.to)}`
}

export function todayUTCDate(): string {
  return todayUTC()
}
