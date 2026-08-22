#!/usr/bin/env bash
# Checa PRs abertas contra um branch base: lista overlap de arquivos entre
# elas, testa (via `git merge-tree`) se a cadeia inteira, na ordem em que o
# `gh pr list` devolveu, funde sem conflito de texto — e reporta.
#
# Nao decide ordem sozinho pelo overlap: `git merge-tree` ja resolve merges
# de 3 vias sem conflito real na maioria dos casos (funcoes diferentes no
# mesmo arquivo, por exemplo) — overlap de ARQUIVO nao e overlap de LINHA.
# O valor real daqui e mecanico: achar a cadeia que realmente funde limpo
# antes de qualquer PR ser mergeada de verdade, e apontar onde nao funde.
#
# Uso:
#   scripts/checar-ordem-merge.sh [base]   # base default: dev
set -euo pipefail

BASE="${1:-dev}"

command -v gh >/dev/null 2>&1 || { echo "gh (GitHub CLI) nao encontrado no PATH." >&2; exit 1; }

echo "== PRs abertas com base=$BASE =="
PRS_JSON=$(gh pr list --base "$BASE" --state open --json number,title,headRefName,author,createdAt)
echo "$PRS_JSON" | node -e '
  const prs = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!prs.length) { console.log("(nenhuma PR aberta contra " + process.argv[1] + ")"); process.exit(0); }
  for (const pr of prs) {
    console.log(`#${pr.number}  ${pr.headRefName} -> ${process.argv[1]}  (${pr.author.login})  ${pr.title}`);
  }
' "$BASE"

COUNT=$(echo "$PRS_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).length)')
if [ "$COUNT" -eq 0 ]; then
  exit 0
fi

echo
echo "== Buscando branches =="
HEADS=$(echo "$PRS_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).map(p=>p.headRefName).join(" "))')
git fetch origin "$BASE" $HEADS 2>&1 | grep -v '^$' || true

echo
echo "== Overlap de arquivos entre PRs (par a par) =="
NUMBERS=$(echo "$PRS_JSON" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf8")).map(p=>p.number).join(" "))')
declare -A FILES_BY_NUM
for n in $NUMBERS; do
  head=$(echo "$PRS_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).find(p=>p.number===$n).headRefName)")
  FILES_BY_NUM[$n]=$(git diff --name-only "origin/$BASE" "origin/$head" 2>/dev/null || true)
done

ARR=($NUMBERS)
OVERLAP_FOUND=0
for ((i=0; i<${#ARR[@]}; i++)); do
  for ((j=i+1; j<${#ARR[@]}; j++)); do
    a=${ARR[$i]}; b=${ARR[$j]}
    common=$(comm -12 <(echo "${FILES_BY_NUM[$a]}" | sort) <(echo "${FILES_BY_NUM[$b]}" | sort))
    if [ -n "$common" ]; then
      OVERLAP_FOUND=1
      echo "#$a <-> #$b:"
      echo "$common" | sed 's/^/  /'
    fi
  done
done
[ "$OVERLAP_FOUND" -eq 0 ] && echo "(nenhum overlap de arquivo entre as PRs abertas)"

echo
echo "== Testando cadeia de merge (ordem do gh pr list, sem tocar nada real) =="
CURRENT="origin/$BASE"
for n in $NUMBERS; do
  head=$(echo "$PRS_JSON" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).find(p=>p.number===$n).headRefName)")
  TREE=$(git merge-tree --write-tree "$CURRENT" "origin/$head" 2>&1) || {
    echo "#$n ($head): FALHOU ao testar merge-tree — $TREE"
    continue
  }
  # merge-tree devolve mais de uma linha (com conflito, marcadores de secao)
  # quando ha conflito real de texto; uma linha so = tree limpa.
  LINES=$(echo "$TREE" | wc -l)
  if [ "$LINES" -gt 1 ]; then
    echo "#$n ($head): CONFLITO DE TEXTO real depois de ${CURRENT} — resolver manual antes de mergear nessa posicao"
    echo "$TREE" | sed 's/^/  /'
    continue
  fi
  MERGE_COMMIT=$(git commit-tree "$TREE" -p "$CURRENT" -p "origin/$head" -m "test-merge-#$n")
  echo "#$n ($head): limpo"
  CURRENT="$MERGE_COMMIT"
done

echo
echo "== Ordem sugerida (a testada acima, sem conflito) =="
i=1
for n in $NUMBERS; do
  echo "$i. #$n"
  i=$((i+1))
done
echo
echo "Nada foi alterado no repositorio real — so objetos de teste locais soltos (git gc limpa sozinho)."
