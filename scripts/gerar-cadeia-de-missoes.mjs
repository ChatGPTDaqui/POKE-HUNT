// PH-245 — emite a CADEIA CANONICA de "Tasks & Missoes" nos dois lados de uma
// vez: o modulo que o cliente le e o par de migrations que popula a tabela que
// a RPC le.
//
//   node scripts/gerar-cadeia-de-missoes.mjs --carimbo=20260828140000
//   node scripts/gerar-cadeia-de-missoes.mjs --relatorio   (so imprime, nao escreve)
//
// POR QUE UM GERADOR, E NAO DUAS DERIVACOES
//
// A primeira versao (PH-199) derivava a cadeia em DOIS lugares: `cadeiaDoTipo`
// no cliente, a partir de `SPECIES`, e um `row_number() over (order by
// dex_number)` dentro da propria RPC, a partir de `public.species`. O
// comentario de la dizia que os dois lados "so precisam concordar numa FORMULA
// pequena, nao numa lista" — mas eles tambem precisam concordar no CONJUNTO DE
// ENTRADA, e nao concordavam: o banco tem 251 especies, o catalogo do cliente
// tem 245, e 4 especies estao com tipo diferente nos dois (o retype de Fairy
// entrou so no cliente). Resultado medido: as cadeias divergiam em 6 dos 18
// tipos, FAIRY ja na posicao 1 (a tela oferecia `clefairy`, e a RPC respondia
// "essa especie nao pertence a cadeia desse tipo").
//
// Aqui existe UMA derivacao. O TS e o SQL saem do mesmo laco, na mesma ordem,
// e `cadeiaDeMissoes.test.ts` reprova se os dois arquivos sairem de sincronia.
//
// DE ONDE VEM CADA COISA — tudo de arquivo ja gerado, nada reimplementado:
//
//   dex / tipo1 / tipo2 / evolucoes  scripts/usum/catalog.json
//   elenco do cliente (245)          src/data/generated/pokes.generated.ts
//   quem realmente aparece em hunt   src/data/generated/subBiomas.generated.ts
//   peso de spawn (dificuldade)      src/data/generated/spawnTiers.generated.ts
//   lendarias                        src/data/legendaries.ts
//
// `SUB_BIOMA_ESPECIES` e a fonte de "spawna de verdade", e nao uma lista nova:
// medido em 28/08, o conjunto de especies alcancavel pelos `enemyPool` em
// runtime e exatamente essas 228 mais as 11 lendarias. Como lendaria nao entra
// em cadeia (ver ELEGIVEL abaixo), as duas definicoes coincidem — e
// `cadeiaDeMissoes.test.ts` confere isso contra os pools DE VERDADE, entao um
// sub-bioma novo que nao chegue a nenhuma hunt e reprovado aqui, nao descoberto
// em producao.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const p = (...t) => join(RAIZ, ...t)

const SO_RELATORIO = process.argv.includes('--relatorio')
// O carimbo PEDIDO. Os arquivos nao usam ele cru — ver `nomeDaMigration`.
const CARIMBO = (() => {
  if (SO_RELATORIO) return null
  const a = process.argv.find((x) => x.startsWith('--carimbo='))
  if (!a) throw new Error('passe --carimbo=YYYYMMDDHHMMSS (ou --relatorio)')
  const v = a.slice('--carimbo='.length)
  if (!/^\d{14}$/.test(v)) throw new Error(`carimbo invalido: ${v}`)
  if (!v.endsWith('0')) throw new Error(`carimbo tem que terminar em 0 (o ultimo digito separa o par): ${v}`)
  return v
})()

/**
 * `_public` fica com o carimbo terminando em 0 e `_dev` em 1 — o ULTIMO digito
 * separa o par, mesma forma de `gerar-migration-evolucoes.mjs`.
 *
 * PH-249: a primeira versao deste gerador escrevia os dois arquivos com o
 * MESMO carimbo. O CLI do Supabase usa o prefixo numerico como chave primaria
 * de `supabase_migrations.schema_migrations`, entao o `db push` aplicou o SQL
 * dos dois, registrou a versao uma vez e estourou `duplicate key value
 * violates unique constraint "schema_migrations_pkey"` na segunda — travando
 * TODO deploy seguinte, de dev e de main, incluindo a PR de promocao. O par ja
 * emitido nao pode ser renomeado de volta (a versao 20260828140000 esta
 * registrada com o nome do `_dev`), e por isso aquele par ficou com a ordem
 * invertida; ver o cabecalho de `20260828140001_missao_cadeia_public.sql`.
 */
function nomeDaMigration(schema) {
  const sufixo = schema === 'public' ? '0' : '1'
  return `${CARIMBO.slice(0, 13)}${sufixo}_missao_cadeia_${schema}.sql`
}

// ---------------------------------------------------------------- numeros
//
// A REGUA, e o motivo de cada numero:
//
// `alvo` cresce com a posicao pra cadeia ter progressao, mas com TETO: sem ele
// a cadeia de WATER (46 missoes) pedia 1.275 abates da ULTIMA especie sozinha.
//
// `recompensa` e alvo * OURO_POR_ABATE, e nao uma segunda progressao paralela.
// E isso que faz o ouro por abate ser IGUAL nos 18 tipos por construcao — na
// versao anterior GHOST pagava 16,3 de ouro por abate e WATER 2,15, uma
// diferenca de 7,6x decidida por nada alem de quantas especies o tipo tem.
//
// `bonus de conclusao` escala com o tamanho da cadeia pelo mesmo motivo: um
// lump-sum fixo de 5.000 pagava igual por fechar as 4 missoes de GHOST e as 46
// de WATER.
//
// A MAGNITUDE de OURO_POR_ABATE foi medida, nao chutada. Ouro medio por abate
// que o LOOT ja paga, por faixa de nivel de hunt (28/08, espelhando
// `awardKillLoot` com os defaults em vigor):
//
//   faixa 1-30 -> 85    faixa 31-60 -> 446    faixa 61-90 -> 882
//   faixa 150-160 -> 1.508    faixa 161-190 -> 2.045
//
// 25 por abate e portanto ~29% do loot no comeco do jogo e troco no fim. E de
// proposito: a missao e um bonus de ritmo pra quem esta subindo, nao uma fonte
// de renda paralela — e o alvo desta issue era o ouro por abate ficar
// COMPARAVEL entre os tipos (era 2,15 em WATER contra 16,3 em GHOST; ficou
// 26,2 a 30,7), nao a missao virar a economia principal. Pra mexer na
// magnitude, mexa aqui e rode `--relatorio`: o ouro total do sistema inteiro
// sai impresso.
const ALVO_BASE = 50
const ALVO_INCREMENTO = 25
const ALVO_TETO = 500
const OURO_POR_ABATE = 25
const BONUS_POR_MISSAO_DA_CADEIA = 500

export const alvoDaPosicao = (pos) => Math.min(ALVO_TETO, ALVO_BASE + pos * ALVO_INCREMENTO)
export const recompensaDaPosicao = (pos, ehUltima, tamanhoDaCadeia) =>
  alvoDaPosicao(pos) * OURO_POR_ABATE + (ehUltima ? BONUS_POR_MISSAO_DA_CADEIA * tamanhoDaCadeia : 0)

// ---------------------------------------------------------------- entrada
const catalogo = JSON.parse(readFileSync(p('scripts', 'usum', 'catalog.json'), 'utf8'))

const elenco = new Set(
  [...readFileSync(p('src', 'data', 'generated', 'pokes.generated.ts'), 'utf8')
    .matchAll(/^\s{2}"([a-z0-9_]+)": \{$/gm)].map((m) => m[1]),
)
if (elenco.size < 200) throw new Error(`elenco suspeito (${elenco.size}) — o regex de pokes.generated.ts quebrou?`)

// `SUB_BIOMA_ESPECIES` e um objeto de arrays de string; so os ids interessam.
const subBiomaRaw = readFileSync(p('src', 'data', 'generated', 'subBiomas.generated.ts'), 'utf8')
const corpoSubBioma = subBiomaRaw.slice(subBiomaRaw.indexOf('SUB_BIOMA_ESPECIES'))
const emAlgumSubBioma = new Set([...corpoSubBioma.matchAll(/^\s{4}'([a-z0-9_]+)',$/gm)].map((m) => m[1]))
if (emAlgumSubBioma.size < 150) throw new Error(`sub-biomas suspeitos (${emAlgumSubBioma.size}) — o regex quebrou?`)

const pesos = Object.fromEntries(
  [...readFileSync(p('src', 'data', 'generated', 'spawnTiers.generated.ts'), 'utf8')
    .matchAll(/^\s{2}'([a-z0-9_]+)': (\d+),/gm)].map((m) => [m[1], Number(m[2])]),
)
if (Object.keys(pesos).length < 200) throw new Error('spawnTiers.generated.ts — o regex quebrou?')

const lendarias = new Set(
  [...readFileSync(p('src', 'data', 'legendaries.ts'), 'utf8')
    .matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]),
)
if (lendarias.size !== 11) throw new Error(`esperava 11 lendarias, li ${lendarias.size}`)

// Os 18 tipos, na ordem de `TYPE_COLORS` — a mesma que `MISSAO_TYPES` usa e a
// mesma do `check` das migrations.
const TIPOS = [
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY',
]

// ------------------------------------------------------- estagio evolutivo
// Quantos passos de evolucao esta especie esta da raiz da linha. Usado so como
// DESEMPATE de dificuldade: entre duas especies de mesmo peso de spawn, a que
// esta mais perto do inicio da linha e a mais facil de encontrar cedo.
const paiDe = new Map()
for (const e of catalogo.especies) {
  for (const o of e.evolucoes ?? []) paiDe.set(o.to, e.chave)
}
function estagioDe(id) {
  let n = 0
  let atual = id
  const visto = new Set([id])
  while (paiDe.has(atual)) {
    atual = paiDe.get(atual)
    if (visto.has(atual)) break // ciclo no dado: para em vez de girar pra sempre
    visto.add(atual)
    n++
  }
  return n
}

// ------------------------------------------------------------- a cadeia
//
// ELEGIVEL = esta no elenco do cliente E aparece em algum sub-bioma E nao e
// lendaria.
//
//   - fora do elenco: o cliente nao sabe desenhar a especie (eram as 6 linhas
//     que so existiam no banco: vulpix, ninetales, chansey, blissey, mr__mime,
//     shuckle).
//   - fora de todo sub-bioma: a especie NUNCA aparece como inimigo, entao
//     `pokedexKills` nunca sobe e a missao e impossivel. Eram os 3 iniciais
//     (charmander/squirtle/bulbasaur), eevee, porygon e porygon2 — e como a
//     cadeia e sequencial, cada um deles matava tudo que vinha depois. Medido:
//     148 das 359 missoes eram inalcancaveis por isto.
//   - lendaria: peso de spawn 1 contra 20 de uma comum, entao um alvo de 975
//     abates de Ho-Oh custa ~20x o de um alvo igual numa comum, e no meio de
//     uma cadeia sequencial ela muralha todo o resto.
const elegivel = (e) => elenco.has(e.chave) && emAlgumSubBioma.has(e.chave) && !lendarias.has(e.chave)

// ORDEM = por dificuldade real de farm, nao por numero de Pokedex. Era a ordem
// de dex que punha CHARIZARD como missao 1 de FLYING (dex 6, estagio 2) — o
// jogador abria a cadeia e a primeira coisa pedida eram 50 abates de um
// estagio final.
function cadeiaDoTipo(tipo) {
  const doTipo = catalogo.especies.filter((e) => elegivel(e) && (e.tipo1 === tipo || e.tipo2 === tipo))
  doTipo.sort((a, b) =>
    (pesos[b.chave] ?? 0) - (pesos[a.chave] ?? 0) // mais comum primeiro
    || estagioDe(a.chave) - estagioDe(b.chave)    // depois, mais perto da raiz
    || a.dex - b.dex)                             // desempate estavel
  const n = doTipo.length
  return doTipo.map((e, posicao) => {
    const ehUltima = posicao === n - 1
    return {
      tipo,
      speciesId: e.chave,
      posicao,
      alvo: alvoDaPosicao(posicao),
      recompensa: recompensaDaPosicao(posicao, ehUltima, n),
      ehUltima,
    }
  })
}

const CADEIAS = TIPOS.map((t) => [t, cadeiaDoTipo(t)])

// --------------------------------------------------------------- relatorio
{
  let totalMissoes = 0
  let totalAbates = 0
  let totalOuro = 0
  for (const [tipo, c] of CADEIAS) {
    if (!c.length) throw new Error(`tipo ${tipo} ficou com cadeia VAZIA — nenhuma especie elegivel`)
    const abates = c.reduce((s, m) => s + m.alvo, 0)
    const ouro = c.reduce((s, m) => s + m.recompensa, 0)
    totalMissoes += c.length
    totalAbates += abates
    totalOuro += ouro
    console.log(
      `${tipo.padEnd(9)} n=${String(c.length).padStart(2)}`
      + ` | 1a=${c[0].speciesId.padEnd(12)}(peso ${pesos[c[0].speciesId]})`
      + ` | ultima=${c[c.length - 1].speciesId.padEnd(12)}`
      + ` | abates=${String(abates).padStart(6)} ouro=${String(ouro).padStart(7)}`
      + ` | ouro/abate=${(ouro / abates).toFixed(2)}`,
    )
  }
  console.log(`\nTOTAL missoes=${totalMissoes} abates=${totalAbates} ouro=${totalOuro}`)
}

if (SO_RELATORIO) process.exit(0)

// ------------------------------------------------------------------- TS
const linhasTs = CADEIAS.flatMap(([, c]) => c).map((m) =>
  `  { tipo: '${m.tipo}', speciesId: '${m.speciesId}', posicao: ${m.posicao}, alvo: ${m.alvo}, recompensa: ${m.recompensa}, ehUltima: ${m.ehUltima} },`)

writeFileSync(p('src', 'data', 'generated', 'missaoCadeia.generated.ts'), `// AUTO-GERADO por \`node scripts/gerar-cadeia-de-missoes.mjs\`. Nao editar a mao.
//
// A cadeia de "Tasks & Missoes" (PH-199/PH-245). O par de migrations
// \`*_missao_cadeia_*.sql\` sai do MESMO laco deste mesmo gerador, entao a
// tabela que a RPC le e esta lista sao a mesma coisa — e
// \`cadeiaDeMissoes.test.ts\` reprova se deixarem de ser.
import type { ElementType } from './types'

export interface MissaoCadeiaLinha {
  tipo: ElementType
  speciesId: string
  posicao: number
  alvo: number
  recompensa: number
  ehUltima: boolean
}

export const MISSAO_CADEIA: readonly MissaoCadeiaLinha[] = [
${linhasTs.join('\n')}
]
`, 'utf8')

// ------------------------------------------------------------------- SQL
// `::public.element_type` em CADA literal, e nao so na coluna: e a licao de
// PH-153, onde um enum sem cast explicito derrubou o deploy da `dev` com todas
// as PRs verdes. `todasAsEvolucoes.test.ts` varre as migrations e reprova
// literal de tipo elemental sem cast dentro de tupla de `values`.
const valores = CADEIAS.flatMap(([, c]) => c)
  .map((m) => `  ('${m.tipo}'::public.element_type, '${m.speciesId}', ${m.posicao}, ${m.alvo}, ${m.recompensa}, ${m.ehUltima})`)
  .join(',\n')

function corpo(schema) {
  const q = schema === 'dev' ? 'dev' : 'public'
  const cabecalho = schema === 'dev'
    ? `-- PH-245 — espelho de ${nomeDaMigration('public')} no schema \`dev\`.\n`
      + '-- O raciocinio completo esta na migration irma em `public`.\n'
    : `-- PH-245 — a cadeia de "Tasks & Missoes" vira TABELA, e a RPC passa a LER
-- em vez de derivar de novo.
--
-- O QUE ESTAVA QUEBRADO: \`reivindicar_missao\` montava a cadeia com
-- \`row_number() over (order by dex_number)\` sobre \`public.species\`, enquanto o
-- cliente montava a dele sobre o catalogo de \`src/data\`. As duas entradas nao
-- sao a mesma: o banco tem 251 especies, o catalogo do cliente tem 245
-- (faltam vulpix, ninetales, chansey, blissey, mr__mime, shuckle), e 4
-- especies tem tipo diferente nos dois lados porque o retype de Fairy entrou
-- so no cliente (clefairy, clefable, togetic, wigglytuff). Medido: as cadeias
-- divergiam em 6 dos 18 tipos. FAIRY divergia ja na posicao 1 — a tela
-- oferecia \`clefairy\` e a RPC respondia "essa especie nao pertence a cadeia
-- desse tipo", entao a cadeia inteira era inalcancavel sob autoridade.
--
-- A CORRECAO nao e "consertar o dado dos dois lados": e tirar a segunda
-- derivacao de cena. Esta tabela e gerada por
-- \`scripts/gerar-cadeia-de-missoes.mjs\`, o MESMO laco que emite
-- \`src/data/generated/missaoCadeia.generated.ts\`, e um teste reprova se os
-- dois arquivos divergirem. A RPC so faz \`select\`.
--
-- A tabela tambem carrega \`alvo\` e \`recompensa\` por linha em vez de repetir a
-- formula em SQL: numero copiado e a mesma classe de bug que a lista copiada.
`

  return `${cabecalho}begin;

create table if not exists ${q}.missao_cadeia (
  -- public.element_type, e nao text com check copiado: o enum ja e a fonte de
  -- verdade de tipo elemental no banco (species.type1 usa ele), e uma lista de
  -- 18 nomes repetida num check e mais uma copia pra sair de sincronia. O enum
  -- vive em public e e compartilhado pelos dois schemas.
  tipo public.element_type not null,
  -- SEM foreign key pra ${q}.species, de proposito: a cadeia e derivada do
  -- catalogo do CLIENTE, e schema dev recem-clonado pode nao ter todas as
  -- especies ainda. Com FK, a migration estouraria no deploy e travaria a fila
  -- de todos os pushes seguintes — o modo de falha de PH-153, e a mesma razao
  -- pela qual gerar-migration-evolucoes.mjs tambem nao usa FK aqui. O que
  -- protege contra id inventado e cadeiaDeMissoes.test.ts, que exige toda
  -- especie da cadeia estar em SPECIES e em algum enemyPool.
  species_id text not null,
  posicao int not null,
  alvo int not null check (alvo > 0),
  recompensa bigint not null check (recompensa >= 0),
  eh_ultima boolean not null,
  primary key (tipo, species_id),
  unique (tipo, posicao)
);

-- Catalogo, nao dado de jogador: todo mundo autenticado le, ninguem escreve.
-- Sem RLS de dono porque nao ha dono — e a mesma postura de \`${q}.species\`.
alter table ${q}.missao_cadeia enable row level security;
drop policy if exists "leitura publica" on ${q}.missao_cadeia;
create policy "leitura publica" on ${q}.missao_cadeia for select to authenticated using (true);
grant select on ${q}.missao_cadeia to authenticated;
grant select, insert, update, delete on ${q}.missao_cadeia to service_role;

-- Regerado por inteiro a cada vez: a cadeia e derivada do catalogo, entao
-- linha que sumiu do catalogo tem que sumir daqui tambem. \`delete\` sem filtro
-- e proposital — a tabela nao guarda nada de jogador (o que o jogador
-- reivindicou vive em \`player_missoes_reivindicadas\`, e nao e tocado aqui).
delete from ${q}.missao_cadeia;

insert into ${q}.missao_cadeia (tipo, species_id, posicao, alvo, recompensa, eh_ultima) values
${valores}
on conflict (tipo, species_id) do update set
  posicao = excluded.posicao,
  alvo = excluded.alvo,
  recompensa = excluded.recompensa,
  eh_ultima = excluded.eh_ultima;

create or replace function ${q}.reivindicar_missao(p_tipo text, p_species_id text)
returns jsonb
language plpgsql
security definer
set search_path = ${q}
as $$
declare
  v_user_id uuid := auth.uid();
  v_posicao int;
  v_alvo int;
  v_recompensa bigint;
  v_reivindicadas int;
  v_abates bigint;
  v_ja_reivindicada boolean;
  v_tipo public.element_type;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  -- Valida ANTES de castar: \`p_tipo::public.element_type\` com lixo levanta
  -- \`invalid input value for enum\`, um erro cru do Postgres, em vez desta
  -- mensagem. Mesmo motivo da guarda que ja existia quando a coluna era text.
  if p_tipo not in (
    'NORMAL','FIRE','WATER','ELECTRIC','GRASS','ICE','FIGHTING','POISON',
    'GROUND','FLYING','PSYCHIC','BUG','ROCK','GHOST','DRAGON','DARK','STEEL','FAIRY'
  ) then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;
  v_tipo := p_tipo::public.element_type;

  -- Lock ANTES de qualquer leitura de negocio (PH-199, ver a migration
  -- ..._missao_lock_antes_da_leitura_*): sem isto a segunda de duas chamadas
  -- concorrentes lia o snapshot velho e caia num erro cru de constraint em vez
  -- da mensagem certa.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select exists(
    select 1 from ${q}.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo and species_id = p_species_id
  ) into v_ja_reivindicada;
  if v_ja_reivindicada then
    raise exception 'Missao ja reivindicada.' using errcode = 'P0001';
  end if;

  -- A cadeia vem da TABELA. Nao ha mais derivacao aqui, entao nao ha mais como
  -- ela discordar da que a tela desenhou.
  select posicao, alvo, recompensa into v_posicao, v_alvo, v_recompensa
    from ${q}.missao_cadeia where tipo = v_tipo and species_id = p_species_id;
  if v_posicao is null then
    raise exception 'Essa especie nao pertence a cadeia desse tipo.' using errcode = 'P0001';
  end if;

  select count(*) into v_reivindicadas from ${q}.player_missoes_reivindicadas
    where user_id = v_user_id and tipo = p_tipo;
  if v_reivindicadas != v_posicao then
    raise exception 'Complete a missao anterior da cadeia primeiro.' using errcode = 'P0001';
  end if;

  select coalesce(normal_kills, 0) + coalesce(shiny_kills, 0) into v_abates
    from ${q}.player_pokedex where user_id = v_user_id and species_id = p_species_id;
  if coalesce(v_abates, 0) < v_alvo then
    raise exception 'Abates insuficientes para reivindicar esta missao.' using errcode = 'P0001';
  end if;

  update ${q}.players set gold = gold + v_recompensa where user_id = v_user_id;
  if not found then
    raise exception 'jogador sem linha em players' using errcode = 'P0001';
  end if;

  insert into ${q}.player_missoes_reivindicadas (user_id, tipo, species_id)
  values (v_user_id, p_tipo, p_species_id);

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Missao de %s (posicao %s) reivindicada — %s de ouro.', p_tipo, v_posicao + 1, v_recompensa)
  );
end;
$$;

-- O progresso de missao e ZERADO, e nao filtrado. O gate sequencial da RPC e
-- \`count(reivindicadas do tipo) = posicao\`, entao ele so funciona se as
-- reivindicacoes gravadas forem exatamente as posicoes 0..n-1 da cadeia VIGENTE.
-- As posicoes mudaram todas (a ordem deixou de ser por numero de Pokedex),
-- entao apagar so o que saiu da cadeia nao basta: uma especie que continua na
-- cadeia mas em OUTRA posicao deixa o \`count\` certo e as posicoes erradas —
-- o jogador veria as primeiras missoes da cadeia nova destravadas na tela e a
-- RPC as recusaria, que e exatamente a classe de divergencia que esta issue
-- veio fechar.
--
-- CUSTO MEDIDO ANTES DE ESCREVER ISTO (28/08): \`public\` tinha 4 linhas de 1
-- jogador e \`dev\` tinha 0. O ouro ja pago nao volta (esta na carteira), entao
-- o unico efeito e esse jogador poder reivindicar de novo as 4 — algumas
-- centenas de ouro. Filtrar com mais cuidado nao pagaria a complexidade.
delete from ${q}.player_missoes_reivindicadas;

commit;
`
}

for (const schema of ['public', 'dev']) {
  const nome = nomeDaMigration(schema)
  writeFileSync(p('supabase', 'migrations', nome), corpo(schema), 'utf8')
  console.log(`-> supabase/migrations/${nome}`)
}
console.log('\nescrito tambem: src/data/generated/missaoCadeia.generated.ts')
