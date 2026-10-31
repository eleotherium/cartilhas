import { ChevronRight } from "lucide-react"
import { motion } from "motion/react"
import { CATEGORY_META } from "@/lib/categories"
import { cn, isRecentlyPublished } from "@/lib/utils"
import { EASE_OUT } from "@/lib/motion"
import type { Cartilha } from "@/types/cartilha"

interface CartilhaCardProps {
  cartilha: Cartilha
  index: number
  onOpen: (cartilha: Cartilha) => void
}

export function CartilhaCard({ cartilha, index, onOpen }: CartilhaCardProps) {
  const meta = CATEGORY_META[cartilha.category]
  const Icon = meta.icon
  const isNew = isRecentlyPublished(cartilha.publishedAt)

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(cartilha)}
      layout
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-72px" }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15, ease: EASE_OUT } }}
      transition={{
        duration: 0.45,
        ease: EASE_OUT,
        delay: (index % 3) * 0.06,
        layout: { duration: 0.4, ease: EASE_OUT },
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="group glass-card block w-full rounded-[28px] p-6 text-left transition-shadow duration-200 hover:shadow-[0_24px_48px_-20px_rgb(212_65_7_/_0.4),0_12px_60px_-24px_rgb(91_42_134_/_0.35)]"
    >
      <span
        className={cn(
          "mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-[0_2px_10px_-2px_rgb(0_0_0_/_0.25)]",
          meta.bg,
          meta.fg,
        )}
      >
        <Icon className="h-3 w-3" strokeWidth={2} />
        {meta.label}
      </span>

      <h3 className="text-clamp-2 mb-2 font-serif text-[28px] font-bold leading-[1.15] text-ink transition-colors duration-200 group-hover:text-calendula-deep">
        {cartilha.title}
      </h3>

      <p className="text-clamp-3 mb-5 text-[15px] leading-relaxed text-ink-soft">
        {cartilha.excerpt}
      </p>

      <div className="flex items-center justify-between text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          {isNew && (
            <>
              <span className="inline-flex items-center gap-1 font-semibold text-calendula-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-calendula-deep motion-safe:animate-pulse" />
                novo
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          {cartilha.dateLabel}
        </span>
        <span className="flex items-center gap-1 font-medium text-calendula-deep opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          ler
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
        </span>
      </div>
    </motion.button>
  )
}
