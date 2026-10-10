import { describe, expect, it } from 'vitest'
import { DESBLOQUEIO_POR_TELA, passoQueLibera, textoDoRequisito } from './desbloqueios'
import { PRIMEIROS_PASSOS } from './primeirosPassos'

const indice = (id: string) => PRIMEIROS_PASSOS.findIndex(p => p.id === id)

describe('cadeados dos menus', () => {
  it('todo cadeado aponta para um passo que existe', () => {
    for (const [tela, passo] of Object.entries(DESBLOQUEIO_POR_TELA)) expect(indice(passo), tela).toBeGreaterThanOrEqual(0)
  })

  it('nenhum passo pede um menu que ele mesmo (ou um depois dele) destranca', () => {
    for (const [i, p] of PRIMEIROS_PASSOS.entries()) {
      const libera = p.destino ? passoQueLibera(p.destino) : null
      if (libera) expect(indice(libera), `${p.id} pede ${p.destino}`).toBeLessThan(i)
    }
  })

  it('Equipe, Mochila, Hunt e Loja nunca ficam trancadas', () => {
    for (const tela of ['equipe', 'mochila', 'hunts', 'loja', 'pokedex', 'social', 'wiki', 'tutoriais', 'config']) {
      expect(passoQueLibera(tela), tela).toBeNull()
    }
  })

  it('o requisito diz o número e a tarefa do passo', () => {
    expect(textoDoRequisito('equipe_de_dois')).toBe('Abre ao concluir o Passo 4: Coloque um 2º POKE na Equipe.')
    expect(textoDoRequisito('equipe_de_dois', true)).toBe('Passo 4')
  })
})
