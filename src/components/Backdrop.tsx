export function Backdrop() {
  return (
    <div aria-hidden className="fixed inset-0 overflow-hidden -z-10">
      <div className="absolute inset-0 bg-paper" />

      {/* Campos de cor grandes e sobrepostos, não pontos de luz discretos:
          laranja calêndula + roxo amor-perfeito + um fundo de noite pra dar
          peso, misturando nas bordas como tinta molhada. */}
      <div
        className="orb orb-drift-a top-[-20%] left-[-14%] h-[820px] w-[820px]"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgb(255 138 61 / 0.55), rgb(212 65 7 / 0.18) 55%, transparent 72%)",
        }}
      />
      <div
        className="orb orb-drift-b top-[-8%] right-[-18%] h-[720px] w-[720px]"
        style={{
          background:
            "radial-gradient(circle at 60% 40%, rgb(139 79 201 / 0.45), rgb(91 42 134 / 0.16) 55%, transparent 70%)",
        }}
      />
      <div
        className="orb orb-drift-c bottom-[-26%] left-[18%] h-[880px] w-[880px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(212 65 7 / 0.4), rgb(91 42 134 / 0.12) 60%, transparent 74%)",
        }}
      />
      <div
        className="orb orb-drift-b bottom-[-10%] right-[-6%] h-[620px] w-[620px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(33 26 40 / 0.3), rgb(91 42 134 / 0.14) 55%, transparent 72%)",
          animationDelay: "-9s",
        }}
      />
      <div
        className="orb orb-drift-a top-[32%] left-[38%] h-[520px] w-[520px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgb(255 138 61 / 0.14), transparent 70%)",
          animationDelay: "-16s",
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgb(250 247 241 / 0) 0%, rgb(250 247 241 / 0.4) 90%)",
        }}
      />
      <div className="grain" />
    </div>
  )
}
