// PH-232 — a particula tem que ter o tamanho da COISA que ela representa.
//
// O QUE ESTE TESTE TRANCA
//
// O sintoma que abriu a issue foi "os efeitos parecem polen": bolinhas grandes
// espalhadas pela tela em quase todo bioma. A causa nao era a forma, era a
// ESCALA — os raios eram numeros soltos, sem nada com que compara-los, e todos
// caiam na mesma faixa. Medido contra a altura de um POKE (40 unidades de
// mundo, ver `escalaDoMundo.ts`), a poeira de caverna chegava a 24% e o floco
// de neve a 30%.
//
// Nenhum teste existente pega isso. `formaPorPreset.test.ts` afirma que a
// silhueta e propria; `ambiente.test.ts` afirma que toda arte tem preset.
// Tamanho errado passa nos dois — e passou, por tres issues seguidas.
//
// POR QUE LER A RECEITA, E NAO O DESENHO
//
// A receita e a unica coisa que alguem edita a mao quando quer "aumentar um
// pouquinho". Rodar a camada e medir o que saiu no `ctx` provaria a mesma
// coisa por um caminho mais longo e mais fragil (a particula reciclada, o
// pulso da faisca, o crescimento do anel — tudo isso mexe no raio DEPOIS do
// nascimento). O numero que o proximo dev vai mexer e o da receita, e e nele
// que a trava tem que estar.
import { describe, expect, it } from 'vitest'

import {
  ALTURA_DE_POKE, RAZAO_MINIMA_DE_RISCO,
  TETO_DO_CORPO_DE_AMBIENTE, TETO_DO_CORPO_DE_CLIMA,
} from './escalaDoMundo'
import { RECEITAS as AMBIENTE, RISCO_SEGUNDOS } from './ambiente'
import { RECEITAS as CLIMA } from './climaVisual'

/** Diametro do corpo, a partir do raio da receita. */
function diametro(raio: [number, number]): number {
  return raio[1] * 2
}

describe('escala do ambiente contra a altura de um POKE (PH-232)', () => {
  it('a regua nao foi mexida sem querer', () => {
    // Guarda anti-teste-vacuo: todos os tetos daqui sao fracoes desta
    // constante. Se ela virar 400 por engano, tudo abaixo passa por
    // construcao em vez de por comportamento.
    expect(ALTURA_DE_POKE).toBe(40)
    expect(TETO_DO_CORPO_DE_AMBIENTE).toBeCloseTo(4.8, 6)
    expect(TETO_DO_CORPO_DE_CLIMA).toBeCloseTo(7.2, 6)
  })

  const presets = Object.entries(AMBIENTE)

  it('a lista de presets nao esta vazia', () => {
    expect(presets.length).toBeGreaterThanOrEqual(9)
  })

  it.each(presets)('%s: o corpo cabe no teto de ambiente', (nome, r) => {
    // `risco` e o unico em que `raio` NAO e meio-corpo: ali ele e a espessura
    // do traco, e o comprimento sai da velocidade. Um risco de 1 unidade de
    // espessura e fino, nao gordo — medir o dobro dele contra o teto de corpo
    // seria comparar coisas diferentes.
    const medida = r.forma === 'risco' ? r.raio[1] : diametro(r.raio)
    expect(
      medida,
      `${nome} desenha ${medida.toFixed(2)} unidades de corpo, `
      + `${((medida / ALTURA_DE_POKE) * 100).toFixed(1)}% da altura de um POKE. `
      + `O teto e ${TETO_DO_CORPO_DE_AMBIENTE} (12%). Ver escalaDoMundo.ts.`,
    ).toBeLessThanOrEqual(TETO_DO_CORPO_DE_AMBIENTE)
  })

  it('a menor particula ainda existe na tela', () => {
    // O teto sozinho e um convite a errar pro outro lado. A proporcao honesta
    // de um grao de poeira contra um Pokemon daria um quarto de pixel, que o
    // canvas resolve como cintilacao aleatoria. Meia unidade de raio e o piso
    // pratico: ~0,75px no zoom padrao de 1,5.
    for (const [nome, r] of presets) {
      expect(r.raio[0], `${nome} nasce menor que meio pixel de mundo`).toBeGreaterThanOrEqual(0.4)
      expect(r.raio[0], `${nome} tem faixa invertida`).toBeLessThan(r.raio[1])
    }
  })

  it('nenhum risco de ambiente e mais grosso que longo', () => {
    // O sintoma original, em numeros: areia com 4,4 unidades de comprimento por
    // ate 5,0 de espessura. Isso nao e um risco, e uma bolha — e como o
    // comprimento sai da velocidade e a espessura sai do raio, os dois podiam
    // (e podem) ser mexidos separadamente sem ninguem notar que cruzaram.
    for (const [nome, r] of presets) {
      if (r.forma !== 'risco') continue
      const comprimentoMinimo = r.velocidade[0] * RISCO_SEGUNDOS
      const espessuraMaxima = r.raio[1]
      expect(
        comprimentoMinimo / espessuraMaxima,
        `${nome}: no pior caso o risco tem ${comprimentoMinimo.toFixed(1)} de comprimento `
        + `por ${espessuraMaxima.toFixed(1)} de espessura`,
      ).toBeGreaterThanOrEqual(RAZAO_MINIMA_DE_RISCO)
    }
  })

  it('neve e poeira, que dividem a silhueta de grao, se separam pelo tamanho', () => {
    // As duas sao ponto cheio, e isso esta certo: um floco distante e um grao
    // de poeira SAO pontos. O que nao pode e serem o MESMO ponto — era
    // exatamente essa a queixa. Sem contorno nem forma pra separar, resta a
    // escala, e ela precisa ser folgada o bastante pra o olho perceber.
    const neve = diametro(AMBIENTE.neve.raio)
    const poeira = diametro(AMBIENTE.poeira.raio)
    expect(neve / poeira, 'floco de neve e grao de poeira sairam do mesmo tamanho')
      .toBeGreaterThanOrEqual(1.5)
  })
})

describe('escala do clima contra a altura de um POKE (PH-232)', () => {
  const climas = Object.entries(CLIMA)

  it('todos os seis climas estao na tabela', () => {
    expect(climas.length).toBe(6)
  })

  it.each(climas)('%s: o corpo cabe no teto de clima', (nome, r) => {
    // Fora do teto, por construcao e nao por esquecimento:
    //   - `risco`: `raio` e COMPRIMENTO de rastro, nao corpo. A trava dele e a
    //     razao comprimento/espessura, no caso abaixo.
    //   - `banco` (nevoa): nao e corpo, e VOLUME. Alpha baixo com raio grande
    //     e o unico jeito de produzir volume; alpha alto com raio pequeno
    //     produz a bolinha cinza que a receita dela existe pra evitar.
    if (r.forma === 'risco' || r.forma === 'banco') return
    const medida = diametro(r.raio)
    expect(
      medida,
      `${nome} desenha ${medida.toFixed(2)} unidades de corpo, `
      + `${((medida / ALTURA_DE_POKE) * 100).toFixed(1)}% da altura de um POKE. `
      + `O teto de clima e ${TETO_DO_CORPO_DE_CLIMA} (18%).`,
    ).toBeLessThanOrEqual(TETO_DO_CORPO_DE_CLIMA)
  })

  it('nenhum risco de clima e mais grosso que longo', () => {
    // A espessura do risco de clima e derivada do proprio comprimento
    // (`max(0.9, raio * 0.09)` em `desenharParticula`), entao o pior caso e o
    // risco MAIS CURTO — e ele que encosta no piso.
    for (const [nome, r] of climas) {
      if (r.forma !== 'risco') continue
      const curto = r.raio[0]
      const espessura = Math.max(0.9, curto * 0.09)
      expect(
        curto / espessura,
        `${nome}: o risco mais curto tem ${curto.toFixed(1)} de comprimento `
        + `por ${espessura.toFixed(2)} de espessura`,
      ).toBeGreaterThanOrEqual(RAZAO_MINIMA_DE_RISCO)
    }
  })

  it('o clima e mais evidente que a decoracao do bioma, e nao o contrario', () => {
    // Hierarquia deliberada (ver `TETO_DO_CORPO_DE_CLIMA`): granizo e areia
    // TIRAM HP. Se a folha caindo do cenario fosse maior que o floco que causa
    // dano, o jogo estaria destacando o enfeite e escondendo a regra.
    const maiorAmbiente = Math.max(
      ...Object.values(AMBIENTE).filter((r) => r.forma !== 'risco').map((r) => diametro(r.raio)),
    )
    const granizo = diametro(CLIMA.granizo.raio)
    expect(granizo, 'granizo ficou menor que a maior particula decorativa')
      .toBeGreaterThan(maiorAmbiente)
  })
})
