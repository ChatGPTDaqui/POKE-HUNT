// PH-246 — quanta Stone de cada tipo o jogo realmente oferece.
//
// FONTE UNICA da metrica, de proposito. Quem usa isto:
//
//   - `scripts/gerar-custo-de-especialidade.ts`, pra decidir o custo de cada
//     tipo (e emitir tanto o modulo do cliente quanto a migration da RPC);
//   - `custoDeEspecialidade.test.ts`, pra reprovar se o esforco entre os tipos
//     sair do acordado.
//
// Ter os dois lendo a MESMA funcao nao e detalhe: a primeira tentativa desta
// issue tinha o gerador estimando a oferta em Node (por sub-bioma, lendo
// `subBiomas.generated.ts`) e o teste medindo os `enemyPool` de verdade. As
// duas contas discordaram feio — o gerador dizia que os tipos estavam
// equilibrados em 1,01x e a medicao real dava 39,7x, porque o pool de uma hunt
// e a UNIAO das salas do bioma e dilui a concentracao de um sub-bioma isolado.
// Estimativa e medicao divergindo em silencio e exatamente o defeito que
// PH-245 veio consertar do lado das missoes; nao faz sentido reintroduzi-lo
// aqui.
import { SPECIES } from './pokes'
import { MAPS } from './maps'
import { ENCOUNTERS } from './enemies'
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

/**
 * Chance de um abate soltar UMA Stone, de qualquer tipo. Espelha
 * `STONE_DROP_CHANCE` de `economySystem.ts` — o valor vem da planilha, com
 * este mesmo default.
 */
export const CHANCE_DE_STONE = 0.05

/**
 * Chance de um abate NESTE pool soltar `stone_<tipo>`, ponderada pelo peso de
 * spawn de cada especie.
 *
 * Espelha a regra de `awardKillLoot` depois de PH-246: especie de dois tipos
 * solta a Stone de um dos dois, meio a meio. Antes o drop olhava so o tipo
 * primario, e como NENHUMA especie do catalogo tem FLYING como primario, a
 * Pedra FLYING nao caia de lugar nenhum.
 */
export function chancePorTipoNoPool(enemyPool: readonly string[]): Map<ElementType, number> {
  const linhas: { tipos: ElementType[]; peso: number }[] = []
  for (const encId of enemyPool) {
    const enc = (ENCOUNTERS as Record<string, { speciesId?: string; weight?: number }>)[encId]
    const sp = enc?.speciesId ? SPECIES[enc.speciesId] : undefined
    if (!sp) continue
    linhas.push({ tipos: sp.type2 ? [sp.type, sp.type2] : [sp.type], peso: enc?.weight ?? 1 })
  }
  const out = new Map<ElementType, number>()
  const total = linhas.reduce((s, l) => s + l.peso, 0)
  if (!total) return out
  for (const { tipos, peso } of linhas) {
    for (const t of tipos) {
      out.set(t, (out.get(t) ?? 0) + ((peso / total) * CHANCE_DE_STONE) / tipos.length)
    }
  }
  return out
}

/**
 * Pra cada tipo, a melhor chance por abate que existe em ALGUMA hunt — a
 * oferta que o jogador consegue se for farmar no lugar certo.
 *
 * E a melhor hunt, e nao a media do jogo, porque ninguem farma Stone andando
 * por tudo por igual: quem quer Pedra DARK vai pro bioma sombrio. Medir pela
 * media global fazia os tipos concentrados num bioma so (DARK, ICE) parecerem
 * muito mais escassos do que sao na pratica.
 *
 * 0 significa que NENHUMA hunt solta aquela Stone — um tipo nesse estado nao
 * pode ter especialidade a venda, e `custoDeEspecialidade.test.ts` reprova.
 */
export function ofertaDeStonePorTipo(): Record<ElementType, number> {
  const melhor = new Map<ElementType, number>()
  for (const mapa of Object.values(MAPS as Record<string, { enemyPool?: string[] }>)) {
    for (const [tipo, chance] of chancePorTipoNoPool(mapa.enemyPool ?? [])) {
      if (chance > (melhor.get(tipo) ?? 0)) melhor.set(tipo, chance)
    }
  }
  const tipos = Object.keys(TYPE_COLORS) as ElementType[]
  return Object.fromEntries(tipos.map((t) => [t, melhor.get(t) ?? 0])) as Record<ElementType, number>
}
