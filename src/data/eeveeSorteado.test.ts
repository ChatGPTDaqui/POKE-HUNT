// PH-330 — o sorteio do Eevee do Lance mora em PL/pgSQL, e este arquivo e o que
// impede o SQL de divergir das probabilidades do jogo.
//
// POR QUE UM TESTE DE FONTE (mesma decisao de `eeveeDoLance.test.ts`): a
// concessao roda dentro do Postgres, num trigger de `hall_da_fama`, e a suite
// nao tem Postgres. Um teste com mocks de banco provaria que os mocks concordam
// entre si.
//
// O QUE ELE DE FATO PROTEGE, e e o ponto: o SQL REPETE numeros que vivem em
// `src/data/`. Peso de raridade, as 25 naturezas, o teto de IV, a chance de
// habilidade oculta e a lista de habilidades do Eevee. Nenhuma dessas
// duplicacoes da erro quando divergir — o Eevee simplesmente sai sorteado por
// uma regra que nao e a do jogo, e ninguem descobre. Aqui os dois lados sao
// lidos e comparados.
//
// A prova de COMPORTAMENTO continua sendo `scripts/harness/eevee-do-lance.mjs`,
// que roda contra o schema publicado.
import { describe, expect, it } from 'vitest'

import { RARITIES } from './rarity'
import { NATURE_LIST } from './natures'
import { IV_MAX } from './characteristics'
import { CHANCE_DE_TRAIT_OCULTA, traitsDaEspecie } from './traits'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function migration(sufixo: string): string {
  const chave = Object.keys(MIGRATIONS).find((c) => c.endsWith(sufixo))
  if (!chave) throw new Error(`migration nao encontrada: ${sufixo}`)
  return MIGRATIONS[chave]
}

const SORTEIO_PUBLICO = migration('20260831100000_eevee_sorteado_public.sql')
const SORTEIO_DEV = migration('20260831100001_eevee_sorteado_dev.sql')
const RETRO_PUBLICO = migration('20260831110000_eevee_sorteado_retroativo_public.sql')
const RETRO_DEV = migration('20260831110001_eevee_sorteado_retroativo_dev.sql')

/**
 * Sem comentario e sem espaco duplicado — o que o Postgres de fato le.
 *
 * `[^\n]`, e nao `.`: em JavaScript o `.` de uma regex NAO casa `\r`, e o repo
 * nao tem `.gitattributes` — o mesmo commit sai em LF no runner e em CRLF aqui.
 * A forma com `.` nao removia comentario nenhum em CRLF, e um `toContain` passava
 * VERDE casando o comentario que descreve a clausula, sem a clausula existir.
 * Foi o PH-252, no arquivo irmao; nao se repete aqui.
 */
function semComentario(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const SORTEIO = { public: semComentario(SORTEIO_PUBLICO), dev: semComentario(SORTEIO_DEV) }
const RETRO = { public: semComentario(RETRO_PUBLICO), dev: semComentario(RETRO_DEV) }

describe('o glob achou os quatro arquivos (PH-330)', () => {
  it('e nenhum deles esta vazio nem trocado', () => {
    expect(SORTEIO_PUBLICO).toContain('create or replace function public._sortear_eevee_do_lance()')
    expect(SORTEIO_PUBLICO).not.toContain('espelho de')
    expect(SORTEIO_DEV).toContain('espelho de 20260831100000_eevee_sorteado_public.sql')
    expect(RETRO_PUBLICO).toContain('_conceder_eevee_do_lance(v_user_id')
    expect(RETRO_DEV).toContain('espelho de 20260831110000_eevee_sorteado_retroativo_public.sql')
  })

  it('o removedor de comentario funciona em CRLF — o guardiao de todo o resto', () => {
    expect(semComentario('select 1;\r\n-- some daqui\r\nselect 2;')).toBe('select 1; select 2;')
    for (const [nome, sql] of Object.entries({ ...SORTEIO, retroPublic: RETRO.public, retroDev: RETRO.dev })) {
      expect(sql, `sobrou comentario em ${nome}`).not.toContain('--')
    }
  })
})

describe.each(['public', 'dev'] as const)('as probabilidades do sorteio em %s', (schema) => {
  const sql = SORTEIO[schema]

  it('os seis pesos de raridade sao EXATAMENTE os de data/rarity.ts', () => {
    // Le a tabela de VALUES do SQL e compara par a par com `RARITIES`. Nao e
    // "contem o numero 69": a ORDEM importa (o acumulado e calculado por `ord`)
    // e um peso a mais ou a menos tem que reprovar.
    const bloco = /\(1, 'comum',\s*69\.0::numeric\),(.*?)\) as p\(ord, chave, peso\)/.exec(sql)
    expect(bloco, 'nao achei a tabela de pesos no SQL').toBeTruthy()

    const doSql = [...sql.matchAll(/\(\d+, '([a-z]+)',\s*([\d.]+)(?:::numeric)?\)/g)]
      .map(([, chave, peso]) => ({ chave, peso: Number(peso) }))
    const doCliente = Object.values(RARITIES).map((r) => ({ chave: r.key, peso: r.weight }))

    expect(doSql).toEqual(doCliente)
  })

  it('os pesos somam 100 nos dois lados — o sorteio e `random() * 100`', () => {
    // Se a soma nao fosse 100, o ultimo intervalo do acumulado nao cobriria o
    // topo do sorteio e o `coalesce(..., 'comum')` mascararia a diferenca em
    // silencio: raridade rara viraria comum de vez em quando.
    expect(sql).toContain('random() * 100')
    const soma = Object.values(RARITIES).reduce((s, r) => s + r.weight, 0)
    expect(soma).toBeCloseTo(100, 10)
  })

  it('as 25 naturezas sao as mesmas de data/natures.ts, e o sorteio e uniforme', () => {
    const bloco = /select t\.n into v_nature from \(values (.*?)\) as t\(n\) order by random\(\) limit 1;/.exec(sql)
    expect(bloco, 'nao achei a lista de naturezas').toBeTruthy()
    const doSql = [...bloco![1].matchAll(/\('([a-z]+)'\)/g)].map(([, n]) => n)
    expect(doSql).toEqual(NATURE_LIST.map((n) => n.key))
    expect(doSql.length).toBe(25)
  })

  it('IV vai de 0 a IV_MAX inclusive — o teto do `floor(random() * N)` e IV_MAX + 1', () => {
    const tetos = [...sql.matchAll(/floor\(random\(\) \* (\d+)\)::int/g)].map(([, n]) => Number(n))
    expect(tetos.length, 'os seis atributos precisam de um sorteio cada').toBe(6)
    for (const teto of tetos) expect(teto).toBe(IV_MAX + 1)
  })

  it('a chance de habilidade oculta e CHANCE_DE_TRAIT_OCULTA', () => {
    expect(sql).toContain(`random() < ${CHANCE_DE_TRAIT_OCULTA}`)
  })

  it('as habilidades do Eevee sao as do catalogo gerado — oculta e normais', () => {
    const doCatalogo = traitsDaEspecie('eevee')
    expect(doCatalogo, 'eevee saiu do catalogo de habilidades').toBeTruthy()
    // A oculta aparece no ramo de 5%, as normais na lista uniforme.
    expect(sql).toContain(`then '${doCatalogo!.oculta}'`)
    const bloco = /\(select t\.a from \(values (.*?)\) as t\(a\) order by random\(\) limit 1\)/.exec(sql)
    expect(bloco, 'nao achei a lista de habilidades normais').toBeTruthy()
    const doSql = [...bloco![1].matchAll(/\('([a-z_]+)'\)/g)].map(([, a]) => a)
    expect(doSql).toEqual(doCatalogo!.normais)
  })

  it('a chance de shiny sai da formula do jogo, com catch_rate lido da tabela', () => {
    // `(catch_rate / 255) * (1/8192) * 100` — os tres numeros da formula de
    // `data/pokes.ts`. `catch_rate` da TABELA e nao literal: reafinar o catalogo
    // do Eevee tem que mudar a chance junto.
    expect(sql).toContain('select s.catch_rate into v_catch_rate from')
    expect(sql).toContain('(1.0 / 8192) * 100')
    expect(sql).toContain('/ 255)')
  })

  it('o nivel e 1', () => {
    expect(sql).toContain("'level', 1,")
    expect(sql).not.toContain("'level', 25")
  })

  it('nada na receita continua congelado', () => {
    // A receita devolvida referencia VARIAVEIS, nao literais. Checar a ausencia
    // dos literais nao serve aqui: `coalesce(v_poke->>'rarity', 'comum')` na
    // coleta e legitimo (e o default de receita antiga) e casaria o padrao.
    expect(sql).toContain("'rarity', v_rarity")
    expect(sql).toContain("'isShiny', v_shiny")
    expect(sql).toContain("'nature', v_nature")
    expect(sql).toContain("'trait', v_trait")
    // Os IVs 23 da versao congelada, esses sim, nao podem sobrar em lugar nenhum.
    expect(sql).not.toContain("'hp', 23")
  })
})

describe.each(['public', 'dev'] as const)('a coleta grava o que foi sorteado em %s', (schema) => {
  const sql = SORTEIO[schema]
  const s = schema === 'public' ? 'public' : 'dev'

  it('`nature` e `trait` entram na lista de colunas do INSERT', () => {
    // Era este o buraco mais silencioso da versao anterior: a receita podia
    // trazer a habilidade e a RPC a descartava na fronteira.
    expect(sql).toContain('unlocked_abilities, original_trainer, nature, trait')
  })

  it('`_calcular_stats` e chamado com a sobrecarga de ONZE argumentos', () => {
    // A de 10 passa natureza nula e os stats saem sem o multiplicador dela —
    // divergindo do que o cliente calcula pro MESMO POKE.
    expect(sql).toContain('v_rarity, v_shiny, v_nature')
    expect(sql).not.toMatch(/_calcular_stats\([^;]*v_rarity, v_shiny\s*\);/)
  })

  it('receita antiga (sem `nature`/`trait`) nao quebra a coleta', () => {
    // Carta ja no correio quando isto subir. `nullif(..., '')` sobre um `->>` de
    // chave ausente devolve NULL, que e o que a coluna aceita.
    expect(sql).toContain("v_nature := nullif(v_poke->>'nature', '');")
    expect(sql).toContain("v_trait := nullif(v_poke->>'trait', '');")
  })

  it('a substituicao e filtrada por user_id — receita e dado, nao autorizacao', () => {
    expect(sql).toContain(
      `delete from ${s}.pokemon_instances where id = v_substitui and user_id = v_user_id;`,
    )
  })

  it('a substituicao acontece ANTES de contar a equipe', () => {
    // Duas razoes, e as duas quebram se a ordem inverter: o `v_team_count` decide
    // o slot livre, e o indice unico `one_pokemon_per_team_slot` reclamaria se a
    // linha antiga ainda ocupasse o slot no momento do insert.
    const posDelete = sql.indexOf('and user_id = v_user_id;')
    const posContagem = sql.indexOf('select count(*) into v_team_count')
    expect(posDelete).toBeGreaterThan(-1)
    expect(posContagem).toBeGreaterThan(posDelete)
  })

  it('time cheio continua abortando antes de criar o POKE', () => {
    const posChecagem = sql.indexOf('if v_team_count >= 6 then')
    const posInsert = sql.indexOf(`insert into ${s}.pokemon_instances (`)
    expect(posChecagem).toBeGreaterThan(-1)
    expect(posInsert).toBeGreaterThan(posChecagem)
    expect(sql).toContain('Sua equipe esta cheia')
  })

  it('o sorteio nao e executavel por papel nenhum do cliente', () => {
    // Ele nao concede nada sozinho, mas expor um gerador de receita ao cliente
    // e o primeiro passo pra ele escolher a propria.
    expect(sql).toContain(`revoke execute on function ${s}._sortear_eevee_do_lance() from authenticated`)
    expect(sql).toContain(`revoke execute on function ${s}._sortear_eevee_do_lance() from anon`)
    expect(sql).not.toMatch(/grant execute on function \w+\._sortear_eevee_do_lance/)
  })

  it('a concessao continua trancada no marcador, e a rota antiga de 1 argumento sai', () => {
    expect(sql).toContain(`insert into ${s}.recompensa_concedida (user_id, chave)`)
    expect(sql).toContain('on conflict do nothing')
    expect(sql).toMatch(/if not found then return false;/)
    // Sem este drop, a assinatura de 20260828230000 (com a receita congelada
    // dentro) continuaria existindo e chamavel.
    expect(sql).toContain(`drop function if exists ${s}._conceder_eevee_do_lance(uuid);`)
  })
})

describe.each(['public', 'dev'] as const)('a troca retroativa em %s', (schema) => {
  const sql = RETRO[schema]
  const s = schema === 'public' ? 'public' : 'dev'

  it('NAO apaga POKE direto — a exclusao vai pela receita do correio', () => {
    // O `delete` solto e justamente o que nao funciona: o flush ressuscita a
    // linha a partir do estado local do jogador (progresso.ts, `atual == null`).
    expect(sql).not.toMatch(new RegExp(`delete from ${s}\\.pokemon_instances`))
    expect(sql).toContain(`${s}._conceder_eevee_do_lance(v_user_id, v_poke_id)`)
  })

  it('so age sobre carta com receita CONGELADA — e o que a torna idempotente', () => {
    // `-> 'nature' is null` em vez do operador `?`: o mesmo teste com menos
    // dependencia de como o driver do CLI trata `?` num arquivo de migration.
    expect(sql).toContain("anexo_poke->'nature' is null")
  })

  it('usa `not found`, e nao `record is null`, pra detectar carta ausente', () => {
    // Num laco, SELECT INTO que nao acha linha deixa a variavel COMO ESTAVA: a
    // segunda volta leria a carta do jogador anterior e trocaria o POKE errado.
    expect(sql).toContain('if not found then')
    expect(sql).not.toMatch(/if v_carta is null then/)
  })

  it('nao reconcede quando o POKE entregue nao e identificavel com certeza', () => {
    // Reconceder com 0 ou 2+ candidatos daria dois Eevees, que e pior que um
    // Eevee velho.
    expect(sql).toContain('if v_candidatos <> 1 then')
    expect(sql).toContain('raise notice')
  })

  it('o RAISE usa % sozinho — `%s` deixaria o "s" literal na mensagem', () => {
    expect(sql).not.toMatch(/raise notice[^;]*%s/)
  })

  it('o marcador e derrubado antes de reconceder, senao a concessao sai `false`', () => {
    expect(sql).toContain(
      `delete from ${s}.recompensa_concedida where user_id = v_user_id and chave = 'eevee_do_lance';`,
    )
  })
})

describe('simetria do par public/dev (PH-330)', () => {
  const normalizar = (sql: string, de: string) => semComentario(sql.slice(sql.indexOf('begin;')))
    .split(`${de}.`).join('ESQUEMA.')
    .split('set search_path = dev, public').join('SEARCH_PATH')
    .split('set search_path = public').join('SEARCH_PATH')

  it('o dev e o public com o schema trocado, e nada mais', () => {
    // Divergencia entre os dois e o modo de falha classico do repo: o bug
    // aparece so no ambiente que ninguem testou.
    expect(normalizar(SORTEIO_DEV, 'dev')).toBe(normalizar(SORTEIO_PUBLICO, 'public'))
    expect(normalizar(RETRO_DEV, 'dev')).toBe(normalizar(RETRO_PUBLICO, 'public'))
  })

  it('os dois pares tem carimbo N / N+1, e a retroativa vem DEPOIS', () => {
    // A retroativa chama `_conceder_eevee_do_lance` com DOIS argumentos, criada
    // pelo par 100000 — a ordem nao e cosmetica.
    expect(Number('20260831110000')).toBeGreaterThan(Number('20260831100001'))
    expect(SORTEIO_DEV).toContain('espelho de 20260831100000_eevee_sorteado_public.sql')
    expect(RETRO_DEV).toContain('espelho de 20260831110000_eevee_sorteado_retroativo_public.sql')
  })

  it('as funcoes de dev enxergam public no search_path', () => {
    expect(SORTEIO_DEV).toContain('set search_path = dev, public')
    expect(SORTEIO_DEV).not.toMatch(/set search_path = dev\s*$/m)
  })
})
