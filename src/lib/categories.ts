import { BookOpen, Feather, Newspaper, PenTool } from "lucide-react"
import type { Category } from "@/types/cartilha"

interface CategoryMeta {
  label: string
  plural: string
  icon: typeof Feather
  /** Pílula em degradê (cards, cabeçalho do leitor, indicador ativo) - já
   * inclui preenchimento e, no caso de "ensaio", a própria borda. Nunca
   * precisa de mais nada além de `fg` por cima. */
  bg: string
  fg: string
  /** Realce suave para o item ativo na barra lateral de gêneros. */
  softBg: string
  softText: string
  /** Brilho decorativo principal (radial) do painel de leitura, na própria
   * cor da categoria, e `glowComplement`, numa segunda cor da identidade -
   * a mistura das duas é o ponto ("roxo e preto em mistura", não só a cor
   * sozinha). */
  glow: string
  glowComplement: string
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  poema: {
    label: "Poema",
    plural: "Poemas",
    icon: Feather,
    bg: "gradient-calendula",
    fg: "text-paper",
    softBg: "bg-calendula-soft",
    softText: "text-calendula-deep",
    glow: "rgb(212 65 7 / 0.4)",
    glowComplement: "rgb(91 42 134 / 0.3)",
  },
  cronica: {
    label: "Crônica",
    plural: "Crônicas",
    icon: Newspaper,
    bg: "gradient-violeta",
    fg: "text-paper",
    softBg: "bg-violeta-soft",
    softText: "text-violeta-deep",
    glow: "rgb(91 42 134 / 0.4)",
    glowComplement: "rgb(212 65 7 / 0.28)",
  },
  conto: {
    label: "Conto",
    plural: "Contos",
    icon: BookOpen,
    bg: "gradient-noite",
    fg: "text-paper",
    softBg: "bg-noite/10",
    softText: "text-noite",
    glow: "rgb(33 26 40 / 0.35)",
    glowComplement: "rgb(91 42 134 / 0.3)",
  },
  ensaio: {
    label: "Ensaio",
    plural: "Ensaios",
    icon: PenTool,
    bg: "gradient-border-mixed",
    fg: "text-ink",
    softBg: "bg-ink/6",
    softText: "text-ink",
    glow: "rgb(212 65 7 / 0.3)",
    glowComplement: "rgb(91 42 134 / 0.24)",
  },
}

export const CATEGORY_ORDER: Category[] = ["poema", "cronica", "conto", "ensaio"]
