// "Primeiros Passos" (10/10/2026): a cadeia de objetivos das primeiras horas.
//
// POR QUE EXISTE: o jogador novo via três sinais diferentes de "por onde
// começar" (tutorial na Rota 46, HUD e selo no Campo Aberto), um objetivo fixo
// que não andava, e sete marcos de longo prazo (Pesadelo incluso) no minuto 1.
// Aqui fica UMA fonte de "o que fazer agora": um passo por vez, com progresso
// ao vivo e uma recompensa que o jogador vê antes de cumprir.
//
// AS REGRAS DO DESENHO, aprovadas pelo dono:
//  - Recompensa paga pelo SERVIDOR (`reivindicar_passo`). Por isso só entra
//    passo que o servidor consegue conferir no save — "abriu a Mochila" não
//    paga nada, porque o cliente poderia mentir.
//  - A RPC tem a MESMA cadeia (condição e recompensa) escrita em SQL. O teste
//    `primeirosPassos.test.ts` lê a migration e reprova se as recompensas daqui
//    divergirem das de lá.
//  - Ordem obrigatória: o passo N só é reivindicado depois do N-1. A HUD mostra
//    um de cada vez, e a RPC confere a mesma coisa.
//  - Conta antiga reivindica tudo o que já cumpriu (decisão do dono), um passo
//    de cada vez como qualquer outro jogador.
//  - Pokébolas generosas: o dono pediu para quintuplicar as bolas da proposta.
import { BIOMAS } from './biomas'
import { evolutionStage } from './evolutionStage'
import { maiorEstagioLimpo, type ProgressoPorBioma } from './progressoDeBioma'
import type { EspecialidadeNiveis } from './especialidades'
import type { PokeInstance } from './pokes'
import type { PokedexKillCount, TrainerInfo } from '@/stores/gameStateDefaults'

/** O recorte do save que a cadeia lê. */
export interface EstadoDosPassos {
  pokedexKills: Record<string, PokedexKillCount>
  team: PokeInstance[]
  bagPokes: PokeInstance[]
  biomaProgress: ProgressoPorBioma
  missoesReivindicadas: Record<string, boolean>
  especialidades: EspecialidadeNiveis
  trainer: TrainerInfo
}

export interface RecompensaDoPasso {
  ouro: number
  itens: { itemId: string; quantidade: number }[]
}

/** Tela que o passo pede para abrir (a seta aponta o botão dela). */
export type DestinoDoPasso = 'hunts' | 'equipe' | 'mochila' | 'tasks' | 'especialidades' | 'auto'

export interface PassoDef {
  id: string
  /** O verbo que a HUD mostra: curto, uma ação. */
  titulo: string
  /** Onde e como, em uma frase. */
  dica: string
  /** A dica de quando o jogador já está caçando ("abra Hunt" não serve mais). */
  dicaEmCampo?: string
  alvo: number
  atual: (s: EstadoDosPassos) => number
  recompensa: RecompensaDoPasso
  destino?: DestinoDoPasso
}

/** Bioma em que o jogador sai da Rota 46. */
export const BIOMA_DO_PRIMEIRO_LORD = 'campo_aberto'

const totalDeAbates = (s: EstadoDosPassos) =>
  Object.values(s.pokedexKills).reduce((n, k) => n + (k?.normal ?? 0) + (k?.shiny ?? 0), 0)
const biomasCom = (s: EstadoDosPassos, estagio: number) =>
  BIOMAS.filter(b => maiorEstagioLimpo(s.biomaProgress, b.chave) >= estagio).length
const todosOsPokes = (s: EstadoDosPassos) => [...s.team, ...s.bagPokes]

export const PRIMEIROS_PASSOS: PassoDef[] = [
  {
    id: 'primeiros_abates',
    titulo: 'Vença 10 selvagens',
    dica: 'Abra Hunt e entre na Rota 46: seu POKE luta sozinho.',
    dicaEmCampo: 'Deixe rodando: seu POKE procura e enfrenta os selvagens sozinho.',
    alvo: 10,
    atual: totalDeAbates,
    recompensa: { ouro: 500, itens: [{ itemId: 'poke_ball', quantidade: 50 }] },
    destino: 'hunts',
  },
  {
    id: 'nivel_5',
    titulo: 'Leve um POKE ao Lv 5',
    dica: 'Cada abate dá EXP. Deixe a caçada rodando.',
    alvo: 5,
    atual: s => Math.max(0, ...s.team.map(p => p.level)),
    recompensa: { ouro: 0, itens: [{ itemId: 'super_potion', quantidade: 10 }] },
  },
  {
    id: 'primeira_captura',
    titulo: 'Capture um POKE',
    dica: 'Ligue o Auto-Catch no botão de robô: cada selvagem vencido gasta uma bola numa tentativa.',
    alvo: 2,
    // O inicial conta como 1: "capturou" é ter um segundo POKE em qualquer lugar.
    atual: s => todosOsPokes(s).length,
    recompensa: { ouro: 0, itens: [{ itemId: 'great_ball', quantidade: 25 }] },
    destino: 'auto',
  },
  {
    id: 'equipe_de_dois',
    titulo: 'Coloque um 2º POKE na Equipe',
    dica: 'Abra Equipe e traga o capturado da Mochila. Quem está na reserva entra quando o da frente cai.',
    alvo: 2,
    atual: s => s.team.length,
    recompensa: { ouro: 1000, itens: [{ itemId: 'super_potion', quantidade: 10 }] },
    destino: 'equipe',
  },
  {
    id: 'primeiro_lord',
    titulo: 'Vença o Lord do Campo Aberto',
    dica: 'Campo Aberto, estágio 1: limpe as 3 salas. O último chefe é o Lord.',
    alvo: 1,
    atual: s => Math.min(1, maiorEstagioLimpo(s.biomaProgress, BIOMA_DO_PRIMEIRO_LORD)),
    recompensa: { ouro: 2500, itens: [{ itemId: 'ultra_ball', quantidade: 25 }] },
    destino: 'hunts',
  },
  {
    id: 'primeira_missao',
    titulo: 'Reivindique uma missão',
    dica: 'Abra Tasks: cada missão pede abates de uma espécie e paga ouro.',
    alvo: 1,
    atual: s => Object.values(s.missoesReivindicadas).filter(Boolean).length,
    recompensa: { ouro: 0, itens: [{ itemId: 'revive', quantidade: 3 }, { itemId: 'great_ball', quantidade: 25 }] },
    destino: 'tasks',
  },
  {
    id: 'primeira_especialidade',
    titulo: 'Invista numa Especialidade',
    dica: 'Especialidades dão dano ou defesa a um tipo inteiro. Pagam com ouro e Stones que caem dos selvagens.',
    alvo: 1,
    atual: s => Object.values(s.especialidades).reduce((n, e) => n + (e?.dano ?? 0) + (e?.defesa ?? 0), 0),
    recompensa: { ouro: 2000, itens: [{ itemId: 'great_ball', quantidade: 50 }] },
    destino: 'especialidades',
  },
  {
    id: 'estagio_2',
    titulo: 'Limpe o estágio 2 de um bioma',
    dica: 'Vencer um Lord abre o estágio seguinte daquele bioma.',
    alvo: 1,
    atual: s => Math.min(1, biomasCom(s, 2)),
    recompensa: { ouro: 3000, itens: [{ itemId: 'ultra_ball', quantidade: 50 }] },
    destino: 'hunts',
  },
  {
    id: 'primeira_evolucao',
    titulo: 'Evolua um POKE',
    dica: 'Na Equipe, um POKE no nível certo mostra o botão Evoluir.',
    alvo: 1,
    atual: s => Math.min(1, todosOsPokes(s).filter(p => evolutionStage(p.speciesId) >= 2).length),
    recompensa: { ouro: 4000, itens: [{ itemId: 'revive', quantidade: 5 }] },
    destino: 'equipe',
  },
  {
    id: 'treinador_10',
    titulo: 'Chegue ao Lv 10 de Treinador',
    dica: 'O treinador ganha EXP junto com o POKE em todo abate.',
    alvo: 10,
    atual: s => s.trainer.level,
    recompensa: { ouro: 0, itens: [{ itemId: 'ultra_ball', quantidade: 50 }] },
  },
  {
    id: 'tres_biomas',
    titulo: 'Vença o 1º Lord em 3 biomas',
    dica: 'Cada bioma tem tipos diferentes de POKE. Variar monta uma equipe que cobre fraquezas.',
    alvo: 3,
    atual: s => biomasCom(s, 1),
    recompensa: { ouro: 6000, itens: [{ itemId: 'max_revive', quantidade: 5 }] },
    destino: 'hunts',
  },
]

/** Antes do 1º passo o lugar do jogador é a Rota 46, e não um bioma. */
export function aindaNaRota46(pokedexKills: Record<string, PokedexKillCount>): boolean {
  return totalDeAbates({ pokedexKills } as EstadoDosPassos) < PRIMEIROS_PASSOS[0].alvo
}

/** Chave em `recompensa_concedida` — a mesma que a RPC grava. */
export const chaveDoPasso = (id: string) => `passo:${id}`

export interface SituacaoDosPassos {
  /** Primeiro passo ainda não reivindicado; `null` quando a cadeia acabou. */
  atual: PassoDef | null
  indice: number
  progresso: number
  pronto: boolean
}

export function situacaoDosPassos(s: EstadoDosPassos, reivindicados: ReadonlySet<string>): SituacaoDosPassos {
  const indice = PRIMEIROS_PASSOS.findIndex(p => !reivindicados.has(p.id))
  if (indice === -1) return { atual: null, indice: PRIMEIROS_PASSOS.length, progresso: 0, pronto: false }
  const atual = PRIMEIROS_PASSOS[indice]
  const progresso = Math.min(atual.alvo, atual.atual(s))
  return { atual, indice, progresso, pronto: progresso >= atual.alvo }
}

/** O passo foi cumprido (reivindicado ou com a condição atendida no save)? */
export function passoCumprido(id: string, s: EstadoDosPassos, reivindicados: ReadonlySet<string>): boolean {
  if (reivindicados.has(id)) return true
  const p = PRIMEIROS_PASSOS.find(x => x.id === id)
  return !!p && p.atual(s) >= p.alvo
}
