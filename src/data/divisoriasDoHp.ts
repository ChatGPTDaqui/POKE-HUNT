// DIVISORIAS DA BARRA DE HP POR QUANTIDADE DE VIDA (pedido do dono, 23/11/2026,
// "igual ao League of Legends"): cada risco vale uma quantidade FIXA de HP, nao
// uma fracao da barra. Quanto mais HP o POKE tem, mais riscos a barra mostra —
// um Lv 100 tanque "parece" mais robusto que um Lv 20 com a barra cheia.
//
// Risco fino a cada UNIDADE_DO_HP, risco forte a cada BLOCO_DO_HP (4 unidades).
// Faixa medida no catalogo: HP maximo ~16 (Lv 5) a ~700 (Lv 100); mediana 60 no
// Lv 20 e 268 no Lv 100 — 2 a 10 riscos na maioria das barras.
//
// Quando os riscos ficariam colados (barra pequena, HP alto), o fino some e
// sobra so o forte; se nem o forte cabe, a escala sobe (x5) ate caber. Mesmo
// criterio do jogo de referencia: o risco tem que continuar legivel.
//
// Puro: usado pelo canvas (render/sprites.ts) e pelo painel (StatusRail.tsx).

export const UNIDADE_DO_HP = 25
export const BLOCO_DO_HP = 100
/** Distancia minima (px) entre dois riscos desenhados. */
export const ESPACO_MINIMO_ENTRE_RISCOS = 2

export interface Divisoria {
  /** Posicao na barra, 0..1 (fracao do HP maximo). */
  posicao: number
  forte: boolean
}

export function divisoriasDoHp(hpMaximo: number, larguraPx: number): Divisoria[] {
  if (!(hpMaximo > 0) || !(larguraPx > 0)) return []
  const pxPorHp = larguraPx / hpMaximo
  let forte = BLOCO_DO_HP
  // Sobe a escala ate o risco FORTE caber (100 -> 500 -> 2500...).
  while (forte * pxPorHp < ESPACO_MINIMO_ENTRE_RISCOS) forte *= 5
  // O fino e o menor degrau que cabe: 25, 50 ou o proprio forte. Sem o degrau
  // de 50, um POKE de 600 HP numa barra de 32 px perdia os finos e mostrava
  // MENOS riscos que um de 175 — o contrario do pedido.
  const degraus = forte === BLOCO_DO_HP ? [UNIDADE_DO_HP, BLOCO_DO_HP / 2] : [forte / 5, forte / 2]
  const passo = degraus.find((d) => d * pxPorHp >= ESPACO_MINIMO_ENTRE_RISCOS) ?? forte
  const riscos: Divisoria[] = []
  for (let hp = passo; hp < hpMaximo; hp += passo) {
    riscos.push({ posicao: hp / hpMaximo, forte: hp % forte === 0 })
  }
  return riscos
}
