// Qual FACE o POKE em campo mostra no trilho de status.
//
// A face do cabecalho era uma imagem so por especie: ela trocava quando o POKE
// trocava e nunca mais. HP, status e KO ja apareciam ali do lado (barra, selo,
// "KO"), mas o retrato ficava sorrindo igual com o POKE a 3% de vida. O banco de
// arte tem ~16 expressoes por especie no mesmo formato da neutra, entao a face
// passa a ser a leitura de RELANCE do estado — quem esta olhando o trilho ve
// dor/tontura antes de ler numero nenhum.
//
// TUDO AQUI E PURO. Quem observa o mundo e o HUD (components/hud/StatusRail.tsx);
// este arquivo so responde "esse estado da que face?" e "essa especie tem esse
// arquivo?".
import { FACE_EMOCOES, FACE_EMOCOES_SHINY, type FaceEmocao } from './generated/faceEmocoes.generated'
import { faceIconUrl } from './sprites'
import type { StatusAtivo } from './statusEffects'
import type { StatusCondition } from './generated/types'

export type { FaceEmocao }

/** Face neutra — o que o trilho mostrava antes, e o fallback de tudo. */
export const FACE_NEUTRA = 'normal' as const
export type FaceEscolhida = FaceEmocao | typeof FACE_NEUTRA

// Cada status tem UMA cara, e ela nao repete cor de selo por acaso: o selo diz
// QUAL e o status (sigla + cor), a face diz o QUANTO incomoda. Congelado usa a
// mesma de paralisado porque as duas leem como "travado" — a origem nao tem
// expressao de frio.
const FACE_POR_STATUS: Record<StatusCondition, FaceEmocao> = {
  poison: 'pain',
  burn: 'pain',
  paralysis: 'stunned',
  freeze: 'stunned',
  sleep: 'sigh',
  confusion: 'dizzy',
}

/** HP abaixo disto (fracao) mostra dor. Alinhado com o vermelho da barra de HP. */
export const HP_CRITICO = 0.3
/** Entre CRITICO e isto, preocupacao. */
export const HP_BAIXO = 0.6

export interface EstadoDaFace {
  /** hp / stats.hp. Fora de [0,1] e tratado como clampado. */
  hpFrac: number
  fainted: boolean
  status: StatusAtivo | null
  statusVolatil: StatusAtivo | null
  /** O POKE esta perseguindo ou batendo em alguem agora. */
  emCombate: boolean
  /** Subiu de nivel nos ultimos instantes (janela decidida por quem chama). */
  festejando: boolean
}

/**
 * A ordem e uma escala de urgencia, e ela e o desenho todo:
 *
 *   KO > acabou de subir de nivel > HP critico > status > HP baixo > lutando > neutro
 *
 * `festejando` vem acima de HP critico de proposito — o level-up dura ~2s e e o
 * unico momento comemorativo do loop; um POKE que sobe de nivel ferido merece a
 * comemoracao e volta a cara de dor logo depois. KO vem antes de tudo porque com
 * o POKE desmaiado nada mais que a face poderia dizer importa.
 *
 * Status ganha de HP baixo, e perde de HP critico: 60% de vida com veneno e uma
 * noticia sobre o veneno; 20% de vida e uma noticia sobre a vida.
 */
export function escolherFace(estado: EstadoDaFace): FaceEscolhida {
  if (estado.fainted) return 'dizzy'
  if (estado.festejando) return 'joyous'
  const hp = Math.max(0, Math.min(1, estado.hpFrac))
  if (hp < HP_CRITICO) return 'pain'
  // Volatil primeiro: confusao e o unico status que se acumula por cima de
  // outro, e ela e a informacao nova.
  const status = estado.statusVolatil ?? estado.status
  if (status) return FACE_POR_STATUS[status.tipo] ?? FACE_NEUTRA
  if (hp < HP_BAIXO) return 'worried'
  if (estado.emCombate) return 'determined'
  return FACE_NEUTRA
}

/**
 * URL do arquivo dessa face, ou a face neutra quando a especie nao tem a
 * expressao (~40 das 226 nao tem parte delas na origem — ver o mapa gerado).
 *
 * NUNCA devolve caminho de arquivo que nao existe em disco: um `<img>` 404 no
 * trilho deixaria um quadrado vazio no lugar do POKE, e o trilho e a unica
 * superficie permanente da tela.
 */
export function faceEmocaoUrl(speciesId: string, isShiny: boolean, face: FaceEscolhida): string | null {
  if (face === FACE_NEUTRA) return faceIconUrl(speciesId, isShiny)
  const tabela = isShiny ? FACE_EMOCOES_SHINY : FACE_EMOCOES
  if (!tabela[speciesId]?.includes(face)) return faceIconUrl(speciesId, isShiny)
  const dir = isShiny ? 'sprites-face-shiny' : 'sprites-face'
  return `assets/${dir}/emo/${face}/${speciesId}.png`
}

/**
 * Toda face que essa especie pode mostrar. Usado pelo preload: a troca de face
 * acontece no meio de um combate, e baixar o PNG na hora deixaria o retrato em
 * branco justamente no frame em que o jogador olhou.
 */
export function faceUrlsDaEspecie(speciesId: string, isShiny: boolean): string[] {
  const tabela = isShiny ? FACE_EMOCOES_SHINY : FACE_EMOCOES
  const urls = [faceIconUrl(speciesId, isShiny)]
  for (const face of tabela[speciesId] ?? []) urls.push(faceEmocaoUrl(speciesId, isShiny, face))
  return urls.filter((u): u is string => u != null)
}
