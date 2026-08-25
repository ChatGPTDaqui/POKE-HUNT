// PH-146 — o elenco do jogo não muda por acidente.
//
// `DEX_MAX` decide o elenco inteiro: quais espécies existem, quais hunts são
// montadas, o que entra no Modo Pesadelo, o que a Pokédex lista. Enquanto era
// uma constante, mudá-lo exigia editar o arquivo. Virou parâmetro para a geração
// III poder ser PREPARADA sem entrar no jogo — e um parâmetro é exatamente o que
// se erra sem perceber.
//
// O modo de falha que este arquivo existe para impedir: alguém roda
// `npm run usum:baixar -- --dex-max=386` sem `--saida`, sobrescreve
// `catalog.json`, e o próximo `usum:gerar` põe 135 espécies de Hoenn em produção
// — sem arte, sem peso de spawn, sem ninguém ter pedido. O estrago aparece longe
// da causa.
import { describe, expect, it } from 'vitest'

import { SPECIES_DATA } from './generated/pokes.generated'

const FETCH = import.meta.glob('/scripts/fetch-usum-catalog.js', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const CATALOGO = import.meta.glob('/scripts/usum/catalog*.json', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const fonte = Object.values(FETCH)[0]

/**
 * Quantas espécies o jogo tem hoje.
 *
 * Este número É o teste. Ele sobe quando alguém acrescenta uma espécie de
 * propósito (PH-145 levou 226 → 245, fechando as evoluções que faltavam), e
 * atualizá-lo é uma linha — o ponto é que a linha seja ESCRITA, num diff que
 * alguém lê, e não apareça sozinha.
 */
const ELENCO_ESPERADO = 245

/** Kanto + Johto. A geração III fica fora até uma issue própria ligá-la. */
const DEX_MAX_ESPERADO = 251

describe('o recorte da Pokédex (PH-146)', () => {
  it(`o jogo tem exatamente ${ELENCO_ESPERADO} espécies`, () => {
    expect(Object.keys(SPECIES_DATA)).toHaveLength(ELENCO_ESPERADO)
  })

  it('nenhuma espécie do jogo passa do dex 251', () => {
    // O número de espécies pode bater por coincidência (uma entra, outra sai).
    // O recorte é a propriedade que interessa.
    const foraDoRecorte: string[] = []
    for (const [id, dados] of Object.entries(SPECIES_DATA)) {
      const dex = Number(dados.description.match(/Nº\s*(\d+)/)?.[1])
      if (!Number.isInteger(dex)) throw new Error(`${id} sem número de Pokédex na descrição`)
      if (dex > DEX_MAX_ESPERADO) foraDoRecorte.push(`${id} (#${dex})`)
    }
    expect(foraDoRecorte).toEqual([])
  })

  it(`o padrão do gerador continua ${DEX_MAX_ESPERADO}`, () => {
    expect(fonte).toContain(`const DEX_MAX_PADRAO = ${DEX_MAX_ESPERADO};`)
  })

  it('mudar o recorte sem dizer onde gravar é ERRO, não aviso', () => {
    // A trava inteira. Sem ela o parâmetro é uma arma apontada para o catálogo
    // de produção.
    expect(fonte).toMatch(/n !== DEX_MAX_PADRAO && !SAIDA/)
    expect(fonte).toContain('muda o elenco do jogo inteiro')
  })

  it('o catálogo do jogo se declara como o recorte padrão', () => {
    const [, cru] = Object.entries(CATALOGO).find(([nome]) => nome.endsWith('/catalog.json'))!
    const catalogo = JSON.parse(cru)
    expect(catalogo._recorte).toEqual({ dexMax: DEX_MAX_ESPERADO, padrao: true })
  })

  it('o catálogo da geração III existe, e NÃO se declara padrão', () => {
    // Guarda dos dois lados: o de preparação precisa existir (senão o trabalho
    // de PH-146 sumiu num merge) e precisa estar marcado como não-padrão (senão
    // alguém o confunde com a fonte do jogo).
    const achado = Object.entries(CATALOGO).find(([nome]) => nome.endsWith('/catalog-gen3.json'))
    expect(achado, 'scripts/usum/catalog-gen3.json não existe').toBeTruthy()
    const catalogo = JSON.parse(achado![1])
    expect(catalogo._recorte).toEqual({ dexMax: 386, padrao: false })
    expect(catalogo.especies).toHaveLength(386)
  })

  it('nada em src/ importa o catálogo da geração III', () => {
    // O arquivo é de preparação. No dia em que alguém o importar de dentro do
    // jogo, a geração está ligada — e isso tem que ser uma decisão, não um
    // import solto. `import.meta.glob` não serve aqui (ele resolve, não busca),
    // então a varredura é sobre o texto dos módulos do próprio jogo.
    const MODULOS = import.meta.glob('/src/**/*.{ts,tsx}', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>
    const culpados = Object.entries(MODULOS)
      .filter(([nome]) => !nome.endsWith('recorteDaPokedex.test.ts'))
      .filter(([, conteudo]) => conteudo.includes('catalog-gen3'))
      .map(([nome]) => nome)
    expect(culpados).toEqual([])
  })
})
