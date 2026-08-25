// PH-92 — o POKE capturado tem que sair com os stats da natureza DELE.
//
// O defeito era uma omissao, nao um erro: `attemptCapture` recalculava os stats
// para o Nivel 1 sem passar o 6o argumento de `computeStatsAtLevel`. O POKE
// herdava a natureza pelo spread, entao a linha ia pro banco com natureza na
// ficha e numeros que a ignoram — nada nulo, nada de excecao, so 74% do banco
// de producao com stat errado.
//
// Por isso ha dois testes aqui, e o segundo importa mais:
//   1. o caso — capturar com natureza nao-neutra da os numeros certos
//   2. a CLASSE — nenhum call site que monte POKE persistido pode omitir a
//      natureza. E a omissao que volta, nao este call site especifico.
import { describe, expect, it, beforeEach } from 'vitest'
import { SPECIES, computeStatsAtLevel, createPokeInstance, type PokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { useGameStateStore } from '@/stores/gameStateStore'
import { attemptCapture } from './captureSystem'

/** Natureza que sobe ataque fisico e desce defesa — os dois lados observaveis. */
const NATUREZA = 'lonely'

function selvagemComNatureza(speciesId: string, nature: string): PokeInstance {
  const poke = createPokeInstance(createRng(1), speciesId, 12, { nature: nature as PokeInstance['nature'] })
  // HP baixo pra captura ser provavel; o roll ainda depende do rng.
  return { ...poke, hp: 1 }
}

describe('captura preserva a natureza nos stats (PH-92)', () => {
  beforeEach(() => {
    useGameStateStore.setState({ items: { poke_ball: 99 } } as never, false)
  })

  it('POKE capturado sai com os stats da natureza dele, nao sem natureza', () => {
    const gameState = useGameStateStore.getState()
    const selvagem = selvagemComNatureza('rattata', NATUREZA)

    // rng fixo com HP 1 e Poke Ball: a chance fica alta o bastante pra capturar.
    let resultado = attemptCapture(createRng(7), gameState, selvagem, 'poke_ball')
    for (let i = 8; !resultado.success && i < 60; i++) {
      resultado = attemptCapture(createRng(i), useGameStateStore.getState(), selvagem, 'poke_ball')
    }
    expect(resultado.success, 'nenhuma das tentativas capturou — ajustar o rng do teste').toBe(true)
    if (!resultado.success) return

    const capturado = resultado.poke
    const especie = SPECIES[selvagem.speciesId]
    const comNatureza = computeStatsAtLevel(especie, 1, selvagem.ivs, selvagem.rarity, selvagem.isShiny, NATUREZA)
    const semNatureza = computeStatsAtLevel(especie, 1, selvagem.ivs, selvagem.rarity, selvagem.isShiny, null)

    // Guarda contra teste vazio: se a natureza escolhida nao mudar nada nesta
    // especie, o caso passaria sem provar coisa alguma.
    expect(comNatureza, `${NATUREZA} nao altera os stats de ${selvagem.speciesId}`).not.toEqual(semNatureza)

    expect(capturado.nature).toBe(NATUREZA)
    expect(capturado.stats).toEqual(comNatureza)
    expect(capturado.hp).toBe(comNatureza.hp)
  })

  it('nenhum call site que monta POKE persistido omite a natureza', () => {
    // Le o codigo-fonte em vez de exercitar cada caminho: o que se quer travar
    // e a FORMA da chamada. Um call site novo entra sem teste proprio; este
    // pega. `import.meta.glob` com `?raw` e do Vite — evita `node:fs`, que nao
    // tem tipos aqui em `src/` (codigo de browser).
    const fontes = import.meta.glob('../../{engine,data}/**/*.ts', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>

    const semNatureza: string[] = []
    for (const [caminho, texto] of Object.entries(fontes)) {
      if (caminho.includes('.test.')) continue
      // A definicao da propria funcao nao e call site.
      const corpo = texto.replace(/export function computeStatsAtLevel\([^)]*\)/g, '')
      for (const m of corpo.matchAll(/computeStatsAtLevel\(([\s\S]{0,240}?)\)/g)) {
        const args = m[1]
        // A chamada precisa mencionar natureza de algum jeito — `nature`,
        // `poke.nature`, ou a variavel `nature` da propria funcao.
        if (!/nature/i.test(args)) {
          semNatureza.push(`${caminho}: computeStatsAtLevel(${args.replace(/\s+/g, ' ').trim().slice(0, 60)}…`)
        }
      }
    }
    // Guarda contra o glob nao casar nada e o teste passar por vacuidade.
    expect(Object.keys(fontes).length, 'glob nao achou fonte nenhuma').toBeGreaterThan(20)
    expect(semNatureza, 'call site montando POKE sem passar natureza').toEqual([])
  })
})
