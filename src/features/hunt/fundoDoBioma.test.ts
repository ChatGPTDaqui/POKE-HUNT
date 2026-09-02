// PH-441: existe exatamente uma arte de fundo por bioma, e o nome do arquivo e
// a chave do bioma.
//
// ARTE AUSENTE E FALHA SILENCIOSA. Um `<img src>` que da 404 nao lanca erro, nao
// aparece em console de producao e nao reprova teste nenhum: a trilha
// simplesmente fica com a cor de fundo e ninguem descobre ate alguem abrir
// aquele bioma especifico. Com 12 biomas, "alguem abriu todos" nao acontece por
// acaso.
//
// O nome tambem importa. As artes chegaram como "campo aberto.jpg", "Mata.jpg" e
// "metropole.jpg" — espaco, maiuscula, e um nome que NAO e o do bioma (o Urbano).
// Qualquer um dos tres vira URL fragil ou arquivo que nunca e pedido.
import { describe, expect, it } from 'vitest'

import { BIOMAS } from '@/data/biomas'
import { urlDoFundoDoBioma } from './TrilhaDeEstagios'

const ARTES = import.meta.glob('/assets/biome-selector/*.jpg', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>

const NOMES = Object.keys(ARTES).map((c) => c.split('/').pop()!).sort()

describe('o fundo da trilha', () => {
  it('a varredura enxergou o diretorio de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado, todo teste abaixo passaria
    // medindo lista vazia — que e exatamente o modo de falha que este arquivo
    // existe pra pegar.
    expect(NOMES.length).toBeGreaterThan(0)
  })

  it('tem uma arte por bioma, sem faltar', () => {
    const faltando = BIOMAS
      .map((b) => `${b.chave}.jpg`)
      .filter((n) => !NOMES.includes(n))
    expect(faltando, 'bioma sem arte de fundo').toEqual([])
  })

  it('nao tem arte sobrando, apontando pra bioma que nao existe', () => {
    const chaves = new Set(BIOMAS.map((b) => `${b.chave}.jpg`))
    const sobrando = NOMES.filter((n) => !chaves.has(n))
    // Arte orfa nao quebra nada — ela so pesa no download e no repo pra sempre,
    // porque ninguem sabe dizer se ainda e usada.
    expect(sobrando, 'arte que nenhum bioma pede').toEqual([])
  })

  it('o nome do arquivo e a CHAVE do bioma, nao o nome de exibicao', () => {
    // `metropole.jpg` era o Urbano; `Mata.jpg` tinha maiuscula; `campo
    // aberto.jpg` tinha espaco. Nenhum dos tres sobreviveria a uma URL.
    for (const n of NOMES) {
      expect(n, `${n} tem caractere fragil pra URL`).toMatch(/^[a-z_]+\.jpg$/)
    }
  })

  it('a URL que o componente monta e RELATIVA e casa com o arquivo', () => {
    // Caminho absoluto quebraria no site publicado sem quebrar em dev: em dev o
    // plugin do Vite serve `/assets/*`, no `dist` a arte e copiada pra
    // `dist/assets` e o app e servido da raiz — mas o codigo do jogo referencia
    // arte por caminho RELATIVO em todo lugar (ver data/sprites.ts).
    for (const bioma of BIOMAS) {
      const url = urlDoFundoDoBioma(bioma.chave)
      expect(url.startsWith('/'), `${bioma.chave}: url absoluta`).toBe(false)
      expect(url).toBe(`assets/biome-selector/${bioma.chave}.jpg`)
      expect(NOMES).toContain(url.split('/').pop())
    }
  })
})
