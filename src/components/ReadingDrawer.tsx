import * as Dialog from "@radix-ui/react-dialog"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CATEGORY_META } from "@/lib/categories"
import { cn } from "@/lib/utils"
import { DURATION, EASE_OUT, STAGGER_CAP, STAGGER_STEP } from "@/lib/motion"
import type { Cartilha } from "@/types/cartilha"

interface ReadingDrawerProps {
  cartilha: Cartilha | null
  onClose: () => void
  onNavigate: (direction: 1 | -1) => void
  hasPrev: boolean
  hasNext: boolean
}

export function ReadingDrawer({ cartilha, onClose, onNavigate, hasPrev, hasNext }: ReadingDrawerProps) {
  const reduceMotion = useReducedMotion()

  // Variants (não um objeto `transition` plano) para que entrada e saída tenham
  // durações diferentes: entrada deliberada (0.42s), saída rápida (0.26s) -
  // ver docs/motion-principles-web.md, "entrada mais longa que saída".
  const panelVariants = reduceMotion
    ? {
        hidden: { opacity: 0, transition: { duration: DURATION.drawerExit, ease: EASE_OUT } },
        visible: { opacity: 1, transition: { duration: DURATION.drawerEnter, ease: EASE_OUT } },
      }
    : {
        hidden: { x: "100%", transition: { duration: DURATION.drawerExit, ease: EASE_OUT } },
        visible: { x: 0, transition: { duration: DURATION.drawerEnter, ease: EASE_OUT } },
      }

  const meta = cartilha ? CATEGORY_META[cartilha.category] : null
  const Icon = meta?.icon
  const paragraphs = cartilha ? cartilha.body.split(/\n{2,}/) : []

  return (
    <Dialog.Root open={cartilha !== null} onOpenChange={(open) => !open && onClose()}>
      <AnimatePresence>
        {cartilha && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-noite/30 sm:backdrop-blur-sm"
                variants={{
                  hidden: { opacity: 0, transition: { duration: DURATION.drawerExit, ease: EASE_OUT } },
                  visible: { opacity: 1, transition: { duration: DURATION.drawerEnter, ease: EASE_OUT } },
                }}
                initial="hidden"
                animate="visible"
                exit="hidden"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="glass-reading fixed right-0 bottom-0 top-[10%] left-[10%] z-50 flex flex-col overflow-hidden rounded-[28px] p-6 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:rounded-l-[32px] sm:rounded-r-none sm:max-w-[640px] sm:p-10 lg:w-3/4 lg:max-w-none"
              >
                {/* Identidade de cor da categoria dentro do painel - sem isso
                    o leitor cai num branco plano desconectado do resto da
                    página (ver feedback: "modal de leitura ta bem pobre").
                    Duas luzes (a cor da categoria + a cor complementar da
                    identidade), uma barra grossa no topo e o ícone da
                    categoria gigante e fantasma no fundo - não é mais um
                    detalhe discreto, é uma presença de verdade. */}
                {meta && Icon && (
                  <>
                    <span className={cn("absolute inset-x-0 top-0 h-2.5 rounded-tl-[32px]", meta.bg)} />
                    {/* Raio e tamanho do blur menores por padrão (mobile) - as
                        duas luzes são enormes (560/460px) com blur pesado
                        (100-110px), um custo de GPU bem alto numa animação
                        de entrada em celular. A partir de `sm:` a tela tem
                        mais espaço de sobra (e GPU melhor em geral), volta
                        ao tamanho cheio. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -top-24 right-[-15%] h-[320px] w-[320px] rounded-full blur-[48px] sm:-top-40 sm:h-[560px] sm:w-[560px] sm:blur-[100px]"
                      style={{ backgroundColor: meta.glow, opacity: 0.9 }}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -bottom-32 left-[-10%] h-[280px] w-[280px] rounded-full blur-[52px] sm:-bottom-48 sm:h-[460px] sm:w-[460px] sm:blur-[110px]"
                      style={{ backgroundColor: meta.glowComplement, opacity: 0.8 }}
                    />
                    <Icon
                      aria-hidden
                      className="pointer-events-none absolute -bottom-16 -right-10 h-[300px] w-[300px] text-ink opacity-[0.05]"
                      strokeWidth={0.75}
                    />
                  </>
                )}
                <div className="relative mb-6 flex items-center justify-between">
                  {meta && Icon && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] shadow-[0_2px_10px_-2px_rgb(0_0_0_/_0.25)]",
                        meta.bg,
                        meta.fg,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      {meta.label}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(-1)}
                      disabled={!hasPrev}
                      aria-label="Texto anterior"
                      className="glass-card grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-[opacity,transform] duration-150 enabled:hover:text-calendula-deep enabled:active:scale-90 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(1)}
                      disabled={!hasNext}
                      aria-label="Próximo texto"
                      className="glass-card grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-[opacity,transform] duration-150 enabled:hover:text-calendula-deep enabled:active:scale-90 disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Fechar"
                        className="glass-card ml-1 grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-transform duration-150 hover:text-calendula-deep active:scale-90"
                      >
                        <X className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                <div className="quiet-scroll flex-1 overflow-y-auto pr-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={cartilha.id}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                    >
                      <motion.div
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: EASE_OUT }}
                      >
                        <Dialog.Title className="mb-1 font-serif text-4xl font-bold leading-tight text-ink">
                          {cartilha.title}
                        </Dialog.Title>
                        <p className="mb-8 text-xs uppercase tracking-[0.08em] text-ink-faint">
                          {cartilha.dateLabel}
                        </p>
                      </motion.div>

                      {/* O poema se revela estrofe a estrofe, não como um bloco
                          só: ver docs/motion-principles-web.md, "revelação
                          sequencial" adaptada de vídeo pra algo motivado pelo
                          próprio conteúdo (cada bloco é uma estrofe real do
                          texto), não um tique decorativo. Só opacity+y, sem
                          `filter: blur()`: textos longos têm muitas estrofes
                          animando quase juntas (STAGGER_CAP trava o delay
                          máximo), e blur é a propriedade mais cara de animar -
                          era o principal motivo do modal "carregar devagar". */}
                      <div className="space-y-6">
                        {paragraphs.map((paragraph, i) => (
                          <motion.p
                            key={i}
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.4,
                              ease: EASE_OUT,
                              delay: 0.1 + Math.min(i, STAGGER_CAP) * STAGGER_STEP,
                            }}
                            className="whitespace-pre-line font-serif text-[20px] leading-[1.75] text-ink"
                          >
                            {paragraph}
                          </motion.p>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
