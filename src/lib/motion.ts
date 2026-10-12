// Gramática de movimento única do site. Ver docs/motion-principles-web.md
// para a origem das regras (adaptadas do doutrinário de vídeo em
// remotion-decks/docs/hyperframes-guia.md) e o raciocínio de cada valor.

export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const

// Spring "iOS": amortecimento crítico com overshoot de 1-1.5%, nunca cartoon.
export const SPRING_SETTLE = { type: "spring", duration: 0.45, bounce: 0.12 } as const
// Levemente mais vivo, só para o indicador do toggle (gesto decorativo, clicado raramente).
export const SPRING_TOGGLE = { type: "spring", duration: 0.4, bounce: 0.18 } as const

export const DURATION = {
  press: 0.14,
  iconMorph: 0.16,
  hover: 0.2,
  card: 0.45,
  drawerEnter: 0.3,
  drawerExit: 0.2,
} as const

export const STAGGER_STEP = 0.045
export const STAGGER_CAP = 12
