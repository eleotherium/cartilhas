// Lê os .txt de texts/ (na raiz do repo) e gera src/data/cartilhas.json.
// Rode de novo com `npm run generate:data` sempre que um texto novo for adicionado/editado.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEXTS_DIR = resolve(__dirname, '..', 'texts')
const OUT_FILE = resolve(__dirname, '..', 'src', 'data', 'cartilhas.json')
const CATEGORIAS_FILE = resolve(__dirname, 'categorias.json')

const { _comentario, ...categorias } = JSON.parse(readFileSync(CATEGORIAS_FILE, 'utf8'))

const FILENAME_RE = /^(\d+)\s*-\s*(.+)\.txt$/
const DATA_LINE_RE = /^Data:\s*(\d{2})\/(\d{2})\/(\d{4})\s*\(([^)]*)\)\s*$/m

function stripBom(text) {
  return text.replace(/^﻿/, '')
}

function noteType(note) {
  const n = note.toLowerCase()
  if (n.includes('composição') && !n.includes('não registrada')) return 'composição'
  if (n.includes('recuperação')) return 'recuperação'
  if (n.includes('data do texto')) return 'data do texto'
  if (n.includes('publicação')) return 'publicação'
  return note
}

function buildExcerpt(body, maxLen = 150) {
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
  if (line.length <= maxLen) return line
  return `${line.slice(0, maxLen).trimEnd()}…`
}

const files = readdirSync(TEXTS_DIR).filter((f) => FILENAME_RE.test(f) && f !== '00 - INDICE.txt')

const entries = files.map((filename) => {
  const match = filename.match(FILENAME_RE)
  const id = Number(match[1])
  const raw = stripBom(readFileSync(join(TEXTS_DIR, filename), 'utf8'))

  const dataMatch = raw.match(DATA_LINE_RE)
  if (!dataMatch) {
    throw new Error(`Linha "Data:" não encontrada em ${filename}`)
  }
  const [, dd, mm, yyyy, note] = dataMatch
  const dateISO = `${yyyy}-${mm}-${dd}`

  const withoutDateLine = raw.slice(0, dataMatch.index).trimEnd()
  const lines = withoutDateLine.split('\n')
  const title = lines[0].trim()
  const body = lines.slice(1).join('\n').trim()

  const categoria = categorias[String(id)]
  if (!categoria) {
    throw new Error(`Sem categoria definida para o id ${id} em scripts/categorias.json`)
  }

  return {
    id,
    title,
    category: categoria,
    dateISO,
    dateLabel: new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${dateISO}T00:00:00`)),
    dateNote: noteType(note.trim()),
    body,
    excerpt: buildExcerpt(body),
    wordCount: body.split(/\s+/).filter(Boolean).length,
  }
})

entries.sort((a, b) => a.id - b.id)

writeFileSync(OUT_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
console.log(`Gerado ${OUT_FILE} com ${entries.length} textos.`)
