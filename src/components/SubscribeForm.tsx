import { Mail } from "lucide-react"
import { useState, type FormEvent } from "react"

type SubscribeState = "idle" | "loading" | "sent" | "already" | "error"

// Pílula compacta (mesma linguagem visual da SearchBar - `.glass`,
// `rounded-full`) pra inscrição na lista de notificação de texto novo.
// Fica perto do cabeçalho (ver App.tsx), não dentro da linha de
// busca/ordenação - é uma ação bem mais rara que buscar, não merece a
// mesma proeminência o tempo todo.
export function SubscribeForm() {
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

  if (state === "sent") {
    return (
      <p className="mx-auto mb-8 max-w-md text-center text-sm text-ink-soft">
        Quase lá - confirme o email que acabou de chegar em <strong>{email}</strong>.
      </p>
    )
  }
  if (state === "already") {
    return <p className="mx-auto mb-8 max-w-md text-center text-sm text-ink-soft">Esse email já está assinando as novidades.</p>
  }

  return (
    <div className="mb-8">
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md items-center justify-center gap-2">
        <div className="glass flex h-12 flex-1 items-center gap-2 rounded-full px-5">
          <Mail className="h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.75} />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Receber um email a cada texto novo"
            className="h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={state === "loading"}
          className="gradient-calendula shrink-0 rounded-full px-5 py-3 text-sm font-semibold text-paper shadow-[0_8px_20px_-6px_rgb(212_65_7_/_0.5)] disabled:opacity-60"
        >
          {state === "loading" ? "..." : "Assinar"}
        </button>
      </form>
      {state === "error" && (
        <p role="alert" className="mt-2 text-center text-xs text-red-700">
          Não deu pra assinar agora. Tenta de novo.
        </p>
      )}
    </div>
  )
}
