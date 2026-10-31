export type Category = "poema" | "cronica" | "conto" | "ensaio"
export type Status = "published" | "private" | "draft"

export interface Cartilha {
  id: number
  title: string
  category: Category
  dateISO: string
  dateLabel: string
  dateNote: string
  /** Quando o texto entrou no ar de verdade (com fallback pra `dateISO` já
   * aplicado pelo worker) - diferente de `dateISO`, que é a data do POEMA,
   * não do site. Usado pro destaque de "mais recente", o selo de "novo" e
   * o agrupamento por mês do feed. */
  publishedAt: string
  publishedLabel: string
  body: string
  excerpt: string
  wordCount: number
  status: Status
}

export type SortField = "alpha" | "date"
export type SortDirection = "asc" | "desc"
export type CategoryFilter = Category | "todos"
