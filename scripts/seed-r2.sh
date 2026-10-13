#!/usr/bin/env bash
# Carrega (ou recarrega) todo o conteúdo de content/*.md no bucket R2 - uso:
#   bash scripts/seed-r2.sh [nome-do-bucket]
# Reaproveitável pra restaurar o bucket do zero a partir do backup versionado em content/.
set -euo pipefail

BUCKET="${1:-cartilhas-content}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content"

count=0
for file in "$CONTENT_DIR"/*.md; do
  name="$(basename "$file")"
  echo "enviando $name..."
  npx wrangler r2 object put "$BUCKET/$name" --file "$file" --remote --content-type "text/markdown; charset=utf-8"
  count=$((count + 1))
done

echo "ok: $count arquivos enviados pro bucket $BUCKET"
echo "lembrete: depois de popular os .md, rode o worker uma vez (ou chame /api/admin/reindex)"
echo "pra gerar o _index.json agregado que a API pública le."
