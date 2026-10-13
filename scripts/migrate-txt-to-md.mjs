// Migração de uso único: lê os .txt reconciliados (fonte passada via argv[2]) e escreve
// content/*.md com frontmatter YAML. Substitui o antigo generate-cartilhas.mjs (que gerava
// src/data/cartilhas.json em build-time) - agora o dado vira seed pro R2, não mais bundle.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = process.argv[2]
if (!SOURCE_DIR) {
  console.error('Uso: node migrate-txt-to-md.mjs <pasta-com-os-txt>')
  process.exit(1)
}
const OUT_DIR = resolve(__dirname, '..', 'content')
const CATEGORIAS_FILE = resolve(__dirname, 'categorias.json')

mkdirSync(OUT_DIR, { recursive: true })

const { _comentario, ...categorias } = JSON.parse(readFileSync(CATEGORIAS_FILE, 'utf8'))

const FILENAME_RE = /^(\d+)\s*-\s*(.+)\.txt$/
const DATA_LINE_RE = /^Data:\s*(\d{2})\/(\d{2})\/(\d{4})\s*\(([^)]*)\)\s*$/m

function stripBom(text) {
  return text.replace(/^﻿/, '')
}

function noteType(note) {
  const n = note.toLowerCase()
  if (n.includes('composição') && !n.includes('não registrada')) return note.trim()
  if (n.includes('recuperação')) return note.trim()
  if (n.includes('data do texto')) return note.trim()
  if (n.includes('publicação')) return note.trim()
  return note.trim()
}

// YAML simples: só precisa escapar aspas duplas dentro de strings - sem libs externas.
function yamlString(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

const files = readdirSync(SOURCE_DIR).filter((f) => FILENAME_RE.test(f) && f !== '00 - INDICE.txt')

let count = 0
for (const filename of files) {
  const match = filename.match(FILENAME_RE)
  const id = Number(match[1])
  const raw = stripBom(readFileSync(join(SOURCE_DIR, filename), 'utf8'))

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

  const frontmatter = [
    '---',
    `id: ${id}`,
    `title: ${yamlString(title)}`,
    `category: ${categoria}`,
    `dateISO: ${yamlString(dateISO)}`,
    `dateNote: ${yamlString(noteType(note))}`,
    '---',
    '',
  ].join('\n')

  writeFileSync(join(OUT_DIR, `${id}.md`), frontmatter + body + '\n', 'utf8')
  count++
}

console.log(`Gerados ${count} arquivos .md em ${OUT_DIR}`)
