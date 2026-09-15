// Fotos de perfil do treinador (PH-548).
//
// O catalogo vive AQUI, e so aqui. A RPC `definir_avatar` valida apenas o
// FORMATO do id (`^[a-z0-9-]{1,32}$`), nao a lista — a mesma regra escrita em
// SQL e em TS ja divergiu uma vez neste projeto (PH-492, `configurar_auto`),
// e um id que o cliente nao conhece cai no icone padrao sem quebrar nada.
//
// Os ids sao os slugs dos bots do PvP (scripts/pvp/seed-bots.mjs): cada bot
// recebe o proprio retrato na migration `20260915140000_avatar_do_treinador`,
// e o jogador escolhe entre os mesmos dez. Retratos em `assets/treinadores/`,
// importados por scripts/importar-retratos-de-treinador.mjs.

export interface AvatarDef {
  id: string
  nome: string
}

export const AVATARES: readonly AvatarDef[] = [
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
]

/** Espelho da regra da RPC `definir_avatar`; o servidor e quem manda. */
export const FORMATO_DE_AVATAR = /^[a-z0-9-]{1,32}$/

const POR_ID: ReadonlyMap<string, AvatarDef> = new Map(AVATARES.map((a) => [a.id, a]))

export function avatarConhecido(id: string | null | undefined): AvatarDef | null {
  return id ? POR_ID.get(id) ?? null : null
}

/** `null` para id vazio ou fora do catalogo — quem desenha cai no icone padrao. */
export function avatarUrl(id: string | null | undefined): string | null {
  return avatarConhecido(id) ? `assets/treinadores/${id}.png` : null
}
