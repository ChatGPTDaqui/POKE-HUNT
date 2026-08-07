// Tasks & Missoes — shell da tela no desenho novo, sem dado fabricado.
//
// POR QUE ESTA VAZIA: nao existe sistema de missao no jogo. Nao ha tabela de
// missoes na planilha nem no Postgres, nao ha campo de progresso no save
// (`GameStateData` nao tem nada parecido), e nenhuma acao concede recompensa de
// task. Preencher com "Derrote 50 Hoppip — 32/50" (os dados do prototipo)
// mostraria uma barra que nunca anda e um botao "Resgatar" que nao paga nada —
// pior que uma tela honestamente vazia, porque parece um bug.
//
// Quando o sistema existir, o unico trabalho aqui e trocar a lista: o card ja
// esta desenhado abaixo (icone, descricao, barra, recompensa, Resgatar).
import { CheckSquare } from '@phosphor-icons/react'
import { ComingSoon } from '@/components/game/controls'

export function TasksMenu() {
  return (
    <ComingSoon icon={<CheckSquare />} title="Missões ainda não existem">
      O jogo ainda não tem sistema de missões: nada no save registra progresso de task, e nenhuma ação
      concede recompensa por objetivo. Esta tela fica reservada para quando ele existir — hoje quem quer
      acompanhar progresso tem a <b>Pokedex</b> (registro por espécie) e o <b>Bestiário</b> (abates por
      espécie).
    </ComingSoon>
  )
}
