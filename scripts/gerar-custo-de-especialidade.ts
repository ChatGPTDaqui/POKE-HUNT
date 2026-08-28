// PH-246 — emite o CUSTO DE ESPECIALIDADE por tipo elemental nos dois lados de
// uma vez: o modulo que o cliente le e o par de migrations com o custo que a
// RPC `subir_nivel_especialidade` cobra.
//
//   npm run custo:especialidade -- --carimbo=20260828150000
//   npm run custo:especialidade -- --relatorio      (so imprime, nao escreve)
//
// E TypeScript, e roda depois de um build SSR (ver
// `vite.custo-especialidade.config.ts`), porque precisa da oferta REAL de
// Stone — que so existe depois que `huntSpawnOverrides.ts` monta os
// `enemyPool`. A medicao vive em `src/data/ofertaDeStone.ts` e e a MESMA que
// `custoDeEspecialidade.test.ts` usa pra julgar o resultado.
//
// O PROBLEMA QUE ISTO RESOLVE
//
// O custo era um array unico — 15/35/70/130/220 Stones por nivel, os mesmos
// 940 pra fechar as duas trilhas de QUALQUER tipo. Mas a Stone so cai de POKE
// daquele tipo, e os tipos nao aparecem na mesma frequencia. Medido em 28/08,
// os abates necessarios pra fechar as duas trilhas:
//
//   FIRE / WATER / ELECTRIC / PSYCHIC    18.800
//   GHOST                                87.232
//   STEEL                               162.933
//   FAIRY                               168.718
//   FLYING                            IMPOSSIVEL
//
// Nove vezes de diferenca entre o mais barato e o mais caro, decidida so por
// quantas especies daquele tipo o catalogo tem — e FLYING literalmente
// incompravel, porque NENHUMA especie tem FLYING como tipo primario e o drop
// so olhava o primario.
//
// SAO DUAS CORRECOES, E ELAS SE COMPLETAM:
//
//   1. `awardKillLoot` passa a sortear entre tipo primario e secundario. So
//      isso ja da fonte pro FLYING (38 especies o tem como type2), mas nao
//      resolve a desigualdade.
//   2. O custo em Stone de cada tipo passa a escalar com a OFERTA medida
//      daquele tipo, e e isso que iguala o esforco.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ofertaDeStonePorTipo } from '@/data/ofertaDeStone'
import { TYPE_COLORS } from '@/data/typeColors'
import type { ElementType } from '@/data/generated/types'

// `scripts/.gerado/` -> raiz do repo.
const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const p = (...t: string[]) => join(RAIZ, ...t)

const SO_RELATORIO = process.argv.includes('--relatorio')
const CARIMBO = (() => {
  if (SO_RELATORIO) return null
  const a = process.argv.find((x) => x.startsWith('--carimbo='))
  if (!a) throw new Error('passe --carimbo=YYYYMMDDHHMMSS (ou --relatorio)')
  const v = a.slice('--carimbo='.length)
  if (!/^\d{14}$/.test(v)) throw new Error(`carimbo invalido: ${v}`)
  return v
})()

/**
 * Quantos abates devem bastar pra fechar as DUAS trilhas de um tipo, farmando
 * na hunt certa pra ele. E a regua que torna os tipos comparaveis: o custo de
 * cada um sai deste alvo multiplicado pela oferta medida daquele tipo.
 *
 * 20.000 e ancorado no que ja existia, e nao escolhido do nada: com o custo
 * antigo de 940 Stones, os tipos COMUNS ja pediam 18.800 abates. Manter esse
 * patamar faz a mudanca ser "os tipos raros deixaram de custar ate 9x mais", e
 * nao "o sistema inteiro encareceu" — cobrar mais de quem nao tinha o problema
 * seria consertar a desigualdade pelo lado errado.
 */
const ABATES_ALVO_PRA_MAXAR = 20_000

/**
 * A FORMA da progressao — quanto do custo total cai em cada um dos 5 niveis.
 * Sao os pesos do array antigo (15/35/70/130/220) preservados: o que muda nesta
 * issue e a ESCALA por tipo, nao a curva.
 */
const FORMA_DA_PROGRESSAO = [15, 35, 70, 130, 220]
const SOMA_DA_FORMA = FORMA_DA_PROGRESSAO.reduce((a, b) => a + b, 0)

/** Ouro por nivel — nao escala por tipo: ouro nao tem oferta por tipo elemental. */
const GOLD_POR_NIVEL = [500, 1500, 4000, 10000, 25000]

const TIPOS = Object.keys(TYPE_COLORS) as ElementType[]

// ---------------------------------------------------------------- a oferta
const oferta = ofertaDeStonePorTipo()

const semFonte = TIPOS.filter((t) => !oferta[t])
if (semFonte.length) {
  throw new Error(
    `${semFonte.join(', ')} sem NENHUMA fonte de Stone. Tipo sem oferta nao pode ter `
    + 'especialidade com preco na tela — conserte a fonte de drop antes de gerar o custo.',
  )
}

// ------------------------------------------------------------- os custos
function custosDoTipo(tipo: ElementType): number[] {
  const porTrilha = (ABATES_ALVO_PRA_MAXAR * oferta[tipo]) / 2
  const alvo = Math.max(FORMA_DA_PROGRESSAO.length, Math.round(porTrilha))

  // Arredondamento por MAIOR RESTO, e nao `round` nivel a nivel. Com `round`
  // solto a soma dos 5 niveis nao fecha com o alvo, e nos tipos de oferta
  // pequena o erro relativo explode — numa versao anterior desta conta um tipo
  // saiu pedindo 100.000 abates num alvo de 60.000.
  const exatos = FORMA_DA_PROGRESSAO.map((peso) => (alvo * peso) / SOMA_DA_FORMA)
  const niveis = exatos.map((v) => Math.max(1, Math.floor(v)))
  let sobra = alvo - niveis.reduce((a, b) => a + b, 0)
  const porResto = exatos.map((v, i) => ({ i, resto: v - Math.floor(v) })).sort((a, b) => b.resto - a.resto)
  for (let k = 0; sobra > 0; k++, sobra--) niveis[porResto[k % niveis.length].i]++

  // Nao-decrescente, e nao estritamente crescente: com oferta pequena o alvo
  // inteiro cabe em poucas Stones, e forcar +1 por nivel inflaria o esforco
  // real. Dois niveis seguidos com o mesmo preco lem-se mal, mas mentem menos
  // que um preco que nao corresponde ao esforco.
  for (let i = 1; i < niveis.length; i++) niveis[i] = Math.max(niveis[i], niveis[i - 1])
  return niveis
}

const CUSTOS = Object.fromEntries(TIPOS.map((t) => [t, custosDoTipo(t)])) as Record<ElementType, number[]>

// --------------------------------------------------------------- relatorio
{
  const linhas = TIPOS.map((t) => {
    const stones = CUSTOS[t].reduce((a, b) => a + b, 0) * 2
    return { tipo: t, chance: oferta[t], stones, abates: stones / oferta[t] }
  })
  for (const l of linhas) {
    console.log(
      `${l.tipo.padEnd(9)} melhor chance/abate=${(l.chance * 100).toFixed(3)}%`
      + ` | niveis=${CUSTOS[l.tipo].join('/').padEnd(22)}`
      + ` | stones(2 trilhas)=${String(l.stones).padStart(5)}`
      + ` | abates p/ maxar=${Math.round(l.abates).toLocaleString('pt-BR')}`,
    )
  }
  const min = Math.min(...linhas.map((l) => l.abates))
  const max = Math.max(...linhas.map((l) => l.abates))
  console.log(`\npior/melhor = ${(max / min).toFixed(2)}x  (antes: 9,0x, com FLYING impossivel)`)
}

if (SO_RELATORIO) process.exit(0)

// ------------------------------------------------------------------- TS
writeFileSync(p('src', 'data', 'generated', 'custoEspecialidade.generated.ts'), `// AUTO-GERADO por \`npm run custo:especialidade\`. Nao editar a mao.
//
// Custo em Stone por tipo e por nivel (PH-198/PH-246). Escala com a OFERTA de
// Stone de cada tipo, medida por \`src/data/ofertaDeStone.ts\` sobre os
// \`enemyPool\` de verdade. O par de migrations \`*_custo_especialidade_*.sql\` sai
// do MESMO laco, e \`custoDeEspecialidade.test.ts\` reprova se os dois sairem de
// sincronia.
import type { ElementType } from './types'

/** Ouro por nivel — igual pros 18 tipos: ouro nao tem oferta por tipo. */
export const ESPECIALIDADE_GOLD_POR_NIVEL: readonly number[] = [${GOLD_POR_NIVEL.join(', ')}]

export const ESPECIALIDADE_STONE_POR_NIVEL: Record<ElementType, readonly number[]> = {
${TIPOS.map((t) => `  ${t}: [${CUSTOS[t].join(', ')}],`).join('\n')}
}
`, 'utf8')

// ------------------------------------------------------------------- SQL
const casos = TIPOS.map((t) => `    when '${t}' then array[${CUSTOS[t].join(', ')}]`).join('\n')

function corpo(schema: 'public' | 'dev') {
  const q = schema
  const cabecalho = schema === 'dev'
    ? `-- PH-246 — espelho de ${CARIMBO}_custo_especialidade_public.sql no schema dev.\n`
      + '-- O raciocinio completo esta na migration irma em public.\n'
    : `-- PH-246 — o custo em Stone da especialidade passa a escalar com a OFERTA
-- de Stone de cada tipo.
--
-- O QUE ESTAVA QUEBRADO: o custo era um array unico (15/35/70/130/220) pros 18
-- tipos, mas a Stone so cai de POKE daquele tipo e os tipos nao aparecem na
-- mesma frequencia. Medido em 28/08, os abates pra fechar as duas trilhas iam
-- de 18.800 (FIRE/WATER/ELECTRIC/PSYCHIC) a 162.933 (STEEL) — nove vezes de
-- diferenca. E FLYING era literalmente incompravel: nenhuma especie do
-- catalogo tem FLYING como tipo primario, o drop so olhava o primario, e a
-- Pedra FLYING nao caia de lugar nenhum enquanto a tela anunciava o preco dos
-- 10 niveis.
--
-- A correcao tem duas metades. A outra esta no motor: awardKillLoot passa a
-- sortear entre tipo primario e secundario, o que da fonte ao FLYING. Esta
-- aqui iguala o ESFORCO — o custo de cada tipo sai de um alvo unico de abates
-- multiplicado pela oferta medida daquele tipo.
--
-- Gerado por scripts/gerar-custo-de-especialidade.ts, o mesmo laco que emite
-- src/data/generated/custoEspecialidade.generated.ts. Um teste reprova se os
-- dois divergirem — a licao de PH-245, onde duas derivacoes da mesma coisa
-- sairam de sincronia em producao.
`

  return `${cabecalho}begin;

create or replace function ${q}.subir_nivel_especialidade(p_tipo text, p_trilha text)
returns jsonb
language plpgsql
security definer
set search_path = ${q}
as $$
declare
  v_user_id uuid := auth.uid();
  v_nivel_atual int;
  -- Custo POR TIPO. Antes era um array unico pros 18 — ver o cabecalho.
  v_stone_qtd_por_nivel int[];
  v_gold_por_nivel bigint[] := array[${GOLD_POR_NIVEL.join(', ')}];
  v_stone_qtd int;
  v_gold bigint;
  v_stone_id text;
  v_stone_atual int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;
  if p_trilha not in ('dano', 'defesa') then
    raise exception 'trilha invalida' using errcode = 'P0001';
  end if;

  -- O \`case\` tambem faz o papel de validar o tipo: nome fora da lista cai no
  -- \`else\` implicito e deixa a variavel nula.
  v_stone_qtd_por_nivel := case p_tipo
${casos}
  end;
  if v_stone_qtd_por_nivel is null then
    raise exception 'tipo invalido' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  insert into ${q}.player_especialidades (user_id, tipo) values (v_user_id, p_tipo)
    on conflict (user_id, tipo) do nothing;

  select case p_trilha when 'dano' then dano_nivel else defesa_nivel end into v_nivel_atual
    from ${q}.player_especialidades where user_id = v_user_id and tipo = p_tipo;

  if v_nivel_atual >= 5 then
    raise exception 'Especialidade ja esta no nivel maximo.' using errcode = 'P0001';
  end if;

  v_stone_qtd := v_stone_qtd_por_nivel[v_nivel_atual + 1];
  v_gold := v_gold_por_nivel[v_nivel_atual + 1];
  v_stone_id := 'stone_' || lower(p_tipo);

  select quantity into v_stone_atual from ${q}.player_items
    where user_id = v_user_id and item_id = v_stone_id;
  if coalesce(v_stone_atual, 0) < v_stone_qtd then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update ${q}.players set gold = gold - v_gold
    where user_id = v_user_id and gold >= v_gold;
  if not found then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;

  -- Guarda live, e nao so o pre-check acima (PH-198, ver a migration
  -- ..._especialidade_guarda_de_stone_*): duas chamadas concorrentes da mesma
  -- conta passavam as duas pelo pre-check com o mesmo snapshot.
  update ${q}.player_items set quantity = quantity - v_stone_qtd, updated_at = now()
    where user_id = v_user_id and item_id = v_stone_id and quantity >= v_stone_qtd;
  if not found then
    raise exception 'Stones insuficientes.' using errcode = 'P0001';
  end if;

  update ${q}.player_especialidades set
    dano_nivel = case when p_trilha = 'dano' then dano_nivel + 1 else dano_nivel end,
    defesa_nivel = case when p_trilha = 'defesa' then defesa_nivel + 1 else defesa_nivel end,
    updated_at = now()
    where user_id = v_user_id and tipo = p_tipo;

  return jsonb_build_object(
    'ok', true,
    'mensagem', format('Especialidade %s (%s) subiu para o nivel %s.', p_tipo, p_trilha, v_nivel_atual + 1)
  );
end;
$$;

commit;
`
}

writeFileSync(p('supabase', 'migrations', `${CARIMBO}_custo_especialidade_public.sql`), corpo('public'), 'utf8')
writeFileSync(p('supabase', 'migrations', `${CARIMBO}_custo_especialidade_dev.sql`), corpo('dev'), 'utf8')
console.log(`\nescrito: src/data/generated/custoEspecialidade.generated.ts e o par ${CARIMBO}_custo_especialidade_{public,dev}.sql`)
