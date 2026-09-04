// PH-494: uma chave que este jogo não conhece NUNCA entra em `autoToggles` e
// NUNCA sai pro servidor.
//
// O DEFEITO, e ele esteve em produção com número: a PH-493 tirou
// `avancoManualDeSala` do cliente e da lista branca de `configurar_auto`, mas a
// chave continuou dentro do jsonb `auto_toggles` de todo jogador que já
// existia — ela esteve no default desde a PH-177, e nada apaga chave de jsonb.
//
// O caminho de volta fechava o círculo sozinho:
//
//   banco  --(playerMapper espalha o jsonb inteiro)-->  store
//   store  --(sincronizarAuto manda `autoToggles` cru)-->  RPC
//   RPC    --(lista branca + `raise`)-->  TRANSAÇÃO INTEIRA ABORTADA
//
// E o `raise` não derruba só o toggle: leva junto bola, regras de poção, regras
// por espécie, itens de cura e auto-venda. **Nenhuma configuração de auto era
// gravada.** Medido no log de produção nas ~9h seguintes à promoção: 1.079
// chamadas reprovadas, todas com `toggle desconhecido: avancoManualDeSala`.
//
// É a PH-492 pela porta oposta. Lá faltava a chave no SQL; aqui sobrava a chave
// no cliente. `togglesDeAutoBatemComORpc.test.ts` amarra o default ao SQL e
// passou verde o tempo todo — ele nunca poderia pegar isto, porque o que vazava
// não era o default, era o que voltava do banco.
import { describe, expect, it } from 'vitest'

import { defaultGameStateData, sanearAutoToggles, CHAVES_DE_AUTO_TOGGLE } from './gameStateDefaults'

/** A chave que causou o incidente. Literal de propósito: ela não existe mais em lugar nenhum do código. */
const ORFA = 'avancoManualDeSala'

describe('chave órfã não entra em autoToggles (PH-494)', () => {
  it('a chave do incidente foi mesmo removida do jogo — guarda anti-vácuo', () => {
    // Sem isto, se alguém reintroduzisse `avancoManualDeSala` no default, os
    // casos abaixo passariam a testar o oposto do que dizem testar.
    expect(CHAVES_DE_AUTO_TOGGLE()).not.toContain(ORFA)
  })

  it('o jsonb do banco COM a chave órfã entra no jogo SEM ela', () => {
    // O formato exato de uma linha real de produção, conferida no banco.
    const doBanco = {
      autoPot: true, autoCatch: true, autoRevive: true, autoStatus: true,
      recuarSePerder: false, avancarDeEstagio: false,
      [ORFA]: true,
    }
    const limpo = sanearAutoToggles(doBanco)
    expect(Object.keys(limpo)).not.toContain(ORFA)
    expect(limpo.autoCatch, 'o filtro comeu um valor legítimo').toBe(true)
    expect(limpo.autoPot).toBe(true)
  })

  it('chave que FALTA no banco cai no default do jogo, e não em `false`', () => {
    // É o motivo de o merge com o default existir desde antes (ver
    // `playerMapper`): `autoStatus` nasce LIGADO, e uma linha gravada antes de
    // ele existir voltaria `undefined`. Trocar o merge por um filtro cru
    // desligaria a automação de todo jogador antigo, em silêncio.
    const antigo = { autoPot: false }
    const limpo = sanearAutoToggles(antigo)
    expect(limpo.autoStatus, 'autoStatus nasce ligado').toBe(defaultGameStateData().autoToggles.autoStatus)
    expect(limpo.autoPot, 'o valor gravado tem que ganhar do default').toBe(false)
  })

  it('valor com TIPO errado cai no default, e não é convertido', () => {
    // `"false"` (string) é truthy: um `!!valor` viraria `true` e ligaria uma
    // automação que o jogador desligou. `null` viraria `false` e desligaria uma
    // que nasce ligada. Os dois são piores que cair no default.
    const torto = { autoPot: 'false', autoStatus: null, autoCatch: 1 } as unknown
    const limpo = sanearAutoToggles(torto)
    const padrao = defaultGameStateData().autoToggles
    expect(limpo.autoPot).toBe(padrao.autoPot)
    expect(limpo.autoStatus).toBe(padrao.autoStatus)
    expect(limpo.autoCatch).toBe(padrao.autoCatch)
  })

  it('jsonb nulo ou corrompido devolve o default inteiro', () => {
    expect(sanearAutoToggles(null)).toEqual(defaultGameStateData().autoToggles)
    expect(sanearAutoToggles('nao sou objeto')).toEqual(defaultGameStateData().autoToggles)
  })

  it('a saída tem EXATAMENTE as chaves do jogo — nem a mais, nem a menos', () => {
    // A RPC valida por lista branca com `raise`. Chave a mais aborta a
    // transação (o incidente); chave a menos deixa o servidor com o valor
    // antigo, sem ninguém ver.
    const limpo = sanearAutoToggles({ [ORFA]: true, inventada: false })
    expect(Object.keys(limpo).sort()).toEqual([...CHAVES_DE_AUTO_TOGGLE()].sort())
  })
})

// A FIAÇÃO, e não só a função. `sanearAutoToggles` passar sozinho não prova
// nada: a versão quebrada tinha o filtro em lugar nenhum e os 195 casos de
// `src/data/remote` continuavam verdes. Conferido — desfazer a correção no
// `playerMapper` não deixava um único teste vermelho, que é exatamente como o
// defeito chegou em produção.
describe('a fiação: o mapper e a sincronização usam o filtro (PH-494)', () => {
  it('snapshotToGameState nao deixa a chave orfa entrar no estado do jogo', async () => {
    const { snapshotToGameState } = await import('@/data/remote/playerMapper')
    const snap = {
      player: {
        user_id: 'u1', active_team_index: 0, gold: 0, diamonds: 0,
        current_map_id: null, unlocked_maps: [], unlocked_continents: [],
        // A linha REAL de produção, com a chave órfã dentro.
        auto_toggles: {
          autoPot: true, autoCatch: true, autoRevive: true, autoStatus: true,
          recuarSePerder: false, avancarDeEstagio: false, [ORFA]: true,
        },
        auto_pot_rules: null, auto_catch_config: null, auto_sell_config: null,
        auto_status_config: null, perf_stats: null,
        trainer_name: 'Treinador', trainer_level: 1, trainer_exp: 0,
        bioma_progress: null, updated_at: '',
      },
      pokemon: [], items: [], pokedex: [],
      autoCatchRules: [], missoesReivindicadas: [], especialidades: [],
    } as never

    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(
      Object.keys(estado.autoToggles),
      'a chave órfã entrou no estado — daqui ela volta pro servidor e derruba o batch inteiro',
    ).not.toContain(ORFA)
    // E os valores gravados sobrevivem ao filtro: sem isto, um `sanear` que
    // devolvesse o default puro passaria neste caso e apagaria a configuração
    // do jogador em toda leitura.
    expect(estado.autoToggles.autoCatch).toBe(true)
    expect(estado.autoToggles.autoRevive).toBe(true)
  })
})
