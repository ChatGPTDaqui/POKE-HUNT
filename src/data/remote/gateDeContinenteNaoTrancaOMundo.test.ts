// O gate de continente NAO pode trancar o que nasce aberto.
//
// BUG REAL, MEDIDO EM PRODUCAO (2026-09-02, PH-447): toda hunt do jogo
// respondeu "Derrote o Campeao Lance antes de acessar Mundo" — a Rota 46
// inicial, que nunca teve gate nenhum, e o estagio 1 de todos os 12 biomas.
// Deploy verde, 2977 testes passando, jogo inteiro inacessivel.
//
// A CADEIA, em tres passos:
//
//  1. a PH-434 trocou `GRUPOS_INICIAIS` de `['faixa1','faixa2']` pra
//     `['biomas']`, e toda hunt passou a declarar `continent: 'biomas'`;
//  2. nenhuma migration reescreveu `players.unlocked_continents` — as 8 linhas
//     do banco seguiram com `["faixa1","faixa2"]` (5 linhas) ou
//     `["faixa1","faixa2","faixa3","nightmare"]` (3);
//  3. o gate perguntava `unlockedContinents.includes(grupo)`, nas duas pontas.
//     Nenhuma linha continha `'biomas'`. Reprovou todas.
//
// POR QUE NENHUM TESTE PEGOU. `stores/gameStateStore.ts#merge` traduzia os
// grupos legados e injetava `GRUPOS_INICIAIS` sempre, e `stores/gateDoLance.
// test.ts` cobria isso — mas com uma COPIA da formula, nao com a funcao. E o
// caminho que vale sob autoridade nao e o `merge`: e `remote/playerMapper.ts`,
// que repassava a coluna crua e nunca teve teste de tradução. Os dois caminhos
// de carga discordavam, e o unico coberto era o que nao estava em uso.
//
// Este arquivo cobre o caminho remoto e a defesa do gate. Sabotar
// `grupoLiberado` (devolver `liberados.includes(grupo)` direto) ou
// `traduzirGruposLiberados` (repassar `gravados`) faz os casos abaixo ficarem
// vermelhos.
import { describe, expect, it } from 'vitest'

import { GRUPOS_DO_LANCE, GRUPOS_INICIAIS, grupoLiberado, traduzirGruposLiberados } from '@/data/biomas'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import { MAPS } from '@/data/maps'

/** As duas formas exatas que existiam em `public.players` em 02/09. */
const LINHA_SEM_LANCE = ['faixa1', 'faixa2']
const LINHA_COM_LANCE = ['faixa1', 'faixa2', 'faixa3', 'nightmare']

describe('gate de continente com linha legada no banco', () => {
  it('o grupo que nasce aberto e liberado mesmo com a linha do banco sem ele', () => {
    // O caso literal da producao: a coluna nao tem `'biomas'`, e o mundo
    // continua aberto. Esta e a asserção que o bug reprovava.
    for (const grupo of GRUPOS_INICIAIS) {
      expect(LINHA_SEM_LANCE).not.toContain(grupo)
      expect(grupoLiberado(grupo, LINHA_SEM_LANCE)).toBe(true)
    }
  })

  it('a Rota 46 inicial abre com a linha legada', () => {
    const inicial = MAPS[STARTER_HUNT_ID]
    expect(inicial, 'a hunt inicial tem que existir em MAPS').toBeTruthy()
    expect(grupoLiberado(inicial.continent, LINHA_SEM_LANCE)).toBe(true)
  })

  it('TODA hunt de grupo inicial abre com a linha legada, nao so a Rota 46', () => {
    // O bug nao era da Rota 46: era de todo mapa cujo `continent` e o grupo
    // aberto — as 120 de bioma inclusive. Contar aqui e o que impede a
    // correcao de valer pra um mapa so.
    const doGrupoAberto = Object.values(MAPS)
      .filter((m) => (GRUPOS_INICIAIS as readonly string[]).includes(m.continent))
    expect(doGrupoAberto.length, 'esperava dezenas de hunts no grupo aberto').toBeGreaterThan(100)
    const trancadas = doGrupoAberto.filter((m) => !grupoLiberado(m.continent, LINHA_SEM_LANCE))
    expect(trancadas.map((m) => m.id)).toEqual([])
  })

  it('o gate que IMPORTA nao afrouxa: o Pesadelo segue fechado pra quem nao venceu o Lance', () => {
    // O risco da correcao e liberar demais. O premio do Lance continua vindo
    // da lista da linha, e nao por definicao.
    for (const grupo of GRUPOS_DO_LANCE) {
      expect(grupoLiberado(grupo, LINHA_SEM_LANCE)).toBe(false)
      expect(grupoLiberado(grupo, LINHA_COM_LANCE)).toBe(true)
    }
  })
})

describe('traducao da carga (a MESMA nos dois caminhos)', () => {
  it('a linha legada vira o vocabulario de hoje, sem perder o Pesadelo', () => {
    const traduzido = traduzirGruposLiberados(LINHA_COM_LANCE)
    for (const grupo of GRUPOS_INICIAIS) expect(traduzido).toContain(grupo)
    for (const grupo of GRUPOS_DO_LANCE) expect(traduzido).toContain(grupo)
    // As faixas saem: nenhuma hunt usa mais esse `continent`, e mante-las
    // deixaria lixo no banco pra sempre.
    expect(traduzido).not.toContain('faixa1')
    expect(traduzido).not.toContain('faixa2')
    expect(traduzido).not.toContain('faixa3')
  })

  it('quem nao venceu o Lance nao ganha o Pesadelo na traducao', () => {
    const traduzido = traduzirGruposLiberados(LINHA_SEM_LANCE)
    for (const grupo of GRUPOS_DO_LANCE) expect(traduzido).not.toContain(grupo)
  })

  it('coluna nula ou vazia ainda abre o mundo', () => {
    // Conta recem-criada por caminho que nao passou pelo default, e o `null`
    // que o PostgREST devolve pra coluna sem valor.
    for (const entrada of [null, undefined, []] as const) {
      const traduzido = traduzirGruposLiberados(entrada)
      for (const grupo of GRUPOS_INICIAIS) expect(traduzido).toContain(grupo)
    }
  })

  it('nao duplica quando a linha JA esta no formato de hoje', () => {
    const traduzido = traduzirGruposLiberados([...GRUPOS_INICIAIS, ...GRUPOS_DO_LANCE])
    expect(traduzido.length).toBe(new Set(traduzido).size)
  })
})
