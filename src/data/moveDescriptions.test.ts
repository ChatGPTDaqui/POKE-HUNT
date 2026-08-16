// Cobertura 1:1 entre o catalogo de golpes e as descricoes em portugues.
//
// A falha aqui e MUDA: um golpe sem descricao nao quebra o jogo, so deixa o
// tooltip com um texto generico. Foi assim que a migracao para os dados de
// Pokemon Ultra Sun chegou a este arquivo com 278 golpes sem texto e 15 chaves
// obsoletas — o catalogo saltou de 223 para 486 golpes e nada acusou.
import { describe, it, expect } from 'vitest'
import {
  MOVE_DESCRIPTIONS, golpeTemEfeitoReal, GOLPES_COM_EFEITO_HARDCODED, GOLPES_DE_ESCUDO,
} from './moveDescriptions'
import { ABILITIES_DATA } from './generated/abilities.generated'
import { TYPED_AOE_MOVES } from './typedAoeMoves'
import { BASIC_ATTACK } from './abilities'

describe('descricoes de golpe', () => {
  it('todo golpe do catalogo tem descricao', () => {
    const semTexto = Object.keys(ABILITIES_DATA).filter((id) => !MOVE_DESCRIPTIONS[id])
    expect(semTexto).toEqual([])
  })

  it('nao ha descricao orfa (chave que nao existe mais no catalogo)', () => {
    // Golpes proprios do jogo (Ataque Basico e os 18 de nivel 50) sao descritos
    // por `descricaoDoGolpe` em AbilityTooltip, nao por esta tabela — entao
    // aparecer aqui tambem nao e erro, so redundancia.
    const proprios = new Set([BASIC_ATTACK.id, ...Object.keys(TYPED_AOE_MOVES)])
    const orfas = Object.keys(MOVE_DESCRIPTIONS).filter((id) => !ABILITIES_DATA[id] && !proprios.has(id))
    expect(orfas).toEqual([])
  })

  it('nenhuma descricao esta vazia ou e so o nome do golpe', () => {
    for (const [id, texto] of Object.entries(MOVE_DESCRIPTIONS)) {
      expect(texto.trim().length, id).toBeGreaterThan(10)
    }
  })
})

// BUG REAL corrigido aqui: AVISO_SEM_DANO ("este golpe nao tem efeito nenhum
// aqui") aparecia em TODO golpe de poder 0, mesmo nos que ganharam mecanica de
// verdade na leva de combate (Taunt, Leech Seed, Reflect, ...). Estes testes
// trancam os dois lados do erro: golpe com efeito real nao pode acender o
// aviso, e as listas hardcoded nao podem ter um id que nao existe mais no
// catalogo (typo/renomeacao silenciosa).
describe('golpeTemEfeitoReal — aviso de "sem efeito" so em golpe realmente inerte', () => {
  it('toda chave das listas hardcoded existe no catalogo atual', () => {
    const idsInvalidos = [...GOLPES_COM_EFEITO_HARDCODED, ...GOLPES_DE_ESCUDO]
      .filter((id) => !ABILITIES_DATA[id])
    expect(idsInvalidos).toEqual([])
  })

  it('golpes com status/statChanges/hazard/heal/dreno no catalogo tem efeito real (amostra)', () => {
    expect(golpeTemEfeitoReal({ id: 'thunder_wave', status: 'paralysis' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'growl', statChanges: [{ stat: 'atkFis', estagios: -1 }] })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'spikes', hazard: 'spikes' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'recover', healPercent: 50 })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'absorb', drainPercent: 50 })).toBe(true)
  })

  it('golpes de clima e de escudo tem efeito real', () => {
    expect(golpeTemEfeitoReal({ id: 'rain_dance' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'reflect' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'light_screen' })).toBe(true)
  })

  it('golpes hardcoded (Taunt/Leech Seed/Protect/...) tem efeito real', () => {
    expect(golpeTemEfeitoReal({ id: 'taunt' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'leech_seed' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'protect' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'destiny_bond' })).toBe(true)
    expect(golpeTemEfeitoReal({ id: 'perish_song' })).toBe(true)
  })

  it('golpes genuinamente inertes (sem status/statChanges/id conhecido) continuam sem efeito', () => {
    expect(golpeTemEfeitoReal({ id: 'splash' })).toBe(false)
    expect(golpeTemEfeitoReal({ id: 'transform' })).toBe(false)
    expect(golpeTemEfeitoReal({ id: 'sleep_talk' })).toBe(false)
    expect(golpeTemEfeitoReal({ id: 'rage_powder' })).toBe(false) // no-op estrutural, documentado
    expect(golpeTemEfeitoReal({ id: 'quick_guard' })).toBe(false) // sem prioridade neste motor
  })
})
