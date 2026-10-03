// A copia das duracoes em data/duracaoDoVfx.ts tem que bater com o DESENHO.
//
// O motor trava o POKE ate o golpe acabar (02/10) lendo aquela tabela, porque
// nao pode importar render/vfx. Se uma coreografia mudar de duracao e a tabela
// nao, o POKE volta a sair andando com o efeito no meio (tabela curta) ou fica
// parado olhando pro nada (tabela longa) — e nenhum outro teste percebe.
//
// Mede golpe a golpe, pelo MESMO caminho do desenho (`resolverVfx` +
// `duracaoDoTier`), e nao entrada a entrada do registro: assim a regra de tier
// copiada tambem fica coberta.
//
// SEM CRITICO, de proposito: o efeito de golpe nao recebe `isCrit` do motor
// (combatSystem cria o `abilityEffect` sem ele; so o numero de dano recebe),
// entao o "critico sobe um tier" (D7) nunca chega ao desenho no jogo. Se um dia
// chegar, a trava precisa do critico tambem — o segundo caso abaixo avisa.
import { describe, expect, it } from 'vitest'
import { ABILITIES, isDamagingAbility } from '@/data/abilities'
import { DURACAO_DO_VFX, duracaoVisualDoGolpe } from '@/data/duracaoDoVfx'
import { duracaoDoTier } from './desenharVfx'
import { REGISTRO_DE_AREA, REGISTRO_DE_MOTIVO, REGISTRO_SINGLE } from './registro'
import { resolverVfx } from './resolverVfx'

/** A tabela como ela DEVERIA estar — impressa quando o teste falha, pra colar. */
function tabelaDoRegistro() {
  const tab: Record<string, Record<string, Record<number, number>>> = { single: {}, area: {} }
  for (const [nome, registro] of [['single', REGISTRO_SINGLE], ['area', REGISTRO_DE_AREA]] as const) {
    for (const [tipo, porTier] of Object.entries(registro)) {
      tab[nome][tipo] = {}
      for (const [t, e] of Object.entries(porTier ?? {})) {
        if (e) tab[nome][tipo][Number(t)] = duracaoDoTier({ entrada: e, tipo: tipo as never, tier: Number(t) as 1, area: nome === 'area', motivo: null })
      }
    }
  }
  return tab
}

describe('duracao do VFX em dados = duracao do desenho', () => {
  it('tabela igual ao registro (se falhar, cole a tabela impressa em data/duracaoDoVfx.ts)', () => {
    expect(DURACAO_DO_VFX, JSON.stringify(tabelaDoRegistro())).toEqual(tabelaDoRegistro())
  })

  it('registro de motivo vazio — a tabela nao cobre motivo', () => {
    // Se ganhar entrada, `duracaoVisualDoGolpe` precisa aprender motivo antes.
    expect(Object.keys(REGISTRO_DE_MOTIVO)).toEqual([])
  })

  it('todo golpe de dano: a duracao que o motor le e a que o desenho usa', () => {
    const golpes = Object.values(ABILITIES).filter(isDamagingAbility)
    expect(golpes.length).toBeGreaterThan(300) // anti-teste-vacuo
    for (const g of golpes) {
      for (const area of [false, true]) {
        const r = resolverVfx({ abilityId: g.id, area })
        expect(duracaoVisualDoGolpe(g.id, area), `${g.id} area=${area}`).toBe(r ? duracaoDoTier(r) : 0)
      }
    }
  })

  it('golpe de status e desconhecido nao travam nada', () => {
    expect(duracaoVisualDoGolpe('growl', false)).toBe(0)
    expect(duracaoVisualDoGolpe('golpe_que_nao_existe', false)).toBe(0)
  })
})
