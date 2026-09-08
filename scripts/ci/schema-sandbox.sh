#!/usr/bin/env bash
set -euo pipefail
# Nunca escreve no remoto. O dump contém apenas estrutura; não é enviado como artefato.
# O histórico antigo não é reexecutado: uma baseline validada precede apenas as migrations novas.
ROOT="$PWD"
SANDBOX=$(mktemp -d)
PROJECT="ph-schema-${GITHUB_RUN_ID:-local}"
mkdir -p "$SANDBOX/supabase/migrations"
cat > "$SANDBOX/supabase/config.toml" <<EOF
project_id = "$PROJECT"
[db]
major_version = 17
port = 54322
[api]
schemas = ["public", "graphql_public", "dev"]
[db.seed]
enabled = false
EOF
trap 'supabase stop --workdir "$SANDBOX" --no-backup >/dev/null 2>&1 || true' EXIT

scripts/ci/supabase-cli.sh supabase db dump --linked --schema public,dev --file "$SANDBOX/baseline.sql"
# Detecta corrida com outro deploy durante a captura, sem aceitar baseline híbrida.
scripts/ci/supabase-cli.sh supabase migration list --linked --output-format json > schema-remote-after.json
diff <(jq -S '[.migrations[].remote | select(. != "")] | sort' schema-remote.json) \
     <(jq -S '[.migrations[].remote | select(. != "")] | sort' schema-remote-after.json)
supabase db start --workdir "$SANDBOX"
sql() { docker exec -i "supabase_db_$PROJECT" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
sql < "$SANDBOX/baseline.sql" > "$SANDBOX/restore.log"
supabase gen types typescript --local --workdir "$SANDBOX" > schema-baseline.types.ts

# Compara a baseline ao contrato da base; divergência nunca é transformada em sucesso.
git show "${SCHEMA_BASE:-origin/dev}:src/lib/database.types.ts" > schema-base.types.ts
normalizar() { sed -E 's/PostgrestVersion: "[^"]*"/PostgrestVersion: "NORMALIZADO"/' "$1"; }
if ! diff -u <(normalizar schema-base.types.ts) <(normalizar schema-baseline.types.ts); then
  echo '::error::Baseline local diverge dos tipos da base. Reconciliar schema/codegen; não aplicar a feature no remoto.'
  exit 1
fi

while IFS= read -r migration; do
  [ -z "$migration" ] || sql < "$ROOT/$migration"
done < schema-new.txt
supabase gen types typescript --local --workdir "$SANDBOX" > database.types.regenerado.ts

# Exercita SQL real que deve falhar; um comando inválido aceito reprova o próprio harness.
if sql -c 'ALTER TABLE public.__ph_tabela_que_nao_existe ADD COLUMN erro integer;' > "$SANDBOX/invalid.log" 2>&1; then
  echo '::error::Sandbox aceitou SQL inválido'; exit 1
fi
sql -c 'BEGIN; CREATE TABLE public.__ph_probe (id integer); CREATE TABLE dev.__ph_probe (id integer); ALTER TABLE public.__ph_probe ADD COLUMN valor text; ALTER TABLE dev.__ph_probe ADD COLUMN valor text; ROLLBACK;'

if ! diff -u <(normalizar src/lib/database.types.ts) <(normalizar database.types.regenerado.ts); then
  echo '::error::Tipos da PR não correspondem ao resultado das migrations. Baixe o artefato database.types.ts, revise e commite na mesma PR.'
  exit 1
fi
echo 'Schema e tipos da PR verificados no banco descartável; remoto permaneceu intacto.'
