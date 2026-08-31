// A qual regiao cada especie pertence, e quais especies nunca aparecem
// selvagens.
//
// O numero da Pokedex Nacional e a unica divisao real entre Kanto e Johto
// (#1-151 / #152-251) e ele ja viaja no catalogo sincronizado, dentro de
// `species.description` ("Pokedex Nº4 - tipo FIRE.") — coluna que
// scripts/sync-planilha.js monta a partir da aba "Especies". Extrair dali
// evita uma segunda tabela de 226 linhas escrita a mao, que divergiria do
// catalogo no primeiro sync.
//
// A extracao ESTOURA se alguma especie nao casar, em vez de cair num
// fallback: uma especie sem numero viraria "Johto" em silencio e passaria a
// spawnar na regiao errada — exatamente o tipo de erro que este arquivo
// existe pra impedir. Conferido no roster atual: 226/226 casam.
import { SPECIES_DATA } from './generated/pokes.generated'

export type Region = 'kanto' | 'johto'

// Ultimo numero da Pokedex de Kanto (Gen1). #152 em diante e Johto (Gen2).
const LAST_KANTO_DEX = 151

const DEX_RE = /Nº\s*(\d+)/

export const POKEDEX_NUMBER: Record<string, number> = Object.fromEntries(
  Object.entries(SPECIES_DATA).map(([id, species]) => {
    const match = species.description.match(DEX_RE)
    if (!match) {
      throw new Error(
        `Especie "${id}" sem numero de Pokedex na descricao ("${species.description}") — ` +
        'sem ele nao da pra dizer se ela e de Kanto ou de Johto.'
      )
    }
    return [id, Number(match[1])]
  })
)

export function pokedexNumber(speciesId: string): number {
  const dex = POKEDEX_NUMBER[speciesId]
  if (dex == null) throw new Error(`Especie desconhecida: ${speciesId}`)
  return dex
}

export function regionOfSpecies(speciesId: string): Region {
  return pokedexNumber(speciesId) <= LAST_KANTO_DEX ? 'kanto' : 'johto'
}

export const REGIONS: Region[] = ['johto', 'kanto']

export const REGION_LABEL: Record<Region, string> = { johto: 'Johto', kanto: 'Kanto' }

// Especies que nunca sao encontro selvagem, por pedido explicito do usuario
// ("Remova Porygon e Eevee (e outros exclusivos de cassino) de todas as
// tabelas de spawn das hunts selvagens").
//
// Lista curta e EXPLICITA de proposito. A tentacao era derivar de
// `scripts/spawn-tiers.json` (o campo `origem: 'regra'` marca as 94 especies
// sem nenhum encontro selvagem real em Gen1/Gen2), mas aquele conjunto inclui
// toda forma evoluida por pedra/troca e todo fossil — tirar as 94 esvaziaria
// metade das hunts. O que o pedido descreve e a categoria "so se obtem fora
// do mato": Porygon e premio de cassino, Eevee e presente, e Porygon2 so
// existe evoluindo o Porygon.
//
// AS CINCO EVOLUCOES DO EEVEE ENTRARAM DEPOIS, e a falta delas era um furo, nao
// uma decisao. A regra sempre foi "so se obtem fora do mato", e o Eevee e
// presente do Campeao Lance (migration `eevee_do_lance`) — entao Vaporeon,
// Jolteon, Flareon, Espeon e Umbreon so podem vir de evoluir aquele Eevee,
// exatamente como Porygon2 so vem de evoluir o Porygon, que ja estava na lista
// por esse motivo.
//
// Elas estavam spawnando: as pools do PokeRogue dao casa pras cinco (Umbreon e
// ate BOSS_RARE do Abismo, ou seja, seria Lord de sala), e o cruzamento so
// filtrava as tres chaves escritas aqui. Ninguem notou porque o resultado nao e
// um erro — e um Umbreon selvagem, que parece conteudo.
//
// EFEITO COLATERAL ACEITO: sem outra fonte de obtencao implementada, Porygon e
// Porygon2 nao sao obteniveis no jogo (o Eevee e as evolucoes dele sao, pelo
// presente do Lance). Continuam no catalogo — stats, moveset, sprite,
// Bestiario — pro dia que um cassino/loja de premios existir.
export const NON_WILD_SPECIES = new Set([
  'porygon', 'porygon2',
  'eevee', 'vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon',
])
