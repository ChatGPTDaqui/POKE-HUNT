// @vitest-environment jsdom
//
// PH-254 — o que quebra em silencio numa camada de prop ancorado.
//
// 1. ANCORA APONTANDO PRA ARTE QUE NAO EXISTE. A tabela e escrita a mao e a
//    chave e um caminho de arquivo. Um typo (`temple.png` quando a arte e
//    `temple.jpg`) nao da erro nenhum: aquela arte simplesmente nunca ganha
//    prop, e a unica forma de perceber e entrando na hunt e reparando na
//    ausencia de uma coisa que nunca esteve la.
//
// 2. PROP EM ARTE NAO CADASTRADA. O contrato do preset (`ambiente.ts`) e que
//    arte fora da tabela fica exatamente como estava. Prop vazando pra uma arte
//    sem ancora seria uma chama no meio do nada.
//
// 3. A CAMADA TOCANDO O RNG DO MOTOR. Mesma razao do guard de `ambiente.ts`:
//    `world.rng` e autoritativo e compartilhado com o resim do servidor, e uma
//    chamada a mais no cliente faz o flush divergir do que o jogador viu sem
//    dar erro nenhum (PH-37).
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { COLISAO_POR_ARTE } from '@/data/generated/subBiomaCollision.generated'
import { LAVA_POR_ARTE } from '@/data/generated/lavaMask.generated'
import { ANCORAS_POR_ARTE } from '@/data/ancorasDeAmbiente'
// `?raw` do Vite, e nao `readFileSync`: `src/` nao tem os types de node, e
// adicionar era o remedio errado. Ver o cabecalho de `ambiente.test.ts`.
import fonteBruta from './ambienteProps.ts?raw'
import fonteDoPreload from '@/data/preload.ts?raw'

const LARGURA_DA_ARTE = 2048
const ALTURA_DA_ARTE = 2048

// Imagem sempre "pronta": a conversao de ancora precisa do tamanho natural da
// arte, e em jsdom nenhuma imagem carrega de verdade. Sem este mock a camada
// funciona (ela desiste em silencio, que e o comportamento certo em producao) e
// nao daria pra testar posicao nenhuma.
vi.mock('./sprites', () => ({
  readyImage: () => ({ complete: true, naturalWidth: LARGURA_DA_ARTE, naturalHeight: ALTURA_DA_ARTE }),
}))

const { desenharPropsDeAmbiente, reiniciarPropsDeAmbiente, quantidadeDePropsDeAmbiente, todasAsTirasDeProps }
  = await import('./ambienteProps')

const JANELA = { x: -4000, y: -4000, w: 12000, h: 12000 }

interface Traco { tipo: 'arc' | 'ellipse' | 'drawImage' | 'lineTo'; x: number; y: number }

function ctxEspiao() {
  const tracos: Traco[] = []
  const ctx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, fill: () => {}, stroke: () => {},
    moveTo: () => {}, fillRect: () => {}, rotate: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: false,
    arc(x: number, y: number) { tracos.push({ tipo: 'arc', x, y }) },
    ellipse(x: number, y: number) { tracos.push({ tipo: 'ellipse', x, y }) },
    lineTo(x: number, y: number) { tracos.push({ tipo: 'lineTo', x, y }) },
    drawImage(_i: unknown, ..._r: number[]) {
      tracos.push({ tipo: 'drawImage', x: _r[4] ?? 0, y: _r[5] ?? 0 })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, tracos }
}

/** Roda `quadros` quadros de uma arte e devolve tudo que foi desenhado. */
function rodar(imagem: string, quadros: number, compacto = false): Traco[] {
  const todos: Traco[] = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, tracos } = ctxEspiao()
    // Instante espalhado de proposito: prop de PULSO (espuma, faisca) fica
    // invisivel a maior parte do ciclo, e um unico quadro pegaria zero.
    desenharPropsDeAmbiente(ctx, imagem, JANELA, compacto, i * 137)
    todos.push(...tracos)
  }
  return todos
}

beforeEach(() => {
  reiniciarPropsDeAmbiente()
})

describe('a tabela de ancoras aponta pra artes que existem (PH-254)', () => {
  const artes = Object.keys(ANCORAS_POR_ARTE)

  it('a tabela nao esta vazia e cobre o que a issue pediu', () => {
    // Guarda anti-teste-vacuo (o `it.each` abaixo passaria com a tabela vazia)
    // e, junto, o criterio de aceite da PH-254: pelo menos 12 artes com prop.
    expect(artes.length).toBeGreaterThanOrEqual(12)
  })

  it.each(artes)('%s existe na lista canonica de artes', (arte) => {
    expect(
      COLISAO_POR_ARTE[arte],
      `${arte} nao esta em COLISAO_POR_ARTE. Confira a extensao do arquivo — `
      + 'jpg e png se confundem, e a chave errada nao da erro: a arte so nunca ganha prop.',
    ).toBeDefined()
  })

  it.each(artes)('%s tem o retangulo da arte, sem o qual a ancora nao converte', (arte) => {
    expect(COLISAO_POR_ARTE[arte]?.arte).toBeDefined()
  })

  it.each(artes)('%s tem ancoras dentro da imagem e com escala positiva', (arte) => {
    for (const a of ANCORAS_POR_ARTE[arte]) {
      expect(a.u, `u fora de [0,1] em ${arte}`).toBeGreaterThanOrEqual(0)
      expect(a.u).toBeLessThanOrEqual(1)
      expect(a.v, `v fora de [0,1] em ${arte}`).toBeGreaterThanOrEqual(0)
      expect(a.v).toBeLessThanOrEqual(1)
      if (a.escala !== undefined) expect(a.escala).toBeGreaterThan(0)
    }
  })

  it.each(artes)('%s nao tem duas ancoras identicas empilhadas', (arte) => {
    // Duas ancoras do mesmo tipo no mesmo ponto desenham uma em cima da outra:
    // o dobro do alpha num lugar so, que le como "aquele prop esta mais forte"
    // e nao como erro. Copiar-e-colar linha e como isso acontece.
    const vistos = new Set<string>()
    for (const a of ANCORAS_POR_ARTE[arte]) {
      const chave = `${a.u}|${a.v}|${a.tipo}`
      expect(vistos.has(chave), `ancora repetida em ${arte}: ${chave}`).toBe(false)
      vistos.add(chave)
    }
  })
})

describe('prop so aparece onde foi cadastrado (PH-254)', () => {
  it('arte sem ancora e sem mascara nao desenha nada', () => {
    // `plains` tem preset de ambiente (particula), e NAO tem ancora: o
    // contrato e que ela continue exatamente como estava.
    expect(ANCORAS_POR_ARTE['assets/hunt-backgrounds/plains.jpg']).toBeUndefined()
    expect(rodar('assets/hunt-backgrounds/plains.jpg', 6)).toEqual([])
    expect(quantidadeDePropsDeAmbiente()).toBe(0)
  })

  it('arte desconhecida nao estoura nem desenha', () => {
    expect(rodar('assets/hunt-backgrounds/nao-existe.jpg', 3)).toEqual([])
  })

  it('sem imagem nenhuma nao desenha', () => {
    const { ctx, tracos } = ctxEspiao()
    desenharPropsDeAmbiente(ctx, null, JANELA, false, 0)
    expect(tracos).toEqual([])
  })

  it('arte com ancora monta um prop por ancora', () => {
    const arte = 'assets/hunt-backgrounds/forest.jpg'
    rodar(arte, 1)
    expect(quantidadeDePropsDeAmbiente()).toBe(ANCORAS_POR_ARTE[arte].length)
  })

  it('o que e desenhado cai dentro do retangulo da arte', () => {
    // A conversao ancora -> mundo e a peca que, errada, poe TODO prop no canto
    // do mapa. O retangulo da arte e o limite que a conta tem que respeitar.
    const arte = 'assets/hunt-backgrounds/forest.jpg'
    const { escala, x: ax, y: ay } = COLISAO_POR_ARTE[arte].arte!
    const margem = 120 // pluma sobe e gota espirra pra fora da ancora
    const tracos = rodar(arte, 8)
    expect(tracos.length).toBeGreaterThan(0)
    for (const t of tracos) {
      expect(t.x).toBeGreaterThanOrEqual(ax - margem)
      expect(t.x).toBeLessThanOrEqual(ax + LARGURA_DA_ARTE * escala + margem)
      expect(t.y).toBeGreaterThanOrEqual(ay - margem)
      expect(t.y).toBeLessThanOrEqual(ay + ALTURA_DA_ARTE * escala + margem)
    }
  })

  it('prop fora da janela nao e desenhado', () => {
    const arte = 'assets/hunt-backgrounds/forest.jpg'
    const { ctx, tracos } = ctxEspiao()
    // Janela longe de qualquer ancora: o recorte tem que cortar tudo.
    desenharPropsDeAmbiente(ctx, arte, { x: 90000, y: 90000, w: 100, h: 100 }, false, 500)
    expect(tracos).toEqual([])
    // ... e os props continuam montados, so nao desenhados.
    expect(quantidadeDePropsDeAmbiente()).toBeGreaterThan(0)
  })
})

describe('prop de regiao sai da mascara, nao de ancora (PH-254)', () => {
  const VULCAO = 'assets/hunt-backgrounds/volcano.jpg'

  it('o vulcao tem mascara de lava de verdade neste dado', () => {
    // Guarda anti-teste-vacuo: sem a mascara, o teste abaixo compararia zero
    // com zero e passaria.
    expect(LAVA_POR_ARTE[VULCAO]).toBeDefined()
  })

  it('o vulcao monta mais props do que tem ancora escrita', () => {
    rodar(VULCAO, 1)
    expect(quantidadeDePropsDeAmbiente()).toBeGreaterThan(ANCORAS_POR_ARTE[VULCAO].length)
  })

  it('o compacto monta menos props que o desktop', () => {
    // Celular paga o mesmo custo por quadro que o desktop e tem menos folga.
    // O corte e nos props de REGIAO (os sorteados), nunca nas ancoras — ancora
    // e uma coisa que o desenho promete, e sumir com ela seria outra arte.
    rodar(VULCAO, 1, false)
    const desktop = quantidadeDePropsDeAmbiente()
    reiniciarPropsDeAmbiente()
    rodar(VULCAO, 1, true)
    const compacto = quantidadeDePropsDeAmbiente()
    expect(compacto).toBeLessThan(desktop)
    expect(compacto).toBeGreaterThanOrEqual(ANCORAS_POR_ARTE[VULCAO].length)
  })

  it('trocar de compacto pra desktop remonta os props', () => {
    rodar(VULCAO, 1, true)
    const compacto = quantidadeDePropsDeAmbiente()
    rodar(VULCAO, 1, false)
    expect(quantidadeDePropsDeAmbiente()).toBeGreaterThan(compacto)
  })
})

describe('a camada se mexe, e o mesmo cenario e sempre o mesmo (PH-254)', () => {
  it('o desenho muda com o tempo', () => {
    const arte = 'assets/hunt-backgrounds/slum.jpg'
    const { ctx: c1, tracos: t1 } = ctxEspiao()
    desenharPropsDeAmbiente(c1, arte, JANELA, false, 1000)
    const { ctx: c2, tracos: t2 } = ctxEspiao()
    desenharPropsDeAmbiente(c2, arte, JANELA, false, 2600)
    expect(t1.length).toBeGreaterThan(0)
    const mexeu = t1.some((t, i) => !t2[i] || Math.abs(t.x - t2[i].x) > 0.01 || Math.abs(t.y - t2[i].y) > 0.01)
    expect(mexeu, 'nada mudou entre dois instantes — a camada esta parada').toBe(true)
  })

  it('a mesma arte monta sempre os mesmos props', () => {
    // O gerador e semeado pela URL da arte: entrar e sair da hunt nao pode
    // reorganizar os focos de lava, senao o cenario "pisca" a cada volta.
    const VULCAO = 'assets/hunt-backgrounds/volcano.jpg'
    const { ctx: c1, tracos: t1 } = ctxEspiao()
    desenharPropsDeAmbiente(c1, VULCAO, JANELA, false, 4321)
    reiniciarPropsDeAmbiente()
    const { ctx: c2, tracos: t2 } = ctxEspiao()
    desenharPropsDeAmbiente(c2, VULCAO, JANELA, false, 4321)
    expect(t1.length).toBeGreaterThan(0)
    expect(t2).toEqual(t1)
  })
})

describe('props nao encostam na simulacao (PH-254)', () => {
  // Comentario fora antes de procurar: o arquivo FALA de `world.rng` sem parar,
  // justamente pra explicar por que nao o usa.
  const fonte = fonteBruta.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('nao importa nada do motor', () => {
    const imports = [...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    const proibidos = imports.filter((i) => i.startsWith('@/engine') || i.includes('worldStore'))
    expect(proibidos, `imports proibidos: ${proibidos.join(', ')}`).toEqual([])
  })

  it('nao menciona o rng do mundo', () => {
    expect(fonte).not.toMatch(/world\.rng|useWorldStore|sortear\(/)
  })

  it('nao le o relogio por conta propria', () => {
    // O instante vem por parametro. Ler `performance.now()` aqui adiantaria o
    // tempo do jogo em um passo por quadro sempre que o relogio for um
    // contador — e e assim que todo teste de camada mocka.
    expect(fonte).not.toMatch(/performance\.now/)
  })
})

describe('a arte dos props entra no preload (PH-254)', () => {
  it('a camada declara as tiras que desenha', () => {
    expect(todasAsTirasDeProps()).toEqual([
      'assets/ambiente-props/chama.png',
      'assets/ambiente-props/agua-caustica.png',
    ])
  })

  it('o preload consome essa lista', () => {
    // Sem isto o primeiro quadro da hunt mostra a fogueira apagada e ela
    // "acende" alguns quadros depois — o mesmo sintoma que `preload.ts` foi
    // escrito pra evitar nas especies.
    expect(fonteDoPreload).toMatch(/todasAsTirasDeProps\(\)/)
  })
})
