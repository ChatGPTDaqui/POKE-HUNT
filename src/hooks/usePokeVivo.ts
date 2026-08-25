// PH-155 — o POKE que a tela recebeu por prop pode estar CONGELADO.
//
// `usePokeProfileStore#showProfile` grava o OBJETO `poke` tirado no clique, e
// nao o `uid`. Isso e proposital e nao da pra simplesmente trocar: o mesmo
// modal abre com POKE de PREVIEW na Pokedex e no ranking — instancias criadas
// na hora, que nao existem em `team` nem em `bagPokes` e das quais nao ha nada
// vivo pra reler.
//
// O preco e que, pro POKE que E do jogador, aquele objeto nunca mais muda: ele
// sobe de nivel, toma dano, aprende golpe, e a tela continua mostrando o
// retrato do instante do clique.
//
// Este hook e o unico lugar que resolve isso. A versao anterior resolvia dentro
// da `MovesetTable`, e o resultado foi que, no MESMO modal, a tabela de golpes
// ficou viva e o cabecalho continuou morto — o nivel no `ProfileHero` nao
// mudava quando o POKE upava com o modal aberto. Tres consumidores com tres
// contornos e como aquele bug sobreviveu a propria correcao.
import { useGameStateStore } from '@/stores/gameStateStore'
import type { PokeInstance } from '@/data/pokes'

/**
 * Devolve a instancia VIVA do POKE (equipe ou mochila, por `uid`), ou o proprio
 * argumento quando ele nao e do jogador.
 *
 * O `?? poke` do fim nao e defensivo: e o caminho normal do POKE de preview,
 * que precisa continuar funcionando exatamente como antes.
 */
export function usePokeVivo(poke: PokeInstance): PokeInstance {
  const equipe = useGameStateStore((s) => s.team)
  const mochila = useGameStateStore((s) => s.bagPokes)
  return equipe.find((p) => p.uid === poke.uid) ?? mochila.find((p) => p.uid === poke.uid) ?? poke
}
