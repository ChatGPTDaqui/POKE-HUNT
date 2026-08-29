// Assentamento da sessao pendente + reentrada na hunt, no boot (PH-93).
//
// ---------------------------------------------------------------------------
// POR QUE O ASSENTAMENTO VIROU UMA PROMESSA COMPARTILHADA
// ---------------------------------------------------------------------------
// `assentarSessaoPendente()` fecha a sessao que ficou aberta e devolve o
// resumo do periodo. Ela tinha UM consumidor (`useOfflineFarmOnBoot`, que
// mostra o modal do farm offline) e agora tem DOIS: a decisao de reentrar na
// hunt precisa do mesmo resumo, e precisa dele ANTES de o jogo montar.
//
// Chamar duas vezes nao e uma ineficiencia — e um bug: o segundo `/sessao/
// fechar` responde `fechada: false` (nao ha mais sessao), entao um dos dois
// consumidores receberia `null` e concluiria que o jogador nao estava em hunt
// nenhuma. Qual dos dois depende de quem ganhou a corrida.
//
// Dai a promessa memoizada: quem chegar primeiro dispara, o segundo recebe a
// MESMA promessa, e o request acontece uma vez so.
//
// ---------------------------------------------------------------------------
// POR QUE ISTO RODA ANTES DE O JOGO MONTAR, E NAO DEPOIS
// ---------------------------------------------------------------------------
// `GameCanvas` monta o mundo no boot com `buildHospitalWorld`, guardado por
// `player === null`. Se a reentrada rodasse depois disso, o jogador veria o
// Hospital por alguns centesimos e a hunt em seguida — e, pior, o guard
// deixaria de valer: o mundo do Hospital ja estaria montado.
//
// Rodando dentro do gate de `useProgressoRemoto` (que ja segura a montagem do
// jogo enquanto o progresso nao chegou), `useWorldStore` recebe o mundo da
// hunt ANTES do primeiro mount. O guard `player === null` do GameCanvas
// entao ve um mundo montado e nao faz nada — o mesmo mecanismo que ja protege
// remount por HMR/StrictMode.
//
// ---------------------------------------------------------------------------
// O CUSTO, E POR QUE ELE NAO CAI EM CIMA DE QUEM NAO ESTAVA CACANDO
// ---------------------------------------------------------------------------
// Esperar o assentamento atrasa a entrada no jogo por um round-trip. Quem NAO
// estava numa hunt nao tem nada pra reentrar, e nao pode pagar por isso: pra
// esses o assentamento e disparado sem espera (o modal do farm offline chega
// quando chegar, ele nao bloqueia tela nenhuma).
//
// Quem estava numa hunt paga o round-trip — e e exatamente quem se beneficia
// dele. O sinal de "estava numa hunt" e `currentMapId` ja hidratado do banco:
// `gravarEstado` grava a coluna `current_map_id` em todo flush, entao ela ja
// chega preenchida pelo `rehydrate`, antes de qualquer request novo.
import { useGameStateStore } from '@/stores/gameStateStore'
import { assentarSessaoPendente } from '@/data/remote/autoridade'
import { servidorAtivo } from '@/data/remote/servidor'
import { controller } from '@/engine/controller'
import type { RespostaFlush } from '@/data/remote/servidor'
import { deveRetomarHunt } from './utils'

export type ResumoDeAssentamento = RespostaFlush['resumo'] | null

let promessa: Promise<ResumoDeAssentamento> | null = null

/**
 * Assenta a sessao pendente no maximo UMA vez por boot. Chamadas seguintes
 * recebem a mesma promessa.
 */
export function assentarUmaVez(): Promise<ResumoDeAssentamento> {
  promessa ??= assentarSessaoPendente()
  return promessa
}

/**
 * Solta a memoizacao. Chamado na troca de conta: a promessa guarda o resumo do
 * jogador ANTERIOR, e reaproveita-la mostraria o farm offline de outra pessoa.
 */
export function reiniciarBootDaSessao(): void {
  promessa = null
}

/**
 * Reentra na hunt que o servidor tinha, se houver uma.
 *
 * Devolve se reentrou — `useProgressoRemoto` nao usa o retorno hoje, mas o
 * teste precisa dele e um `void` aqui viraria "nao da pra saber o que
 * aconteceu" na primeira vez que alguem for diagnosticar isto.
 */
export async function retomarHuntSeHavia(): Promise<boolean> {
  // Sem servidor de autoridade nao existe sessao pra assentar nem hunt do
  // servidor pra retomar — o modo local ja reconstroi o Hospital como sempre.
  if (!servidorAtivo()) return false

  const mapaAntesDoAssentamento = useGameStateStore.getState().currentMapId
  if (mapaAntesDoAssentamento == null) {
    // Nao estava cacando: dispara o assentamento e NAO espera. O modal do farm
    // offline continua aparecendo (o `useOfflineFarmOnBoot` pega a mesma
    // promessa), mas o jogo entra sem o round-trip a mais.
    void assentarUmaVez()
    return false
  }

  const resumo = await assentarUmaVez()
  const estado = useGameStateStore.getState()
  const ativo = estado.team[estado.activeIndex]

  const retomar = deveRetomarHunt({
    // Depois do assentamento, e nao antes: a resposta pode ter zerado o mapa
    // (cacada encerrada com o POKE no chao), e essa e a versao que vale.
    mapId: estado.currentMapId,
    stoppedEarly: resumo?.stoppedEarly ?? false,
    hpDoPokeAtivo: ativo?.hp ?? null,
  })

  if (!retomar) {
    // O mapa sobreviveu no estado mas nao da pra voltar pra ele (POKE caido,
    // slot vazio). Zerar e obrigatorio: a tela vai mostrar o Hospital, e
    // `currentMapId` preenchido faria o resto do jogo achar que o jogador esta
    // em hunt — `PokeStatDetail` esconde acoes por causa disso.
    if (estado.currentMapId != null) estado.setCurrentMapId(null)
    return false
  }

  // `retomando: true` (PH-266): esta e a UNICA entrada em hunt que nao nasce de
  // um clique, e e por isso que ela pode herdar a sala. O assentamento logo
  // acima fechou a sessao que estava aberta; sem a flag, `/sessao/abrir` cria
  // uma sessao nova em ciclo 1, sala 1 — um F5 no meio da sala 7 devolvia o
  // jogador pra primeira.
  const entrou = await controller.enterMap(estado.currentMapId!, { silencioso: true, retomando: true })
  if (!entrou) {
    // Recusa do servidor (hunt trancada desde a ultima sessao, POKE que nao e
    // mais da equipe). Cair no Hospital em silencio: o jogador nao pediu essa
    // entrada, e o Hospital e o estado seguro, nao um erro pra ele ler.
    useGameStateStore.getState().setCurrentMapId(null)
    return false
  }
  return true
}
