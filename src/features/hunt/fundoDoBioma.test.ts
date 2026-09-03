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
import { statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { BIOMAS } from '@/data/biomas'
import { urlDaMiniaturaDoBioma, urlDoFundoDoBioma } from './TrilhaDeEstagios'

const ARTES = import.meta.glob('/assets/biome-selector/*.jpg', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>

const NOMES = Object.keys(ARTES).map((c) => c.split('/').pop()!).sort()

const MINIATURAS = import.meta.glob('/assets/biome-selector/mini/*.webp', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>

const NOMES_MINI = Object.keys(MINIATURAS).map((c) => c.split('/').pop()!).sort()

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

// PH-469: a MINIATURA, que e o icone do cartao de bioma.
//
// O MESMO MODO DE FALHA SILENCIOSA do bloco acima, e um segundo em cima dele:
// a miniatura e DERIVADA (gerada por `scripts/gerar-miniaturas-de-bioma.py` a
// partir do `.jpg` ao lado), entao ela pode ficar para tras sem nada avisar —
// bioma novo entra com arte de fundo e sem miniatura, e o cartao dele fica com
// um quadrado de cor no lugar do icone. Este bloco liga as duas listas.
describe('a miniatura do cartao de bioma', () => {
  it('a varredura enxergou o diretorio de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado, "nao falta nenhuma" passaria
    // comparando duas listas vazias.
    expect(NOMES_MINI.length).toBeGreaterThan(0)
  })

  it('tem uma miniatura por bioma, sem faltar', () => {
    const faltando = BIOMAS
      .map((b) => `${b.chave}.webp`)
      .filter((n) => !NOMES_MINI.includes(n))
    expect(faltando, 'bioma sem miniatura — rode scripts/gerar-miniaturas-de-bioma.py').toEqual([])
  })

  it('nao tem miniatura sobrando', () => {
    const chaves = new Set(BIOMAS.map((b) => `${b.chave}.webp`))
    expect(NOMES_MINI.filter((n) => !chaves.has(n)), 'miniatura orfa').toEqual([])
  })

  it('a URL do componente e RELATIVA e casa com o arquivo', () => {
    for (const bioma of BIOMAS) {
      const url = urlDaMiniaturaDoBioma(bioma.chave)
      expect(url.startsWith('/'), `${bioma.chave}: url absoluta`).toBe(false)
      expect(url).toBe(`assets/biome-selector/mini/${bioma.chave}.webp`)
      expect(NOMES_MINI).toContain(url.split('/').pop())
    }
  })

  it('e LEVE — o ponto dela e nao baixar as 12 artes de 3 MB', () => {
    // O numero e o motivo da miniatura existir. Sem piso, alguem "regenera" as
    // miniaturas em 2048px um dia, o teste continua verde, e a tela de 12
    // cartoes volta a baixar dezenas de MB pra desenhar 12 icones de 2em.
    const pesadas: string[] = []
    for (const caminho of Object.keys(MINIATURAS)) {
      // `import.meta.glob` com `?url` nao da tamanho; o peso vem do disco.
      const bytes = tamanhoNoDisco(caminho)
      if (bytes > 60 * 1024) pesadas.push(`${caminho} = ${(bytes / 1024).toFixed(0)} KB`)
    }
    expect(pesadas, 'miniatura acima de 60 KB').toEqual([])
  })
})

function tamanhoNoDisco(caminhoDoGlob: string): number {
  // O glob devolve caminho com raiz no projeto (`/assets/...`); `statSync`
  // precisa do caminho de sistema de arquivos.
  const rel = caminhoDoGlob.replace(/^\//, '')
  return statSync(new URL(`../../../${rel}`, import.meta.url)).size
}
