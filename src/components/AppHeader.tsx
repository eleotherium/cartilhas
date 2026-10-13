import { motion, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import assinatura from "@/assets/assinatura.png"
import { EASE_OUT } from "@/lib/motion"
import { cn } from "@/lib/utils"

const TITLE = "Cartilhas"

// Proporção real da assinatura recortada (src/assets/assinatura.png), medida
// uma vez via script: 1191x878px de conteúdo de tinta.
const SIGNATURE_ASPECT = 1191 / 878
// Posição calibrada à mão em tools/signature-align-standalone.html (arrastar
// + girar direto sobre o título renderizado), nos dois extremos de tamanho
// que o h1 realmente assume: text-5xl/48px no mobile e lg:text-7xl/72px no
// desktop (ver sm:/lg: do <h1> abaixo) - `titleHeight` aqui é o valor REAL
// medido no app (h1.getBoundingClientRect().height com leading-none, que
// bate exatamente com o font-size: 48 e 72px).
//
// A ferramenta de calibração reportou 55.2px/82.8px como "altura do
// título" nesses mesmos dois pontos - 15% maior nos dois casos, de forma
// consistente. Isolei a causa: não é fonte/fallback (testado forçando
// serif genérica no lugar da Cormorant Garamond, o app ainda mede 72px
// exatos para o `lg:text-7xl`), então o motivo exato da divergência na
// ferramenta ficou em aberto. Para não herdar esse erro, os valores abaixo
// não vêm das frações que a ferramenta calculou - vêm dos deslocamentos em
// PIXEL ABSOLUTO que ela também reportou (dx, dy, largura/altura da
// assinatura), recalculados aqui contra o `titleHeight` real do app. Isso
// preserva exatamente a composição visual escolhida, só com o denominador
// certo.
const CALIBRATION = {
  mobile: { titleHeight: 48, dxFrac: -53.6 / 48, dyFrac: -39.9 / 48, scale: 77.3 / 48, rotateDeg: -6.9 },
  desktop: { titleHeight: 72, dxFrac: -78.5 / 72, dyFrac: -60.5 / 72, scale: 115.9 / 72, rotateDeg: 0 },
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

interface AppHeaderProps {
  /** "full": cabeçalho público, centralizado, com a revelação cinética letra
   * a letra (ver CALIBRATION acima). "compact": versão pro admin - menor,
   * alinhada à esquerda pra caber ao lado de botões de ação, sem a
   * animação de entrada (o admin troca de tela com frequência alta demais
   * pra repetir essa revelação a cada navegação, ver filosofia de
   * animação em emil-design-eng). */
  variant?: "full" | "compact"
}

export function AppHeader({ variant = "full" }: AppHeaderProps) {
  const reduceMotion = useReducedMotion()
  const compact = variant === "compact"
  const wrapperRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [sigBox, setSigBox] = useState<{
    left: number
    top: number
    width: number
    height: number
    rotate: number
  } | null>(null)

  useLayoutEffect(() => {
    function measure() {
      const wrapper = wrapperRef.current
      const title = titleRef.current
      if (!wrapper || !title) return
      // Âncora no próprio <h1>, não numa letra individual: as letras
      // animam com `transform: translateY(22px) blur(...)` na entrada, e
      // `getBoundingClientRect()` de um elemento transformado reflete essa
      // posição transitória (medida uma vez, nunca corrigida depois, porque
      // um `transform` em filho não dispara ResizeObserver no ancestral) -
      // causava o pingo pousando ~22px abaixo do alvo real. O <h1> em si
      // nunca anima, e como "s" é o último caractere sem espaço à direita,
      // sua borda inferior-direita já coincide com o vértice do "s".
      const wrapperRect = wrapper.getBoundingClientRect()
      const targetRect = title.getBoundingClientRect()
      const titleHeight = targetRect.height

      const { mobile, desktop } = CALIBRATION
      const t = Math.max(
        0,
        Math.min(1, (titleHeight - mobile.titleHeight) / (desktop.titleHeight - mobile.titleHeight)),
      )
      const dxFrac = lerp(mobile.dxFrac, desktop.dxFrac, t)
      const dyFrac = lerp(mobile.dyFrac, desktop.dyFrac, t)
      const scale = lerp(mobile.scale, desktop.scale, t)
      const rotate = lerp(mobile.rotateDeg, desktop.rotateDeg, t)

      const height = titleHeight * scale
      const width = height * SIGNATURE_ASPECT

      const anchorX = targetRect.right - wrapperRect.left
      const anchorY = targetRect.bottom - wrapperRect.top

      setSigBox({
        left: anchorX + dxFrac * titleHeight,
        top: anchorY + dyFrac * titleHeight,
        width,
        height,
        rotate,
      })
    }
    measure()
    // ResizeObserver no wrapper, não só `resize` da janela + `fonts.ready`:
    // a fonte serifada carrega via @fontsource (self-hosted, assíncrono) e
    // a primeira medição acontece com a fonte de fallback (largura de letra
    // diferente da Cormorant Garamond real). `fonts.ready` sozinho não foi
    // suficiente - a troca de fonte dispara reflow em momentos que não
    // batem exatamente com a resolução da promise (uma medição ficou presa
    // no valor antigo mesmo depois do `.then`). ResizeObserver reage ao
    // tamanho real do wrapper mudar, não importa a causa.
    const observer = new ResizeObserver(() => measure())
    observer.observe(wrapperRef.current!)
    document.fonts?.ready.then(measure)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  const signatureStyle: CSSProperties | undefined = sigBox
    ? {
        left: sigBox.left,
        top: sigBox.top,
        width: sigBox.width,
        height: sigBox.height,
        backgroundColor: "var(--color-calendula-deep)",
        WebkitMaskImage: `url(${assinatura})`,
        maskImage: `url(${assinatura})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }
    : undefined

  return (
    <header className={cn("relative", compact ? "inline-block text-left" : "mb-[66px] text-center")}>
      <div ref={wrapperRef} className="relative inline-block">
        {/* Revelação cinética única na primeira carga: cada letra sobe com
            blur (ver docs/motion-principles-web.md). Cor sólida só, sem
            degradê - o resto da página já carrega a mistura de cor. Só no
            cabeçalho público ("full") - o do admin troca de tela demais
            pra repetir essa entrada toda vez. */}
        <h1
          ref={titleRef}
          className={cn(
            "select-none font-serif font-bold leading-none tracking-tight text-calendula-deep",
            compact ? "text-3xl sm:text-4xl" : "text-5xl sm:text-6xl lg:text-7xl",
          )}
        >
          {compact || reduceMotion ? (
            TITLE
          ) : (
            <span aria-label={TITLE}>
              {TITLE.split("").map((char, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="inline-block"
                  initial={{ opacity: 0, y: 22, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.15 + i * 0.035 }}
                >
                  {char}
                </motion.span>
              ))}
            </span>
          )}
        </h1>

        {/* Assinatura como silhueta sólida via CSS mask (não `multiply`, que
            pegava a cor de baixo e ficava "suja"). Posição, escala e rotação
            calibradas à mão em tools/signature-align-standalone.html (ver
            CALIBRATION acima) - não é mais uma âncora geométrica no "s", é
            composição visual escolhida diretamente sobre o título real. */}
        {sigBox &&
          (compact ? (
            <div aria-hidden className="pointer-events-none absolute select-none opacity-[0.85]" style={{ ...signatureStyle, transform: `rotate(${sigBox.rotate}deg)` }} />
          ) : (
            <motion.div
              aria-hidden
              initial={reduceMotion ? { opacity: 0, rotate: sigBox.rotate } : { opacity: 0, scale: 0.9, rotate: sigBox.rotate }}
              animate={reduceMotion ? { opacity: 0.85, rotate: sigBox.rotate } : { opacity: 0.85, scale: 1, rotate: sigBox.rotate }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 + TITLE.length * 0.035 }}
              className="pointer-events-none absolute select-none"
              style={signatureStyle}
            />
          ))}
      </div>
    </header>
  )
}
