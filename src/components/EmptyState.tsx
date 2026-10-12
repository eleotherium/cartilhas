import { SearchX } from "lucide-react"
import { motion } from "motion/react"
import { DURATION, EASE_OUT } from "@/lib/motion"

interface EmptyStateProps {
  query: string
  onClear: () => void
}

export function EmptyState({ query, onClear }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.card, ease: EASE_OUT }}
      className="glass mx-auto flex max-w-md flex-col items-center gap-4 rounded-[28px] px-10 py-16 text-center"
    >
      <span className="metal-coin grid h-12 w-12 place-items-center rounded-full">
        <SearchX className="h-5 w-5 text-ink-soft" strokeWidth={1.75} />
      </span>
      <p className="font-serif text-xl font-bold text-ink">Nenhum texto encontrado para "{query}"</p>
      <p className="text-sm text-ink-faint">Tente outra palavra, ou veja todos os textos reunidos.</p>
      <button
        type="button"
        onClick={onClear}
        className="gradient-calendula mt-1 rounded-full px-5 py-2 text-sm font-semibold text-paper shadow-[0_8px_20px_-6px_rgb(212_65_7_/_0.5)] transition-transform duration-150 active:scale-95"
      >
        Limpar busca
      </button>
    </motion.div>
  )
}
