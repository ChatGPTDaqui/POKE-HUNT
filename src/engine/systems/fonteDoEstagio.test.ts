// PH-121 — de onde veio cada estagio de atributo.
//
// `estagios` guardava so QUANTOS degraus. O selo do HUD dizia "Ataque −2" e mais
// nada, e "de quem" e a metade util: baixar o proprio Ataque (Hammer Arm) e
// levar Rosnado de um Rattata sao situacoes diferentes, e a tela mostrava as
// duas igual. A informacao existe SO no instante em que o estagio e aplicado —
// depois do hit, `estagios` e um numero solto —, entao ou e anotada ali ou nao
// existe.
//
// O que estes testes trancam nao e o texto do selo: e a COBERTURA dos pontos de
// escrita. `estagios` e mexido em seis lugares (golpe, trait de reacao, hook de
// entrada, Belly Drum, Acupressure, Guard Swap) e cada um que esquecer de anotar
// vira um selo sem origem, em silencio.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { getAbility } from '@/data/abilities'
import { aplicarMudancasDeStat, aplicarEstagioUnico, fonteDeTrait, limparEstadoVolatil, tickStatus } from './statusSystem'
import { DURACAO_DE_ESTAGIO_SEGUNDOS, multiplicadorDeEstagio } from '@/data/statusEffects'
import type { WorldEntity } from '../types'

/** Entidade minima: so o que `aplicarMudancasDeStat` toca. */
function entidade(speciesId: string): WorldEntity {
  return {
    id: `e-${speciesId}`,
    poke: createPokeInstance(createRng(5), speciesId, 40),
    estagios: {},
  } as unknown as WorldEntity
}

/** Rng que sempre aprova o sorteio de `statChance`. */
const SEMPRE = { nextFloat: () => 0 } as never

const NOME = (id: string) => SPECIES[id]!.name

describe('procedencia do estagio de atributo (PH-121)', () => {
  it('golpe no PROPRIO usuario anota o golpe e marca `proprio`', () => {
    // Danca das Espadas: `statTarget: 'self'`, +2 em Ataque Fisico.
    const ability = getAbility('swords_dance')!
    expect(ability.statChanges?.length, 'swords_dance sem statChanges no catalogo').toBeGreaterThan(0)

    const usuario = entidade('charmander')
    aplicarMudancasDeStat(SEMPRE, usuario, entidade('rattata'), ability)

    const fontes = usuario.estagiosFonte?.atkFis
    expect(fontes, 'estagio aplicado sem procedencia nenhuma').toBeDefined()
    // PH-418: a fonte carrega tambem QUANTO ela vale e QUANTO tempo dura — sem
    // os dois campos o total nao seria derivavel dela, e o total e derivado dela.
    expect(fontes).toEqual([
      {
        id: 'swords_dance', tipo: 'golpe', proprio: true, deQuem: NOME('charmander'),
        estagios: 2, expiraEm: DURACAO_DE_ESTAGIO_SEGUNDOS,
      },
    ])
  })

  it('golpe no OPONENTE anota quem usou, e `proprio` fica falso', () => {
    const ability = getAbility('growl')!
    const atacante = entidade('rattata')
    const alvo = entidade('charmander')
    aplicarMudancasDeStat(SEMPRE, atacante, alvo, ability)

    expect(alvo.estagiosFonte?.atkFis).toEqual([
      {
        id: 'growl', tipo: 'golpe', proprio: false, deQuem: NOME('rattata'),
        estagios: -1, expiraEm: DURACAO_DE_ESTAGIO_SEGUNDOS,
      },
    ])
    // E nao suja o atacante: ele nao teve estagio nenhum.
    expect(atacante.estagiosFonte).toBeUndefined()
  })

  it('duas fontes no MESMO atributo ficam as DUAS', () => {
    // A decisao de desenho desta issue: sobrescrever com a ultima apagaria
    // metade da resposta. "Ataque +1" pode ser Danca das Espadas (+2) mais um
    // Rosnado (−1), e as duas linhas explicam o numero.
    const alvo = entidade('charmander')
    aplicarMudancasDeStat(SEMPRE, alvo, entidade('rattata'), getAbility('swords_dance')!)
    aplicarMudancasDeStat(SEMPRE, entidade('rattata'), alvo, getAbility('growl')!)

    const ids = (alvo.estagiosFonte?.atkFis ?? []).map((f) => f.id)
    expect(ids).toEqual(['swords_dance', 'growl'])
    expect(alvo.estagios.atkFis, 'os estagios tem que ter somado: +2 e −1').toBe(1)
  })

  it('o mesmo golpe repetido NAO duplica a lista', () => {
    // Sem dedup a lista cresceria sem teto numa entidade que vive a luta toda.
    const usuario = entidade('charmander')
    for (let i = 0; i < 5; i++) {
      aplicarMudancasDeStat(SEMPRE, usuario, entidade('rattata'), getAbility('swords_dance')!)
    }
    expect(usuario.estagiosFonte?.atkFis).toHaveLength(1)
  })

  it('total ZERO por cancelamento NAO apaga as fontes — quem esvazia a lista e o prazo', () => {
    // ESTE TESTE FOI INVERTIDO NA PH-418, de proposito. Antes, total zero apagava
    // a lista; com o total DERIVADO das fontes isso passou a ser errado, porque
    // zero quase nunca e "acabou" — e cancelamento. Um Rosnado -1 sobre um Howl
    // +1 da zero com as DUAS fontes vivas e prazos proprios, e quando o Rosnado
    // vence o Howl volta a valer. Apagar no zero mataria essa volta, e o sintoma
    // seria um buff que desaparece porque o inimigo debuffou na mesma hora, sem
    // nada na tela explicando.
    const alvo = entidade('charmander')
    aplicarEstagioUnico(alvo, 'atkFis', 1, { id: 'howl', tipo: 'golpe', proprio: true, deQuem: NOME('charmander') })
    aplicarEstagioUnico(alvo, 'atkFis', -1, { id: 'growl', tipo: 'golpe', proprio: false, deQuem: NOME('rattata') })

    expect(alvo.estagios.atkFis, 'cancelou: sai do cache').toBeUndefined()
    expect(alvo.estagiosFonte?.atkFis, 'as duas fontes seguem vivas').toHaveLength(2)

    // E o tempo, nao o total, que esvazia a lista.
    tickStatus(SEMPRE, alvo, DURACAO_DE_ESTAGIO_SEGUNDOS, null)
    expect(alvo.estagiosFonte?.atkFis, 'prazo vencido esvazia a chave').toBeUndefined()
    expect(alvo.estagios.atkFis).toBeUndefined()
  })

  it('fonte de trait no PROPRIO dono marca `proprio`', () => {
    const dono = entidade('charmander')
    expect(fonteDeTrait(dono, 'speed_boost')).toEqual({
      id: 'speed_boost', tipo: 'trait', proprio: true, deQuem: NOME('charmander'),
    })
  })

  it('Intimidate e a excecao: trait de um, estagio no outro', () => {
    // O caso que obriga `fonteDeTrait` a receber dono E destino. Se ela assumisse
    // "o destino e o dono", o selo do jogador diria que ELE tem Intimidate.
    const dono = entidade('gyarados')
    const vitima = entidade('charmander')
    expect(fonteDeTrait(dono, 'intimidate', vitima)).toEqual({
      id: 'intimidate', tipo: 'trait', proprio: false, deQuem: NOME('gyarados'),
    })
  })

  it('trait sem id nao inventa fonte', () => {
    expect(fonteDeTrait(entidade('charmander'), null)).toBeUndefined()
    expect(fonteDeTrait(entidade('charmander'), undefined)).toBeUndefined()
  })

  it('fim de luta apaga a procedencia DE TERCEIRO, e deixa a propria', () => {
    // PH-418: quem decide o corte e o campo `proprio` da fonte. O selo da luta
    // seguinte nao pode explicar um Rosnado de outra luta (por isso o de terceiro
    // sai), mas a Danca das Espadas que o POKE usou nele mesmo tem prazo de 18s e
    // o "fim de batalha" deste motor acontece no vao entre dois spawns — cortar
    // ali era o que matava o buff em cerca de um segundo.
    const alvo = entidade('charmander')
    aplicarMudancasDeStat(SEMPRE, alvo, entidade('rattata'), getAbility('swords_dance')!)
    aplicarMudancasDeStat(SEMPRE, entidade('rattata'), alvo, getAbility('growl')!)
    expect(alvo.estagios.atkFis, '+2 propria e -1 de terceiro').toBe(1)

    limparEstadoVolatil(alvo)

    expect(alvo.estagios).toEqual({ atkFis: 2 })
    expect((alvo.estagiosFonte?.atkFis ?? []).map((f) => f.id)).toEqual(['swords_dance'])
  })

  it('estagio SEM fonte deixou de ser possivel, e a procedencia deixou de ser cosmetica', () => {
    // A PH-121 garantia o CONTRARIO: procedencia era enfeite de HUD e nenhuma
    // regra a lia. A PH-418 mudou isso na raiz, e o teste tem que dizer a verdade
    // nova, senao ele passa a mentir sobre a arquitetura — `estagios` e CACHE de
    // `estagiosFonte`, e quem nao registra fonte nao aplica estagio.
    //
    // Por isso `aplicarEstagioUnico` sem fonte inventa uma anonima em vez de
    // escrever solto: estagio sem fonte seria estagio sem PRAZO, ou seja eterno —
    // o defeito exato que esta issue conserta.
    const comFonte = entidade('charmander')
    const semFonte = entidade('charmander')
    aplicarEstagioUnico(comFonte, 'atkFis', 2, fonteDeTrait(comFonte, 'moxie'))
    aplicarEstagioUnico(semFonte, 'atkFis', 2)

    expect(comFonte.estagios.atkFis).toBe(semFonte.estagios.atkFis)
    expect(multiplicadorDeEstagio(comFonte.estagios.atkFis ?? 0))
      .toBe(multiplicadorDeEstagio(semFonte.estagios.atkFis ?? 0))
    expect(comFonte.estagiosFonte?.atkFis).toHaveLength(1)
    expect(semFonte.estagiosFonte?.atkFis, 'fonte anonima, mas fonte').toHaveLength(1)
    expect(semFonte.estagiosFonte?.atkFis?.[0].expiraEm).toBe(DURACAO_DE_ESTAGIO_SEGUNDOS)
  })
})
