// Emite o PAR de migrations que leva ESPECIES NOVAS do catalogo pro banco:
// `<carimbo>_especies_novas_public.sql` e `..._dev.sql`.
//
//   node scripts/gerar-migration-especies.mjs --carimbo=20260831120000 --acima-de-dex=251
//
// ---------------------------------------------------------------------------
// POR QUE ESTE SCRIPT EXISTE, se ja ha `npm run catalog:migrar`
// ---------------------------------------------------------------------------
// `catalog:migrar` (scripts/migrate-catalog-to-postgres.js) e o caminho normal
// pra popular o catalogo, e e uma das duas excecoes nomeadas a regra "banco so
// muda por migration" (CLAUDE.local.md). Ele esta BLOQUEADO por
// `scripts/lib/guarda-catalogo-gen2.js`, e o bloqueio esta certo: aquele script
// le a PLANILHA, que e dado de Gen2, e rodar hoje escreveria o catalogo antigo
// por cima do de Ultra Sun.
//
// `docs/17-geracao-iii-preparada.md`, passo 9, nomeia as duas saidas: destravar
// aquele caminho com a fonte certa, ou gerar a migration "como
// `gerar-migration-evolucoes.mjs` faz". Esta e a segunda. Ela e a menos
// invasiva das duas — nao mexe no caminho que popula as 8 tabelas de catalogo
// hoje — e produz um arquivo que passa por code review, que e o que a regra do
// projeto quer.
//
// ---------------------------------------------------------------------------
// O QUE ELA GRAVA, E O QUE ELA NAO GRAVA
// ---------------------------------------------------------------------------
// GRAVA, nesta ordem (e a ordem e por FK):
//
//   1. `moves`   — os golpes que as especies novas aprendem e que o banco ainda
//                  nao tem. `species_moves.move_id` referencia esta tabela;
//                  sem isso o insert de learnset estoura com 23503.
//   2. `species` — as especies novas, com `evolves_to` NULO.
//   3. `species_moves` — o learnset de cada uma.
//
// NAO GRAVA:
//
//   - `evolves_to` / `evolves_at_level` / `is_special_evolution`. Elas saem do
//     par de `gerar-migration-evolucoes.mjs`, que tem que rodar DEPOIS desta
//     (carimbo maior) e ja sabe tratar ramo, gate de pedra e `stone_type`.
//     Duplicar a logica de evolucao aqui seria a segunda receita do projeto pra
//     a mesma coisa — o defeito que a PH-245 pagou em producao.
//   - `height_m`. O catalogo de Ultra Sun traz PESO (`pesoHg`), nao altura, e a
//     tabela de altura do projeto (`src/data/pokeHeights.ts`) e escrita a mao e
//     nao cobre as especies novas. Fica NULL, que a coluna aceita, e nada no
//     jogo depende dela hoje (`scaleForSpecies` devolve 1 desde que a escala por
//     tamanho saiu). Registrado como buraco conhecido, nao como esquecimento.
//   - Nada em `species` que JA exista. O `on conflict do nothing` e deliberado:
//     esta migration ACRESCENTA elenco, e nunca corrige linha existente. Corrigir
//     catalogo e trabalho de `catalog:migrar`, com a fonte certa.
//
// ---------------------------------------------------------------------------
// IDEMPOTENTE, e por que isso importa aqui em particular
// ---------------------------------------------------------------------------
// Migration de dado que roda duas vezes e duplica linha e bug, nao migration
// (CLAUDE.local.md). Os tres inserts usam `on conflict do nothing`, e o filtro
// de `species_moves` exige que a especie exista — schema `dev` recem-clonado
// pode nao ter tudo, e a migration nao pode estourar por isso.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const { lerSpawnTiers } = require('./lib/spawn-tiers.js')

function argumento(nome, obrigatorio = true) {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  if (!a) {
    if (obrigatorio) throw new Error(`passe --${nome}=<valor>`)
    return null
  }
  return a.slice(nome.length + 3)
}

const CARIMBO = (() => {
  const v = argumento('carimbo')
  if (!/^\d{14}$/.test(v)) throw new Error(`carimbo invalido: ${v}`)
  return v
})()

// A FRONTEIRA do que e "novo". Explicita, e nao inferida do banco: o gerador
// roda offline e nao pode depender de credencial nem do estado remoto — dois
// desenvolvedores rodando contra bancos em pontos diferentes produziriam
// migrations diferentes do mesmo commit.
const ACIMA_DE_DEX = Number(argumento('acima-de-dex'))
if (!Number.isInteger(ACIMA_DE_DEX)) throw new Error('--acima-de-dex precisa ser inteiro')

const catalogo = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'usum', 'catalog.json'), 'utf8'))

// So o que esta no ELENCO do cliente. O catalogo baixado pode ter especie que o
// gerador nao emitiu (sem arte, por exemplo), e cadastrar no banco especie que o
// jogo nao desenha produz um POKE que a tela nao sabe mostrar.
const elenco = new Set(
  [...readFileSync(join(RAIZ, 'src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
    .matchAll(/"id": "([a-z0-9_]+)"/g)].map((m) => m[1]),
)

// Lendarios: a MESMA lista do cliente, lida do fonte. Importar o modulo
// TypeScript exigiria um passo de build no meio do pipeline de dados; ler a
// lista e comparar e o que `lendariosEmDuasListas.test.ts` ja faz.
const lendarios = new Set(
  [...readFileSync(join(RAIZ, 'src', 'data', 'legendaries.ts'), 'utf8')
    .matchAll(/'([a-z0-9_]+)',/g)].map((m) => m[1]),
)

const { especies: tierPorEspecie } = lerSpawnTiers()

const novas = catalogo.especies
  .filter((e) => e.dex > ACIMA_DE_DEX && elenco.has(e.chave))
  .sort((a, b) => a.dex - b.dex)

if (!novas.length) throw new Error(`nenhuma especie acima do dex ${ACIMA_DE_DEX} esta no elenco do cliente`)

// Golpes que as novas aprendem. Todos, e nao so os que faltam no banco: o
// gerador nao consulta o banco (ver a nota do `--acima-de-dex`), e
// `on conflict do nothing` faz o resto virar no-op.
const golpesUsados = new Set()
for (const e of novas) for (const g of e.golpes) golpesUsados.add(g.chave)
const golpes = catalogo.golpes.filter((g) => golpesUsados.has(g.chave)).sort((a, b) => a.chave.localeCompare(b.chave))

const AOE_RADIUS = 240

const lit = (v) => (v === null || v === undefined
  ? 'null'
  : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'`
    : typeof v === 'boolean' ? String(v)
      : String(v))

function linhasDeGolpe(schema) {
  return golpes.map((g) => {
    const aoe = g.alvo === 'aoe'
    return '  (' + [
      lit(g.chave), lit(g.nome),
      `${lit(g.tipo)}::${schema === 'public' ? 'public' : 'public'}.element_type`,
      `${lit(g.categoria)}::public.move_category`,
      g.poder, g.precisao, g.pp,
      `${lit(g.alvo)}::public.move_target`,
      aoe ? AOE_RADIUS : 'null',
    ].join(', ') + ')'
  }).join(',\n')
}

function linhasDeEspecie() {
  return novas.map((e) => {
    const tier = tierPorEspecie[e.chave]
    if (!tier) throw new Error(`especie sem spawn tier: ${e.chave}`)
    return '  (' + [
      lit(e.chave), e.dex, lit(e.nome),
      `${lit(e.tipo1)}::public.element_type`,
      e.tipo2 ? `${lit(e.tipo2)}::public.element_type` : 'null::public.element_type',
      e.base.hp, e.base.atkFis, e.base.atkEsp, e.base.def, e.base.defEsp, e.base.speed,
      e.catchRate, e.baseExp, lit(e.curva), lit(tier.tier),
      lit(lendarios.has(e.chave)),
    ].join(', ') + ')'
  }).join(',\n')
}

function linhasDeLearnset() {
  const linhas = []
  for (const e of novas) {
    // `sort_order` e a ordem das linhas na origem, e ela e dado real: os
    // `*.generated.ts` emitem os golpes nessa ordem e nenhum criterio derivavel
    // a reproduz (ver a migration `ordem_de_origem_do_catalogo`). Por especie,
    // pra o par (species_id, sort_order) — que e a chave primaria — nao colidir
    // entre especies.
    e.golpes.forEach((g, i) => {
      linhas.push(`  (${lit(e.chave)}, ${lit(g.chave)}, ${g.nivel}, ${i})`)
    })
  }
  return linhas.join(',\n')
}

function corpo(schema) {
  const cabecalho = schema === 'dev'
    ? [
      `-- PH-332 — espelho de ${CARIMBO}_especies_novas_public.sql no schema dev.`,
      '-- O raciocinio completo esta na migration irma em public.',
    ].join('\n')
    : [
      '-- PH-332 — as 135 especies de Hoenn (dex 252-386) entram no catalogo do banco.',
      '--',
      '-- GERADO por `node scripts/gerar-migration-especies.mjs` a partir de',
      '-- scripts/usum/catalog.json, recortado pelo elenco de pokes.generated.ts.',
      '-- Editar a mao faz o arquivo divergir da fonte sem nada reprovar — o gerador',
      '-- e barato, rode ele de novo.',
      '--',
      '-- POR QUE MIGRATION E NAO `catalog:migrar`: aquele script le a PLANILHA (dado',
      '-- de Gen2) e esta bloqueado de proposito por `lib/guarda-catalogo-gen2.js`.',
      '-- Ver docs/17-geracao-iii-preparada.md, passo 9, que nomeia as duas saidas.',
      '--',
      '-- O QUE NAO ESTA AQUI:',
      '--   * `evolves_to` e companhia — saem do par de `gerar-migration-evolucoes.mjs`,',
      '--     que roda DEPOIS desta (carimbo maior) e ja trata ramo e gate de pedra.',
      '--     Duas receitas pra evolucao foi o que a PH-245 pagou em producao.',
      '--   * `height_m` — o catalogo de Ultra Sun traz peso, nao altura. Fica NULL',
      '--     (a coluna aceita) e nada no jogo le altura hoje. Buraco conhecido.',
      '--',
      '-- IDEMPOTENTE: os tres inserts sao `on conflict do nothing`. Esta migration',
      '-- ACRESCENTA elenco e nunca corrige linha existente — corrigir catalogo e',
      '-- trabalho de `catalog:migrar`, com a fonte certa.',
    ].join('\n')

  return `${cabecalho}

begin;

-- ---------------------------------------------------------------------------
-- 1. Golpes (${golpes.length}) — ANTES das especies, por FK de species_moves
-- ---------------------------------------------------------------------------
-- A lista traz TODOS os golpes que as especies novas aprendem, e nao so os que
-- faltam: o gerador roda offline e nao consulta o banco (ver a nota de
-- \`--acima-de-dex\` no script). O \`do nothing\` faz o resto virar no-op.
--
-- As colunas de efeito (status, mudanca de stat, dreno, cura) NAO entram: a
-- tabela \`moves\` do banco e a forma reduzida que a validacao do servidor usa;
-- o efeito de verdade vive em \`src/data/generated/abilities.generated.ts\`, que
-- e o que o motor le.
insert into ${schema}.moves (id, name, type, category, power, accuracy, pp, target, aoe_radius)
values
${linhasDeGolpe(schema)}
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Especies (${novas.length})
-- ---------------------------------------------------------------------------
insert into ${schema}.species (
  id, dex_number, name, type1, type2,
  base_hp, base_atk_fis, base_atk_esp, base_def, base_def_esp, base_speed,
  catch_rate, base_exp, growth_curve, spawn_tier, is_legendary
)
values
${linhasDeEspecie()}
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Learnsets
-- ---------------------------------------------------------------------------
-- \`where exists\` na especie E no golpe: schema \`dev\` recem-clonado pode nao ter
-- tudo, e a migration nao pode estourar por isso — ela e o par de uma que roda
-- em producao.
insert into ${schema}.species_moves (species_id, move_id, level_req, sort_order)
select v.species_id, v.move_id, v.level_req, v.sort_order
from (values
${linhasDeLearnset()}
) as v(species_id, move_id, level_req, sort_order)
where exists (select 1 from ${schema}.species s where s.id = v.species_id)
  and exists (select 1 from ${schema}.moves m where m.id = v.move_id)
on conflict (species_id, sort_order) do nothing;

commit;
`
}

for (const schema of ['public', 'dev']) {
  const sufixo = schema === 'public' ? '000' : '001'
  const nome = `${CARIMBO.slice(0, -3)}${sufixo}_especies_novas_${schema}.sql`
  const caminho = join(RAIZ, 'supabase', 'migrations', nome)
  writeFileSync(caminho, corpo(schema))
  console.log(`-> supabase/migrations/${nome}`)
}

console.log(
  `\n${novas.length} especie(s), ${golpes.length} golpe(s), `
  + `${novas.reduce((s, e) => s + e.golpes.length, 0)} linha(s) de learnset.`,
)
console.log(`lendarias entre elas: ${novas.filter((e) => lendarios.has(e.chave)).map((e) => e.chave).join(', ') || '(nenhuma)'}`)
