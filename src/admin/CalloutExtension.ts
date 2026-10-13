// Bloco de destaque (callout, estilo Notion) - não existe nativo no Tiptap
// nem em markdown puro, então é um nó customizado. Serializa como um
// container `::: destaque ... :::` (padrão documentado no próprio exemplo
// oficial do tiptap-markdown, via markdown-it-container) - continua legível
// como texto puro se alguém abrir o .md cru, e não inventa uma sintaxe nova.
import { Node, mergeAttributes } from "@tiptap/core"
import markdownItContainer from "markdown-it-container"

const CONTAINER_NAME = "destaque"

// `state`/`markdownit` tipados frouxamente de propósito: a interface
// `MarkdownNodeSpec` do tiptap-markdown puxa uma versão de @types/markdown-it
// que conflita com a instalada na raiz (erro de tipos, não de runtime - o
// padrão abaixo é copiado do próprio exemplo oficial do pacote, que funciona).
interface MarkdownState {
  write(text: string): void
  renderContent(node: unknown): void
  closeBlock(node: unknown): void
  flushClose(size?: number): void
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownState, node: unknown) {
          state.write(`::: ${CONTAINER_NAME}\n`)
          state.renderContent(node)
          state.flushClose(1)
          state.write(":::")
          state.closeBlock(node)
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(markdownit: any) {
            markdownit.use(markdownItContainer, CONTAINER_NAME)
          },
        },
      },
    }
  },

  // markdown-it-container renderiza o container como `<div class="destaque">`
  // (classe, não atributo) - o parseHTML precisa bater com isso exatamente,
  // já que o caminho markdown→editor passa por HTML intermediário (os tokens
  // do markdown-it viram essa div, que só então é interpretada pelas regras
  // normais de parseHTML do nó, não por um mapeamento direto token→nó).
  parseHTML() {
    return [{ tag: "div.destaque" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: CONTAINER_NAME }), 0]
  },
})
