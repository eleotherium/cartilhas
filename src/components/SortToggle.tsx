import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpWideNarrow, CalendarDays } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { DURATION, SPRING_TOGGLE } from "@/lib/motion"
import type { SortDirection, SortField } from "@/types/cartilha"

interface SortToggleProps {
  field: SortField
  direction: SortDirection
  onFieldChange: (field: SortField) => void
  onToggleDirection: () => void
}

const OPTIONS: { field: SortField; label: string; icon: typeof ArrowDownAZ }[] = [
  { field: "alpha", label: "A a Z", icon: ArrowDownAZ },
  { field: "date", label: "Data", icon: CalendarDays },
]

export function SortToggle({ field, direction, onFieldChange, onToggleDirection }: SortToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="glass relative flex h-14 items-center rounded-full p-1.5">
        {OPTIONS.map((option) => {
          const Icon = option.icon
          const active = field === option.field
          return (
            <button
              key={option.field}
              type="button"
              onClick={() => onFieldChange(option.field)}
              aria-pressed={active}
              className="relative z-10 flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-[color,transform] duration-200 active:scale-95"
            >
              {active && (
                <motion.span
                  layoutId="sort-indicator"
                  transition={SPRING_TOGGLE}
                  className="metal-coin absolute inset-0 -z-10 rounded-full"
                />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 transition-colors duration-200",
                  active ? "text-ink" : "text-ink-faint",
                )}
                strokeWidth={1.75}
              />
              <span className={cn(active ? "text-ink" : "text-ink-faint")}>{option.label}</span>
            </button>
          )
        })}
      </div>

      <motion.button
        type="button"
        onClick={onToggleDirection}
        aria-label={direction === "asc" ? "Ordem crescente, trocar para decrescente" : "Ordem decrescente, trocar para crescente"}
        whileTap={{ scale: 0.92 }}
        className="glass relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-ink-soft hover:text-calendula-deep"
      >
        <AnimatePresence initial={false}>
          {direction === "asc" ? (
            <motion.span
              key="asc"
              className="absolute inset-0 grid place-items-center"
              initial={{ opacity: 0, scale: 0.75, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.75, rotate: 20 }}
              transition={{ duration: DURATION.iconMorph, ease: [0.16, 1, 0.3, 1] }}
            >
              <ArrowUpWideNarrow className="h-4.5 w-4.5" strokeWidth={1.75} />
            </motion.span>
          ) : (
            <motion.span
              key="desc"
              className="absolute inset-0 grid place-items-center"
              initial={{ opacity: 0, scale: 0.75, rotate: 20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.75, rotate: -20 }}
              transition={{ duration: DURATION.iconMorph, ease: [0.16, 1, 0.3, 1] }}
            >
              <ArrowDownWideNarrow className="h-4.5 w-4.5" strokeWidth={1.75} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
