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
import { aplicarMudancasDeStat, aplicarEstagioUnico, fonteDeTrait, limparEstadoVolatil } from './statusSystem'
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
    expect(fontes).toEqual([
      { id: 'swords_dance', tipo: 'golpe', proprio: true, deQuem: NOME('charmander') },
    ])
  })

  it('golpe no OPONENTE anota quem usou, e `proprio` fica falso', () => {
    const ability = getAbility('growl')!
    const atacante = entidade('rattata')
    const alvo = entidade('charmander')
    aplicarMudancasDeStat(SEMPRE, atacante, alvo, ability)

    expect(alvo.estagiosFonte?.atkFis).toEqual([
      { id: 'growl', tipo: 'golpe', proprio: false, deQuem: NOME('rattata') },
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

  it('estagio de volta a ZERO perde a fonte', () => {
    // O selo desaparece da tela; manter a lista faria a proxima mudanca daquele
    // atributo aparecer com o historico de uma situacao que ja passou.
    const alvo = entidade('charmander')
    aplicarEstagioUnico(alvo, 'speed', 2, fonteDeTrait(alvo, 'speed_boost'))
    expect(alvo.estagiosFonte?.speed).toHaveLength(1)

    aplicarEstagioUnico(alvo, 'speed', -2, fonteDeTrait(alvo, 'speed_boost'))
    expect(alvo.estagios.speed).toBe(0)
    expect(alvo.estagiosFonte?.speed).toBeUndefined()
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

  it('fim de luta apaga a procedencia junto com os estagios', () => {
    // Fonte sobrevivendo faria o selo da proxima luta explicar um golpe que
    // aconteceu em outra.
    const alvo = entidade('charmander')
    aplicarMudancasDeStat(SEMPRE, alvo, entidade('rattata'), getAbility('swords_dance')!)
    expect(alvo.estagiosFonte?.atkFis).toBeDefined()

    limparEstadoVolatil(alvo)
    expect(alvo.estagios).toEqual({})
    expect(alvo.estagiosFonte).toBeUndefined()
  })

  it('nenhuma regra de combate le a procedencia', () => {
    // A garantia de que isto e cosmetico: dois POKEs identicos, um com fonte
    // registrada e outro sem, tem o MESMO multiplicador.
    const comFonte = entidade('charmander')
    const semFonte = entidade('charmander')
    aplicarEstagioUnico(comFonte, 'atkFis', 2, fonteDeTrait(comFonte, 'moxie'))
    aplicarEstagioUnico(semFonte, 'atkFis', 2)
    expect(comFonte.estagios.atkFis).toBe(semFonte.estagios.atkFis)
    expect(comFonte.estagiosFonte?.atkFis).toHaveLength(1)
    expect(semFonte.estagiosFonte?.atkFis).toBeUndefined()
  })
})
