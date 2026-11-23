// Mapa da Wiki do site: mesma organização da Wiki do jogo (agrupada pela
// pergunta que cada bloco responde), com a Pokédex e o atlas dos biomas.
export interface SecaoDaWiki { slug: string; titulo: string; sprite: string; resumo: string }
export interface GrupoDaWiki { grupo: string; secoes: SecaoDaWiki[] }

export const WIKI: GrupoDaWiki[] = [
  { grupo: 'Começando', secoes: [
    { slug: 'comecando', titulo: 'Primeiros passos', sprite: 'squirtle', resumo: 'Inicial, primeira caçada, automações e menus.' },
  ] },
  { grupo: 'Mundo', secoes: [
    { slug: 'mundo', titulo: 'Como o mundo funciona', sprite: 'pidgey', resumo: 'Estágios, salas, chefes, clima, Lance e Pesadelo.' },
    { slug: 'biomas', titulo: 'Biomas', sprite: 'caterpie', resumo: 'Os 12 biomas, sub-biomas e salas especiais.' },
    { slug: 'pokedex', titulo: 'Pokédex', sprite: 'eevee', resumo: 'Todas as espécies e onde encontrar cada uma.' },
  ] },
  { grupo: 'Combate', secoes: [
    { slug: 'tipos', titulo: 'Tipos', sprite: 'charmander', resumo: 'Efetividade e a tabela completa 18×18.' },
    { slug: 'combate', titulo: 'Combate e dano', sprite: 'pikachu', resumo: 'IA, acerto, cálculo de dano, clima e golpes especiais.' },
    { slug: 'status', titulo: 'Status', sprite: 'krabby', resumo: 'Veneno, queimadura, sono e o resto, com curas.' },
    { slug: 'natureza', titulo: 'Natureza e habilidade', sprite: 'rattata', resumo: 'O que faz dois POKEs iguais serem diferentes.' },
  ] },
  { grupo: 'Progresso', secoes: [
    { slug: 'progresso', titulo: 'Progressão', sprite: 'bulbasaur', resumo: 'Captura, economia, evolução, especialidades e ovos.' },
    { slug: 'raridade', titulo: 'Raridade e shiny', sprite: 'dragonite', resumo: 'Tabela de raridades, shiny e lendários.' },
  ] },
  { grupo: 'Jogadores', secoes: [
    { slug: 'jogadores', titulo: 'Jogadores', sprite: 'wingull', resumo: 'Mercado, troca, social, chat e ranking.' },
  ] },
]

export const SECOES = WIKI.flatMap((g) => g.secoes)
export const secao = (slug: string) => SECOES.find((s) => s.slug === slug)!
