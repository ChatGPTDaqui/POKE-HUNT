// Fixtures de apresentação. Não importar catálogo, stores, controller ou clientes remotos.
// Ordem preservada da ActionDock real: ESQUERDA, Hunt, Loja, Hospital, Mercado, Mais.
export const PRIMARY = ['Equipe', 'Mochila', 'Pokédex', 'Hunt', 'Loja', 'Hospital', 'Mercado', 'Mais'] as const
export const SHORTCUTS = ['Diário', 'Especialidades', 'Tasks', 'Calculadora', 'PvP'] as const
export type Primary = typeof PRIMARY[number]
export type View = Primary | 'hunt' | 'Treinador' | typeof GROUPS[number]['destinations'][number]['name']
export type ArtKind = 'team' | 'bag' | 'map' | 'dex' | 'guide'

export const GROUPS = [
  { title: 'Preparar a jornada', note: 'Tudo pronto para o próximo encontro.', destinations: [
    { name: 'Loja', description: 'Suprimentos para a viagem', icon: 'Storefront' },
    { name: 'Hospital', description: 'Recuperação e retorno', icon: 'FirstAid' },
    { name: 'Especialidades', description: 'Seu jeito de treinar', icon: 'Sparkle' },
    { name: 'Tasks', description: 'Objetivos da jornada', icon: 'CheckSquare' },
    { name: 'Diário', description: 'Acompanhe seus primeiros passos', icon: 'BookBookmark' },
  ] },
  { title: 'Encontrar outros treinadores', note: 'Uma aventura fica melhor em companhia.', destinations: [
    { name: 'Social', description: 'Conversas e contatos', icon: 'ChatsCircle' },
    { name: 'Troca', description: 'Pokémon entre treinadores', icon: 'ArrowsLeftRight' },
    { name: 'Mercado', description: 'Anúncios da comunidade', icon: 'Scales' },
    { name: 'PvP', description: 'Prepare sua formação', icon: 'Sword' },
    { name: 'Ranking', description: 'Classificações', icon: 'Trophy' },
  ] },
  { title: 'Consultar e ajustar', note: 'Conhecimento também faz parte da equipe.', destinations: [
    { name: 'Bestiário', description: 'Estude os encontros', icon: 'BookBookmark' },
    { name: 'Wiki', description: 'Guia do jogo', icon: 'Books' },
    { name: 'Tutoriais', description: 'Aprenda no seu ritmo', icon: 'GraduationCap' },
    { name: 'Calculadora', description: 'Compare possibilidades', icon: 'Calculator' },
    { name: 'Ajustes', description: 'Deixe o jogo do seu jeito', icon: 'Gear' },
  ] },
] as const

// Destinos permanentes não são repetidos no guia.
export const GUIDE_GROUPS = GROUPS.map(group => ({ ...group, destinations: group.destinations.filter(
  destination => !PRIMARY.some(name => name === destination.name) && !SHORTCUTS.some(name => name === destination.name),
) })).filter(group => group.destinations.length > 0)

export const TEAM = [
  { id: 'charmeleon', name: 'Charmeleon', level: 24, types: ['Fogo'], hp: 82, maxHp: 96, number: '005', note: 'Seu parceiro de campo.', stats: [58, 64, 80] },
  { id: 'pikachu', name: 'Pikachu', level: 22, types: ['Elétrico'], hp: 68, maxHp: 68, number: '025', note: 'Sempre pronto para a próxima aventura.', stats: [55, 40, 90] },
  { id: 'wartortle', name: 'Wartortle', level: 23, types: ['Água'], hp: 84, maxHp: 84, number: '008', note: 'Um companheiro de confiança.', stats: [63, 80, 58] },
  { id: 'ivysaur', name: 'Ivysaur', level: 23, types: ['Planta', 'Veneno'], hp: 80, maxHp: 80, number: '002', note: 'Uma nova descoberta a cada passo.', stats: [62, 63, 60] },
  { id: 'pidgeotto', name: 'Pidgeotto', level: 21, types: ['Voador', 'Normal'], hp: 74, maxHp: 74, number: '017', note: 'De olho no horizonte.', stats: [60, 55, 71] },
  { id: 'eevee', name: 'Eevee', level: 20, types: ['Normal'], hp: 72, maxHp: 72, number: '133', note: 'Muitas possibilidades pela frente.', stats: [55, 50, 55] },
] as const
export type TeamMember = typeof TEAM[number]
export const ITEMS = [
  { id: 'poke_ball', name: 'Poké Ball', category: 'Poké Bolas', count: 48, description: 'Uma ferramenta indispensável para seus encontros com Pokémon.' },
  { id: 'great_ball', name: 'Great Ball', category: 'Poké Bolas', count: 16, description: 'Uma opção de captura para levar na próxima expedição.' },
  { id: 'ultra_ball', name: 'Ultra Ball', category: 'Poké Bolas', count: 8, description: 'Reserve um espaço na mochila para encontros especiais.' },
  { id: 'potion', name: 'Potion', category: 'Recuperação', count: 24, description: 'Suprimento de recuperação para cuidar dos seus parceiros.' },
  { id: 'super_potion', name: 'Super Potion', category: 'Recuperação', count: 12, description: 'Mais uma opção de recuperação para sua jornada.' },
  { id: 'revive', name: 'Revive', category: 'Recuperação', count: 5, description: 'Um recurso de recuperação para momentos importantes.' },
  { id: 'antidote', name: 'Antidote', category: 'Recuperação', count: 7, description: 'Leve recursos para lidar com condições de combate.' },
  { id: 'type_stone', name: 'Pedra de tipo', category: 'Pedras', count: 2, description: 'Exemplo de apresentação de um material. Não representa uma nova regra de evolução.' },
] as const
export type Item = typeof ITEMS[number]
export const CATEGORIES = ['Todos', 'Poké Bolas', 'Recuperação', 'Pedras'] as const
export type Category = typeof CATEGORIES[number]
export const ART: Partial<Record<Primary, ArtKind>> = { Equipe: 'team', Mochila: 'bag', Hunt: 'map', Pokédex: 'dex', Mais: 'guide' }
export function filterItems(category: Category, search: string) {
  const query = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  return ITEMS.filter(item => (category === 'Todos' || item.category === category)
    && item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(query))
}
