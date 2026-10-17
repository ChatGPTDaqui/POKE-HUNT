// Skins do TREINADOR em campo (o boneco que anda atras do POKE, 08/10).
//
// Cada skin e uma pasta em `assets/treinadores/campo/<id>/` com `Walk-Anim.png`
// e `Idle-Anim.png` com recortes RGBA na resolução original (8 direções).
// Geometria gerada por scripts/arte/importar-treinadores-sem-perda.cjs.
//
// Nao confundir com a FOTO de perfil (`avatares.ts`): a foto e social, os
// outros jogadores veem; a skin so aparece no campo do proprio jogador.

import quadros from './quadrosDoTreinador.json'

// SKIN DESBLOQUEAVEL (decisao do dono, 17/10/2026): gratis sao so as que a
// franquia da de graca — os protagonistas jogaveis (Red, May, Dawn) e o
// Mochileiro generico. As outras pedem MERITO: uma conquista do jogador. Nunca
// compradas, coerente com as conquistas (so cosmetico, mérito proprio).
//
// O SERVIDOR E QUEM DECIDE: `definir_skin_treinador` recusa skin trancada, e
// a regra de cada uma esta escrita la tambem. `skinsDesbloqueaveis.test.ts`
// compara os dois lados — skin nova entra aqui E na migration.
//
// Skin nova (o dono faz as sprites e introduz aos poucos): uma linha aqui, a
// pasta da arte, e a regra na proxima migration de skins.
export type DesbloqueioDeSkin =
  | { t: 'gratis' }
  /** Desbloqueia quando o jogador tem a conquista. `dica` e o texto da tela. */
  | { t: 'conquista'; id: string; dica: string }

export interface SkinDoTreinador {
  id: string
  nome: string
  desbloqueio: DesbloqueioDeSkin
}

export const SKINS_DO_TREINADOR: readonly SkinDoTreinador[] = [
  { id: 'mochila', nome: 'Mochileiro', desbloqueio: { t: 'gratis' } },
  { id: 'red', nome: 'Red', desbloqueio: { t: 'gratis' } },
  { id: 'may', nome: 'May', desbloqueio: { t: 'gratis' } },
  { id: 'dawn', nome: 'Dawn', desbloqueio: { t: 'gratis' } },
  { id: 'carvalho', nome: 'Professor Carvalho', desbloqueio: { t: 'conquista', id: 'assistente_do_professor', dica: 'Registre 100 espécies na Pokédex.' } },
  { id: 'jessie', nome: 'Jessie', desbloqueio: { t: 'conquista', id: 'decolando_de_novo', dica: 'Conquista secreta da Equipe Rocket.' } },
  { id: 'lance', nome: 'Lance', desbloqueio: { t: 'conquista', id: 'campeao', dica: 'Vença o Campeão Lance.' } },
  { id: 'cynthia', nome: 'Cynthia', desbloqueio: { t: 'conquista', id: 'mestre_pokemon', dica: 'Conquiste a platina: Mestre Pokémon.' } },
]

/** A skin esta liberada pra quem tem estas conquistas? Gratis sempre. */
export function skinDesbloqueada(
  skin: SkinDoTreinador, conquistas: Readonly<Record<string, unknown>>,
): boolean {
  return skin.desbloqueio.t === 'gratis' || conquistas[skin.desbloqueio.id] != null
}

export const SKIN_PADRAO = 'mochila'

/** Id conhecido devolve ele mesmo; qualquer outro (chave antiga, lixo) cai na padrao. */
export function skinValida(id: string | null | undefined): string {
  return SKINS_DO_TREINADOR.some((s) => s.id === id) ? id! : SKIN_PADRAO
}

export function folhaDaSkin(id: string, anim: 'Walk' | 'Idle'): string {
  return `assets/treinadores/campo/${skinValida(id)}/${anim}-Anim.png`
}

export function quadroDaSkin(id: string) {
  return quadros[skinValida(id) as keyof typeof quadros]
}
