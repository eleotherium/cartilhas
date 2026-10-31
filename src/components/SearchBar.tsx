import { Search, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { DURATION } from "@/lib/motion"

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = "Buscar por título ou palavra do texto" }: SearchBarProps) {
  return (
    <div className="glass flex h-[72px] shrink-0 items-center gap-3 rounded-full px-7 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_rgb(212_65_7_/_0.3)] sm:flex-1">
      <Search className="h-6 w-6 shrink-0 text-ink-faint" strokeWidth={1.75} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent text-base text-ink placeholder:text-ink-faint focus:outline-none"
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
            <X className="h-4 w-4" strokeWidth={1.75} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
