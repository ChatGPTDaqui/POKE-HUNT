// CARACTERISTICA (Characteristic) — o terceiro traco individual dos jogos, ao
// lado da Natureza (data/natures.ts) e da Habilidade (data/traits.ts).
//
// REGRA REAL (Gen IV em diante, inalterada no Ultra Sun): a frase que o resumo
// do Pokemon mostra ("Likes to thrash about") e uma PISTA sobre os IVs. Ela sai
// de duas coisas:
//
//   1. QUAL atributo tem o IV mais alto  -> escolhe a familia de 5 frases;
//   2. Esse IV modulo 5                  -> escolhe qual das 5.
//
// Sao 6 atributos x 5 frases = 30 caracteristicas. Nao ha aleatoriedade extra:
// dois Pokemon com os mesmos IVs e o mesmo desempate tem a mesma frase.
//
// O UNICO DESVIO, dito em voz alta: nos jogos o desempate entre IVs iguais usa
// o Personality Value (o `PV mod 6` decide por qual atributo a varredura
// COMECA, e o primeiro empatado a partir dali vence). Este jogo nao tem PV — a
// identidade de um POKE aqui e o uuid — entao o desempate usa a ordem fixa de
// STAT_ORDER (HP, Atk Fis, Atk Esp, Def, Def Esp, Vel). A consequencia e que a
// distribuicao das 30 frases fica levemente enviesada pro HP em caso de empate,
// e nada mais: a frase continua sendo uma pista CORRETA do IV mais alto, que e
// a funcao dela.
//
// Nao ha nada pra gravar: a caracteristica e 100% derivada dos IVs, que ja
// estao no save. Uma coluna no banco so criaria a chance de ela divergir deles.
import type { StatBlock, StatKey } from './pokes'
import { STAT_ORDER } from './statLabels'

// Teto do dado. Exportado porque a ficha do POKE (destaque verde no IV maximo) e
// o glossario precisam do MESMO numero — eram tres copias do literal 31.
export const IV_MAX = 31

// As 30 frases oficiais, traduzidas. Indice = IV modulo 5, na ordem em que os
// jogos as listam para cada atributo.
const FRASES: Record<StatKey, string[]> = {
  hp: [
    'Adora comer',
    'Cochila muito',
    'Dorme demais',
    'Distrai-se com facilidade',
    'Escapole por qualquer buraco',
  ],
  atkFis: [
    'Gosta de se debater',
    'Tem um temperamento forte',
    'Um pouco briguento',
    'Aguenta o tranco',
    'Cabeca-dura',
  ],
  def: [
    'Muito bem cuidado',
    'Meio vaidoso',
    'Firme e determinado',
    'Bom resistindo',
    'Extremamente teimoso',
  ],
  atkEsp: [
    'Muito curioso',
    'Meio brincalhao',
    'Costuma se perder',
    'Tem imaginacao forte',
    'Sonhador',
  ],
  defEsp: [
    'Faz muita bagunca',
    'Bom em altas rodas',
    'Meio ranzinza',
    'Detesta perder',
    'Muito paciente',
  ],
  speed: [
    'Corre demais',
    'Muito rapido',
    'Foge quando pode',
    'Alerta a sons',
    'Impetuoso',
  ],
}

/** O atributo de IV mais alto, desempatando pela ordem fixa de STAT_ORDER. */
export function statDeMaiorIv(ivs: StatBlock): StatKey {
  let melhor: StatKey = STAT_ORDER[0]
  for (const stat of STAT_ORDER) {
    if (ivs[stat] > ivs[melhor]) melhor = stat
  }
  return melhor
}

export interface Caracteristica {
  /** A frase que o jogador le. */
  texto: string
  /** O atributo que ela denuncia como o de IV mais alto. */
  stat: StatKey
  /** O valor desse IV — a ficha ja mostra os IVs, entao nao e spoiler de nada. */
  iv: number
}

export function caracteristicaDe(ivs: StatBlock | null | undefined): Caracteristica | null {
  if (!ivs) return null
  const stat = statDeMaiorIv(ivs)
  const iv = ivs[stat]
  if (!Number.isFinite(iv) || iv < 0 || iv > IV_MAX) return null
  return { texto: FRASES[stat][iv % 5], stat, iv }
}
