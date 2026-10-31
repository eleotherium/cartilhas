import { Search, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { forwardRef, type CSSProperties } from "react"
import { DURATION } from "@/lib/motion"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Largura explícita (px) - igualada à lista de gêneros ao lado (ver
   * App.tsx, `useSyncedWidth`). `undefined` = largura natural (mobile,
   * onde a busca já ocupa 100% via classe). */
  width?: number
}

// Compacta (h-10, ícone 16px) - a versão antiga (h-[72px], ícone 24px)
// sozinha já ocupava mais de metade da largura da tela numa linha de
// cabeçalho; ninguém precisa de tanto espaço só pra digitar/ver uma busca.
export const SearchBar = forwardRef<HTMLDivElement, SearchBarProps>(function SearchBar(
  { value, onChange, placeholder = "Buscar textos", width },
  ref,
) {
  const style: CSSProperties | undefined = width ? { width } : undefined
  return (
    <div
      ref={ref}
      style={style}
      className="glass flex h-10 shrink-0 items-center gap-2.5 rounded-full px-4 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_rgb(212_65_7_/_0.3)] max-sm:w-full"
    >
      <Search className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
      <AnimatePresence>
        {value.length > 0 && (
          <motion.button
            type="button"
            onClick={() => onChange("")}
            aria-label="Limpar busca"
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.82 }}
            transition={{ duration: DURATION.iconMorph, ease: "easeOut" }}
            whileTap={{ scale: 0.9 }}
            className="shrink-0 rounded-full p-1 text-ink-faint hover:text-calendula-deep"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
})
