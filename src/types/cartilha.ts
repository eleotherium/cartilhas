export type Category = "poema" | "cronica" | "conto" | "ensaio"
export type Status = "published" | "private" | "draft"

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
  status: Status
}

export type SortField = "alpha" | "date"
export type SortDirection = "asc" | "desc"
