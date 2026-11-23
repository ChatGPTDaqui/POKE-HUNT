// Pares de páginas PT <-> EN. A chave é o id da página; o layout usa isto para
// o hreflang, o seletor de idioma e o menu.
export const ROUTES = {
  home: { pt: '/', en: '/en/' },
  howto: { pt: '/como-jogar/', en: '/en/how-to-play/' },
  faq: { pt: '/perguntas/', en: '/en/faq/' },
  updates: { pt: '/novidades/', en: null },
}

export const UI = {
  pt: {
    lang: 'pt-BR',
    nav: { home: 'Início', howto: 'Como jogar', faq: 'Perguntas', updates: 'Novidades' },
    play: 'Jogar grátis',
    switchLabel: 'English',
    disclaimer:
      'Poke Inspiration é um jogo de fã, gratuito e sem vínculo com Nintendo, Game Freak, Creatures ou The Pokémon Company. Pokémon e os nomes relacionados são marcas de seus respectivos donos.',
  },
  en: {
    lang: 'en',
    nav: { home: 'Home', howto: 'How to play', faq: 'FAQ', updates: 'Updates (PT)' },
    play: 'Play free',
    switchLabel: 'Português',
    disclaimer:
      'Poke Inspiration is a free fan game with no affiliation with Nintendo, Game Freak, Creatures or The Pokémon Company. Pokémon and related names are trademarks of their respective owners.',
  },
}
