import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import { Markdown } from "tiptap-markdown"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link2,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Callout } from "./CalloutExtension"

interface RichEditorProps {
  initialMarkdown: string
  onReady: (editor: Editor) => void
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:text-calendula-deep",
        active && "gradient-calendula text-paper hover:text-paper",
      )}
    >
      {children}
    </button>
  )
}

// Editor rico (negrito, itálico, sublinhado, link, títulos, listas, citação,
// bloco de destaque) que persiste em Markdown puro - `tiptap-markdown` faz o
// round-trip (ver CartilhaEditor.tsx pra leitura/escrita via
// `editor.storage.markdown.getMarkdown()`).
export function RichEditor({ initialMarkdown, onReady }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
      Markdown.configure({ html: false, tightLists: true, linkify: false, breaks: false }),
      Callout,
    ],
    content: initialMarkdown,
    onCreate: ({ editor }) => {
      onReady(editor)
    },
    editorProps: {
      attributes: {
        class: "quiet-scroll min-h-[320px] max-w-none focus:outline-none font-serif text-[17px] leading-[1.75] text-ink",
      },
    },
  })

  if (!editor) return null

  function setLink() {
    const previous = editor!.getAttributes("link").href as string | undefined
    const url = window.prompt("URL do link", previous ?? "https://")
    if (url === null) return
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  return (
    <div className="glass-card rounded-[24px] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-ink/10 pb-3">
        <ToolbarButton label="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-ink/10" />
        <ToolbarButton
          label="Título 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          label="Título 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-ink/10" />
        <ToolbarButton label="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          label="Bloco de destaque"
          active={editor.isActive("callout")}
          onClick={() =>
            editor.isActive("callout")
              ? editor.chain().focus().lift("callout").run()
              : editor.chain().focus().wrapIn("callout").run()
          }
        >
          <Lightbulb className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
