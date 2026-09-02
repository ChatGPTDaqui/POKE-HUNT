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
// nao concordavam.
//
// O QUE FOI MEDIDO EM 28/08, e que motivou a mudanca: o banco tinha 251
// especies e o catalogo do cliente 245, e 4 especies tinham tipo diferente nos
// dois lados porque o retype de Fairy tinha entrado so no cliente. As cadeias
// divergiam em 6 dos 18 tipos, e FAIRY divergia ja na posicao 1 — a tela
// oferecia `clefairy` e a RPC respondia "essa especie nao pertence a cadeia
// desse tipo", entao a cadeia inteira era inalcancavel sob autoridade.
//
// O QUE MUDOU DESDE ENTAO, pra ninguem ler o paragrafo acima como estado atual
// (conferido em 02/09, PH-413):
//  - O retype de Fairy foi pro banco na migration `tipos_fairy_no_catalogo`
//    (30/08). As 12 especies da linha batem nos dois lados hoje.
//  - Os numeros sao 386 no banco e 380 no cliente (PH-332 ligou a Geracao III).
//
// A DECISAO CONTINUA A MESMA, e por um motivo que nao envelhece: a diferenca de
// conjunto e ESTRUTURAL, nao um dado torto que se conserta. O cliente so recebe
// especie alcancavel (`syncSpeciesAndMoves`: starter, lendaria, quem aparece em
// hunt, e a cadeia de evolucao dessas); o banco recebe o catalogo inteiro via
// `catalog:migrar`. Vai diferir sempre. Derivar a lista dos dois lados volta a
// divergir no dia em que uma hunt mudar de elenco.
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

// Re-export por compatibilidade: as duas moraram aqui e todo call site importa
// daqui. Quem precisa SO da chave deve importar de `./missaoChave` direto —
// ver a nota de la sobre os 38 kB que isto custava no bundle da Edge.
export { chaveDaMissao, missaoDaChave } from './missaoChave'
