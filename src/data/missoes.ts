// "Tasks & Missões" (PH-199) — cadeia de missões de abate por tipo elemental,
// equivalente ao "Linked Tasks" do pokedream.com.br. Mecanica de referencia
// (cadeia sequencial por tipo, bonus ao completar); numeros e fonte de dado
// sao proprios deste jogo.
//
// A CADEIA NAO E MAIS DERIVADA AQUI (PH-245). Ela e lida de
// `generated/missaoCadeia.generated.ts`, que sai de
// `scripts/gerar-cadeia-de-missoes.mjs` — o MESMO gerador que emite o par de
// migrations que popula a tabela `missao_cadeia` lida pela RPC.
//
// POR QUE MUDOU: a primeira versao derivava a cadeia dos dois lados — aqui a
// partir de `SPECIES`, e dentro da propria `reivindicar_missao` a partir de
// `public.species`. O comentario de la dizia que os dois lados "so precisam
// concordar numa FORMULA pequena, nao numa lista de ~245 linhas". Concordar na
// formula nao basta: eles tambem precisam concordar no CONJUNTO DE ENTRADA, e
// nao concordavam. O banco tem 251 especies e o catalogo do cliente tem 245
// (faltam vulpix, ninetales, chansey, blissey, mr__mime, shuckle), e 4
// especies tem tipo diferente nos dois lados porque o retype de Fairy entrou
// so no cliente. Medido em 28/08: as cadeias divergiam em 6 dos 18 tipos, e
// FAIRY divergia ja na posicao 1 — a tela oferecia `clefairy` e a RPC
// respondia "essa especie nao pertence a cadeia desse tipo", entao a cadeia
// inteira era inalcancavel sob autoridade.
//
// A regra de elegibilidade e a ordem vivem no gerador, com o porque de cada
// uma. Em resumo: entram so especies do elenco do cliente que aparecem em
// algum sub-bioma e nao sao lendarias, ordenadas por dificuldade real de farm
// (peso de spawn, depois estagio de evolucao, depois dex) — e nao por numero
// de Pokedex, que era o que punha Charizard como missao 1 de FLYING.
import { MISSAO_CADEIA } from './generated/missaoCadeia.generated'
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

export const MISSAO_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

export interface MissaoInfo {
  speciesId: string
  posicao: number
  alvo: number
  recompensa: number
  ehUltima: boolean
}

// Indexado uma vez no import: `MISSAO_CADEIA` e constante, e `cadeiaDoTipo` e
// chamada por render de card na tela de Tasks.
const POR_TIPO = ((): Record<string, MissaoInfo[]> => {
  const mapa: Record<string, MissaoInfo[]> = {}
  for (const linha of MISSAO_CADEIA) {
    ;(mapa[linha.tipo] ??= []).push({
      speciesId: linha.speciesId,
      posicao: linha.posicao,
      alvo: linha.alvo,
      recompensa: linha.recompensa,
      ehUltima: linha.ehUltima,
    })
  }
  // O gerador ja emite em ordem de posicao; ordenar aqui de novo custa uma vez
  // e tira a dependencia dessa premissa continuar valendo.
  for (const lista of Object.values(mapa)) lista.sort((a, b) => a.posicao - b.posicao)
  return mapa
})()

export function cadeiaDoTipo(tipo: ElementType): MissaoInfo[] {
  return POR_TIPO[tipo] ?? []
}

export function chaveDaMissao(tipo: ElementType, speciesId: string): string {
  return `${tipo}:${speciesId}`
}

/** Inversa de `chaveDaMissao` — species id nunca tem ':' (e um slug snake_case). */
export function missaoDaChave(chave: string): { tipo: ElementType; speciesId: string } {
  const i = chave.indexOf(':')
  return { tipo: chave.slice(0, i) as ElementType, speciesId: chave.slice(i + 1) }
}
