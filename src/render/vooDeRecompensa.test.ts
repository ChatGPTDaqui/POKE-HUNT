// O voo de recompensa faz o que a PH-191 pede (e nao inventa recompensa).
//
// O que estes testes trancam, em ordem de quanto custa perder:
//
//  - RECICLAGEM DE ID. `createWorldEffect` numera a partir de `counters.effect`,
//    que volta a 1 quando o mundo e reconstruido — e ele e reconstruido a cada
//    flush. Um conjunto de "ja vistos" acumulado engoliria a recompensa do mundo
//    novo em SILENCIO. E o bug mais caro possivel aqui: o jogador mata, ganha, e
//    a tela nao diz nada.
//  - UNIDADE DESCONHECIDA nao vira voo. Uma recompensa nova no motor que nao
//    passe por `tipoDaRecompensa` nao pode sair como chuva de ouro por engano.
//  - VALOR ZERO nao vira voo: abate na hunt de treino rende 0, e moeda voando
//    anunciando nada e mentira visual.
//  - SATURACAO da contagem de moedas: acima de uma duzia o olho nao conta mais.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  converterRecompensasNovas, criarVoo, posicaoDaMoeda, quantidadeDeMoedas,
  contarVoos, reiniciarDeteccao, reiniciarRecompensas, temRecompensaViva, vooTerminou,
} from './vooDeRecompensa'
import { UNIDADE_OURO, UNIDADE_XP, tipoDaRecompensa } from '@/data/recompensaDoAbate'

/** Um `rewardText` como `handleEnemyDefeated` o cria. */
function recompensa(id: string, unit: string, value: number, x = 100, y = 200) {
  return { id, type: 'rewardText', unit, value, x, y }
}

const NA_TELA = (p: { x: number; y: number }) => ({ x: p.x, y: p.y })

beforeEach(() => {
  reiniciarRecompensas()
  reiniciarDeteccao()
})

describe('tipoDaRecompensa (PH-191)', () => {
  it('reconhece as duas unidades que o motor emite', () => {
    expect(tipoDaRecompensa(UNIDADE_OURO)).toBe('ouro')
    expect(tipoDaRecompensa(UNIDADE_XP)).toBe('xp')
  })

  it('devolve null pro que nao conhece, em vez de chutar', () => {
    for (const desconhecida of ['', 'ouro', 'gold', '💎', undefined]) {
      expect(tipoDaRecompensa(desconhecida)).toBeNull()
    }
  })
})

describe('deteccao de recompensa nova (PH-191)', () => {
  it('lanca um voo por recompensa nova', () => {
    converterRecompensasNovas([recompensa('effect-1', UNIDADE_OURO, 240)], NA_TELA)
    expect(temRecompensaViva()).toBe(true)
  })

  it('NAO lanca de novo enquanto o mesmo efeito continua vivo', () => {
    // O `rewardText` dura 1,1s e o desenho roda a ~60fps: o MESMO efeito passa
    // por aqui umas 66 vezes. Sem a memoria de vistos seriam 66 voos por abate.
    const efeitos = [recompensa('effect-1', UNIDADE_OURO, 240)]
    for (let quadro = 0; quadro < 66; quadro++) converterRecompensasNovas(efeitos, NA_TELA)
    expect(contarVoos(), 'o mesmo rewardText virou mais de um voo').toBe(1)
  })

  it('dois efeitos no mesmo quadro viram dois voos', () => {
    // E o caso normal: todo abate emite XP e ouro juntos.
    converterRecompensasNovas([
      recompensa('effect-1', UNIDADE_XP, 86),
      recompensa('effect-2', UNIDADE_OURO, 240),
    ], NA_TELA)
    expect(contarVoos()).toBe(2)
  })

  it('ID RECICLADO depois da reconstrucao do mundo vira voo de novo', () => {
    // O caso que um conjunto acumulado quebraria. `counters.effect` volta a 1 a
    // cada flush, entao `effect-1` reaparece — e e uma recompensa DIFERENTE.
    converterRecompensasNovas([recompensa('effect-1', UNIDADE_OURO, 240)], NA_TELA)
    // Mundo reconstruido: a lista de efeitos fica vazia por pelo menos um quadro.
    converterRecompensasNovas([], NA_TELA)
    reiniciarRecompensas()
    expect(temRecompensaViva()).toBe(false)

    converterRecompensasNovas([recompensa('effect-1', UNIDADE_OURO, 500)], NA_TELA)
    expect(contarVoos(), 'recompensa do mundo novo foi engolida').toBe(1)
  })

  it('ignora unidade desconhecida', () => {
    converterRecompensasNovas([recompensa('effect-1', '💎', 240)], NA_TELA)
    expect(temRecompensaViva()).toBe(false)
  })

  it('ignora valor zero e negativo', () => {
    converterRecompensasNovas([
      recompensa('effect-1', UNIDADE_OURO, 0),
      recompensa('effect-2', UNIDADE_XP, -5),
    ], NA_TELA)
    expect(temRecompensaViva()).toBe(false)
  })

  it('ignora efeito que nao e recompensa', () => {
    converterRecompensasNovas(
      [{ id: 'effect-1', type: 'damageNumber', value: 148, x: 0, y: 0 }],
      NA_TELA,
    )
    expect(temRecompensaViva()).toBe(false)
  })

  it('nao lanca fora da hunt, quando a conversao pra tela devolve null', () => {
    // No Hospital nao ha `mapDef` e `mundoParaTela` devolve `null`. Lancar ali
    // poria moeda voando de um ponto inventado.
    converterRecompensasNovas([recompensa('effect-1', UNIDADE_OURO, 240)], () => null)
    expect(temRecompensaViva()).toBe(false)
  })
})

describe('geometria do voo (PH-191)', () => {
  it('quantidade de moedas satura em 12 e tem piso de 3', () => {
    expect(quantidadeDeMoedas(0)).toBe(0)
    expect(quantidadeDeMoedas(1)).toBe(3)
    expect(quantidadeDeMoedas(240)).toBeGreaterThanOrEqual(3)
    expect(quantidadeDeMoedas(1_000_000)).toBe(12)
    expect(quantidadeDeMoedas(999_999_999)).toBe(12)
  })

  it('mesma semente produz o mesmo voo', () => {
    // O sorteio e local e deterministico de proposito — ver a nota sobre nao
    // usar `world.rng`. Se virasse `Math.random`, este teste denuncia.
    const a = criarVoo('ouro', 240, { x: 10, y: 20 }, 7)
    const b = criarVoo('ouro', 240, { x: 10, y: 20 }, 7)
    expect(a).toEqual(b)
  })

  it('sementes diferentes produzem leques diferentes', () => {
    const a = criarVoo('ouro', 240, { x: 10, y: 20 }, 1)
    const b = criarVoo('ouro', 240, { x: 10, y: 20 }, 2)
    expect(a!.moedas[0].xm).not.toBe(b!.moedas[0].xm)
  })

  it('as moedas saem PRA CIMA da origem', () => {
    // Pra baixo elas atravessariam o corpo do POKE e o chao, e a carteira esta
    // no topo — descer pra depois subir le como hesitacao.
    const voo = criarVoo('ouro', 5000, { x: 100, y: 200 }, 3)!
    for (const m of voo.moedas) {
      expect(m.ym, 'moeda espalhou pra baixo da origem').toBeLessThan(m.y0)
    }
  })

  it('a moeda chega no destino e depois some', () => {
    const voo = criarVoo('ouro', 240, { x: 0, y: 0 }, 5)!
    const destino = { x: 500, y: 40 }
    const m = voo.moedas[0]

    // Perto do fim do voo, mas antes de acabar: ja está quase no destino.
    const quase = posicaoDaMoeda(m, m.atraso + 0.22 + m.duracao * 0.98, destino)
    expect(quase).not.toBeNull()
    expect(Math.abs(quase!.x - destino.x)).toBeLessThan(20)
    expect(quase!.escala, 'devia estar encolhendo na chegada').toBeLessThan(1)

    // Passado o fim, nao existe mais.
    expect(posicaoDaMoeda(m, m.atraso + 0.22 + m.duracao + 0.01, destino)).toBeNull()
  })

  it('a moeda nao existe antes do proprio atraso', () => {
    const voo = criarVoo('ouro', 5000, { x: 0, y: 0 }, 9)!
    const ultima = voo.moedas[voo.moedas.length - 1]
    expect(ultima.atraso).toBeGreaterThan(0)
    expect(posicaoDaMoeda(ultima, -0.01, { x: 1, y: 1 })).toBeNull()
  })

  it('o voo so termina quando a ULTIMA moeda chega', () => {
    const voo = criarVoo('ouro', 5000, { x: 0, y: 0 }, 11)!
    expect(vooTerminou(voo)).toBe(false)
    // Envelhece tudo menos a ultima.
    for (const m of voo.moedas) m.idade = 99
    expect(vooTerminou(voo)).toBe(true)
    voo.moedas[voo.moedas.length - 1].idade = 0
    expect(vooTerminou(voo), 'terminou com uma moeda ainda no ar').toBe(false)
  })
})
