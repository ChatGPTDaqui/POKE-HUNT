import { useEffect } from 'react'
import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { commitAgora } from '@/data/remote/autoridade'

// Level-up e um evento CRITICO: grava na hora, sem esperar o ciclo normal.
//
// Bug relatado: "dou F5 e perco niveis". Sob autoridade do servidor, o que a
// tela mostra entre dois flushes e PREDICAO local — quem credita e o servidor,
// re-simulando o intervalo. Um nivel que a predicao ja mostrou e a verdade
// ainda nao tem volta atras no primeiro carregamento. Nada de tempo se perde,
// mas o numero regride, e pro jogador isso e perda de progresso.
//
// Observa o ESTADO em vez de receber um callback do motor de proposito:
// `engine/simulation.ts` roda identico no servidor (headless) e nao pode
// importar nada de `data/remote`. E observando o estado, todo caminho que sobe
// nivel entra aqui de graca — combate ao vivo, catch-up de aba oculta e o
// proprio flush do servidor.
export function useCommitOnLevelUp(): void {
  useEffect(() => {
    const assinatura = (s: GameStateData) =>
      s.trainer.level + s.team.reduce((soma, p) => soma + p.level, 0)
    let anterior = assinatura(useGameStateStore.getState())
    return useGameStateStore.subscribe((estado) => {
      const atual = assinatura(estado)
      // So SUBIDA. Descida acontece por penalidade de morte, por trocar POKE de
      // equipe e — principalmente — quando a resposta do servidor corrige a
      // predicao; commitar ali seria commitar em cima do proprio commit.
      if (atual > anterior) void commitAgora()
      anterior = atual
    })
  }, [])
}
