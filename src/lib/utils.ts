import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

export function readingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.round(wordCount / 200))
  return `${minutes} min de leitura`
}

// Janela de "atividade recente" pro selo "novo" - não é "publicado hoje",
// é "publicado numa leva recente o bastante pra valer destacar" (um blog
// pessoal não publica todo dia).
const NEW_WINDOW_DAYS = 21

export function isRecentlyPublished(publishedAt: string): boolean {
  const published = new Date(publishedAt).getTime()
  if (Number.isNaN(published)) return false
  return Date.now() - published < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

// true só quando o texto foi de fato reaproveitado/republicado (a data do
// poema e a data de publicação no site caem em dias diferentes) - a imensa
// maioria dos textos tem as duas iguais (fallback do worker, ver
// worker/index.ts), e repetir a mesma data duas vezes na UI seria ruído.
export function hasDivergentPublishDate(dateISO: string, publishedAt: string): boolean {
  return dateISO !== publishedAt.slice(0, 10)
}

// Chave/rótulo de agrupamento por mês a partir do prefixo "AAAA-MM" da
// string (serve tanto pra `publishedAt` com hora quanto pro formato puro
// "AAAA-MM-DD") - evita reparsear a data inteira só pra isso.
export function monthKey(value: string): string {
  return value.slice(0, 7)
}

export function monthLabel(value: string): string {
  const [year, month] = monthKey(value).split("-").map(Number)
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Primeiras N linhas não vazias do corpo (markdown bruto) - usada no preview
// do texto em destaque, que quer mostrar MAIS do que o `excerpt` curto
// pré-computado (pensado pros cards pequenos da grade). Como a maioria dos
// textos é poema com quebra de linha livre, isso já lê como uma amostra de
// verdade do ritmo do texto, não só a primeira frase.
export function leadLines(body: string, maxLines: number): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n")
}

// Mesma distribuição round-robin em colunas usada pra grade inteira (ver
// App.tsx), só que parametrizável - um grupo de mês com poucos textos usa
// menos colunas que a grade cheia, pra não sobrar coluna vazia ao lado de
// uma só coluna preenchida.
export function distributeRoundRobin<T>(items: T[], columnCount: number): T[][] {
  const cols: T[][] = Array.from({ length: Math.max(1, columnCount) }, () => [])
  items.forEach((item, index) => cols[index % cols.length].push(item))
  return cols
}
