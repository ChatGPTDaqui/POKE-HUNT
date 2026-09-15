// Fotos de perfil do treinador (PH-548, PH-550).
//
// O catalogo vive AQUI, e so aqui. A RPC `definir_avatar` valida apenas o
// FORMATO do id (`^[a-z0-9-]{1,32}$`), nao a lista — a mesma regra escrita em
// SQL e em TS ja divergiu uma vez neste projeto (PH-492, `configurar_auto`),
// e um id que o cliente nao conhece cai no icone padrao sem quebrar nada.
//
// O catalogo CONTEM os slugs dos bots do PvP (scripts/pvp/seed-bots.mjs): cada
// bot recebe o proprio retrato na migration `20260915140000_avatar_do_treinador`.
// Desde a PH-550 ha mais gente (desenho, lideres, campeoes, Equipe Rocket).
// Corpo inteiro em `assets/treinadores/`, rosto em `assets/treinadores/rosto/`,
// os dois gerados por scripts/importar-retratos-de-treinador.mjs.

export interface AvatarDef {
  id: string
  nome: string
}

export const AVATARES: readonly AvatarDef[] = [
  // Os dez bots do PvP — a ordem e a do seed.
  { id: 'red', nome: 'Red' },
  { id: 'blue', nome: 'Blue' },
  { id: 'giovanni', nome: 'Giovanni' },
  { id: 'lance', nome: 'Lance' },
  { id: 'agatha', nome: 'Agatha' },
  { id: 'blaine', nome: 'Blaine' },
  { id: 'steven', nome: 'Steven Stone' },
  { id: 'wallace', nome: 'Wallace' },
  { id: 'maxie', nome: 'Maxie' },
  { id: 'ash', nome: 'Ash' },
  // PH-550: o desenho e os jogos.
  { id: 'misty', nome: 'Misty' },
  { id: 'brock', nome: 'Brock' },
  { id: 'jessie', nome: 'Jessie' },
  { id: 'james', nome: 'James' },
  { id: 'recruta-rocket', nome: 'Recruta Rocket' },
  { id: 'recruta-rocket-f', nome: 'Recruta Rocket (ela)' },
  { id: 'archer', nome: 'Archer' },
  { id: 'ariana', nome: 'Ariana' },
  { id: 'oak', nome: 'Prof. Carvalho' },
  { id: 'leaf', nome: 'Leaf' },
  { id: 'ethan', nome: 'Ethan' },
  { id: 'lyra', nome: 'Lyra' },
  { id: 'silver', nome: 'Silver' },
  { id: 'may', nome: 'May' },
  { id: 'dawn', nome: 'Dawn' },
  { id: 'serena', nome: 'Serena' },
  { id: 'n', nome: 'N' },
  { id: 'cynthia', nome: 'Cynthia' },
  { id: 'sabrina', nome: 'Sabrina' },
  { id: 'erika', nome: 'Erika' },
  { id: 'koga', nome: 'Koga' },
  { id: 'bruno', nome: 'Bruno' },
  { id: 'lorelei', nome: 'Lorelei' },
  { id: 'whitney', nome: 'Whitney' },
  { id: 'morty', nome: 'Morty' },
  { id: 'clair', nome: 'Clair' },
]

/** Espelho da regra da RPC `definir_avatar`; o servidor e quem manda. */
export const FORMATO_DE_AVATAR = /^[a-z0-9-]{1,32}$/

const POR_ID: ReadonlyMap<string, AvatarDef> = new Map(AVATARES.map((a) => [a.id, a]))

export function avatarConhecido(id: string | null | undefined): AvatarDef | null {
  return id ? POR_ID.get(id) ?? null : null
}

/**
 * O ROSTO (PH-550): quadrado recortado do topo do sprite, e o que toda tela
 * mostra — num quadrado de 2em o corpo inteiro nao dizia quem era.
 * `null` para id vazio ou fora do catalogo — quem desenha cai no icone padrao.
 */
export function avatarUrl(id: string | null | undefined): string | null {
  return avatarConhecido(id) ? `assets/treinadores/rosto/${id}.png` : null
}

/** O sprite de corpo inteiro, pra quem tiver espaco (nenhuma tela usa hoje). */
export function avatarCorpoUrl(id: string | null | undefined): string | null {
  return avatarConhecido(id) ? `assets/treinadores/${id}.png` : null
}
