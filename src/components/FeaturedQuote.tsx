import { ChevronRight } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { CATEGORY_META } from "@/lib/categories"
import { cn, leadLines } from "@/lib/utils"
import type { Cartilha } from "@/types/cartilha"

interface FeaturedQuoteProps {
  cartilha: Cartilha
  /** Gap (px) entre a borda esquerda do bloco e a régua - medido de verdade
   * (ver App.tsx, `useLeftOffset`: 70% do gap real até a busca, não um
   * valor fixo chutado). `undefined` = medição ainda não disponível
   * (primeiro render), usa o valor antigo como fallback pra não gerar um
   * salto de layout visível. */
  barGap?: number
  onOpen: (cartilha: Cartilha) => void
  onSubscribeClick: () => void
}

const BAR_WIDTH = 3
const FALLBACK_GAP = 25
// Gap da régua até o texto = metade do gap até a borda esquerda (pedido
// explícito: "aproxima ela do texto, 50% mais próximo do que está
// atualmente") - os dois gaps pararam de ser iguais de propósito.
const RIGHT_GAP_RATIO = 0.5

// Distância real entre a borda direita do bloco e a borda direita da
// JANELA (não da coluna/container centralizado `max-w-`) - pra a faixa
// decorativa sair "do canto da tela" de verdade (pedido explícito), não
// parar na borda do container como a primeira tentativa fazia. Medida à
// parte do `useLeftOffset`/`useSyncedWidth` de App.tsx porque depende da
// própria borda direita DESTE componente, não de outro nó irmão.
function useRightViewportGap(sourceRef: React.RefObject<HTMLElement | null>) {
  const [gap, setGap] = useState(0)
  useLayoutEffect(() => {
    function measure() {
      if (!sourceRef.current) return
      setGap(window.innerWidth - sourceRef.current.getBoundingClientRect().right)
    }
    measure()
    window.addEventListener("resize", measure)
    const observer = new ResizeObserver(measure)
    observer.observe(document.body)
    return () => {
      window.removeEventListener("resize", measure)
      observer.disconnect()
    }
  }, [sourceRef])
  return gap
}

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
  const leftGap = barGap ?? FALLBACK_GAP
  const rightGap = leftGap * RIGHT_GAP_RATIO
  const rootRef = useRef<HTMLDivElement>(null)
  const rightViewportGap = useRightViewportGap(rootRef)

  return (
    <div ref={rootRef} className="relative flex h-full flex-col gap-3 pb-2 pt-5" style={{ paddingLeft: leftGap + BAR_WIDTH + rightGap }}>
      {/* Réguas finas no topo/base, só no layout de 2 colunas (`lg+`) -
          pedido explícito ("abraça esse todo saindo do canto direito",
          "linhas + tag", cor "a partir da barra" como uma extensão dela);
          no empilhado (mobile/tablet) o usuário confirmou que já está bom
          sem elas. Cada régua usa a cor REAL da barra NAQUELA altura (ela é
          um degradê vertical calêndula→violeta) - a de cima é calêndula, a
          de baixo é violeta, nunca uma cor inventada à parte - dissolvendo
          pra transparente indo pra direita até a borda física da tela (ver
          `useRightViewportGap`). Duas tentativas anteriores erraram: uma
          tinha a direção do fade invertida (sumia bem onde devia nascer);
          outra usava linhas grossas com cores saturadas que destoavam da
          referência fina/sutil aprovada. */}
      <span
        aria-hidden
        className="absolute top-0 hidden h-px bg-gradient-to-l from-calendula to-transparent opacity-60 lg:block"
        style={{ left: leftGap + BAR_WIDTH, right: -rightViewportGap }}
      />
      <span
        aria-hidden
        className="absolute bottom-0 hidden h-px bg-gradient-to-l from-violeta to-transparent opacity-60 lg:block"
        style={{ left: leftGap + BAR_WIDTH, right: -rightViewportGap }}
      />
      {/* Tag ancorada na régua de cima, alinhada à borda direita do
          CONTEÚDO (não da tela crua, diferente das réguas) - mesmo
          alinhamento que o resto da página já respeita. `bg-paper`
          "corta" visualmente a linha por trás do texto. */}
      <span
        aria-hidden
        className="absolute right-0 top-0 hidden -translate-y-1/2 items-center gap-1.5 bg-paper pl-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-calendula-deep lg:flex"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-calendula-deep" />
        Nova edição
      </span>

      <span
        aria-hidden
        className="absolute inset-y-1 w-[3px] rounded-full bg-gradient-to-b from-calendula to-violeta"
        style={{ left: leftGap }}
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
          className="max-w-full shrink-0 rounded-full bg-calendula-soft px-5 py-2.5 text-center text-xs font-semibold leading-tight text-calendula-deep transition-transform duration-200 hover:scale-[1.03]"
        >
          Inscreva-se gratuitamente para receber novas publicações
        </button>
      </div>
    </div>
  )
}
