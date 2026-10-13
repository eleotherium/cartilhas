import assinatura from "@/assets/assinatura.png"
import { cn } from "@/lib/utils"

// Mesma silhueta sólida via CSS mask do cabeçalho (ver AppHeader.tsx) - aqui
// sem a calibração de posição sobre o título, só um selo estático no tamanho
// pedido. Proporção real da assinatura recortada (src/assets/assinatura.png):
// 1191x878px de conteúdo de tinta.
const SIGNATURE_ASPECT = 1191 / 878

export function Signature({ height = 44, className }: { height?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none select-none bg-calendula-deep", className)}
      style={{
        height,
        width: height * SIGNATURE_ASPECT,
        WebkitMaskImage: `url(${assinatura})`,
        maskImage: `url(${assinatura})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  )
}
