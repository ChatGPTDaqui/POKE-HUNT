// A chave de uma missao reivindicada — separada de `missoes.ts` de proposito.
//
// `playerMapper.ts` precisa so disto pra montar `missoesReivindicadas` a
// partir das linhas do banco, e `playerMapper` entra no bundle da Edge
// Function. Enquanto as duas funcoes viviam em `missoes.ts`, importar
// `chaveDaMissao` arrastava junto `generated/missaoCadeia.generated.ts` — as
// 335 linhas da cadeia inteira, 38 kB de dado que o servidor nunca le (quem
// valida missao la e a RPC `reivindicar_missao`, que consulta a tabela
// `missao_cadeia` no Postgres).
//
// `missoes.ts` re-exporta as duas, entao nenhum call site precisou mudar.
import type { ElementType } from './generated/types'

export function chaveDaMissao(tipo: ElementType, speciesId: string): string {
  return `${tipo}:${speciesId}`
}

/** Inversa de `chaveDaMissao` — species id nunca tem ':' (e um slug snake_case). */
export function missaoDaChave(chave: string): { tipo: ElementType; speciesId: string } {
  const i = chave.indexOf(':')
  return { tipo: chave.slice(0, i) as ElementType, speciesId: chave.slice(i + 1) }
}
