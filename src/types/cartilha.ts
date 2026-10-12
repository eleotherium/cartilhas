export type Category = "poema" | "cronica" | "conto" | "ensaio"

export interface Cartilha {
  id: number
  title: string
  category: Category
  dateISO: string
  dateLabel: string
  dateNote: string
  body: string
  excerpt: string
  wordCount: number
}

export type SortField = "alpha" | "date"
export type SortDirection = "asc" | "desc"
