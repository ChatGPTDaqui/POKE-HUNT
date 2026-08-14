// Gera um SQL unico que recria toda a estrutura de `public` dentro do schema `dev`,
// lendo as mesmas migrations e trocando qualificacao `public.` -> `dev.`.
// Nao duplica o trigger em auth.users (auth e compartilhado, nao clonavel por schema) --
// ver initial_schema.sql "on_auth_user_created": removido do output pra dev nao herdar
// escrita automatica em dev.players a cada signup real.
const fs = require("fs");
const path = require("path");

const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
const outFile = path.join(__dirname, "..", "supabase", "dev-schema-clone.sql");

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const TRIGGER_BLOCK_RE =
  /create trigger on_auth_user_created[\s\S]*?execute function public\.handle_new_user\(\);/;

let combined = `-- GERADO por scripts/clone-schema-to-dev.js -- nao editar a mao\nbegin;\ncreate schema if not exists dev;\nset local search_path to dev, extensions, public;\n\n`;

for (const file of files) {
  let sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

  if (TRIGGER_BLOCK_RE.test(sql)) {
    sql = sql.replace(TRIGGER_BLOCK_RE, "-- [clone-schema-to-dev] trigger on_auth_user_created omitido (auth.users e compartilhado)\n");
  }

  sql = sql.split("public.").join("dev.");

  combined += `-- ==== ${file} ====\n${sql}\n\n`;
}

combined += "commit;\n";

fs.writeFileSync(outFile, combined, "utf8");
console.log(`Gerado: ${outFile} (${files.length} migrations)`);
