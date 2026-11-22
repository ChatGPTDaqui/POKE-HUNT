// Endereços fixos num lugar só. Se um dia houver domínio próprio, muda aqui.
export const SITE_URL = 'https://pokeinspiration.pages.dev'
export const GAME_URL = 'https://poke-hunt-euj.pages.dev'
// Sprites servidos pelo próprio jogo: o site não duplica a arte.
export const spriteUrl = (id) => `${GAME_URL}/assets/gen5ani/${id}.gif`
