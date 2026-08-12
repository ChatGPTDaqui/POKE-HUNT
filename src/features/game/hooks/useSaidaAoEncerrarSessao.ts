import { useEffect } from 'react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { registrarEncerramentoDeSessao } from '@/data/remote/autoridade'
import { servidorAtivo } from '@/data/remote/servidor'
import { controller } from '@/engine/controller'

// `returnToHospital` zera o `currentMapId` (que ja e nulo) antes de trocar a
// cena, e esse `set` acorda o proprio observador abaixo com a hunt ainda na
// tela. Sem a trava, a chamada se chamaria de novo pra sempre.
let saindoDaHunt = false
function voltarProHospital(): void {
  if (saindoDaHunt) return
  saindoDaHunt = true
  try {
    controller.returnToHospital({ x: 0, y: 0 })
  } finally {
    saindoDaHunt = false
  }
}

// O servidor pode encerrar a cacada sozinho (POKE desmaiado sem como levantar).
// Quando isso acontece o cliente TEM que sair da hunt: a simulacao local
// continuaria desenhando combate — com o POKE caido, parado — enquanto o
// servidor ja nao credita nada, e o jogador nao teria como perceber.
//
// Registrado aqui, e nao dentro de `autoridade.ts`, porque `controller` importa
// aquele modulo: chamar o controller de la fecharia um ciclo de import.
export function useSaidaAoEncerrarSessao(): void {
  useEffect(() => {
    const soltarCallback = registrarEncerramentoDeSessao(voltarProHospital)
    if (!servidorAtivo()) return soltarCallback

    // Rede de seguranca que cobre TODAS as rotas, nao so o flush: `/acao` e
    // `/mercado` tambem liquidam a sessao antes de agir, e um POKE que caiu
    // durante uma delas encerraria a cacada sem passar pelo callback acima. Em
    // vez de espalhar o aviso por cada rota, o cliente confia no dado que ja
    // volta em todas: `currentMapId` nulo com uma hunt na tela significa que o
    // servidor tirou o jogador de la.
    const cancelar = useGameStateStore.subscribe((estado) => {
      if (estado.currentMapId != null) return
      if (!useWorldStore.getState().mapDef) return
      voltarProHospital()
    })
    return () => { soltarCallback(); cancelar() }
  }, [])
}
