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
#
# CUSTO DE PROCESSO E DELIBERADO AQUI (PH-377)
# -----------------------------------------------------------------------------
# Este script roda uma vez por comando de CI, entao o tempo dele nao importa em
# producao — mas ele e o unico codigo shell do repo com teste, e o teste paga o
# custo TRES vezes por caso de retry. Cada processo externo (`cat`, `grep`,
# `seq`, `sleep`, `mktemp`) custa ~100ms no Git Bash do Windows, e nove deles por
# tentativa levavam o teste a 830ms por tentativa — 83% do teto de 5s so no caso
# de 3 tentativas, que estourava quando a suite roda em paralelo.
#
# Entao: onde o bash tem builtin equivalente, usar o builtin. `$(<arquivo)` em
# vez de `cat`, `[[ =~ ]]` em vez de `grep -qE`, aritmetica em vez de `seq`, e
# `sleep` so quando a espera nao e zero. O `mktemp` FICA — criacao segura de
# arquivo temporario nao se troca por caminho previsivel pra economizar 100ms —
# mas sai de dentro do laco, porque um arquivo reusado (truncado pelo proprio
# `2>`) resolve igual.
#
# O que NAO mudou: a ordem das operacoes, os codigos de saida, o criterio de
# retry e a captura de `$?` fora do `if`. Comportamento identico, menos fork.
set -uo pipefail

: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF obrigatorio}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN obrigatorio}"

TENTATIVAS="${SUPABASE_CLI_TENTATIVAS:-3}"
ESPERA="${SUPABASE_CLI_ESPERA:-10}"

# Assinatura da colisao de credencial. As tres formas ja vistas nos logs: o
# codigo do Postgres, a mensagem dele, e a do proprio CLI quando falha ainda no
# `link` ("failed to connect as temp role").
ASSINATURA='28P01|password authentication failed|failed to connect as temp role'

# `sleep 0` e um fork pra nao fazer nada. O CI usa 10s de verdade; o teste usa 0
# justamente pra nao esperar, e era o unico lugar onde este fork aparecia.
esperar() {
  if [ "$ESPERA" != 0 ]; then
    sleep "$ESPERA"
  fi
}

# `[[ =~ ]]` no lugar de `grep -qE`: mesma familia de expressao regular (ERE),
# sem fork, e sem depender de qual `grep` esta no PATH do runner. A direita do
# `=~` fica SEM QUOTES de proposito — entre aspas ela viraria texto literal e a
# alternacao pararia de valer, o que faria o script nunca repetir.
erro_de_credencial() {
  local conteudo
  conteudo="$(<"$1")"
  [[ $conteudo =~ $ASSINATURA ]]
}

# Repassa o stderr do CLI sem forkar um `cat`. `$(<arquivo)` come as quebras de
# linha do fim, entao o `printf` devolve exatamente uma — diferenca cosmetica no
# log do CI, e o unico efeito visivel desta troca.
repassar() {
  local conteudo
  conteudo="$(<"$1")"
  [ -n "$conteudo" ] && printf '%s\n' "$conteudo" >&2
  return 0
}

# UM arquivo pra todas as tentativas: cada `2>"$ERRO"` trunca. Antes era um
# `mktemp` + um `rm` por tentativa, seis forks no caso de 3 tentativas.
ERRO="$(mktemp)"
trap 'rm -f "$ERRO"' EXIT

for ((tentativa = 1; tentativa <= TENTATIVAS; tentativa++)); do

  # `$?` e capturado NA LINHA seguinte ao comando, e nao dentro de um `if`: um
  # `if cmd; then ...; fi` sem `else` devolve 0 quando a condicao FALHA, entao
  # ler `$?` depois do `fi` daria sempre sucesso e este script engoliria todo
  # erro real do CLI.
  supabase link --project-ref "$SUPABASE_PROJECT_REF" >&2 2>"$ERRO"
  CODIGO=$?
  repassar "$ERRO"
  if [ "$CODIGO" -ne 0 ]; then
    if [ "$tentativa" -lt "$TENTATIVAS" ] && erro_de_credencial "$ERRO"; then
      echo "::warning::link falhou por credencial (tentativa ${tentativa}/${TENTATIVAS}) — outra invocacao do CLI rotacionou a senha. Repetindo em ${ESPERA}s..." >&2
      esperar
      continue
    fi
    echo "::error::supabase link falhou (codigo ${CODIGO}) e nao e colisao de credencial recuperavel." >&2
    exit "$CODIGO"
  fi

  "$@" 2>"$ERRO"
  CODIGO=$?
  repassar "$ERRO"
  if [ "$CODIGO" -eq 0 ]; then
    exit 0
  fi

  if [ "$tentativa" -ge "$TENTATIVAS" ] || ! erro_de_credencial "$ERRO"; then
    exit "$CODIGO"
  fi

  echo "::warning::'$*' falhou por credencial rotacionada (tentativa ${tentativa}/${TENTATIVAS}). Re-linkando e repetindo em ${ESPERA}s..." >&2
  esperar
done

echo "::error::'$*' falhou ${TENTATIVAS}x por colisao de credencial do CLI. Ha outra invocacao do CLI (outro workflow, ou 'db:types'/'db push' numa maquina) rodando ao mesmo tempo com o mesmo token — ver docs/11-operacao.md." >&2
exit 1
