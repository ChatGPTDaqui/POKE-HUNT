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
  TIRA_POR_ELEMENTO, TIRA_AOE_POR_ELEMENTO, TIRA_CURA_HP, TIRA_CURA_STATUS, TIRA_CONFUSAO, TIRA_SONO,
  TIRA_POR_CONDICAO_NO_CORPO,
  todasAsTirasDeVfx, COR_DE_STATUS_NO_CORPO, orientacaoDaTira, type TiraDeVfx,
} from './vfxTiras'
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

const ARQUIVOS = import.meta.glob('/assets/{move-vfx/tiras,move-vfx/tiras-aoe,status-vfx}/*.png', {
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
  ...Object.entries(TIRA_AOE_POR_ELEMENTO).map(([t, tira]): [string, TiraDeVfx] => [`${t}-aoe`, tira!]),
  ['cura-hp', TIRA_CURA_HP],
  ['cura-status', TIRA_CURA_STATUS],
  ['confusao', TIRA_CONFUSAO],
  ['sono', TIRA_SONO],
  ...Object.entries(TIRA_POR_CONDICAO_NO_CORPO).map(([c, tira]): [string, TiraDeVfx] => [`condicao-${c}`, tira!]),
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

  // A camada de AREA e PARCIAL de proposito (4 tipos sem candidato aprovado —
  // ver o cabecalho de TIRA_AOE_POR_ELEMENTO). O que NAO pode acontecer e ela
  // repetir a arte da camada de impacto: seria desenhar exatamente o mesmo
  // efeito que ela existe pra substituir, e nada no jogo denunciaria isso.
  it('nenhuma tira de area repete o arquivo da tira de impacto', () => {
    // Compara o CONTEUDO, nao o caminho: os dois lotes usam o nome do tipo como
    // nome de arquivo (`tiras/fire.png` e `tiras-aoe/fire.png`), entao comparar
    // caminho nao acusaria nada e comparar nome acusaria tudo.
    const impacto = new Set(Object.values(TIRA_POR_ELEMENTO).map((t) => ARQUIVOS[`/${t.url}`]))
    const repetidas = Object.entries(TIRA_AOE_POR_ELEMENTO)
      .filter(([, tira]) => impacto.has(ARQUIVOS[`/${tira!.url}`]))
      .map(([tipo]) => tipo)
    expect(repetidas).toEqual([])
  })

  it('os 18 tipos elementais tem tira', () => {
    const semTira = (Object.keys(TYPE_COLORS) as ElementType[]).filter((t) => !TIRA_POR_ELEMENTO[t])
    expect(semTira).toEqual([])
  })

  it('so os 4 status com cor obvia tingem o corpo — sono e confusao usam simbolo', () => {
    expect(Object.keys(COR_DE_STATUS_NO_CORPO).sort())
      .toEqual(['burn', 'freeze', 'paralysis', 'poison'])
  })

  // PH-370. A regra deixou de ser "cor OU simbolo" e passou a ser "cor pra
  // quatro, e simbolo TAMBEM pra dois deles". O teste diz isso explicitamente
  // porque a alternativa — apagar a assercao acima — perderia a unica linha que
  // registra que veneno e congelamento ficaram de fora de proposito.
  it('paralisia e queimadura tem simbolo ALEM da tinta; veneno e congelamento so tinta', () => {
    expect(Object.keys(TIRA_POR_CONDICAO_NO_CORPO).sort()).toEqual(['burn', 'paralysis'])
    for (const status of ['burn', 'paralysis'] as const) {
      expect(COR_DE_STATUS_NO_CORPO[status], `${status} continua tingindo o corpo`).toBeTruthy()
    }
    for (const status of ['poison', 'freeze'] as const) {
      expect(TIRA_POR_CONDICAO_NO_CORPO[status], `${status} e so tinta`).toBeUndefined()
    }
  })

  it('as duas artes de condicao entram no preload', () => {
    // Status persistente aparece em todo combate. Fora do preload, o PRIMEIRO
    // POKE paralisado de cada sessao ficaria sem faisca por alguns frames — e
    // como o desenho degrada em silencio, ninguem notaria que o preload
    // esqueceu.
    const preload = new Set(todasAsTirasDeVfx())
    for (const [status, tira] of Object.entries(TIRA_POR_CONDICAO_NO_CORPO)) {
      expect(preload.has(tira!.url), status).toBe(true)
    }
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
  // BUG saiu em 2026-08-31 (PH-368): a arte trocou de um respingo diagonal
  // (5446, que era grama) pra aneis de som empilhados (4675), e aneis apontam
  // pra CIMA. Girar pro alvo deitaria a pilha no chao.
  const GIRAM = ['FIRE', 'DARK']
  // As que sao assimetricas mas NAO podem girar: elas apontam pra CIMA
  // (cupula, coluna, nuvem, pilha de anel), nao pro alvo. Girar deitaria todas
  // no chao — e o erro que um teste ingenuo de "assimetrica? gira" produziria.
  const ANCORADAS_NO_CHAO = ['PSYCHIC', 'FLYING', 'POISON', 'FAIRY', 'BUG']

  it('exatamente as medidas como direcionais estao marcadas', () => {
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
    expect(o.giroParaOAlvo).toBe(0)
    expect(o.giroDaBase).toBe(-0)
    expect(o.espelharY).toBe(false)
  })

  it('alvo a esquerda gira meia volta E espelha, pra arte nao ficar de ponta-cabeca', () => {
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.FIRE, Math.PI)
    expect(o.giroParaOAlvo).toBeCloseTo(Math.PI, 6)
    expect(o.espelharY).toBe(true)
  })

  it('a base da arte e descontada: o talho do DARK sai reto, nao 41° torto', () => {
    // Ele nasce em -41° no arquivo. Mirando em -41°, a soma dos dois giros tem
    // que ser ZERO — sem descontar a base, a arte sairia sempre 41° fora da
    // linha do golpe.
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.DARK, (-41 * Math.PI) / 180)
    expect(o.giroParaOAlvo + o.giroDaBase).toBeCloseTo(0, 6)
  })

  it('a MIRA sobrevive ao espelho, mesmo com arte de eixo vertical', () => {
    // O bug que esta funcao teve ate 2026-08-19, e a razao de existirem dois
    // giros. Com um giro so e o espelho aplicado antes dele, a reflexao
    // acontecia em volta da horizontal DO ARQUIVO: arte desenhada de cima pra
    // baixo (base 98°, o punho do Shadow Punch) chegava pelo lado OPOSTO ao do
    // atacante sempre que o alvo estava a esquerda.
    //
    // O teste mede o que importa: pra onde aponta o vetor "frente" da arte
    // depois da cadeia inteira. Ele tem que apontar pro alvo, e so.
    const vertical = { url: 'x', quadros: 1, direcional: { anguloBaseGraus: 98 } } as TiraDeVfx
    for (const grausDoAlvo of [0, 45, 90, 135, 180, -45, -90, -135]) {
      const alvo = (grausDoAlvo * Math.PI) / 180
      const o = orientacaoDaTira(vertical, alvo)
      // frente da arte, no espaco do arquivo
      const base = (98 * Math.PI) / 180
      let fx = Math.cos(base)
      let fy = Math.sin(base)
      // rotate(giroDaBase)
      let x = fx * Math.cos(o.giroDaBase) - fy * Math.sin(o.giroDaBase)
      let y = fx * Math.sin(o.giroDaBase) + fy * Math.cos(o.giroDaBase)
      // scale(1, -1)
      if (o.espelharY) y = -y
      // rotate(giroParaOAlvo)
      fx = x * Math.cos(o.giroParaOAlvo) - y * Math.sin(o.giroParaOAlvo)
      fy = x * Math.sin(o.giroParaOAlvo) + y * Math.cos(o.giroParaOAlvo)
      // ...e tem que coincidir com a direcao do golpe
      expect(Math.atan2(fy, fx), `alvo em ${grausDoAlvo}°`).toBeCloseTo(alvo, 6)
    }
  })

  it('sem angulo (golpe em si mesmo, area) nada gira, nada recorta, ancora no centro', () => {
    // O caminho do AOE. Recorte de 1 aqui NAO e detalhe: `recorteX` corta a
    // cauda do jato pro impacto alvo-unico caber nos 39px de alcance, e a
    // area de efeito nao tem cauda pra cortar — recortar o AOE mentiria sobre
    // o raio do golpe, que e o unico dado que aquele desenho carrega.
    const o = orientacaoDaTira(TIRA_POR_ELEMENTO.FIRE, undefined)
    expect(o).toEqual({ giroParaOAlvo: 0, giroDaBase: 0, espelharY: false, ancoraX: 0.5, recorteX: 1 })
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
