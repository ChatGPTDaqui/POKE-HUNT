// PH-205 — o protetor da sala captura com METADE da chance, e nunca com zero.
//
// POR QUE ISTO IMPORTA
//
// O protetor (Guardian nas salas 1-9, Lord na 10) e o unico inimigo que aparece
// UMA VEZ por sala e que precisa cair pra a sala avancar. Ele nasce no teto de
// nivel da faixa e com IV 20-31 (`rollIvsDoProtetor`) — atributos que selvagem
// nenhum tem. Capturado na chance de um mob comum, o premio do ciclo de 10
// salas seria a coisa mais barata da hunt.
//
// O CAMINHO E O MESMO DO CLIENTE E DO SERVIDOR: a reducao mora no motor
// (`captureSystem`), que os dois lados carregam via `#engine`. Nao ha um numero
// no cliente e outro na RPC pra divergirem — a classe de bug que ja custou a
// PH-247 (Clefairy pedindo Pedra de Fada na tela e Pedra Normal no servidor).
import { describe, expect, it } from 'vitest'
import {
  catchChance,
  MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR,
  CHANCE_MINIMA_DE_CAPTURA_DO_PROTETOR,
} from './captureSystem'
import { SPECIES } from '@/data/pokes'
import { getItem } from '@/data/items'

/** As bolas reais do jogo, pra o teste nao medir multiplicador inventado. */
const BOLAS = ['poke_ball', 'great_ball', 'ultra_ball'].map((id) => {
  const item = getItem(id)
  // `AnyItem` e `GeneratedItem | StoneItem`, e `kind` e `ItemKind` (uniao larga)
  // em vez de literal — entao `Extract` nao estreita e o `captureRate` nao
  // aparece no tipo. Mesma forma que `attemptCapture` usa: conferir `kind` e
  // ler o campo opcional. As duas linhas de `expect` sao afirmacoes de verdade
  // do teste: se um id de bola virar outra coisa no catalogo, isto reprova em
  // vez de medir `undefined`.
  expect(item?.kind, `${id} deixou de ser bola no catalogo`).toBe('ball')
  const { captureRate } = item as { captureRate?: number }
  expect(captureRate, `${id} sem captureRate — o catalogo mudou`).toBeGreaterThan(0)
  return { id, mult: captureRate! }
})

/** Espécies reais cobrindo a faixa inteira de `catchRate`. */
const ESPECIES = Object.values(SPECIES)
const TAXAS = [...new Set(ESPECIES.map((s) => s.catchRate))].sort((a, b) => a - b)

describe('a bancada mede especies e bolas de verdade', () => {
  it('achou bolas e uma faixa larga de catchRate', () => {
    expect(BOLAS.length).toBe(3)
    expect(TAXAS.length).toBeGreaterThan(3)
    expect(TAXAS[0]).toBeLessThan(20)
    expect(TAXAS[TAXAS.length - 1]).toBeGreaterThan(150)
  })
})

describe('captura do protetor (PH-205)', () => {
  it('o multiplicador e 0,5 — meio, nao um terco', () => {
    // Numero medido, nao escolhido: um terco leva a especie de catchRate 3 a
    // 0,6% com uma tentativa por ciclo de 10 salas, o que le como "nao da pra
    // capturar" — exatamente o que a issue proibe.
    expect(MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR).toBe(0.5)
  })

  it('protetor e SEMPRE mais dificil que o mesmo POKE comum', () => {
    for (const taxa of TAXAS) {
      for (const bola of BOLAS) {
        const normal = catchChance(taxa, bola.mult, 100, 100, false)
        const protetor = catchChance(taxa, bola.mult, 100, 100, true)
        expect(
          protetor,
          `catchRate ${taxa} com ${bola.id}: protetor ${protetor} nao e menor que o normal ${normal}`,
        ).toBeLessThan(normal)
      }
    }
  })

  it('mas NUNCA impossivel — chance > 0 em toda combinacao', () => {
    // O criterio explicito da issue. Sem ele, "reduzida" vira "proibida" no
    // canto mais raro do catalogo e ninguem percebe.
    for (const taxa of TAXAS) {
      for (const bola of BOLAS) {
        const c = catchChance(taxa, bola.mult, 100, 100, true)
        expect(c, `catchRate ${taxa} com ${bola.id} zerou`).toBeGreaterThan(0)
        expect(c).toBeGreaterThanOrEqual(CHANCE_MINIMA_DE_CAPTURA_DO_PROTETOR)
      }
    }
  })

  it('a reducao entra na TAXA, nao no resultado — a cadeia da Gen VII nao e linear', () => {
    // Se alguem "simplificar" pra `chance * 0.5`, este caso reprova. E a
    // diferenca importa: `CATCH_SHAKE_PROBABILITY` tira raiz e `CATCH_CHANCE`
    // eleva a potencia, entao metade da taxa NAO e metade da chance.
    const normal = catchChance(190, 1, 100, 100, false)
    const protetor = catchChance(190, 1, 100, 100, true)
    expect(
      protetor,
      'a chance do protetor ficou exatamente na metade da normal — sinal de que a reducao '
      + 'foi aplicada no resultado final em vez de na taxa modificada',
    ).not.toBeCloseTo(normal * MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR, 6)
    // E o efeito real fica ENTRE a metade e o valor cheio, sempre.
    expect(protetor).toBeGreaterThan(normal * MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR)
    expect(protetor).toBeLessThan(normal)
  })

  it('sem a flag, nada muda pro resto do jogo', () => {
    // Guarda de regressao: o valor padrao nao pode alterar a captura comum, que
    // e o caso de 99,9% dos abates.
    for (const taxa of TAXAS) {
      expect(catchChance(taxa, 1, 100, 100)).toBe(catchChance(taxa, 1, 100, 100, false))
    }
  })

  it('os numeros da tabela do comentario batem com a implementacao', () => {
    // O comentario de `MULTIPLICADOR_DE_CAPTURA_DO_PROTETOR` publica a medicao
    // que justifica o 0,5. Comentario que mente e pior que comentario nenhum.
    const pct = (taxa: number, bola: string, protetor: boolean) => {
      const b = BOLAS.find((x) => x.id === bola)!
      return Number((catchChance(taxa, b.mult, 100, 100, protetor) * 100).toFixed(1))
    }
    expect(pct(255, 'ultra_ball', false)).toBe(20.9)
    expect(pct(255, 'ultra_ball', true)).toBe(14.1)
    expect(pct(190, 'poke_ball', false)).toBe(12.0)
    expect(pct(190, 'poke_ball', true)).toBe(8.1)
    expect(pct(45, 'poke_ball', false)).toBe(5.3)
    expect(pct(45, 'poke_ball', true)).toBe(3.6)
    expect(pct(3, 'poke_ball', true)).toBe(0.8)
  })
})
