// A ponte entre a UI e o servidor de autoridade.
//
// Toda mutacao do jogador passa por `pedirAcao`. Com `VITE_SERVIDOR_URL`
// definida ela vira uma intencao mandada ao servidor, e o estado local e
// SOBRESCRITO pela resposta; sem a variavel, ela executa o `fallback` local de
// sempre. Assim cada tela tem um caminho so, e ligar/desligar a autoridade nao
// exige mexer em nenhuma tela.
import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { servidor, servidorAtivo, ErroServidor } from './servidor'

/** Substitui o estado local pelo que o servidor considera verdade. */
export function aplicarEstadoDoServidor(estado: unknown): void {
  if (!estado || typeof estado !== 'object') return
  useGameStateStore.setState(estado as GameStateData)
}

function reportarErro(erro: unknown): void {
  const mensagem = erro instanceof ErroServidor ? erro.message : 'nao foi possivel falar com o servidor'
  useToastStore.getState().pushToast(mensagem, 'error', 'world')
}

/**
 * `fallback` roda quando NAO ha servidor configurado — e o comportamento atual
 * do jogo, preservado inteiro. Nao e um "modo degradado": e o modo padrao
 * enquanto a hospedagem nao foi decidida.
 */
export async function pedirAcao(
  acao: { tipo: string } & Record<string, unknown>,
  fallback: () => void,
): Promise<void> {
  if (!servidorAtivo()) {
    fallback()
    return
  }
  try {
    const resposta = await servidor.acao(acao)
    aplicarEstadoDoServidor(resposta.estado)
    if (resposta.mensagem) useToastStore.getState().pushToast(resposta.mensagem, 'success', 'world')
  } catch (erro) {
    reportarErro(erro)
  }
}

// --- sessao de hunt ---------------------------------------------------------

// De quanto em quanto tempo o progresso e liquidado com o servidor. 30s e um
// meio-termo: o jogador ve o ouro andar em passos visiveis, e uma aba fechada
// no soco perde no maximo 30s de tempo NAO creditado — nao de progresso, porque
// o relogio de referencia vive no banco e o proximo flush cobre o intervalo.
export const INTERVALO_FLUSH_MS = 30000

let timerFlush: ReturnType<typeof setInterval> | null = null

export async function abrirSessaoDeHunt(mapId: string, pokeUid: string): Promise<boolean> {
  if (!servidorAtivo()) return true
  try {
    await servidor.abrirSessao(mapId, pokeUid)
    pararFlushPeriodico()
    timerFlush = setInterval(() => { void liquidar() }, INTERVALO_FLUSH_MS)
    return true
  } catch (erro) {
    reportarErro(erro)
    return false
  }
}

export async function liquidar(): Promise<void> {
  if (!servidorAtivo()) return
  try {
    const r = await servidor.flush()
    aplicarEstadoDoServidor(r.estado)
    if (r.truncado) {
      useToastStore.getState().pushToast(
        'Voce ficou fora tempo demais — parte do periodo nao foi creditada.', 'error', 'world',
      )
    }
  } catch (erro) {
    // 409 = nao ha sessao aberta. Acontece em corrida normal (fechou a hunt
    // enquanto o timer disparava) e nao e problema do jogador.
    if (erro instanceof ErroServidor && erro.status === 409) return
    reportarErro(erro)
  }
}

export function pararFlushPeriodico(): void {
  if (timerFlush) clearInterval(timerFlush)
  timerFlush = null
}

export async function fecharSessaoDeHunt(): Promise<void> {
  if (!servidorAtivo()) return
  pararFlushPeriodico()
  try {
    const r = await servidor.fecharSessao()
    if (r.estado) aplicarEstadoDoServidor(r.estado)
  } catch (erro) {
    reportarErro(erro)
  }
}
