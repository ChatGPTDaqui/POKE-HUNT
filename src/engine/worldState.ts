// O estado inicial de um mundo — a FORMA dele, sem o store.
//
// Morava em `stores/worldStore.ts` ate PH-148, e sair de la E o ponto: aquele
// arquivo cria o store com `create` do zustand, que puxa `zustand/react`, que
// puxa o REACT inteiro. E `engine/simulation.ts` importava `emptyWorldState`
// dali — entao o React entrava no bundle da Edge Function, num servidor que
// nao renderiza nada.
//
// Aqui em `engine/` a funcao fica onde ela pertence: ela descreve o estado do
// MOTOR, e o store e so um dos consumidores dela. `worldStore.ts` reexporta,
// entao nenhum dos ~30 call sites do cliente muda.
import type { WorldState } from './types'
import { createRng, randomSeed } from '@/core/rng'

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
    trocaEmCampo: null,
    respawnTimer: null,
    sequenceIndex: 0,
    sequenceCleared: false,
    countdownRemaining: null,
    sala: null,
    bossPendente: null,
    salaCountdownRemaining: null,
    salaPendente: null,
    salaSobAutoridade: false,
    salaEsperaDaAutoridade: 0,
    salaPredita: false,
    rng: createRng(seed),
    // Guardada alem do `rng` porque `rng.state` avanca a cada sorteio e deixa
    // de identificar a sessao — ver o campo em engine/types.ts (PH-140).
    seed,
    counters: { entity: 1, effect: 1, pendingHit: 1 },
    pessimista: false,
    clima: null,
    climaAmbiente: null,
  }
}
