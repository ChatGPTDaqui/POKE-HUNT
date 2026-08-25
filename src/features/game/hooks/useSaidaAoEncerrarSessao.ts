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

/**
 * A DIRECAO CONTRARIA: flag de hunt ligada sem hunt na tela (PH-156).
 *
 * O observador de baixo cobre `currentMapId == null` COM `mapDef` — servidor
 * encerrou a cacada e o cliente precisa sair. O inverso nunca foi observado por
 * ninguem: `currentMapId != null` SEM `mapDef` deixava o jogo achando que o
 * jogador estava cacando com o Hospital na tela, e a unica coisa que desfazia
 * era recarregar a pagina (o boot zera a flag quando nao da pra retomar). Era o
 * "so destrava com F5" da edicao dos 4 golpes.
 *
 * `player != null` NAO e detalhe, e o que torna isto seguro. Durante o boot
 * existe uma janela legitima com a flag ligada e sem `mapDef`: e a retomada de
 * cacada, que roda ANTES de o jogo montar (ver bootDaSessao). Reconciliar ali
 * mataria a hunt que o jogador tinha. `player` so existe depois que algum mundo
 * subiu, entao a condicao completa — flag ligada, mundo montado, e esse mundo
 * NAO e um mapa — descreve exclusivamente o estado quebrado.
 *
 * Zera a flag e nao reconstroi cena nenhuma: o Hospital ja esta na tela, e
 * chamar `returnToHospital` aqui so remontaria o mundo por nada.
 */
function reconciliarFlagSemCena(): void {
  const estado = useGameStateStore.getState()
  if (estado.currentMapId == null) return
  const mundo = useWorldStore.getState()
  if (mundo.player == null || mundo.mapDef != null) return
  estado.setCurrentMapId(null)
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

    // PH-156 — observa os DOIS stores, e nao so o do jogo.
    //
    // O estado quebrado (flag ligada, mundo montado, sem mapa) pode nascer de
    // qualquer um dos lados, e depois dele nada obriga o outro a mudar: um
    // observador so do `gameStateStore` poderia nunca acordar, porque e
    // justamente `currentMapId` que ficou parado no valor errado.
    //
    // Roda tambem no jogo LOCAL, fora do `servidorAtivo()` abaixo: a flag e do
    // cliente, e travar a edicao dos golpes sem cacada nenhuma acontece igual
    // sem servidor.
    reconciliarFlagSemCena()
    const cancelarMundo = useWorldStore.subscribe(reconciliarFlagSemCena)
    const cancelarJogo = useGameStateStore.subscribe(reconciliarFlagSemCena)
    const soltarReconciliacao = () => { cancelarMundo(); cancelarJogo() }

    if (!servidorAtivo()) return () => { soltarCallback(); soltarReconciliacao() }

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
    return () => { soltarCallback(); cancelar(); soltarReconciliacao() }
  }, [])
}
