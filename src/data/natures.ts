// NATUREZA (Nature) — o primeiro dos tres tracos individuais dos jogos, ao lado
// da Habilidade (data/traits.ts) e da Caracteristica (data/characteristics.ts).
//
// REGRA REAL (Gen III em diante, inalterada no Ultra Sun): cada Pokemon nasce
// com 1 de 25 naturezas. A natureza sobe UM atributo em 10% e desce OUTRO em
// 10%. As 5 combinacoes em que o atributo subido e o descido sao o MESMO nao
// mexem em nada — sao as naturezas "neutras". HP NUNCA e afetado por natureza,
// em nenhuma delas: por isso a tabela abaixo so cita os cinco outros.
//
// As 25 sao exatamente o produto 5x5 (atributo que sobe x atributo que desce),
// nesta ordem canonica: Ataque, Defesa, Velocidade, Ataque Especial, Defesa
// Especial. Nao ha natureza fora desse produto, e nenhuma se repete — o teste
// em natures.test.ts tranca as duas coisas.
//
// ONDE ELA ENTRA NA CONTA: `computeStatsAtLevel` (data/pokes.ts) aplica o
// multiplicador DEPOIS da formula base e ANTES de shiny/raridade, que sao
// invencao deste jogo. A ordem importa porque os tres se multiplicam.
import type { StatBlock, StatKey } from './pokes'

export type NatureKey =
  | 'hardy' | 'lonely' | 'brave' | 'adamant' | 'naughty'
  | 'bold' | 'docile' | 'relaxed' | 'impish' | 'lax'
  | 'timid' | 'hasty' | 'serious' | 'jolly' | 'naive'
  | 'modest' | 'mild' | 'quiet' | 'bashful' | 'rash'
  | 'calm' | 'gentle' | 'sassy' | 'careful' | 'quirky'

export interface NatureDef {
  key: NatureKey
  /** Nome do jogo, em ingles — e assim que o jogador reconhece a natureza. */
  nome: string
  /** Atributo com +10%. `null` nas 5 neutras. */
  sobe: StatKey | null
  /** Atributo com -10%. `null` nas 5 neutras. */
  desce: StatKey | null
}

export const NATURE_BONUS = 1.1
export const NATURE_PENALTY = 0.9

// A ordem canonica dos 5 atributos que a natureza alcanca. HP fica de fora
// porque nenhuma natureza mexe nele.
export const NATURE_STATS: StatKey[] = ['atkFis', 'def', 'speed', 'atkEsp', 'defEsp']

// Nomes na ordem do produto 5x5 (linha = atributo que sobe, coluna = o que
// desce), que e a ordem em que os jogos numeram as naturezas de 0 a 24.
const NOMES: string[][] = [
  ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty'],
  ['Bold', 'Docile', 'Relaxed', 'Impish', 'Lax'],
  ['Timid', 'Hasty', 'Serious', 'Jolly', 'Naive'],
  ['Modest', 'Mild', 'Quiet', 'Bashful', 'Rash'],
  ['Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'],
]

export const NATURES: Record<NatureKey, NatureDef> = Object.fromEntries(
  NOMES.flatMap((linha, i) =>
    linha.map((nome, j): [NatureKey, NatureDef] => {
      const key = nome.toLowerCase() as NatureKey
      const neutra = i === j
      return [key, {
        key,
        nome,
        sobe: neutra ? null : NATURE_STATS[i],
        desce: neutra ? null : NATURE_STATS[j],
      }]
    })
  )
) as Record<NatureKey, NatureDef>

export const NATURE_LIST: NatureDef[] = Object.values(NATURES)

/** As 5 sem efeito nenhum. Uteis pra backfill de save antigo (ver a migration). */
export const NATURES_NEUTRAS: NatureKey[] = NATURE_LIST.filter((n) => !n.sobe).map((n) => n.key)

/**
 * Multiplicador desta natureza sobre um atributo. 1 quando ela nao alcanca
 * aquele atributo — e o caso da MAIORIA das combinacoes (cada natureza mexe em
 * 2 dos 6) e o de HP sempre.
 */
export function multiplicadorDeNatureza(nature: NatureKey | null | undefined, stat: StatKey): number {
  const def = nature ? NATURES[nature] : null
  if (!def) return 1
  if (def.sobe === stat) return NATURE_BONUS
  if (def.desce === stat) return NATURE_PENALTY
  return 1
}

/**
 * Rotulo curto pra ficha do POKE: "Adamant (+Ataque, -Atq. Esp.)".
 * Natureza neutra sai so com o nome, sem parenteses vazio.
 */
export function descricaoDaNatureza(nature: NatureKey | null | undefined, rotuloDoStat: (s: StatKey) => string): string {
  const def = nature ? NATURES[nature] : null
  if (!def) return '—'
  if (!def.sobe || !def.desce) return `${def.nome} (neutra)`
  return `${def.nome} (+${rotuloDoStat(def.sobe)}, -${rotuloDoStat(def.desce)})`
}

/** Save antigo / chave desconhecida vira natureza neutra, nunca um crash. */
export function naturezaDe(poke: { nature?: string | null } | null | undefined): NatureDef | null {
  const key = poke?.nature as NatureKey | undefined
  return (key && NATURES[key]) || null
}

export type { StatBlock }
