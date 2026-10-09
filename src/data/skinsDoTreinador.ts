// Skins do TREINADOR em campo (o boneco que anda atras do POKE, 08/10).
//
// Cada skin e uma pasta em `assets/treinadores/campo/<id>/` com `Walk-Anim.png`
// e `Idle-Anim.png` no formato das folhas dos POKE (8 direcoes x 4 quadros,
// quadro 32x40) — geradas da arte do dono por
// `scripts/arte/converter-treinador-de-campo.cjs`.
//
// Nao confundir com a FOTO de perfil (`avatares.ts`): a foto e social, os
// outros jogadores veem; a skin so aparece no campo do proprio jogador.

export interface SkinDoTreinador {
  id: string
  nome: string
}

export const SKINS_DO_TREINADOR: readonly SkinDoTreinador[] = [
  { id: 'mochila', nome: 'Mochileiro' },
  { id: 'may', nome: 'May' },
  { id: 'dawn', nome: 'Dawn' },
  { id: 'lance', nome: 'Lance' },
  { id: 'cynthia', nome: 'Cynthia' },
]

export const SKIN_PADRAO = 'mochila'

/** Id conhecido devolve ele mesmo; qualquer outro (chave antiga, lixo) cai na padrao. */
export function skinValida(id: string | null | undefined): string {
  return SKINS_DO_TREINADOR.some((s) => s.id === id) ? id! : SKIN_PADRAO
}

export function folhaDaSkin(id: string, anim: 'Walk' | 'Idle'): string {
  return `assets/treinadores/campo/${skinValida(id)}/${anim}-Anim.png`
}
