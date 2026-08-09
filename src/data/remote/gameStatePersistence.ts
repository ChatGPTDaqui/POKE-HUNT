// Adaptador que liga o `persist` do zustand ao Postgres.
//
// Por que aqui e nao reescrevendo o gameStateStore: o `PersistStorage` do
// zustand ja E a costura de persistencia do store. Trocando so o adaptador,
// as 38 actions, os selectors e todo componente que le estado continuam
// exatamente como estao — a migracao de localStorage pra banco nao vaza pro
// resto do app.
//
// Diferencas em relacao ao adaptador de localStorage que isto substitui:
//  - I/O e assincrono e pode falhar (rede). O `persist` aceita storage
//    assincrono nativamente; quem precisa saber se ja carregou usa
//    `useGameStateStore.persist.hasHydrated()`.
//  - A escrita e DEBOUNCED. O jogo chama `set` varias vezes por kill; sem
//    debounce isso viraria varias requests por segundo. No localStorage o
//    custo era desprezivel, na rede nao e.
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import type { GameStateData } from '@/stores/gameStateStore'
import { loadPlayerState, savePlayerState } from './playerRepository'
import { servidorAtivo, servidor } from './servidor'

const DEBOUNCE_MS = 3000

// Quem esta logado. Definido pelo bootstrap de sessao antes de hidratar o
// store — sem isso o adaptador nao tem em qual linha escrever.
let usuarioAtual: string | null = null
let defaultsDoJogo: GameStateData | null = null

// Geracao da configuracao atual. Cada `configurarPersistencia` cria uma nova;
// o desligamento so vale se ainda for o dono da geracao que ele capturou.
//
// BUG REAL que isto corrige (o save nunca acontecia): a limpeza do efeito e
// assincrona (`flushAgora().finally(...)`) e o React remonta o efeito
// (mount -> cleanup -> mount, garantido pelo StrictMode em dev e possivel em
// producao em qualquer remonte). A sequencia era:
//   1. mount#1 configura      -> usuario = U
//   2. cleanup#1 agenda limpar
//   3. mount#2 configura      -> usuario = U
//   4. o `.finally` de (2) roda -> zera o usuario configurado em (3)
// Com `setItem` fazendo early-return quando nao ha usuario, o save ficava
// desligado pra sempre, sem erro nenhum aparecer — so nada era gravado.
//
// A primeira tentativa de conserto comparava o `userId` no desligamento, o
// que NAO resolve: nos dois ciclos o usuario e o mesmo, entao a comparacao
// sempre passava. Precisa ser a geracao, nao a identidade do jogador.
let geracao = 0

export function configurarPersistencia(userId: string, defaults: GameStateData): number {
  usuarioAtual = userId
  defaultsDoJogo = defaults
  return ++geracao
}

export function limparPersistencia(geracaoCapturada: number): void {
  if (geracaoCapturada !== geracao) return
  cancelarEscritaPendente()
  usuarioAtual = null
}

let timer: ReturnType<typeof setTimeout> | null = null
let pendente: GameStateData | null = null
let salvando: Promise<void> | null = null

function cancelarEscritaPendente(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendente = null
}

async function escrever(userId: string, estado: GameStateData): Promise<void> {
  try {
    await savePlayerState(userId, estado)
    savedAtMs = Date.now()
    onSaveError?.(null)
  } catch (err) {
    // Nao relanca: um erro aqui roda dentro do middleware do zustand, em
    // resposta a um `set` qualquer do jogo — estourar ali quebraria o tick.
    // Reporta pra UI decidir o que mostrar.
    console.warn('Falha ao salvar progresso:', err)
    onSaveError?.(err instanceof Error ? err.message : String(err))
  }
}

/** Callback de UI para avisar o jogador quando o save remoto falha. */
let onSaveError: ((mensagem: string | null) => void) | null = null
export function aoFalharSave(cb: (mensagem: string | null) => void): void {
  onSaveError = cb
}

/** Grava agora o que estiver pendente. Usado em pontos de saida/transicao. */
export async function flushAgora(): Promise<void> {
  if (!usuarioAtual || !pendente) return salvando ?? Promise.resolve()
  const estado = pendente
  cancelarEscritaPendente()
  salvando = escrever(usuarioAtual, estado)
  return salvando
}

// Quando o progresso foi gravado pela ultima vez, em ms. Vem de
// `players.updated_at` no load e do relogio local a cada escrita. O Farm
// Offline usa isto pra medir quanto tempo o jogador ficou fora — antes vinha
// do campo `savedAt` do payload no localStorage.
let savedAtMs: number | null = null
export function ultimoSavedAt(): number | null {
  return savedAtMs
}

/**
 * Por que a falha de carga precisa ser registrada aqui em vez de propagada.
 *
 * O `persist` do zustand ENGOLE o erro do storage: o `hydrate()` dele termina
 * num `.catch` que chama `onRehydrateStorage(undefined, erro)` e **resolve** a
 * promessa. Ou seja, `rehydrate()?.then(...)` roda o `then` mesmo quando o
 * `getItem` rejeitou, e o `.catch` de quem chamou nunca dispara.
 *
 * Consequencia real, reproduzida com um bloqueador de anuncios barrando o
 * servico: a leitura falhava, o store hidratava com o DEFAULT e o jogo entrava
 * apresentando a conta como nova — pedindo nome de treinador e inicial pra quem
 * ja tinha equipe e progresso no servidor. O gate de "falhar visivelmente" que
 * o `useProgressoRemoto` documenta existia, mas era codigo morto.
 */
let erroDeCarga: string | null = null
export function erroDaUltimaCarga(): string | null {
  return erroDeCarga
}

export const postgresStorage: PersistStorage<GameStateData> = {
  getItem: async (): Promise<StorageValue<GameStateData> | null> => {
    erroDeCarga = null
    if (!usuarioAtual || !defaultsDoJogo) return null
    try {
      // Sob autoridade do servidor, o estado inicial vem DELE — nao de uma leitura
      // direta do Postgres. Assim o cliente enxerga exatamente o que o servidor
      // considera verdade, inclusive o que uma sessao ainda aberta ja rendeu.
      if (servidorAtivo()) {
        const { estado } = await servidor.estado()
        savedAtMs = Date.now()
        return { state: estado as GameStateData, version: 1 }
      }
      const resultado = await loadPlayerState(usuarioAtual, defaultsDoJogo)
      if (!resultado) return null
      savedAtMs = resultado.savedAt
      return { state: resultado.data, version: 1 }
    } catch (err) {
      erroDeCarga = err instanceof Error ? err.message : String(err)
      throw err
    }
  },

  setItem: (_nome, valor) => {
    // Sob autoridade do servidor o cliente NAO grava progresso. Este e o ponto
    // exato onde o jogo deixa de ser autoritativo: sem este early-return, o
    // autosave do navegador continuaria sobrescrevendo por cima do que o
    // servidor calculou — e o resultado seria pior que nao ter servidor, porque
    // a ultima escrita venceria e ela viria do cliente.
    if (servidorAtivo()) return
    if (!usuarioAtual) return
    pendente = valor.state
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const estado = pendente
      pendente = null
      if (estado && usuarioAtual) salvando = escrever(usuarioAtual, estado)
    }, DEBOUNCE_MS)
  },

  // O `persist` chama isto no `clearStorage()`. Apagar o progresso do jogador
  // no banco a partir do cliente nao e uma operacao que este jogo queira ter
  // — "resetar jogo" grava um estado inicial por cima (via setItem normal),
  // que e reversivel do lado do servidor, em vez de destruir linhas.
  removeItem: () => {},
}
