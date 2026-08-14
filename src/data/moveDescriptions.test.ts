// Cobertura 1:1 entre o catalogo de golpes e as descricoes em portugues.
//
// A falha aqui e MUDA: um golpe sem descricao nao quebra o jogo, so deixa o
// tooltip com um texto generico. Foi assim que a migracao para os dados de
// Pokemon Ultra Sun chegou a este arquivo com 278 golpes sem texto e 15 chaves
// obsoletas — o catalogo saltou de 223 para 486 golpes e nada acusou.
import { describe, it, expect } from 'vitest'
import { MOVE_DESCRIPTIONS } from './moveDescriptions'
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
