// PH-158 / PH-159 — o painel de novidades nao pode prometer que o POKE ja
// salvo mantem golpe que saiu do learnset.
//
// A 7.11 prometeu exatamente isso ("Quem ja tem um deles NAO perde nada — os
// golpes ficam") e era falso. `src/data/remote/playerMapper.ts` deriva
// `unlockedAbilities` de (especie, nivel) em TODA carga e ignora a coluna
// gravada — por bom motivo: e o que impediu todo save de quebrar quando 15
// chaves de golpe trocaram de grafia na migracao para Ultra Sun. O efeito
// colateral e que tirar golpe do learnset alcanca o POKE salvo tambem.
//
// A frase foi escrita pra TRANQUILIZAR, e por isso errar ali custou mais que
// uma imprecisao: quem leu "nao perde nada" e viu a build trocada nao conclui
// que a nota estava errada — conclui que o jogo bugou o POKE dele.
//
// Este arquivo e um alarme, nao uma prova: ele guarda a promessa especifica que
// ja foi feita e desmentida. A prova de que o comportamento e esse esta em
// `golpesAprendidosAte`, exercitada abaixo com um caso real.
import { describe, expect, it } from 'vitest'

import { PATCH_NOTES, sortedPatchNotes } from './patchNotes'
import { SPECIES } from './pokes'
import { golpesAprendidosAte } from './activeAbilities'

describe('nota nao promete golpe intacto em POKE salvo (PH-158)', () => {
  it('ha notas para inspecionar', () => {
    // Anti-vacuo: com a lista vazia, todo `expect` abaixo passa medindo nada.
    expect(PATCH_NOTES.length).toBeGreaterThan(5)
  })

  it('nenhuma linha diz que quem ja tem o POKE nao perde nada', () => {
    const promessas: string[] = []
    for (const nota of PATCH_NOTES) {
      for (const linha of nota.highlights) {
        // As duas metades da frase original. Casar so "NAO perde nada" deixaria
        // passar a variante "os golpes ficam", que diz o mesmo.
        if (/n[aã]o perde nada/i.test(linha) || /os golpes ficam/i.test(linha)) {
          promessas.push(`${nota.version}: ${linha.slice(0, 90)}`)
        }
      }
    }
    expect(
      promessas,
      'nota de versao prometendo que o POKE ja capturado mantem os golpes. Ele NAO mantem: '
      + '`unlockedAbilities` e recalculado de (especie, nivel) em toda carga, entao golpe que sai '
      + 'do learnset sai do save junto. Diga o que acontece, nao o que tranquiliza.',
    ).toEqual([])
  })

  it('e o comportamento e esse mesmo — Jolteon de Nivel 80 nao conhece mais Tackle', () => {
    // O caso que desmentiu a 7.11, preso aqui pra ninguem "corrigir" a nota de
    // volta achando que a promessa era verdadeira.
    const conhecidos = golpesAprendidosAte(SPECIES.jolteon!, 80)
    expect(conhecidos.length).toBeGreaterThan(5) // anti-vacuo
    expect(conhecidos).not.toContain('tackle')
    expect(conhecidos).not.toContain('tail_whip')
    expect(conhecidos).not.toContain('helping_hand')
  })

  it('a nota mais recente e a 7.12, no topo do painel', () => {
    // O painel (`SettingsScreen`) renderiza `sortedPatchNotes()` na ordem que
    // ela devolve — checar aqui e o equivalente testavel de "abri a aba e a
    // entrada nova estava em cima".
    const topo = sortedPatchNotes()[0]!
    expect(topo.version).toBe('7.12')
    expect(topo.highlights.length).toBeGreaterThan(4)
  })
})
