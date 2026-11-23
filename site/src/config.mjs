// Endereços fixos num lugar só. Se um dia houver domínio próprio, muda aqui.
export const SITE_URL = 'https://pokeinspiration.pages.dev'
export const GAME_URL = 'https://poke-hunt-euj.pages.dev'
// Arte copiada do jogo por scripts/preparar-arte.mjs (public/art/).
export const spriteUrl = (id) => `/art/sprites/${id}.gif`
export const trainerUrl = (id) => `/art/treinadores/${id}.png`
export const sceneUrl = (id, w = 1600) => `/art/cenarios/${id}-${w}.webp`
export const biomeUrl = (id) => `/art/biomas/${id}.webp`
