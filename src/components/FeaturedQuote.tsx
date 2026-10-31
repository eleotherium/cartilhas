import { ChevronRight } from "lucide-react"
import { CATEGORY_META } from "@/lib/categories"
import { cn, leadLines } from "@/lib/utils"
import type { Cartilha } from "@/types/cartilha"

interface FeaturedQuoteProps {
  cartilha: Cartilha
  /** Gap (px) entre a borda esquerda do bloco e a régua, e entre a régua e o
   * texto - os dois iguais, de propósito (ver App.tsx, `useLeftOffset`: 70%
   * do gap real até a busca, não um valor fixo chutado). `undefined` =
   * medição ainda não disponível (primeiro render), usa o valor antigo
   * como fallback pra não gerar um salto de layout visível. */
  barGap?: number
  onOpen: (cartilha: Cartilha) => void
  onSubscribeClick: () => void
}

const BAR_WIDTH = 3
const FALLBACK_GAP = 25

// Destaque do texto mais recente, como uma citação editorial - sem card/
// fundo atrás (nem sutil, nem com gradiente): só uma régua vertical em
// degradê delimitando o bloco, o texto flutua direto sobre o fundo da
// própria página. "ler o texto inteiro" e "Assinar" sempre na mesma linha,
// no fim do bloco (`mt-auto` empurra pro fundo independente do tamanho do
// excerto) - têm que ficar perto um do outro, não espalhados pelas pontas
// da coluna (já aconteceu, lia como solto/sem contexto).
export function FeaturedQuote({ cartilha, barGap, onOpen, onSubscribeClick }: FeaturedQuoteProps) {
  const meta = CATEGORY_META[cartilha.category]
  const Icon = meta.icon
  const excerpt = leadLines(cartilha.body, 5)
  const gap = barGap ?? FALLBACK_GAP

  return (
    <div className="relative flex h-full flex-col gap-3 py-0.5" style={{ paddingLeft: gap * 2 + BAR_WIDTH }}>
      <span
        aria-hidden
        className="absolute inset-y-1 w-[3px] rounded-full bg-gradient-to-b from-calendula to-violeta"
        style={{ left: gap }}
      />

      {/* flex-wrap: o eyebrow carrega a data por extenso ("06 de outubro de
          2026"), bem mais longa que o "6 out" do protótipo - numa coluna
          estreita (mobile, ou o destaque dividindo espaço com a sidebar)
          a soma eyebrow+badge (ambos shrink-0, de propósito, pra não truncar
          nem a data nem o rótulo da categoria) pode passar da largura
          disponível; sem wrap o badge vazava pra fora da tela. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-calendula-deep motion-safe:animate-pulse" />
          mais recente · {cartilha.publishedLabel}
        </span>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] shadow-[0_2px_10px_-2px_rgb(0_0_0_/_0.22)]", meta.bg, meta.fg)}>
          <Icon className="h-[11px] w-[11px]" strokeWidth={2} />
          {meta.label}
        </span>
      </div>

      <h2 className="font-serif text-[26px] font-semibold italic leading-[1.18] text-ink">"{cartilha.title}"</h2>

      <p className="whitespace-pre-line text-[14px] leading-[1.52] text-ink-soft">{excerpt}</p>

      <div className="mt-auto flex flex-wrap items-center gap-5 pt-1">
        <button
          type="button"
          onClick={() => onOpen(cartilha)}
          className="group inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-calendula-deep hover:underline"
        >
          ler o texto inteiro
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onSubscribeClick}
          className="max-w-[280px] shrink-0 rounded-full bg-calendula-soft px-5 py-2.5 text-center text-xs font-semibold leading-tight text-calendula-deep transition-transform duration-200 hover:scale-[1.03]"
        >
          Inscreva-se gratuitamente para receber novas publicações
        </button>
      </div>
    </div>
  )
}
