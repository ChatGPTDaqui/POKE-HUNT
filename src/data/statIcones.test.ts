// PH-121 — cada atributo tem identidade visual PROPRIA.
//
// O defeito era exatamente este: o selo usava `statusVfxUrl(tipo do POKE,
// direcao)`, entao Ataque caindo e Velocidade caindo desenhavam a mesma coisa.
// Trocar por icone nao resolve nada se dois atributos acabarem com o mesmo
// icone — e com sete entradas escritas a mao, e o erro mais facil de cometer
// (Defesa e Def. Esp. sao os dois candidatos obvios a virarem o mesmo escudo).
import { describe, expect, it } from 'vitest'

import { ICONE_DE_ESTAGIO } from './statIcones'
import { ROTULO_ESTAGIO } from './statLabels'
import type { StatDeEstagio } from './statusEffects'

const STATS = Object.keys(ROTULO_ESTAGIO) as StatDeEstagio[]

describe('icone por atributo (PH-121)', () => {
  it('todo atributo que tem rotulo tem icone', () => {
    // `ROTULO_ESTAGIO` e a lista canonica (a tela ja itera por ela). Um atributo
    // novo entra ali e este teste cobra o icone, sem ninguem lembrar.
    expect(STATS.length).toBeGreaterThan(0)
    for (const stat of STATS) {
      expect(ICONE_DE_ESTAGIO[stat], `sem icone para ${stat}`).toBeDefined()
    }
  })

  it('nenhum icone e reusado entre dois atributos', () => {
    const vistos = new Map<unknown, StatDeEstagio>()
    for (const stat of STATS) {
      const icone = ICONE_DE_ESTAGIO[stat]
      const anterior = vistos.get(icone)
      expect(
        anterior,
        `${stat} e ${anterior} compartilham o mesmo icone — e o defeito que o PH-121 conserta`,
      ).toBeUndefined()
      vistos.set(icone, stat)
    }
  })

  it('nao sobra icone para atributo que nao existe', () => {
    // Guarda contra o inverso: chave orfa aqui e icone que nunca aparece, e
    // ninguem descobre olhando a tela.
    expect(Object.keys(ICONE_DE_ESTAGIO).sort()).toEqual([...STATS].sort())
  })
})
