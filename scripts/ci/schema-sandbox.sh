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
git show "${SCHEMA_BASE:-origin/dev}:src/lib/database.types.ts" > schema-base.types.ts
# O CLI 2.116 carrega pg-meta 0.98, que erra enums entre schemas (PH-417).
# Usa gerador 0.99 fixado, sem normalizar referências de enum ou outros tipos.
POSTGREST=$(node -e 'const s=require("fs").readFileSync("schema-base.types.ts","utf8"); const v=s.match(/PostgrestVersion: "([0-9.]+)"/); if(!v)process.exit(1); process.stdout.write(v[1])')
gerar() {
  docker run --rm --network "container:supabase_db_$PROJECT" \
    -e PG_META_DB_HOST=127.0.0.1 -e PG_META_DB_PASSWORD=postgres \
    -e PG_META_GENERATE_TYPES=typescript \
    -e PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public,graphql_public,dev \
    -e PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true \
    -e "PG_META_POSTGREST_VERSION=$POSTGREST" ghcr.io/supabase/postgres-meta:v0.99.0 \
    | node -e 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(s.trimEnd()+"\n"))'
}
gerar > schema-baseline.types.ts

# Compara a baseline ao contrato da base; divergência nunca é transformada em sucesso.
normalizar() { node scripts/ci/schema-normalizar.mjs "$1"; }
if ! diff -u <(normalizar schema-base.types.ts) <(normalizar schema-baseline.types.ts); then
  echo '::error::Baseline local diverge dos tipos da base. Reconciliar schema/codegen; não aplicar a feature no remoto.'
  exit 1
fi

while IFS= read -r migration; do
  [ -z "$migration" ] || sql < "$ROOT/$migration"
done < schema-new.txt
gerar > database.types.regenerado.ts

# Fixtures de RPC executam somente na cópia descartável, com rollback integral.
if grep -q 'catalogo_e_ensino_tm' schema-new.txt; then
  sql < "$ROOT/supabase/testes/tms.sql"
fi

# Exercita SQL real que deve falhar; um comando inválido aceito reprova o próprio harness.
if sql -c 'ALTER TABLE public.__ph_tabela_que_nao_existe ADD COLUMN erro integer;' > "$SANDBOX/invalid.log" 2>&1; then
  echo '::error::Sandbox aceitou SQL inválido'; exit 1
fi
sql -c 'CREATE TABLE public.__ph_probe (id integer); CREATE TABLE dev.__ph_probe (id integer); ALTER TABLE public.__ph_probe ADD COLUMN valor text; ALTER TABLE dev.__ph_probe ADD COLUMN valor text;'
gerar > "$SANDBOX/probe.types.ts"
grep -q '__ph_probe' "$SANDBOX/probe.types.ts"
grep -q 'valor: string | null' "$SANDBOX/probe.types.ts"
if diff -q <(normalizar database.types.regenerado.ts) <(normalizar "$SANDBOX/probe.types.ts") >/dev/null; then
  echo '::error::Gerador nao detectou coluna nova'; exit 1
fi
sql -c 'DROP TABLE public.__ph_probe; DROP TABLE dev.__ph_probe;'

if ! diff -u <(normalizar src/lib/database.types.ts) <(normalizar database.types.regenerado.ts); then
  echo '::error::Tipos da PR não correspondem ao resultado das migrations. Baixe o artefato database.types.ts, revise e commite na mesma PR.'
  exit 1
fi
echo 'Schema e tipos da PR verificados no banco descartável; remoto permaneceu intacto.'
