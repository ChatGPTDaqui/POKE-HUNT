// Fila de celebracao de marco (PH-192) — a declaracao, sem React.
//
// SEPARADO DO HOOK pelo mesmo motivo de `toastStoreVanilla.ts`: quem empurra
// aqui e `engine/simulation.ts`, que vai pro bundle da Edge Function. Importar
// um store criado com o `create` de `zustand/react` puxaria o React inteiro
// pra dentro de um servidor que nao renderiza nada.
//
// SUBSTITUI `levelUpSplashStore.ts`, que era codigo morto: `show()` nunca foi
// chamado em lugar nenhum desde a migracao pra React (9976ea9c). O splash
// vanilla original era disparado em dois pontos — level-up do TREINADOR
// (js/main.js:288) e EVOLUCAO (js/main.js:658) — e os dois se perderam no
// porte. Os dois voltam aqui, com o nivel do POKE e o shiny por cima.
import { createStore } from 'zustand/vanilla'
import type { StatBlock } from '@/data/pokes'

export type Celebracao =
  | {
      tipo: 'nivel'
      especieId: string
      nome: string
      /**
       * Nivel em que o POKE ESTAVA. Com `nivel`, delimita o intervalo — e e o
       * intervalo que decide se houve marco.
       *
       * Nao e enfeite: `grantExp` tem um `while` interno e um abate pode subir
       * varios niveis de uma vez, devolvendo `statGains` como diff do inicio ao
       * fim. O evento ja vem coalescido; o que faltava era ele dizer DE ONDE
       * veio. O call site tem esse numero em maos (`poke.level` antes da chamada).
       */
      nivelInicial: number
      nivel: number
      ganhos: StatBlock | null
      golpesNovos: string[]
      isShiny: boolean
    }
  | { tipo: 'treinador'; nome: string; nivelInicial: number; nivel: number }
  | {
      tipo: 'evolucao'
      deId: string
      paraId: string
      deNome: string
      paraNome: string
      isShiny: boolean
    }
  | { tipo: 'shiny'; especieId: string; nome: string }

/**
 * Uma celebracao na fila, com identidade propria.
 *
 * O `id` existe pra o React NAO REUSAR o no do DOM entre duas celebracoes
 * (PH-192). Sem ele, a segunda celebracao seguida cai no mesmo elemento, a
 * animacao CSS NAO reinicia, e ela aparece ja no fim do fade — medido: opacity
 * 0 aos 700ms de uma animacao de 2600ms.
 *
 * Mesmo defeito que o ticker do `ChatMobile` ja documenta ("sem `key` o React
 * reaproveita o node e a animacao de chegada nao reinicia — linha nova entrava
 * sem nenhum sinal de que era nova").
 *
 * O id NAO muda na coalescencia, e isso e proposital: juntar niveis atualiza o
 * cartao que ja esta na tela, e reiniciar a animacao ali faria o cartao piscar
 * a cada abate de uma sequencia.
 */
export interface CelebracaoNaFila {
  id: number
  celebracao: Celebracao
}

export interface CelebracaoState {
  fila: CelebracaoNaFila[]
  /** Empurra uma celebracao. A COALESCENCIA acontece aqui — ver `coalescer`. */
  celebrar: (c: Celebracao) => void
  /** Tira a da frente. Chamado pelo componente quando a animacao termina. */
  encerrarAtual: () => void
  limpar: () => void
}

// --- coalescencia ------------------------------------------------------------
type CelebNivel = Extract<Celebracao, { tipo: 'nivel' }>
type CelebTreinador = Extract<Celebracao, { tipo: 'treinador' }>

/** Os ganhos SOMAM: sao deltas de atributo, entao somar e a operacao certa. */
function somarGanhos(a: StatBlock | null, b: StatBlock | null): StatBlock | null {
  if (!a) return b
  if (!b) return a
  const fora = {} as StatBlock
  for (const k of Object.keys(b) as (keyof StatBlock)[]) fora[k] = (a[k] ?? 0) + (b[k] ?? 0)
  return fora
}

function podeJuntar(a: Celebracao | undefined, b: Celebracao): boolean {
  if (!a) return false
  if (a.tipo === 'nivel' && b.tipo === 'nivel') return a.especieId === b.especieId
  if (a.tipo === 'treinador' && b.tipo === 'treinador') return true
  // Evolucao e shiny NAO coalescem: cada uma e um evento unico.
  return false
}

function juntar(a: Celebracao, b: Celebracao): Celebracao {
  if (a.tipo === 'nivel' && b.tipo === 'nivel') {
    const x = a as CelebNivel
    const y = b as CelebNivel
    return {
      ...y,
      nivelInicial: Math.min(x.nivelInicial, y.nivelInicial),
      nivel: Math.max(x.nivel, y.nivel),
      ganhos: somarGanhos(x.ganhos, y.ganhos),
      golpesNovos: [...new Set([...x.golpesNovos, ...y.golpesNovos])],
    }
  }
  const x = a as CelebTreinador
  const y = b as CelebTreinador
  return { ...y, nivelInicial: Math.min(x.nivelInicial, y.nivelInicial), nivel: Math.max(x.nivel, y.nivel) }
}

/**
 * Fila com UMA celebracao visivel por vez e level-up COALESCIDO.
 *
 * Sem coalescencia, dois abates seguidos que dao nivel enfileiram dois cartoes
 * e travam a tela por 2x a duracao — e o segundo diz quase a mesma coisa que o
 * primeiro.
 *
 * A juncao entra na celebracao QUE JA ESTA NA TELA (indice 0), e nao so na fila
 * de tras: mesclar so o que espera deixaria o cartao dizendo "Nv 33" enquanto o
 * POKE ja esta em 35, e informacao desatualizada na tela e pior que cartao
 * repetido.
 */
let proximoId = 1

export const celebracaoStore = createStore<CelebracaoState>()((set) => ({
  fila: [],

  celebrar: (c) =>
    set((estado) => {
      const fila = estado.fila
      if (podeJuntar(fila[0]?.celebracao, c)) {
        // MANTEM o `id`: a coalescencia atualiza o cartao que ja esta na tela, e
        // trocar o id reiniciaria a animacao a cada abate de uma sequencia.
        const junta = { id: fila[0].id, celebracao: juntar(fila[0].celebracao, c) }
        return { fila: [junta, ...fila.slice(1)] }
      }
      // Nao juntou com a da frente: tenta com a ULTIMA da espera, pra dois
      // niveis que cheguem enquanto uma evolucao esta na tela nao virarem dois
      // cartoes atras dela.
      const ultima = fila.length > 1 ? fila[fila.length - 1] : undefined
      if (ultima && podeJuntar(ultima.celebracao, c)) {
        const junta = { id: ultima.id, celebracao: juntar(ultima.celebracao, c) }
        return { fila: [...fila.slice(0, -1), junta] }
      }
      return { fila: [...fila, { id: proximoId++, celebracao: c }] }
    }),

  encerrarAtual: () => set((estado) => ({ fila: estado.fila.slice(1) })),

  limpar: () => set({ fila: [] }),
}))
