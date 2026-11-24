// A INVESTIDA DO GOLPE (23/11/2026). No Pokemon Mystery Dungeon a arte de
// ataque fica no lugar e quem MOVE a sprite e o jogo, guiado por tres marcas do
// AnimData.xml: de <RushFrame> ate <HitFrame> o corpo avanca na direcao do
// alvo; de <ReturnFrame> ate o fim, volta. Sem isso, os golpes de contato do
// acervo liam como "soco no ar" parado a um corpo de distancia.
//
// So desenho: a posicao do motor (`x/y`) nao muda, o servidor nao sabe disto.
// O tempo sai dos quadros da pose que esta tocando (`animFrame`/`animElapsed`),
// entao o hitstop (quadro congelado) segura a investida junto.
import { INVESTIDA_DO_ATAQUE } from '@/data/generated/investidaDoAtaque.generated'
import { APICE_DO_ATAQUE } from '@/data/generated/apiceDoAtaque.generated'
import type { AnimName } from '@/data/battleSpriteAnims'
import type { Deslocamento } from './reacaoAoGolpe'

/**
 * Quanto (px de mundo) cada pose avanca no apice. So as poses de CONTATO
 * investem; as de canalizar/soltar (Shoot, Charge, SpAttack, Sing, Gas...)
 * ficam no lugar mesmo que o acervo marque RushFrame, como no PMD.
 */
export const AVANCO_DA_POSE: Partial<Record<AnimName, number>> = {
  Attack: 10, Strike: 10, QuickStrike: 12, Punch: 10, Jab: 9, Uppercut: 9, Kick: 10, Chop: 9, Slice: 9,
  Bite: 9, Scratch: 8, MultiScratch: 8, MultiStrike: 8, Double: 8, Slam: 10, Head: 10, Lick: 7, Swing: 6,
}

/** Na camera 3/4 o chao e achatado: o avanco vertical vale menos que o lateral. */
const ACHATAMENTO_DO_CHAO = 0.6
const PARADO: Deslocamento = Object.freeze({ dx: 0, dy: 0 })

interface Corpo {
  poke: { speciesId: string }
  battleAnim: { name: AnimName; durations: readonly number[] } | null
  animFrame: number
  animElapsed: number
  attackAnimTimer: number
  facing: { x: number; y: number }
}

const somaAte = (duracoes: readonly number[], quadro: number) => {
  let s = 0
  for (let k = 0; k < quadro && k < duracoes.length; k++) s += duracoes[k]
  return s
}
const suave = (t: number) => t * t * (3 - 2 * t)

/** Fracao 0..1 da investida em `t` ticks desde o inicio da pose. */
export function fracaoDaInvestida(duracoes: readonly number[], rush: number, apice: number, retorno: number, t: number): number {
  const tRush = somaAte(duracoes, rush)
  const tApice = somaAte(duracoes, apice)
  const tRetorno = somaAte(duracoes, retorno)
  const tFim = somaAte(duracoes, duracoes.length)
  if (t < tRush) return 0
  if (t < tApice) return suave((t - tRush) / (tApice - tRush))
  if (t < tRetorno) return 1
  if (tFim <= tRetorno) return 0
  return 1 - suave(Math.min(1, (t - tRetorno) / (tFim - tRetorno)))
}

export function avancoDoGolpe(e: Corpo, reduzido: boolean): Deslocamento {
  if (reduzido || e.attackAnimTimer <= 0 || !e.battleAnim) return PARADO
  const pose = e.battleAnim.name
  const distancia = AVANCO_DA_POSE[pose]
  if (!distancia) return PARADO
  const investida = INVESTIDA_DO_ATAQUE[e.poke.speciesId]?.[pose]
  const apice = APICE_DO_ATAQUE[e.poke.speciesId]?.[pose]
  if (!investida || apice === undefined) return PARADO
  const t = somaAte(e.battleAnim.durations, e.animFrame) + e.animElapsed * 60
  const f = fracaoDaInvestida(e.battleAnim.durations, investida[0], apice, investida[1], t)
  if (f === 0) return PARADO
  return { dx: e.facing.x * distancia * f, dy: e.facing.y * distancia * f * ACHATAMENTO_DO_CHAO }
}
