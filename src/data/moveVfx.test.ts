// Arte por GOLPE falha em silêncio de três jeitos, e nenhum lança exceção.
//
// 1. Caminho errado. `drawQuadroDeTira` devolve `false` quando a imagem não
//    carrega, e quem chama cai na tira do TIPO — que é uma arte válida. O golpe
//    simplesmente nunca mostra a arte dele, e ninguém nota, porque o que aparece
//    na tela é bonito e do elemento certo.
// 2. Id de golpe que não existe no catálogo. A entrada fica no arquivo, o
//    preload não a alcança (ela nem está lá), e `vfxDoGolpe` nunca encontra o id
//    porque nenhum POKE aprende esse golpe.
// 3. `quadros` diferente do que a tira tem. A largura do quadro sai de
//    `naturalWidth / quadros`: errar o número não quebra o desenho, ele passa a
//    mostrar um pedaço de dois quadros ao mesmo tempo, em toda a animação.
//
// O item 3 precisa ler os BYTES do PNG e por isso mora em
// `scripts/conferir-direcao-vfx.mjs`, que já decodifica as tiras — ele falha com
// código de saída se algum `quadros` não dividir a largura. Aqui ficam 1 e 2.
import { describe, expect, it } from 'vitest'

import { ABILITIES_DATA } from './generated/abilities.generated'
import { VFX_POR_GOLPE, todasAsTirasDeGolpe, vfxDoGolpe, repeticoesDoGolpe } from './moveVfx'

// `import.meta.glob` e não `node:fs`: confere contra o que o Vite realmente
// empacota, não contra o disco cru. É a mesma escolha de `vfxTiras.test.ts`, e
// pelo mesmo motivo — um arquivo que existe em disco mas fora do alcance do
// bundler não chega ao jogador.
const ARQUIVOS = new Set(
  Object.keys(import.meta.glob('/assets/move-vfx/golpes/*.png')).map((p) => p.replace(/^\//, '')),
)

describe('arte de efeito por golpe', () => {
  it('toda tira cadastrada existe', () => {
    const faltando = todasAsTirasDeGolpe().filter((url) => !ARQUIVOS.has(url))
    expect(faltando, 'caminho errado não quebra nada — só devolve a arte do tipo').toEqual([])
  })

  it('nenhuma tira em disco fica órfã', () => {
    // O outro lado: arte exportada e esquecida fora do cadastro pesa no
    // repositório e no deploy sem nunca aparecer no jogo. Foi assim que
    // `cave-volcanic` passou duas levas sem grade de colisão.
    const usadas = new Set(todasAsTirasDeGolpe())
    const orfas = [...ARQUIVOS].filter((f) => !usadas.has(f))
    expect(orfas).toEqual([])
  })

  it('todo golpe cadastrado existe no catálogo', () => {
    const desconhecidos = Object.keys(VFX_POR_GOLPE).filter((id) => !(id in ABILITIES_DATA))
    expect(
      desconhecidos,
      'arte cadastrada para um id que nenhum POKE aprende nunca aparece em jogo',
    ).toEqual([])
  })

  it('quadros é sempre positivo', () => {
    const ruins = Object.entries(VFX_POR_GOLPE)
      .flatMap(([id, v]) => [[id, v.single] as const, ...(v.aoe ? [[id, v.aoe] as const] : [])])
      .filter(([, t]) => !Number.isInteger(t.quadros) || t.quadros < 1)
      .map(([id]) => id)
    expect(ruins).toEqual([])
  })

  it('a âncora fica dentro do quadro e o recorte dentro de (0,1]', () => {
    for (const [id, v] of Object.entries(VFX_POR_GOLPE)) {
      const d = v.single.direcional
      if (!d) continue
      expect(d.ancoraX ?? 0.5, id).toBeGreaterThanOrEqual(0)
      expect(d.ancoraX ?? 0.5, id).toBeLessThanOrEqual(1)
      expect(d.recorteX ?? 1, id).toBeGreaterThan(0)
      expect(d.recorteX ?? 1, id).toBeLessThanOrEqual(1)
    }
  })

  it('golpe sem arte própria não muda de comportamento', () => {
    // A garantia de que esta camada é aditiva: os 450+ golpes sem entrada aqui
    // continuam caindo na tira do tipo, e `repeticoes` volta 1 (nenhuma
    // esticada de duração).
    expect(vfxDoGolpe('tackle')).toBeNull()
    expect(vfxDoGolpe(undefined)).toBeNull()
    expect(repeticoesDoGolpe('tackle')).toBe(1)
    expect(repeticoesDoGolpe(undefined)).toBe(1)
  })

  it('a área reusa a tira do impacto, nunca uma arte diferente', () => {
    // Decisão registrada: a leitura de "isto pegou uma área" vem do TAMANHO (o
    // desenho de área usa o diâmetro real do raio), não de um segundo desenho.
    // Se um dia um golpe precisar de arte de área própria, este teste cai e
    // obriga a decisão a ser explícita em vez de acidental.
    for (const [id, v] of Object.entries(VFX_POR_GOLPE)) {
      if (!v.aoe) continue
      expect(v.aoe.url, id).toBe(v.single.url)
      expect(v.aoe.quadros, id).toBe(v.single.quadros)
    }
  })
})
