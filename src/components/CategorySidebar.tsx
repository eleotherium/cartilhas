import { Menu, PanelLeftClose, X, type LucideIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"
import { cn } from "@/lib/utils"
import { DURATION, EASE_OUT, SPRING_TOGGLE } from "@/lib/motion"
import type { Category } from "@/types/cartilha"

export type CategoryFilter = Category | "todos"

interface SharedProps {
  selected: CategoryFilter
  onSelect: (value: CategoryFilter) => void
  counts: Record<Category, number>
  total: number
}

function Item({
  value,
  selected,
  onSelect,
  label,
  count,
  icon: Icon,
  colorBg,
  colorText,
  compact,
}: {
  value: CategoryFilter
  selected: CategoryFilter
  onSelect: (value: CategoryFilter) => void
  label: string
  count: number
  icon?: LucideIcon
  colorBg?: string
  colorText?: string
  compact?: boolean
}) {
  const active = selected === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl text-left transition-colors duration-200",
        compact ? "px-3 py-2.5" : "px-4 py-3",
      )}
    >
      {active && (
        <motion.span
          layoutId={compact ? "category-indicator-mobile" : "category-indicator"}
          transition={SPRING_TOGGLE}
          className={cn("absolute inset-0 -z-10 rounded-2xl", colorBg ?? "bg-ink/8")}
        />
      )}
      {Icon && (
        <Icon
          className={cn("h-4 w-4 shrink-0", active ? (colorText ?? "text-ink") : "text-ink-faint")}
          strokeWidth={1.75}
        />
      )}
      <span className={cn("flex-1 text-sm font-semibold", active ? (colorText ?? "text-ink") : "text-ink-soft")}>
        {label}
      </span>
      <span className={cn("text-xs tabular-nums", active ? (colorText ?? "text-ink") : "text-ink-faint")}>
        {count}
      </span>
    </button>
  )
}

function ItemList({ selected, onSelect, counts, total, compact }: SharedProps & { compact?: boolean }) {
  return (
    <nav className="flex flex-col gap-1">
      <Item value="todos" selected={selected} onSelect={onSelect} label="Todos os textos" count={total} compact={compact} />
      {CATEGORY_ORDER.map((category) => {
        const meta = CATEGORY_META[category]
        return (
          <Item
            key={category}
            value={category}
            selected={selected}
            onSelect={onSelect}
            label={meta.plural}
            count={counts[category]}
            icon={meta.icon}
            colorBg={meta.softBg}
            colorText={meta.softText}
            compact={compact}
          />
        )
      })}
    </nav>
  )
}

/** Botão de alternância da sidebar. Não carrega posição própria (nem
 * `fixed`/`sticky`/`absolute`) - quem posiciona é o wrapper em App.tsx.
 * Lembrete: nunca combinar `.glass`/`.glass-reading` (ambas setam
 * `position` no próprio CSS) com `fixed`/`sticky`/`absolute` no MESMO
 * elemento - a regra do CSS que vier depois na folha de estilo final
 * ganha, nem sempre a que você espera pela ordem das classes no JSX. */
export function SidebarToggle({ open, onToggleOpen }: { open: boolean; onToggleOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onToggleOpen}
      whileTap={{ scale: 0.92 }}
      aria-label={open ? "Recolher barra de gêneros" : "Abrir barra de gêneros"}
      className="glass-card relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-calendula-deep"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.span
            key="close"
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: DURATION.iconMorph, ease: EASE_OUT }}
          >
            <PanelLeftClose className="h-4.5 w-4.5" strokeWidth={1.75} />
          </motion.span>
        ) : (
          <motion.span
            key="open"
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, rotate: 90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: -90 }}
            transition={{ duration: DURATION.iconMorph, ease: EASE_OUT }}
          >
            <Menu className="h-4.5 w-4.5" strokeWidth={1.75} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

interface CategorySidebarProps extends SharedProps {
  open: boolean
  /** Deslocamento do topo (px), medido a partir da base real do cabeçalho
   * em App.tsx - não um valor chutado, porque a altura do cabeçalho muda
   * por breakpoint (tamanho de fonte do título). */
  topOffset: number
}

/** Painel de verdade `position: fixed`: preso à viewport, nunca se move
 * nem some com o scroll da página (diferente de `sticky`, que depende do
 * container pai ter espaço de sobra pra "grudar" - aqui o pai era só do
 * tamanho do próprio conteúdo, então sticky não tinha onde grudar e a
 * sidebar simplesmente rolava pra fora de vista). Desliza de verdade
 * (`x`, não `width`) - mais suave e não força reflow de texto durante a
 * própria animação. */
export function CategorySidebar({ open, topOffset, ...props }: CategorySidebarProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.aside
      initial={false}
      animate={{ x: open ? 0 : -300, opacity: open ? 1 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE_OUT }}
      style={{ top: topOffset, left: "max(2.5rem, calc((100vw - 1280px) / 2 + 2.5rem))" }}
      aria-hidden={!open}
      inert={!open ? true : undefined}
      className="fixed z-20 hidden w-[272px] lg:block"
    >
      <div className="glass-card rounded-[28px] p-4">
        <p className="mb-2 px-4 pt-2 text-xs uppercase tracking-[0.08em] text-ink-faint">Gêneros</p>
        <ItemList {...props} />
      </div>
    </motion.aside>
  )
}

/** Acesso à navegação de gêneros no mobile: balão compacto ancorado no
 * próprio botão (mesmo padrão de `automater-de-envios/public/shared/
 * sidebar.html` - `.sidebar-balloon-panel`), não uma gaveta de altura
 * cheia. Fundo invisível só pra fechar ao tocar fora (sem escurecer a
 * tela), seta apontando pro botão, entrada em escala a partir do canto
 * inferior direito (de onde ele "nasce"). */
export function CategoryFilterMobile(props: SharedProps) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  const activeMeta = props.selected !== "todos" ? CATEGORY_META[props.selected] : null

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.92 }}
        aria-label="Abrir gêneros"
        aria-expanded={open}
        className={cn(
          "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+18px)] right-[calc(env(safe-area-inset-right,0px)+18px)] z-40 grid h-14 w-14 place-items-center rounded-full shadow-[0_14px_32px_-8px_rgb(0_0_0_/_0.45)] lg:hidden",
          activeMeta ? activeMeta.bg : "gradient-calendula",
        )}
      >
        <Menu className={cn("h-5 w-5", activeMeta ? activeMeta.fg : "text-paper")} strokeWidth={2} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop invisível: só fecha ao tocar fora, não escurece a
                tela (diferente do painel de leitura, que é uma troca de
                foco completa; aqui é uma escolha rápida, a página continua
                visível atrás). */}
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              style={{ transformOrigin: "bottom right" }}
              className="glass-reading fixed bottom-[calc(env(safe-area-inset-bottom,0px)+82px)] right-[calc(env(safe-area-inset-right,0px)+18px)] z-50 w-[250px] rounded-[20px] p-3 lg:hidden"
            >
              {/* Setinha apontando pro botão que abriu o balão (mesmo
                  padrão de automater-de-envios: .sidebar-balloon-panel::before).
                  Cor sólida, não o tratamento de vidro completo - um blur
                  pesado numa forma de 12px vira só um borrão. */}
              <span className="absolute -bottom-[5px] right-[22px] h-3 w-3 rotate-45 rounded-[2px] border-b border-r border-white/90 bg-paper" />
              <div className="mb-1 flex items-center justify-between px-2 pt-1">
                <p className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Gêneros</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:text-calendula-deep active:scale-90"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <ItemList
                {...props}
                compact
                onSelect={(value) => {
                  props.onSelect(value)
                  setOpen(false)
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
