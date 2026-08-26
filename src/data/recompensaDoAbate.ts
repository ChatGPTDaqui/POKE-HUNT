// As duas recompensas que um abate produz, e como reconhece-las (PH-191).
//
// `handleEnemyDefeated` (engine/simulation.ts) empurra DOIS `rewardText` no
// `WorldState` por abate, e o que os distingue e o campo `unit`. Estas
// constantes dao nome aquele literal pra o cliente nao adivinhar por cor.
//
// POR QUE O MOTOR NAO FOI ALTERADO pra carregar um tipo explicito: `simulation`
// vai pro bundle da Edge, e mexer nele obriga a regerar `servidor.js` e a
// arriscar divergencia entre o que o servidor simula e o que o cliente desenha.
// O `unit` ja existe e ja e o discriminante — o que faltava era um nome e um
// teste travando o contrato. `unidadesDoAbate.test.ts` le o proprio
// `simulation.ts` e reprova se os literais de la sairem de sincronia com estes.
export const UNIDADE_XP = 'XP'
/** Emoji de moeda, e nao a palavra "ouro" — e o que o motor emite hoje. */
export const UNIDADE_OURO = '🪙'

export type TipoDeRecompensa = 'ouro' | 'xp'

/**
 * Que recompensa este `rewardText` representa?
 *
 * `null` para unidade desconhecida, e o call site trata: uma recompensa nova que
 * apareca no motor sem passar por aqui NAO vira um voo de ouro por engano — ela
 * simplesmente nao vira voo, o que e visivel na revisao e nao mente pro jogador.
 */
export function tipoDaRecompensa(unit: string | undefined): TipoDeRecompensa | null {
  if (unit === UNIDADE_OURO) return 'ouro'
  if (unit === UNIDADE_XP) return 'xp'
  return null
}
