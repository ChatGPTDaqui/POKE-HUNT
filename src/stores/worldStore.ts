// Arvore de estado EFEMERA de combate — porta o `currentWorld`/`world` de
// main.js. Nunca persistida (reconstruida do zero a cada troca de cena, ver
// buildHospitalWorld/buildMapWorld no original). Separada de
// gameStateStore.ts (persistente) de proposito — vidas/frequencias de
// update bem diferentes (world muda a 60/s, gameState muda em eventos
// discretos do jogador/economia).
//
// Fase 3 do plano: so a FORMA do estado + o mecanismo de update via immer.
// As funcoes de sistema (movimento/combate/auto/captura) que de fato mutam
// isso todo tick sao Fase 4 (engine/systems/*.ts) — elas vao chamar
// `useWorldStore.getState().update(draft => { ... })` (ou uma acao mais
// especifica que eu adicionar la) pra escrever no draft imer com a mesma
// ergonomia de mutacao direta que o codigo vanilla ja tinha
// (`draft.enemies[i].x = novoX`), so que produzindo estado imutavel por
// baixo.
//
// O desenho no canvas (Fase 5) le `useWorldStore.getState()` direto dentro
// do proprio loop de rAF do componente <GameCanvas> — NAO via hook/selector
// — pra nao disparar re-render do React 60x/s so pra redesenhar pixel (ver
// "Decisao de implementacao: estado do motor" no plano). Componentes de UI
// que precisam saber de um campo especifico (ex: HP do poke ativo pro HUD)
// usam selector normal (`useWorldStore(s => s.player?.poke.hp)`) e so
// re-renderizam quando aquele campo muda de verdade.
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SalaAtiva, WorldState } from '@/engine/types'
import { reconciliarSalaDaAutoridade } from '@/engine/systems/salaSystem'
import { createRng, randomSeed, type Rng } from '@/core/rng'

// `seed` opcional: quem constroi um mundo pra valer passa a semente da sessao
// (na Fase D ela vem do servidor); sem argumento, sorteia uma. Nao ha fallback
// pra `Math.random()` em lugar nenhum da simulacao — a sequencia inteira sai
// deste estado.
export function emptyWorldState(seed: number = randomSeed()): WorldState {
  return {
    mapDef: null,
    player: null,
    enemies: [],
    effects: [],
    pendingHits: [],
    pendingWishes: [],
    autoTimers: { treinador: 0 },
    reviveCountdown: null,
    respawnTimer: null,
    sequenceIndex: 0,
    sequenceCleared: false,
    countdownRemaining: null,
    sala: null,
    salaCountdownRemaining: null,
    salaPendente: null,
    salaSobAutoridade: false,
    salaEsperaDaAutoridade: 0,
    rng: createRng(seed),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
    pessimista: false,
    clima: null,
  }
}

export interface WorldStore extends WorldState {
  // Troca o mundo inteiro (equivalente a `currentWorld = buildXWorld()` no
  // original) — usado nas transicoes de cena (Hospital <-> hunt).
  setWorld: (world: WorldState) => void
  resetWorld: () => void
  // Escotilha generica pros sistemas da Fase 4 mutarem o draft imer direto,
  // com a mesma ergonomia de mutacao em lugar que o codigo vanilla ja tinha.
  update: (recipe: (draft: WorldState) => void) => void
  // Sorteia usando o Rng do mundo E persiste o avanco da sequencia.
  //
  // Necessario porque `getState().rng` vem CONGELADO pelo immer (autoFreeze) e
  // `nextFloat` muta o estado do gerador — passar o rng congelado direto pra
  // qualquer helper de sorteio estoura com "Cannot assign to read only property
  // 'state'". Foi um bug real: `chooseStarter` fazia exatamente isso e quebrava
  // a criacao do primeiro POKE. Dentro do `update` o rng e um draft mutavel,
  // entao o avanco da sequencia fica gravado em vez de se perder.
  sortear: <T>(fn: (rng: Rng) => T) => T
  // Sobrescreve a sala com a AUTORITATIVA do servidor. A simulacao local
  // sorteia a propria (ela e predicao e tem sequencia de sorteio propria), e
  // quem decidiu o pool e o loot creditados foi o servidor.
  definirSala: (sala: SalaAtiva | null) => void
}

export const useWorldStore = create<WorldStore>()(
  immer((set) => ({
    ...emptyWorldState(),

    setWorld: (world) =>
      set((draft) => {
        Object.assign(draft, world)
      }),

    resetWorld: () =>
      set((draft) => {
        Object.assign(draft, emptyWorldState())
      }),

    update: (recipe) => set((draft) => recipe(draft)),

    sortear: (fn) => {
      let resultado: ReturnType<typeof fn>
      set((draft) => { resultado = fn(draft.rng) })
      return resultado!
    },

    definirSala: (sala) =>
      set((draft) => {
        // A REGRA mora no motor (salaSystem.ts#reconciliarSalaDaAutoridade), e
        // nao aqui: trocar de sala e trocar mapa, grade de colisao, ponto de
        // nascimento e inimigos em campo — cadeia que ja existe pra transicao
        // local. Este store escrevia `draft.sala` direto, e era exatamente isso
        // que deixava o HUD numa sala e o desenho em outra.
        reconciliarSalaDaAutoridade(draft, sala)
      }),
  })),
)
