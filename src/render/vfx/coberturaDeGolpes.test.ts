// Meta do dono (09/10): todo golpe de dano tem efeito PRÓPRIO. Um golpe está
// coberto quando (a) tem entrada no registro por golpe do seu alvo (single ou
// área) ou (b) é o golpe-vitrine para o qual a coreografia do tipo naquele
// tier foi desenhada. Bullet Punch mantém a sprite original por pedido do dono.
// Golpes que o motor nunca dispara (isDamagingAbility falso) ficam de fora:
// o efeito deles nunca apareceria.
import { describe, expect, it } from 'vitest'
import { ABILITIES, isDamagingAbility } from '@/data/abilities'
import { REGISTRO_POR_GOLPE, REGISTRO_POR_GOLPE_DE_AREA } from './registro'
import { VITRINE_DO_ACO } from './coreografias/aco'
import { VITRINE_DA_AGUA } from './coreografias/agua'
import { VITRINE_DO_DRAGAO } from './coreografias/dragao'
import { VITRINE_DO_ELETRICO } from './coreografias/eletrico'
import { VITRINE_DA_FADA } from './coreografias/fada'
import { VITRINE_DO_FANTASMA } from './coreografias/fantasma'
import { VITRINE_DO_FOGO } from './coreografias/fogo'
import { VITRINE_DO_GELO } from './coreografias/gelo'
import { VITRINE_DA_GRAMA } from './coreografias/grama'
import { VITRINE_DO_INSETO } from './coreografias/inseto'
import { VITRINE_DO_LUTADOR } from './coreografias/lutador'
import { VITRINE_DO_NORMAL } from './coreografias/normal'
import { VITRINE_DO_PSIQUICO } from './coreografias/psiquico'
import { VITRINE_DA_ROCHA } from './coreografias/rocha'
import { VITRINE_DO_SOMBRIO } from './coreografias/sombrio'
import { VITRINE_DA_TERRA } from './coreografias/terra'
import { VITRINE_DO_VENENO } from './coreografias/veneno'
import { VITRINE_DO_VOADOR } from './coreografias/voador'

const VITRINES = [VITRINE_DO_ACO, VITRINE_DA_AGUA, VITRINE_DO_DRAGAO, VITRINE_DO_ELETRICO, VITRINE_DA_FADA,
  VITRINE_DO_FANTASMA, VITRINE_DO_FOGO, VITRINE_DO_GELO, VITRINE_DA_GRAMA, VITRINE_DO_INSETO, VITRINE_DO_LUTADOR,
  VITRINE_DO_NORMAL, VITRINE_DO_PSIQUICO, VITRINE_DA_ROCHA, VITRINE_DO_SOMBRIO, VITRINE_DA_TERRA, VITRINE_DO_VENENO,
  VITRINE_DO_VOADOR]

const vitrinesSingle = new Set(VITRINES.flatMap(v => Object.values(v.single) as string[]))
const vitrinesArea = new Set(VITRINES.flatMap(v => Object.values(v.area) as string[]))
const EXCECOES = new Set(['bullet_punch'])

describe('cobertura: todo golpe de dano tem efeito próprio', () => {
  it('nenhum golpe que o motor dispara fica só com o efeito genérico do tipo', () => {
    const faltando: string[] = []
    for (const [id, g] of Object.entries(ABILITIES)) {
      if (!isDamagingAbility(g) || EXCECOES.has(id)) continue
      const area = g.target !== 'single'
      const proprio = area ? REGISTRO_POR_GOLPE_DE_AREA[id] : REGISTRO_POR_GOLPE[id]
      const vitrine = (area ? vitrinesArea : vitrinesSingle).has(id)
      if (!proprio && !vitrine) faltando.push(`${id}${area ? ' (área)' : ''}`)
    }
    expect(faltando).toEqual([])
  })

  it('nada no registro por golpe aponta pra golpe inexistente ou que não dispara', () => {
    for (const id of [...Object.keys(REGISTRO_POR_GOLPE), ...Object.keys(REGISTRO_POR_GOLPE_DE_AREA)]) {
      expect(isDamagingAbility(ABILITIES[id]), id).toBe(true)
    }
  })
})
