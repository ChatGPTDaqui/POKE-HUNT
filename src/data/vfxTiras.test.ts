// Tranca as tres falhas SILENCIOSAS de uma tira de VFX. Nenhuma delas lanca
// excecao: o jogo desenha errado (ou nao desenha nada) e segue rodando.
//
// 1. URL que nao existe -> `isImageReady` nunca fica true e o tipo inteiro cai
//    calado no burst procedural. Foi assim que o lote anterior ficou com FOGO
//    funcionando e os outros sete invisiveis.
// 2. `quadros` diferente da contagem real -> a largura do quadro sai de
//    `naturalWidth / quadros`, entao UM a mais ou a menos desloca TODOS os
//    recortes e a animacao vira um borrao de meio-quadro. E exatamente o bug
//    que custou duas levas nas pokebolas.
// 3. Tipo elemental sem entrada -> golpe daquele tipo volta pro procedural sem
//    ninguem perceber, porque o procedural nao parece quebrado.
//
// `import.meta.glob` em vez de `node:fs` — mesmo motivo de sprites.test.ts:
// confere contra o que o Vite realmente empacota, nao o disco cru. `?inline`
// entrega o arquivo como data URI, o que permite ler o cabecalho IHDR do PNG
// (largura e altura) sem decodificador nenhum.
import { describe, expect, it } from 'vitest'

import {
  TIRA_POR_ELEMENTO, TIRA_CURA_HP, TIRA_CURA_STATUS, TIRA_CONFUSAO, TIRA_SONO,
  todasAsTirasDeVfx, COR_DE_STATUS_NO_CORPO, orientacaoDaTira, type TiraDeVfx,
} from './vfxTiras'
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

const ARQUIVOS = import.meta.glob('/assets/{move-vfx/tiras,status-vfx}/*.png', {
  query: '?inline', import: 'default', eager: true,
}) as Record<string, string>

/** Cabecalho IHDR: largura em 16..19, altura em 20..23, big-endian. */
function dimensoes(url: string): { largura: number; altura: number } {
  const dataUri = ARQUIVOS[`/${url}`]
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64.slice(0, 64)), (c) => c.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  return { largura: view.getUint32(16), altura: view.getUint32(20) }
}

const TODAS: [string, TiraDeVfx][] = [
  ...Object.entries(TIRA_POR_ELEMENTO),
  ['cura-hp', TIRA_CURA_HP],
  ['cura-status', TIRA_CURA_STATUS],
  ['confusao', TIRA_CONFUSAO],
  ['sono', TIRA_SONO],
]

describe('tiras de VFX', () => {
  it('todo arquivo referenciado existe', () => {
    const faltando = todasAsTirasDeVfx().filter((url) => !(`/${url}` in ARQUIVOS))
    expect(faltando).toEqual([])
  })

  // NAO prova que a contagem esta certa — 3520px aceitam 16 e tambem 20
  // quadros. Prova que ela nao esta OBVIAMENTE errada, que e o caso que
  // acontece de verdade: alguem reexporta a arte com um quadro a mais/menos e
  // esquece de mexer aqui.
  it('a largura de cada tira e multiplo exato do numero de quadros', () => {
    const errados = TODAS
      .map(([nome, tira]) => ({ nome, largura: dimensoes(tira.url).largura, quadros: tira.quadros }))
      .filter((t) => t.largura % t.quadros !== 0)
    expect(errados).toEqual([])
  })

  // Quadro achatado ou esticado demais e o sintoma de contagem errada por
  // fator (16 lidos como 32 dao metade da largura). A folga e generosa de
  // proposito pra nao brigar com arte nova legitimamente comprida.
  it('a proporcao de cada quadro fica numa faixa plausivel', () => {
    const fora = TODAS
      .map(([nome, tira]) => {
        const { largura, altura } = dimensoes(tira.url)
        return { nome, proporcao: Number((largura / tira.quadros / altura).toFixed(2)) }
      })
      .filter((t) => t.proporcao < 0.35 || t.proporcao > 3)
    expect(fora).toEqual([])
  })

  it('os 18 tipos elementais tem tira', () => {
    const semTira = (Object.keys(TYPE_COLORS) as ElementType[]).filter((t) => !TIRA_POR_ELEMENTO[t])
    expect(semTira).toEqual([])
  })

  it('so os 4 status com cor obvia tingem o corpo — sono e confusao usam simbolo', () => {
    expect(Object.keys(COR_DE_STATUS_NO_CORPO).sort())
      .toEqual(['burn', 'freeze', 'paralysis', 'poison'])
  })
})

// ---------------------------------------------------------------------------
// Direcao da arte
// ---------------------------------------------------------------------------
// O lote nasceu marcado como "simetrico" em bloco e ninguem tinha medido.
// `scripts/conferir-direcao-vfx.mjs` mediu as 18 e achou tres classes; estes
// testes trancam a decisao e, principalmente, a CONVENCAO DE SINAL da rotacao
// — sinal trocado nao lanca erro, so desenha o fogo saindo pelas costas do
// POKE, e isso sobrevive a qualquer revisao de codigo.
describe('orientacao das tiras direcionais', () => {
  const GIRAM = ['FIRE', 'BUG', 'DARK']
  // As quatro que sao assimetricas mas NAO podem girar: elas apontam pra CIMA
  // (cupula, coluna, nuvem), nao pro alvo. Girar deitaria as quatro no chao —
  // e o erro que um teste ingenuo de "assimetrica? gira" produziria.
  const ANCORADAS_NO_CHAO = ['PSYCHIC', 'FLYING', 'POISON', 'FAIRY']

  it('exatamente as tres medidas como direcionais estao marcadas', () => {
    const marcadas = Object.entries(TIRA_POR_ELEMENTO)
      .filter(([, tira]) => tira.direcional)
      .map(([nome]) => nome)
      .sort()
    expect(marcadas).toEqual([...GIRAM].sort())
  })

  it('as ancoradas no chao continuam SEM rotacao', () => {
    for (const nome of ANCORADAS_NO_CHAO) {
      expect(TIRA_POR_ELEMENTO[nome as ElementType].direcional, nome).toBeUndefined()
    }
  })

  it('arte que aponta pra direita nao gira quando o alvo esta a direita', () => {
    // FIRE nasce apontando pra +x, e 0 rad e exatamente "alvo a direita".
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.FIRE, 0)
    expect(o.girar).toBe(0)
    expect(o.espelharY).toBe(false)
  })

  it('alvo a esquerda gira meia volta E espelha, pra arte nao ficar de ponta-cabeca', () => {
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.FIRE, Math.PI)
    expect(o.girar).toBeCloseTo(Math.PI, 6)
    expect(o.espelharY).toBe(true)
  })

  it('a base da arte e descontada: o talho do DARK sai reto, nao 41° torto', () => {
    // Ele nasce em -41° no arquivo. Mirando em -41°, o giro tem que ser ZERO —
    // sem descontar a base, a arte sairia sempre 41° fora da linha do golpe.
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.DARK, (-41 * Math.PI) / 180)
    expect(o.girar).toBeCloseTo(0, 6)
  })

  it('sem angulo (golpe em si mesmo, area) nada gira, nada recorta, ancora no centro', () => {
    // O caminho do AOE. Recorte de 1 aqui NAO e detalhe: `recorteX` corta a
    // cauda do jato pro impacto alvo-unico caber nos 39px de alcance, e a
    // area de efeito nao tem cauda pra cortar — recortar o AOE mentiria sobre
    // o raio do golpe, que e o unico dado que aquele desenho carrega.
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.FIRE, undefined)
    expect(o).toEqual({ girar: 0, espelharY: false, ancoraX: 0.5, recorteX: 1 })
  })

  it('o recorte reposiciona a ancora, senao o impacto desliza do alvo', () => {
    // A conta que erra em silencio. `ancoraX` e medida no quadro INTEIRO, mas
    // o desenho recebe so a fatia da direita: sem reposicionar, o ponto de
    // impacto do FIRE (0.78 do quadro) cairia em 0.78 DA FATIA, que e outro
    // lugar — o fogo passa a acertar ao lado do inimigo, e nada quebra.
    //
    // Com recorteX 0.68, a fatia comeca em 0.32 do quadro. A ancora de 0.78
    // fica em (0.78 - 0.32) / 0.68 = 0.676 da fatia.
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.FIRE, 0)
    expect(o.recorteX).toBeCloseTo(0.68, 6)
    expect(o.ancoraX).toBeCloseTo((0.78 - 0.32) / 0.68, 4)
  })

  it('recorte nunca zera nem passa de 1', () => {
    // Fatia de largura 0 nao desenha nada e fatia maior que o quadro leria
    // fora dele. Os dois casos sao clamp, nao erro: um valor bobo no cadastro
    // tem que degradar pra arte inteira, nao pra tela vazia.
    const zerado = orientacaoDaTira(
      { url: 'x', quadros: 1, direcional: { anguloBaseGraus: 0, recorteX: 0 } } as TiraDeVfx, 0,
    )
    expect(zerado.recorteX).toBeGreaterThan(0)
    const estourado = orientacaoDaTira(
      { url: 'x', quadros: 1, direcional: { anguloBaseGraus: 0, recorteX: 3 } } as TiraDeVfx, 0,
    )
    expect(estourado.recorteX).toBe(1)
  })

  it('a ancora fica dentro do quadro e a base dentro de meia volta', () => {
    for (const [nome, tira] of Object.entries(TIRA_POR_ELEMENTO)) {
      if (!tira.direcional) continue
      expect(Math.abs(tira.direcional.anguloBaseGraus), nome).toBeLessThanOrEqual(180)
      const ancora = tira.direcional.ancoraX ?? 0.5
      expect(ancora, nome).toBeGreaterThan(0)
      expect(ancora, nome).toBeLessThanOrEqual(1)
    }
  })
})
