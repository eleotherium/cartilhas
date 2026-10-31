import * as Dialog from "@radix-ui/react-dialog"
import { Mail, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState, type FormEvent } from "react"
import { DURATION, EASE_OUT } from "@/lib/motion"

type SubscribeState = "idle" | "loading" | "sent" | "already" | "error"

interface SubscribeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Era uma pílula sempre visível perto do cabeçalho - saiu de lá porque
// competia por espaço com a busca/logo na linha de cima (ver App.tsx).
// Agora é um modal: o botão "Inscreva-se..." mora junto do texto em
// destaque (ver FeaturedQuote), e só abre isso aqui quando clicado.
export function SubscribeModal({ open, onOpenChange }: SubscribeModalProps) {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<SubscribeState>("idle")

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (state === "loading") return
    setState("loading")
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = (await res.json()) as { alreadySubscribed?: boolean }
      setState(data.alreadySubscribed ? "already" : "sent")
    } catch {
      setState("error")
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    // Reseta só ao fechar, com um pequeno atraso - trocar o conteúdo
    // (mensagem de sucesso -> formulário vazio) ainda durante a animação
    // de saída piscaria o estado errado por uma fração de segundo.
    if (!next) setTimeout(() => setState("idle"), 200)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-noite/30 sm:backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.drawerExit, ease: EASE_OUT }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="glass-reading fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[28px] p-7"
              >
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-paper-deep hover:text-calendula-deep"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </Dialog.Close>

                <span className="gradient-calendula mb-4 grid h-11 w-11 place-items-center rounded-full text-paper">
                  <Mail className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>

                <Dialog.Title className="mb-2 font-serif text-2xl font-bold text-ink">
                  Novidades por email
                </Dialog.Title>

                {state === "sent" ? (
                  <p className="text-[13.5px] leading-relaxed text-ink-soft">
                    Quase lá - confirme o email que acabou de chegar em <strong>{email}</strong>.
                  </p>
                ) : state === "already" ? (
                  <p className="text-[13.5px] leading-relaxed text-ink-soft">
                    Esse email já está assinando as novidades.
                  </p>
                ) : (
                  <>
                    <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">
                      Um email só quando sai texto novo — poema, crônica, conto ou ensaio. Sem spam, sem newsletter
                      semanal.
                    </p>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="seu@email.com"
                        className="h-11 rounded-2xl border border-ink/10 bg-paper px-4 text-sm text-ink placeholder:text-ink-faint focus:border-calendula-deep focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={state === "loading"}
                        className="h-11 rounded-2xl bg-calendula-deep text-sm font-semibold text-paper disabled:opacity-60"
                      >
                        {state === "loading" ? "..." : "Assinar"}
                      </button>
                    </form>
                    {state === "error" && (
                      <p role="alert" className="mt-2 text-center text-xs text-red-700">
                        Não deu pra assinar agora. Tenta de novo.
                      </p>
                    )}
                    <p className="mt-3.5 text-center text-[11px] text-ink-faint">Cancele quando quiser, com um clique.</p>
                  </>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
