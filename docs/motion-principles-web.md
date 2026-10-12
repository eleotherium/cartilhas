# Motion em páginas sem timeline fixa

Como adaptar a doutrina de movimento de vídeo (Remotion/HyperFrames) para uma
interface web interativa, onde não existe uma sequência de cenas definida por
um roteiro, só as interações que a pessoa escolhe fazer. Escrito construindo o
`cartilhas-app`; atualize este arquivo quando a próxima página parecida
ensinar algo novo.

Fontes originais do doutrinário de vídeo: `C:\Users\gabri\Desktop\coisinhas\projetinhos\remotion-decks\docs\playbook-video-apresentacao.md`
e `docs\hyperframes-guia.md` no mesmo repositório (projeto Tiro na Lua, Remotion).
Este documento é a tradução dos princípios que sobrevivem a troca de domínio,
não um resumo daqueles arquivos.

## A tradução central

Vídeo tem um diretor: cada quadro é autorado, a câmera e o roteiro decidem
exatamente quando cada elemento aparece. Web não tem diretor — tem uma pessoa
clicando, passando o mouse, digitando, puxando a barra de rolagem, em uma
ordem que você não controla. As regras de movimento de vídeo (ritmo de cena,
revelação amarrada à fala, uma transição por corte) não se copiam direto;
elas precisam ser reancoradas em **eventos de interface** e principalmente em
**frequência de uso**:

- Algo que a pessoa vai ver/clicar **dezenas ou centenas de vezes por sessão**
  (abrir um toggle, apertar uma tecla, abrir o menu) quase não deve animar, ou
  deve animar em bem menos de 200ms. Ver Raycast: o command palette não tem
  animação de abrir/fechar, e essa ausência é a escolha certa, não uma
  lacuna. Em vídeo isso não existe como categoria, porque nada se repete.
- Algo que a pessoa vê **uma vez por sessão** (abrir um modal, o primeiro
  carregamento da página) pode ter uma entrada mais deliberada, parecida com
  a "entrada de herói" dos blueprints de vídeo.
- Não existe "próxima cena": o estado muda porque a pessoa agiu. Toda
  animação precisa responder a um evento real (clique, hover, mudança de
  valor), nunca a um relógio (`setInterval`, replays automáticos) — isso é
  tão proibido aqui quanto em renderização seek-safe de vídeo, mas pelo
  motivo oposto: não é sobre determinismo de render, é sobre nunca animar
  algo que a pessoa não causou.

## O que sobrevive direto da doutrina de vídeo

Estas regras não dependiam de existir uma timeline; elas são sobre como um
movimento *parece* bom, e isso é igual em vídeo e em web:

1. **Liso vence elástico.** Curvas de desaceleração fortes
   (`cubic-bezier(0.16,1,0.3,1)`, equivalente a `power3.out`/`expo.out`) como
   padrão. `back.out`/`bounce.out`/elástico som cartoon fora de contexto
   explicitamente lúdico — é o "número 1 de desligamento instantâneo" citado
   no guia de vídeo, e em UI é a mesma sensação de "isso não devia estar
   quicando".
2. **A saída é a transição.** Quando dois estados trocam (abrir/fechar um
   painel, trocar um ícone), o que entra e o que sai animam **ao mesmo
   tempo, no mesmo instante** — nunca "sai, espera, aí entra". Em Motion isso
   é um `AnimatePresence` sem `mode="wait"` quando se quer sobreposição
   (crossfade), ou com variants que começam a transição de saída no instante
   em que a de entrada começa.
3. **Entrada mais longa que saída.** No catálogo de vídeo: 0,4s para entrar,
   0,25s para sair, como regra geral. A pessoa está disposta a esperar um
   pouco para algo aparecer (ainda está decidindo prestar atenção); quando
   ela pediu para fechar, cada milissegundo extra parece atrito. Usado no
   `ReadingDrawer`: 420ms para abrir, 260ms para fechar, com `variants` (não
   um objeto `transition` plano — plano não diferencia enter/exit porque a
   prop do React continua montada com os mesmos valores durante a saída).
4. **Stagger curto, nunca um relógio por item.** 30-80ms entre itens (vídeo
   usa 40-80ms); mais que isso parece deliberadamente lento. Nunca stagger
   acima de ~500ms de duração total do grupo.
5. **Uma gramática primária (60-70% dos casos) + 1-2 acentos.** Em vídeo isso
   é sobre transições de cena; em web é sobre qual animação cada tipo de
   elemento usa. Ver "A gramática deste site" abaixo.
6. **Nada de respiração preguiçosa.** Movimento ambiente (orbs de fundo, por
   exemplo) deve ser quase imperceptível conscientemente — deslocamento de
   poucos pixels, período de dezenas de segundos — nunca um balanço óbvio.
   "Prefira nenhum movimento a um movimento ruim."
7. **Use blur para mascarar crossfades difíceis.** Quando duas versões de um
   mesmo bloco de texto trocam de tamanho (dois poemas de tamanhos
   diferentes dentro do mesmo painel), um `blur` curto (3-6px) no meio da
   transição esconde a sobreposição das duas versões melhor que qualquer
   ajuste de easing.

## O que não se traduz (e por quê)

- **Revelação sequencial amarrada à fala** não existe sem narração; o
  equivalente web é revelar por **scroll** (`whileInView`, uma vez,
  `margin: "-100px"`) ou por **interação direta** (hover, clique), nunca por
  tempo decorrido.
- **Catálogo de transições de cena** (zoom-through, íris, waterfall) não
  tem onde morar numa página sem cortes de cena. O que sobra dele é a *ideia*
  de ter uma transição-assinatura reconhecível (aqui: o painel lateral
  deslizante) em vez de inventar uma transição diferente por componente.
- **Pausas deliberadas / quadros parados** não se aplicam: a página já fica
  "parada" o tempo todo entre interações, isso é o estado de repouso normal
  da web, não uma ausência a corrigir.

## A gramática deste site (`cartilhas-app`)

Centralizada em `src/lib/motion.ts`. Três camadas:

- **Primária — conteúdo que aparece/reordena.** Fade + leve translateY (12-16px)
  + ease-out forte, 400-480ms, stagger de 45ms por item (até ~12 itens;
  acima disso sem stagger adicional, só `whileInView` por item ao rolar).
  Usada nos cards da grade e no empty state.
- **Acento — o painel de leitura.** Push-slide da direita (não um modal
  centralizado) porque o pedido original era literalmente sobre "transições
  de barras laterais" e porque o gesto de "abrir a margem de um livro" casa
  com o conceito de "Cartilhas". Entrada 420ms / saída 260ms, documentado no
  ponto 3 acima. É a única transição desse tipo na página (gramática única,
  não uma por componente).
- **Microfeedback — ícones e controles.** Troca de ícone (ordem crescente/
  decrescente, busca com texto → busca vazia) é um crossfade com scale
  (0.75→1 entrando, 1→0.75 saindo) e leve rotação (±20°), 140-160ms. Rápido
  de propósito: são os elementos mais clicados da página (regra de
  frequência). O indicador deslizante do toggle de ordenação usa
  `layoutId` do Motion com spring suave (`bounce: 0.18`) porque é um gesto
  raramente repetido (poucas trocas por sessão) e decorativo, não precisa
  da disciplina de velocidade dos ícones.

Toda animação usa só `transform`, `opacity` e (no crossfade do painel de
leitura) `filter: blur()` — nunca `width`/`height`/`top`/`left`. Tudo acima
de `prefers-reduced-motion: reduce` degrada para opacidade pura, sem
deslocamento (ver `useReducedMotion` no `ReadingDrawer` e o `@media` no
`index.css` para os orbs de fundo).

## Segunda rodada: motivando a intensidade pelo conteúdo, não pelo efeito

Pedido do usuário: mais "uau", pesquisado contra referências reais (técnicas
de scrollytelling do The Pudding, vocabulário de kinetic typography do
Awwwards). A pesquisa não achou um "site de poesia premiado" específico pra
copiar — achou princípios: revelação disparada por scroll real (nunca
scroll-jacking), e a ideia de que GSAP ScrollTrigger (ou, aqui, `whileInView`
do Motion) é a ferramenta certa pra "revelar conteúdo conforme a pessoa rola
a página", não pra decorar. Cada efeito abaixo nasceu de uma pergunta "o que
isso tem a ver com o texto/poesia em si", não de "o que fica bonito":

- **Entrada cinética do hero (uma vez só, no carregamento).** O título
  "Cartilhas" entra letra por letra (blur+y+opacity, 30ms de defasagem por
  letra) e a assinatura de fundo faz um wipe de `clip-path` da esquerda pra
  direita, como se estivesse sendo assinada na hora. Motivo: é literalmente
  uma assinatura; animá-la como "sendo escrita" é a única razão de ela
  merecer movimento, não decoração gratuita. Só acontece uma vez (`initial`/
  `animate` no mount, não repete em navegação dentro da SPA).
- **Scroll-reveal de verdade em todos os cards, não só nos primeiros 12.**
  A primeira versão só animava os cards já visíveis no primeiro paint
  (`initial`/`animate` puro); cards abaixo da dobra já apareciam prontos,
  sem revelação. Trocado para `whileInView` com `viewport={{ once: true,
  margin: "-72px" }}` em TODO card — "motion claimed = motion shown" vale
  pro scroll inteiro da página, não só pro primeiro viewport.
- **Tilt 3D no hover dos cards.** `useMotionValue` + `useTransform` +
  `useSpring` (nunca `useState`) seguindo a posição do ponteiro, ±6°. É
  decorativo (não serve função), por isso só se justifica por ser barato,
  suave e por reforçar a sensação de "cartão físico" da grade de papéis —
  exatamente o caso de uso que `emil-design-eng` chama de "spring-based
  mouse interaction", onde decoração é aceitável.
- **Revelação em cascata por estrofe no painel de leitura.** Em vez de um
  `<p>` só com `whitespace-pre-line`, o corpo é dividido por `\n{2,}`
  (parágrafos/estrofes reais do texto) e cada bloco entra com um atraso
  pequeno e limitado (`Math.min(i, STAGGER_CAP) * STAGGER_STEP`, igual ao
  cap já usado nos cards). A motivação é literária: cada bloco É uma
  estrofe, então a cascata acompanha a estrutura real do poema, não é um
  tique aplicado por cima.
- **Saída animada ao trocar de categoria.** A grade inteira agora vive
  dentro de um `AnimatePresence`; cards que saem do filtro encolhem e
  desaparecem em 150ms (rápido, porque trocar de categoria é uma ação
  frequente) em vez de sumirem sem aviso. Isso fecha o princípio "a saída é
  a transição" (seção acima) também pra filtragem, não só pro painel de
  leitura.

Fora do escopo desta rodada, mas caiu da lista por risco maior que ganho:
paralaxe de scroll nos orbs de fundo (os orbs já têm uma animação CSS
própria de deriva; somar um `transform` controlado por scroll no mesmo
elemento arriscava as duas animações brigarem pela mesma propriedade -
precisaria de um wrapper motion separado por orb pra fazer direito, e o
ganho visual não justificou o risco nesta rodada).

## Checklist para a próxima página parecida

- [ ] Declarar a gramática (primária/acento/microfeedback) **antes** de
      escrever componentes, não descobrir no meio.
- [ ] Toda animação responde a um evento real; nada em `setInterval`.
- [ ] Easings fortes (`cubic-bezier(0.16,1,0.3,1)` ou equivalente), nunca o
      `ease`/`ease-in-out` default do navegador.
- [ ] Entradas mais longas que saídas em paineis/modais (~400ms / ~250ms).
- [ ] Elementos clicados com frequência (toggles, ícones) ficam abaixo de
      ~160ms ou não animam.
- [ ] `prefers-reduced-motion` testado de verdade (não só declarado).
- [ ] Nenhuma animação de `width`/`height`/`top`/`left`.
