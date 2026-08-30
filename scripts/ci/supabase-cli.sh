#!/usr/bin/env bash
# Roda um comando do CLI do Supabase que precisa de `--linked`, re-linkando e
# repetindo quando a senha do role temporario foi rotacionada por OUTRA
# invocacao concorrente (PH-106).
#
# O QUE ACONTECE SEM ISTO
# -----------------------------------------------------------------------------
# `supabase link` sem senha de banco provisiona o role `cli_login_postgres` pela
# Management API e ROTACIONA a senha dele a cada login. Duas invocacoes do CLI
# no mesmo projeto — dois workflows, ou o CI e um `npm run db:types` na maquina,
# que usam o MESMO token — invalidam uma a outra: quem linkou primeiro leva
#
#   FATAL: password authentication failed for user "cli_login_postgres" (SQLSTATE 28P01)
#
# no comando seguinte. Quem morre e sorteio. Medido nas 20 execucoes de
# `supabase-deploy-dev` anteriores a 30/08: 3 falhas, TODAS 28P01 — 15%. Deploy
# morto significa migration nao aplicada e Edge nao republicada, com a PR ja
# verde e mesclada; foi assim que o PH-92 ficou em producao com o codigo velho.
#
# POR QUE RETRY, E NAO `concurrency.group` COMPARTILHADO
# -----------------------------------------------------------------------------
# Grupo unico entre os 3 workflows era a correcao obvia da issue, e tem um efeito
# colateral pior que o bug: o GitHub mantem UM run pendente por grupo e CANCELA o
# pendente anterior quando outro entra na fila. Com `supabase-check` e os dois
# deploys no mesmo grupo, um push em `dev` durante um deploy de `main` cancelaria
# o deploy de `main` que estava na fila — migration de PRODUCAO silenciosamente
# nao aplicada. Trocar "morre por sorteio" por "morre por fila" nao e conserto.
#
# O retry ataca a causa real: a credencial ficou velha, e re-linkar a renova. So
# repete quando a falha TEM a assinatura de autenticacao — erro de SQL de verdade
# (constraint, tipo, migration fora de ordem) reprova na primeira tentativa, sem
# gastar 3 rodadas escondendo o log util no meio.
#
# USO
#   scripts/ci/supabase-cli.sh supabase migration list --linked --output-format json
#
# O `stdout` do comando passa direto (da pra capturar em variavel ou redirecionar
# pra arquivo); o `link` e o diagnostico do retry vao pro `stderr`.
set -uo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF obrigatorio}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN obrigatorio}"

TENTATIVAS="${SUPABASE_CLI_TENTATIVAS:-3}"
ESPERA="${SUPABASE_CLI_ESPERA:-10}"

# Assinatura da colisao de credencial. As tres formas ja vistas nos logs: o
# codigo do Postgres, a mensagem dele, e a do proprio CLI quando falha ainda no
# `link` ("failed to connect as temp role").
ASSINATURA='28P01|password authentication failed|failed to connect as temp role'

erro_de_credencial() {
  grep -qE "$ASSINATURA" "$1"
}

for tentativa in $(seq 1 "$TENTATIVAS"); do
  ERRO="$(mktemp)"

  # `$?` e capturado NA LINHA seguinte ao comando, e nao dentro de um `if`: um
  # `if cmd; then ...; fi` sem `else` devolve 0 quando a condicao FALHA, entao
  # ler `$?` depois do `fi` daria sempre sucesso e este script engoliria todo
  # erro real do CLI.
  supabase link --project-ref "$SUPABASE_PROJECT_REF" >&2 2>"$ERRO"
  CODIGO=$?
  cat "$ERRO" >&2
  if [ "$CODIGO" -ne 0 ]; then
    if [ "$tentativa" -lt "$TENTATIVAS" ] && erro_de_credencial "$ERRO"; then
      echo "::warning::link falhou por credencial (tentativa ${tentativa}/${TENTATIVAS}) — outra invocacao do CLI rotacionou a senha. Repetindo em ${ESPERA}s..." >&2
      rm -f "$ERRO"
      sleep "$ESPERA"
      continue
    fi
    rm -f "$ERRO"
    echo "::error::supabase link falhou (codigo ${CODIGO}) e nao e colisao de credencial recuperavel." >&2
    exit "$CODIGO"
  fi

  "$@" 2>"$ERRO"
  CODIGO=$?
  cat "$ERRO" >&2
  if [ "$CODIGO" -eq 0 ]; then
    rm -f "$ERRO"
    exit 0
  fi

  if [ "$tentativa" -ge "$TENTATIVAS" ] || ! erro_de_credencial "$ERRO"; then
    rm -f "$ERRO"
    exit "$CODIGO"
  fi

  echo "::warning::'$*' falhou por credencial rotacionada (tentativa ${tentativa}/${TENTATIVAS}). Re-linkando e repetindo em ${ESPERA}s..." >&2
  rm -f "$ERRO"
  sleep "$ESPERA"
done

echo "::error::'$*' falhou ${TENTATIVAS}x por colisao de credencial do CLI. Ha outra invocacao do CLI (outro workflow, ou 'db:types'/'db push' numa maquina) rodando ao mesmo tempo com o mesmo token — ver docs/11-operacao.md." >&2
exit 1
