// Conquistas ("platinar") — o catalogo AUTORAL.
//
// Spec: vault 01-Projetos/novo-poke-idle/specs/2026-10-14-conquistas-design.md
// (aprovado pelo dono em 14/10/2026). Ideias de onde saiu cada uma:
// docs/planos/2026-10-13-conquistas-brainstorm.md.
//
// ESTE ARQUIVO NAO E LIDO PELO JOGO DIRETO. `npm run conquistas:gerar` resolve
// as regras (lista de especies de cada regiao, especies rosa...) e emite:
//   * src/data/generated/conquistas.generated.ts — o que a tela usa;
//   * uma migration com as linhas de `conquista_catalogo` — o que o servidor
//     avalia.
// `conquistasCatalogo.test.ts` reprova se os dois sairem do passo com isto.
//
// REGRAS DE PRODUTO (decisoes do dono, 14/10):
//  * recompensa so cosmetica (titulo nas Ouro/Impossivel/Platina);
//  * permanente; so merito proprio (POKE comprado/trocado nao conta — o SQL so
//    olha POKE com origem captura/inicial/recompensa);
//  * NENHUMA conquista cita especie lendaria: lendarios vao virar eventos, e as
//    hunts BOSS de hoje sao so pros beta testers. A RARIDADE "Legendary" e outra
//    coisa e vale;
//  * platina = todas as bronze/prata/ouro, secretas incluidas; impossiveis fora.
import type { RarityKey } from './rarity'
import type { ElementType } from './generated/types'
import type { NatureKey } from './natures'

export type NivelDeConquista = 'bronze' | 'prata' | 'ouro' | 'impossivel' | 'platina'

export type CategoriaDeConquista =
  | 'anime_s1' | 'anime_s2' | 'colecao' | 'cacada' | 'genetica'
  | 'combate' | 'treinador' | 'social' | 'universo'

export const PONTOS_POR_NIVEL: Record<NivelDeConquista, number> = {
  bronze: 10, prata: 25, ouro: 75, impossivel: 250, platina: 500,
}

/** Nome de cada categoria na tela. */
export const NOME_DA_CATEGORIA: Record<CategoriaDeConquista, string> = {
  anime_s1: 'Jornada de Kanto',
  anime_s2: 'Ilhas Laranja',
  colecao: 'Coleção',
  cacada: 'Caçada',
  genetica: 'Raridade e genética',
  combate: 'Combate',
  treinador: 'Treinador',
  social: 'Social e PvP',
  universo: 'Universo Pokémon',
}

/**
 * Lista de especies "simbolica", resolvida pelo gerador: a regiao inteira
 * (so especies que o jogo tem e que NAO sao lendarias) ou um grupo nomeado.
 */
export type GrupoDeEspecies = '@kanto' | '@johto' | '@hoenn' | '@nacional' | '@rosa'
export type Especies = string[] | GrupoDeEspecies

export interface FiltroDePoke {
  especies?: Especies
  shiny?: boolean
  raridade?: RarityKey
  raridade_min?: RarityKey
  nivel_min?: number
  nivel_max?: number
  ivs31_min?: number
  ivs_zero?: boolean
  iv_vel_min?: number
  natureza?: NatureKey
  oculto?: boolean
  tipo?: ElementType
}

export type Metrica =
  | 'nivel_treinador' | 'pvp_vitorias' | 'pvp_derrotas' | 'pvp_divisao' | 'amigos'
  | 'trocas' | 'vendas_mercado' | 'especialidades_max' | 'especialidade_niveis' | 'tms'
  | 'diario_logins' | 'dias_jogados' | 'lance' | 'biomas_estagio' | 'pesadelo_estagio'
  | 'estagio_do_bioma' | 'conquistas'

/** A regra como o autor escreve (antes de resolver grupos de especies). */
export type RegraAutoral =
  | { t: 'contador'; chave: string; alvo: number }
  | { t: 'contadores'; chaves: string[]; alvo: number }
  | { t: 'contadores_todos'; chaves: string[]; alvo_cada: number }
  | { t: 'abates'; especies?: Especies; tipo?: ElementType; alvo: number }
  | { t: 'abates_tipos'; tipos: ElementType[]; alvo_cada: number }
  | { t: 'abates_shiny'; alvo: number }
  | { t: 'posse'; f: FiltroDePoke; qtd?: number }
  | { t: 'time'; f: FiltroDePoke; qtd: number }
  | { t: 'conjunto'; especies: string[]; time?: boolean }
  | { t: 'colecao'; de: 'registradas' | 'possuidas'; especies?: Especies; f?: FiltroDePoke; alvo: number | 'todas' }
  | { t: 'colecao'; de: 'naturezas' | 'tipos'; alvo: number }
  | { t: 'metrica'; m: Metrica; arg?: number | string; alvo: number }
  | { t: 'platina' }

/** Regra resolvida pelo gerador: o mesmo formato, sem grupos simbolicos. */
export type RegraResolvida = Record<string, unknown> & { t: string }

/** Linha do catalogo como o BANCO le (migration gerada): com a regra inteira. */
export interface ConquistaResolvida {
  id: string
  nome: string
  descricao: string
  categoria: CategoriaDeConquista
  nivel: NivelDeConquista
  pontos: number
  secreta: boolean
  ordem: number
  ref: string | null
  regra: RegraResolvida
}

/**
 * Linha do catalogo como a TELA le (src/data/generated/conquistas.generated.ts).
 * Sem a regra: as listas de especies das Pokedex regionais pesariam ~50 kB no
 * bundle, e o progresso de cada conquista vem do servidor (`minhas_conquistas`).
 * `alvo` e o mesmo numero que o SQL calcula em `conquista_alvo`; platina = 0
 * (a tela conta as bronze/prata/ouro do proprio catalogo).
 */
export interface ConquistaDaTela {
  id: string
  nome: string
  descricao: string
  categoria: CategoriaDeConquista
  nivel: NivelDeConquista
  pontos: number
  secreta: boolean
  ordem: number
  ref: string | null
  alvo: number
}

export interface ConquistaAutoral {
  id: string
  nome: string
  descricao: string
  categoria: CategoriaDeConquista
  nivel: NivelDeConquista
  regra: RegraAutoral
  secreta?: boolean
  /** Episodio ou jogo de referencia (EP012, Red/Blue...). So texto da tela. */
  ref?: string
}

// Posicao da divisao em `ESCADA_DIVISOES` (authority/src/pvpElo.ts), 1-based —
// a mesma conta que o SQL faz com array_position.
const DIVISAO = { prata_1: 4, ouro_1: 7, mestre: 16 } as const

const ROSA = '@rosa' as const

// Atalhos de escrita. So acucar: a regra sai identica a escrever o objeto.
const abates = (especies: string[], alvo: number): RegraAutoral => ({ t: 'abates', especies, alvo })
const abatesDoTipo = (tipo: ElementType, alvo: number): RegraAutoral => ({ t: 'abates', tipo, alvo })
const evoluir = (especieFinal: string): RegraAutoral => ({ t: 'contador', chave: `evolucao:${especieFinal}`, alvo: 1 })
const ter = (f: FiltroDePoke, qtd = 1): RegraAutoral => ({ t: 'posse', f, qtd })
const conjunto = (especies: string[], time = false): RegraAutoral => ({ t: 'conjunto', especies, time })
const metrica = (m: Metrica, alvo: number, arg?: number | string): RegraAutoral =>
  arg === undefined ? { t: 'metrica', m, alvo } : { t: 'metrica', m, arg, alvo }

const UMA_HORA = 3600

export const CONQUISTAS: ConquistaAutoral[] = [
  // --- Jornada de Kanto (temporada 1) ---------------------------------------
  { id: 'eu_escolho_voce', nome: 'Eu Escolho Você!', descricao: 'Comece sua jornada como treinador.', categoria: 'anime_s1', nivel: 'bronze', regra: metrica('nivel_treinador', 1), ref: 'EP001' },
  { id: 'teimoso_como_pikachu', nome: 'Teimoso como um Pikachu', descricao: 'Cace por 1 hora com um Pikachu como POKE ativo.', categoria: 'anime_s1', nivel: 'bronze', regra: { t: 'contador', chave: 'ativo_seg:pikachu', alvo: UMA_HORA }, ref: 'EP001' },
  { id: 'fuga_dos_spearow', nome: 'Fuga dos Spearow', descricao: 'Derrote 100 Spearow.', categoria: 'anime_s1', nivel: 'bronze', regra: abates(['spearow'], 100), ref: 'EP001' },
  { id: 'primeira_captura', nome: 'Primeira Captura', descricao: 'Capture seu primeiro POKE.', categoria: 'anime_s1', nivel: 'bronze', regra: { t: 'contador', chave: 'captura_total', alvo: 1 }, ref: 'EP003' },
  { id: 'do_casulo_ao_ceu', nome: 'Do Casulo ao Céu', descricao: 'Evolua um Caterpie até Butterfree.', categoria: 'anime_s1', nivel: 'bronze', regra: evoluir('butterfree'), ref: 'EP004' },
  { id: 'pedra_que_desafia', nome: 'Pedra que Desafia', descricao: 'Derrote 500 Geodude, Graveler, Golem, Onix ou Steelix.', categoria: 'anime_s1', nivel: 'prata', regra: abates(['geodude', 'graveler', 'golem', 'onix', 'steelix'], 500), ref: 'EP005' },
  { id: 'pedra_da_lua', nome: 'Pedra da Lua', descricao: 'Evolua um Clefairy até Clefable.', categoria: 'anime_s1', nivel: 'prata', regra: evoluir('clefable'), ref: 'EP006' },
  { id: 'florzinhas_de_cerulean', nome: 'Florzinhas de Cerulean', descricao: 'Tenha Staryu, Starmie, Goldeen e Horsea ao mesmo tempo.', categoria: 'anime_s1', nivel: 'prata', regra: conjunto(['staryu', 'starmie', 'goldeen', 'horsea']), ref: 'EP007' },
  { id: 'os_tres_iniciais', nome: 'Os Três Iniciais', descricao: 'Tenha Bulbasaur, Charmander e Squirtle ao mesmo tempo.', categoria: 'anime_s1', nivel: 'prata', regra: conjunto(['bulbasaur', 'charmander', 'squirtle']), ref: 'EP010–012' },
  { id: 'esquadrao_squirtle', nome: 'Esquadrão Squirtle', descricao: 'Tenha 5 Squirtle.', categoria: 'anime_s1', nivel: 'prata', regra: ter({ especies: ['squirtle'] }, 5), ref: 'EP012' },
  { id: 'magikarp_virou_gyarados', nome: 'Magikarp Virou Gyarados', descricao: 'Evolua um Magikarp.', categoria: 'anime_s1', nivel: 'bronze', regra: evoluir('gyarados'), ref: 'EP016' },
  { id: 'concurso_de_beleza', nome: 'Concurso de Beleza', descricao: 'Tenha 10 POKEs de raridade Raro ou acima.', categoria: 'anime_s1', nivel: 'prata', regra: ter({ raridade_min: 'raro' }, 10), ref: 'EP018' },
  { id: 'fantasmas_da_torre', nome: 'Fantasmas da Torre', descricao: 'Derrote 1.000 Gastly, Haunter ou Gengar.', categoria: 'anime_s1', nivel: 'prata', regra: abates(['gastly', 'haunter', 'gengar'], 1000), ref: 'EP023' },
  { id: 'mente_contra_mente', nome: 'Mente Contra Mente', descricao: 'Derrote 1.000 POKEs Psíquicos.', categoria: 'anime_s1', nivel: 'prata', regra: abatesDoTipo('PSYCHIC', 1000), ref: 'EP022' },
  { id: 'riso_que_vence', nome: 'Riso que Vence', descricao: 'Tenha Haunter e Kadabra na equipe ao mesmo tempo.', categoria: 'anime_s1', nivel: 'bronze', regra: conjunto(['haunter', 'kadabra'], true), ref: 'EP024' },
  { id: 'perfume_de_celadon', nome: 'Perfume de Celadon', descricao: 'Derrote 1.000 POKEs Planta.', categoria: 'anime_s1', nivel: 'prata', regra: abatesDoTipo('GRASS', 1000), ref: 'EP026' },
  { id: 'o_muk_abraca', nome: 'O Muk Abraça', descricao: 'Tenha um Muk nível 50 ou mais.', categoria: 'anime_s1', nivel: 'prata', regra: ter({ especies: ['muk'], nivel_min: 50 }), ref: 'EP030' },
  { id: 'ninja_de_fuchsia', nome: 'Ninja de Fuchsia', descricao: 'Derrote 1.000 POKEs Venenosos.', categoria: 'anime_s1', nivel: 'prata', regra: abatesDoTipo('POISON', 1000), ref: 'EP032' },
  { id: 'corrida_de_rapidash', nome: 'Corrida de Rapidash', descricao: 'Evolua um Ponyta.', categoria: 'anime_s1', nivel: 'bronze', regra: evoluir('rapidash'), ref: 'EP033' },
  { id: 'mamae_kangaskhan', nome: 'Mamãe Kangaskhan', descricao: 'Derrote 300 Kangaskhan.', categoria: 'anime_s1', nivel: 'prata', regra: abates(['kangaskhan'], 300), ref: 'EP034' },
  { id: 'ditto_desajeitado', nome: 'Ditto Desajeitado', descricao: 'Tenha 3 Ditto.', categoria: 'anime_s1', nivel: 'prata', regra: ter({ especies: ['ditto'] }, 3), ref: 'EP036' },
  { id: 'irmaos_eevee', nome: 'Irmãos Eevee', descricao: 'Tenha Eevee, Vaporeon, Jolteon e Flareon ao mesmo tempo.', categoria: 'anime_s1', nivel: 'ouro', regra: conjunto(['eevee', 'vaporeon', 'jolteon', 'flareon']), ref: 'EP038' },
  { id: 'charmander_rebelde', nome: 'Charmander Rebelde', descricao: 'Evolua um Charmander até Charizard.', categoria: 'anime_s1', nivel: 'prata', regra: evoluir('charizard'), ref: 'EP044' },
  { id: 'fosseis_vivos', nome: 'Fósseis Vivos', descricao: 'Tenha Omanyte, Kabuto e Aerodactyl ao mesmo tempo.', categoria: 'anime_s1', nivel: 'ouro', regra: conjunto(['omanyte', 'kabuto', 'aerodactyl']), ref: 'EP044' },
  { id: 'quem_fica_com_o_togepi', nome: 'Quem Fica com o Togepi?', descricao: 'Tenha um Togepi.', categoria: 'anime_s1', nivel: 'prata', regra: ter({ especies: ['togepi'] }), ref: 'EP048' },
  { id: 'jardim_secreto', nome: 'Jardim Secreto', descricao: 'Evolua um Bulbasaur até Venusaur.', categoria: 'anime_s1', nivel: 'prata', regra: evoluir('venusaur'), ref: 'EP049' },
  { id: 'detetive_growlithe', nome: 'Detetive Growlithe', descricao: 'Tenha um Growlithe e um Arcanine.', categoria: 'anime_s1', nivel: 'bronze', regra: conjunto(['growlithe', 'arcanine']), ref: 'EP052' },
  { id: 'exame_da_liga', nome: 'Exame da Liga', descricao: 'Limpe o estágio 10 de 4 biomas.', categoria: 'anime_s1', nivel: 'ouro', regra: metrica('biomas_estagio', 4, 10), ref: 'EP054' },
  { id: 'ginasio_escondido', nome: 'Ginásio Escondido', descricao: 'Derrote 1.000 POKEs de Fogo.', categoria: 'anime_s1', nivel: 'prata', regra: abatesDoTipo('FIRE', 1000), ref: 'EP056–057' },
  { id: 'oito_insignias', nome: 'Oito Insígnias', descricao: 'Limpe o estágio 10 de 8 biomas.', categoria: 'anime_s1', nivel: 'ouro', regra: metrica('biomas_estagio', 8, 10), ref: 'EP061' },
  { id: 'natal_com_jynx', nome: 'Natal com Jynx', descricao: 'Derrote 300 Jynx.', categoria: 'anime_s1', nivel: 'prata', regra: abates(['jynx'], 300), ref: 'EP063' },
  { id: 'nevasca', nome: 'Nevasca', descricao: 'Cace por 1 hora sob neve.', categoria: 'anime_s1', nivel: 'prata', regra: { t: 'contador', chave: 'clima_seg:neve', alvo: UMA_HORA }, ref: 'EP064' },
  { id: 'bruno_e_o_onix', nome: 'Bruno e o Onix Gigante', descricao: 'Derrote 1.000 Onix.', categoria: 'anime_s1', nivel: 'ouro', regra: abates(['onix'], 1000), ref: 'EP071' },
  { id: 'kingler_na_liga', nome: 'Kingler na Liga', descricao: 'Evolua um Krabby.', categoria: 'anime_s1', nivel: 'bronze', regra: evoluir('kingler'), ref: 'EP075' },
  { id: 'top_16_da_liga', nome: 'Top 16 da Liga', descricao: 'Chegue à divisão Prata do PvP ranqueado.', categoria: 'anime_s1', nivel: 'prata', regra: metrica('pvp_divisao', DIVISAO.prata_1), ref: 'EP080' },
  { id: 'os_30_tauros', nome: 'Os 30 Tauros', descricao: 'Tenha 30 Tauros.', categoria: 'anime_s1', nivel: 'ouro', regra: ter({ especies: ['tauros'] }, 30), ref: 'Safari Zone (não dublado)' },
  { id: 'lenda_do_dratini', nome: 'Lenda do Dratini', descricao: 'Evolua um Dratini até Dragonite.', categoria: 'anime_s1', nivel: 'ouro', regra: evoluir('dragonite'), ref: 'Safari Zone (não dublado)' },
  { id: 'porygon_proibido', nome: 'Porygon Proibido', descricao: 'Tenha um Porygon.', categoria: 'anime_s1', nivel: 'prata', regra: ter({ especies: ['porygon'] }), secreta: true, ref: 'episódio não exibido' },

  // --- Ilhas Laranja (temporada 2) ------------------------------------------
  { id: 'pidgeot_liberto', nome: 'Pidgeot Liberto', descricao: 'Evolua um Pidgey até Pidgeot.', categoria: 'anime_s2', nivel: 'prata', regra: evoluir('pidgeot'), ref: 'EP081' },
  { id: 'a_gs_ball', nome: 'A GS Ball', descricao: 'Desbloqueie 100 conquistas.', categoria: 'anime_s2', nivel: 'ouro', regra: metrica('conquistas', 100), ref: 'EP083' },
  { id: 'lapras_perdido', nome: 'Lapras Perdido', descricao: 'Tenha um Lapras.', categoria: 'anime_s2', nivel: 'prata', regra: ter({ especies: ['lapras'] }), ref: 'EP084' },
  { id: 'insignia_coral_eye', nome: 'Insígnia Coral-Eye', descricao: 'Derrote 2.000 POKEs de Água.', categoria: 'anime_s2', nivel: 'prata', regra: abatesDoTipo('WATER', 2000), ref: 'EP085' },
  { id: 'onix_de_cristal', nome: 'Onix de Cristal', descricao: 'Tenha um Onix shiny.', categoria: 'anime_s2', nivel: 'ouro', regra: ter({ especies: ['onix'], shiny: true }), ref: 'EP087' },
  { id: 'tudo_cor_de_rosa', nome: 'Tudo Cor-de-Rosa', descricao: 'Tenha 6 POKEs rosa na equipe.', categoria: 'anime_s2', nivel: 'ouro', regra: { t: 'time', f: { especies: ROSA }, qtd: 6 }, ref: 'EP088' },
  { id: 'kabuto_desperta', nome: 'Kabuto Desperta', descricao: 'Derrote 500 Kabuto ou Kabutops.', categoria: 'anime_s2', nivel: 'prata', regra: abates(['kabuto', 'kabutops'], 500), ref: 'EP089' },
  { id: 'psyduck_nunca_evolui', nome: 'Psyduck Nunca Evolui', descricao: 'Tenha um Psyduck nível 100.', categoria: 'anime_s2', nivel: 'ouro', regra: ter({ especies: ['psyduck'], nivel_min: 100 }), ref: 'EP091' },
  { id: 'insignia_sea_ruby', nome: 'Insígnia Sea Ruby', descricao: 'Limpe o estágio 10 do bioma Gélido.', categoria: 'anime_s2', nivel: 'ouro', regra: metrica('estagio_do_bioma', 10, 'gelido'), ref: 'EP093' },
  { id: 'snorlax_guloso', nome: 'Snorlax Guloso', descricao: 'Tenha um Snorlax nível 50 ou mais.', categoria: 'anime_s2', nivel: 'prata', regra: ter({ especies: ['snorlax'], nivel_min: 50 }), ref: 'EP094' },
  { id: 'scyther_ferido', nome: 'Scyther Ferido', descricao: 'Tenha um Scyther de raridade Comum no nível 100.', categoria: 'anime_s2', nivel: 'ouro', regra: ter({ especies: ['scyther'], raridade: 'comum', nivel_min: 100 }), ref: 'EP097' },
  { id: 'lorelei_em_mandarin', nome: 'Lorelei em Mandarin', descricao: 'Derrote 2.000 POKEs de Gelo.', categoria: 'anime_s2', nivel: 'ouro', regra: abatesDoTipo('ICE', 2000), ref: 'EP099' },
  { id: 'romeu_e_julieta', nome: 'Romeu e Julieta', descricao: 'Tenha um Nidoran♂ e uma Nidoran♀.', categoria: 'anime_s2', nivel: 'bronze', regra: conjunto(['nidoran_m', 'nidoran_f']), ref: 'EP100' },
  { id: 'pastor_de_magnemite', nome: 'Pastor de Magnemite', descricao: 'Tenha 10 Magnemite.', categoria: 'anime_s2', nivel: 'prata', regra: ter({ especies: ['magnemite'] }, 10), ref: 'EP101' },
  { id: 'insignia_spike_shell', nome: 'Insígnia Spike Shell', descricao: 'Tenha uma equipe de 6 POKEs Elétricos.', categoria: 'anime_s2', nivel: 'prata', regra: { t: 'time', f: { tipo: 'ELECTRIC' }, qtd: 6 }, ref: 'EP103' },
  { id: 'tracey_e_os_magikarp', nome: 'Tracey e os Magikarp', descricao: 'Derrote 5.000 Magikarp.', categoria: 'anime_s2', nivel: 'ouro', regra: abates(['magikarp'], 5000), ref: 'EP109' },
  { id: 'dragonite_invicto', nome: 'Dragonite Invicto', descricao: 'Limpe o estágio 10 de um bioma no Modo Pesadelo.', categoria: 'anime_s2', nivel: 'ouro', regra: metrica('pesadelo_estagio', 1, 10), ref: 'EP112' },
  { id: 'campeao_das_ilhas_laranja', nome: 'Campeão das Ilhas Laranja', descricao: 'Limpe o estágio 10 dos 12 biomas.', categoria: 'anime_s2', nivel: 'ouro', regra: metrica('biomas_estagio', 12, 10), ref: 'EP112' },
  { id: 'enxame_de_electrode', nome: 'Enxame de Electrode', descricao: 'Derrote 1.000 Electrode.', categoria: 'anime_s2', nivel: 'prata', regra: abates(['electrode'], 1000), ref: 'EP114' },

  // --- Coleção --------------------------------------------------------------
  { id: 'pesquisador_iniciante', nome: 'Pesquisador Iniciante', descricao: 'Registre 25 espécies na Pokédex.', categoria: 'colecao', nivel: 'bronze', regra: { t: 'colecao', de: 'registradas', alvo: 25 } },
  { id: 'assistente_do_professor', nome: 'Assistente do Professor', descricao: 'Registre 100 espécies na Pokédex.', categoria: 'colecao', nivel: 'prata', regra: { t: 'colecao', de: 'registradas', alvo: 100 } },
  { id: 'pokedex_de_kanto', nome: 'Pokédex de Kanto', descricao: 'Registre todas as espécies de Kanto do jogo (menos lendárias).', categoria: 'colecao', nivel: 'ouro', regra: { t: 'colecao', de: 'registradas', especies: '@kanto', alvo: 'todas' } },
  { id: 'pokedex_de_johto', nome: 'Pokédex de Johto', descricao: 'Registre todas as espécies de Johto do jogo (menos lendárias).', categoria: 'colecao', nivel: 'ouro', regra: { t: 'colecao', de: 'registradas', especies: '@johto', alvo: 'todas' } },
  { id: 'pokedex_de_hoenn', nome: 'Pokédex de Hoenn', descricao: 'Registre todas as espécies de Hoenn do jogo (menos lendárias).', categoria: 'colecao', nivel: 'ouro', regra: { t: 'colecao', de: 'registradas', especies: '@hoenn', alvo: 'todas' } },
  { id: 'pokedex_nacional', nome: 'Pokédex Nacional', descricao: 'Registre todas as espécies do jogo (menos lendárias).', categoria: 'colecao', nivel: 'ouro', regra: { t: 'colecao', de: 'registradas', especies: '@nacional', alvo: 'todas' } },
  { id: 'colecionador', nome: 'Colecionador', descricao: 'Tenha 150 espécies diferentes capturadas por você.', categoria: 'colecao', nivel: 'ouro', regra: { t: 'colecao', de: 'possuidas', alvo: 150 } },
  { id: 'colecionador_de_tipos', nome: 'Colecionador de Tipos', descricao: 'Tenha POKEs dos 18 tipos.', categoria: 'colecao', nivel: 'prata', regra: { t: 'colecao', de: 'tipos', alvo: 18 } },
  { id: 'familia_pidgey', nome: 'Família Completa', descricao: 'Tenha Pidgey, Pidgeotto e Pidgeot ao mesmo tempo.', categoria: 'colecao', nivel: 'bronze', regra: conjunto(['pidgey', 'pidgeotto', 'pidgeot']) },
  { id: 'eeveelucao', nome: 'Eeveelução', descricao: 'Tenha Vaporeon, Jolteon, Flareon, Espeon e Umbreon ao mesmo tempo.', categoria: 'colecao', nivel: 'ouro', regra: conjunto(['vaporeon', 'jolteon', 'flareon', 'espeon', 'umbreon']) },
  { id: 'spinda_unico', nome: 'Spinda Único', descricao: 'Tenha 10 Spinda.', categoria: 'colecao', nivel: 'prata', regra: ter({ especies: ['spinda'] }, 10), ref: 'Ruby/Sapphire' },
  { id: 'feebas_bela', nome: 'Feebas Bela', descricao: 'Evolua um Feebas até Milotic.', categoria: 'colecao', nivel: 'ouro', regra: evoluir('milotic'), ref: 'Ruby/Sapphire' },
  { id: 'shedinja_fantasma', nome: 'Shedinja Fantasma', descricao: 'Tenha Ninjask e Shedinja ao mesmo tempo.', categoria: 'colecao', nivel: 'prata', regra: conjunto(['ninjask', 'shedinja']), ref: 'Ruby/Sapphire' },
  { id: 'fosseis_de_hoenn', nome: 'Fósseis de Hoenn', descricao: 'Tenha Lileep e Anorith ao mesmo tempo.', categoria: 'colecao', nivel: 'prata', regra: conjunto(['lileep', 'anorith']) },
  { id: 'bercario', nome: 'Berçário', descricao: 'Tenha Pichu, Cleffa, Igglybuff, Togepi, Tyrogue, Smoochum, Elekid, Magby, Azurill e Wynaut.', categoria: 'colecao', nivel: 'ouro', regra: conjunto(['pichu', 'cleffa', 'igglybuff', 'togepi', 'tyrogue', 'smoochum', 'elekid', 'magby', 'azurill', 'wynaut']) },
  { id: 'nove_iniciais', nome: 'Nove Iniciais', descricao: 'Tenha os 9 iniciais de Kanto, Johto e Hoenn.', categoria: 'colecao', nivel: 'ouro', regra: conjunto(['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko', 'torchic', 'mudkip']) },
  { id: 'evolucao_final_total', nome: 'Evolução Final Total', descricao: 'Tenha as 9 evoluções finais dos iniciais.', categoria: 'colecao', nivel: 'ouro', regra: conjunto(['venusaur', 'charizard', 'blastoise', 'meganium', 'typhlosion', 'feraligatr', 'sceptile', 'blaziken', 'swampert']) },
  { id: 'box_cheia', nome: 'Box Cheia', descricao: 'Tenha 500 POKEs capturados por você.', categoria: 'colecao', nivel: 'prata', regra: ter({}, 500) },

  // --- Caçada ---------------------------------------------------------------
  { id: 'primeiro_abate', nome: 'Primeiro Abate', descricao: 'Derrote um POKE.', categoria: 'cacada', nivel: 'bronze', regra: { t: 'abates', alvo: 1 } },
  { id: 'cacador', nome: 'Caçador', descricao: 'Derrote 10.000 POKEs.', categoria: 'cacada', nivel: 'bronze', regra: { t: 'abates', alvo: 10_000 } },
  { id: 'exterminador', nome: 'Exterminador', descricao: 'Derrote 100.000 POKEs.', categoria: 'cacada', nivel: 'prata', regra: { t: 'abates', alvo: 100_000 } },
  { id: 'lenda_da_cacada', nome: 'Lenda da Caçada', descricao: 'Derrote 1.000.000 de POKEs.', categoria: 'cacada', nivel: 'ouro', regra: { t: 'abates', alvo: 1_000_000 } },
  { id: 'dez_milhoes', nome: 'Dez Milhões', descricao: 'Derrote 10.000.000 de POKEs.', categoria: 'cacada', nivel: 'impossivel', regra: { t: 'abates', alvo: 10_000_000 } },
  { id: 'explorador', nome: 'Explorador', descricao: 'Limpe o estágio 1 dos 12 biomas.', categoria: 'cacada', nivel: 'bronze', regra: metrica('biomas_estagio', 12, 1) },
  { id: 'desbravador', nome: 'Desbravador', descricao: 'Limpe o estágio 5 de 6 biomas.', categoria: 'cacada', nivel: 'prata', regra: metrica('biomas_estagio', 6, 5) },
  { id: 'pesadelo_acordado', nome: 'Pesadelo Acordado', descricao: 'Limpe um estágio do Modo Pesadelo.', categoria: 'cacada', nivel: 'prata', regra: metrica('pesadelo_estagio', 1, 1) },
  { id: 'pesadelo_vencido', nome: 'Pesadelo Vencido', descricao: 'Limpe o estágio 10 dos 12 biomas no Modo Pesadelo.', categoria: 'cacada', nivel: 'ouro', regra: metrica('pesadelo_estagio', 12, 10) },
  { id: 'campeao', nome: 'Campeão', descricao: 'Vença o Campeão Lance.', categoria: 'cacada', nivel: 'ouro', regra: metrica('lance', 1) },
  { id: 'seis_climas', nome: 'Seis Climas', descricao: 'Cace 10 minutos em cada clima: chuva, sol, granizo, areia, neve e névoa.', categoria: 'cacada', nivel: 'bronze', regra: { t: 'contadores_todos', chaves: ['clima_seg:chuva', 'clima_seg:sol', 'clima_seg:granizo', 'clima_seg:areia', 'clima_seg:neve', 'clima_seg:nevoa'], alvo_cada: 600 } },
  { id: 'cacador_de_shiny', nome: 'Caçador de Shiny', descricao: 'Derrote 100 POKEs shiny.', categoria: 'cacada', nivel: 'prata', regra: { t: 'abates_shiny', alvo: 100 } },
  { id: 'veterano_das_hunts', nome: 'Veterano das Hunts', descricao: 'Cace por 100 horas.', categoria: 'cacada', nivel: 'ouro', regra: { t: 'contador', chave: 'hunt_seg', alvo: 100 * UMA_HORA } },
  { id: 'mil_capturas', nome: 'Mil Capturas', descricao: 'Capture 1.000 POKEs.', categoria: 'cacada', nivel: 'prata', regra: { t: 'contador', chave: 'captura_total', alvo: 1000 } },
  { id: 'dez_mil_capturas', nome: 'Dez Mil Capturas', descricao: 'Capture 10.000 POKEs.', categoria: 'cacada', nivel: 'ouro', regra: { t: 'contador', chave: 'captura_total', alvo: 10_000 } },

  // --- Raridade e genética ----------------------------------------------------
  { id: 'brilho_raro', nome: 'Brilho Raro', descricao: 'Tenha um POKE shiny.', categoria: 'genetica', nivel: 'prata', regra: ter({ shiny: true }) },
  { id: 'colecao_brilhante', nome: 'Coleção Brilhante', descricao: 'Tenha 25 espécies diferentes shiny.', categoria: 'genetica', nivel: 'ouro', regra: { t: 'colecao', de: 'possuidas', f: { shiny: true }, alvo: 25 } },
  { id: 'lago_da_furia', nome: 'Lago da Fúria', descricao: 'Tenha um Gyarados shiny.', categoria: 'genetica', nivel: 'ouro', regra: ter({ especies: ['gyarados'], shiny: true }), ref: 'Gold/Silver' },
  { id: 'pikachu_brilhante', nome: 'Pikachu Brilhante', descricao: 'Tenha um Pikachu shiny.', categoria: 'genetica', nivel: 'ouro', regra: ter({ especies: ['pikachu'], shiny: true }) },
  { id: 'primeiro_ultra', nome: 'Primeiro Ultra', descricao: 'Tenha um POKE de raridade Ultra ou acima.', categoria: 'genetica', nivel: 'bronze', regra: ter({ raridade_min: 'ultra' }) },
  { id: 'legendario', nome: 'Legendário', descricao: 'Tenha um POKE de raridade Legendary ou acima.', categoria: 'genetica', nivel: 'prata', regra: ter({ raridade_min: 'legendary' }) },
  { id: 'mitico', nome: 'Mítico', descricao: 'Tenha um POKE de raridade Mythic.', categoria: 'genetica', nivel: 'ouro', regra: ter({ raridade: 'mythic' }) },
  { id: 'tres_perfeitos', nome: 'Três Perfeitos', descricao: 'Tenha um POKE com 3 atributos individuais no máximo (31).', categoria: 'genetica', nivel: 'prata', regra: ter({ ivs31_min: 3 }) },
  { id: 'cinco_perfeitos', nome: 'Cinco Perfeitos', descricao: 'Tenha um POKE com 5 atributos individuais no máximo (31).', categoria: 'genetica', nivel: 'ouro', regra: ter({ ivs31_min: 5 }) },
  { id: 'natureza_completa', nome: 'Natureza Completa', descricao: 'Tenha POKEs das 25 naturezas.', categoria: 'genetica', nivel: 'prata', regra: { t: 'colecao', de: 'naturezas', alvo: 25 } },
  { id: 'habilidade_oculta', nome: 'Habilidade Oculta', descricao: 'Tenha um POKE com a habilidade oculta.', categoria: 'genetica', nivel: 'prata', regra: ter({ oculto: true }) },
  { id: 'natureza_certa', nome: 'Natureza Certa', descricao: 'Tenha um Pikachu Timid com Velocidade 31.', categoria: 'genetica', nivel: 'prata', regra: ter({ especies: ['pikachu'], natureza: 'timid', iv_vel_min: 31 }) },
  { id: 'dupla_sorte', nome: 'Dupla Sorte', descricao: 'Tenha um shiny de raridade Legendary ou Mythic.', categoria: 'genetica', nivel: 'impossivel', regra: ter({ shiny: true, raridade_min: 'legendary' }) },
  { id: 'seis_perfeitos', nome: 'Seis Perfeitos', descricao: 'Tenha um POKE com os 6 atributos individuais em 31.', categoria: 'genetica', nivel: 'impossivel', regra: ter({ ivs31_min: 6 }) },
  { id: 'oculto_e_brilhante', nome: 'Oculto e Brilhante', descricao: 'Tenha um shiny com a habilidade oculta.', categoria: 'genetica', nivel: 'impossivel', regra: ter({ shiny: true, oculto: true }) },
  { id: 'joia_da_coroa', nome: 'A Joia da Coroa', descricao: 'Tenha um POKE shiny, Mythic, com habilidade oculta e os 6 atributos em 31.', categoria: 'genetica', nivel: 'impossivel', regra: ter({ shiny: true, raridade: 'mythic', oculto: true, ivs31_min: 6 }) },
  { id: 'magikarp_de_ouro', nome: 'Magikarp de Ouro', descricao: 'Tenha um Magikarp shiny, Mythic e nível 100.', categoria: 'genetica', nivel: 'impossivel', regra: ter({ especies: ['magikarp'], shiny: true, raridade: 'mythic', nivel_min: 100 }) },
  { id: 'pior_de_todos', nome: 'Pior de Todos', descricao: 'Tenha um POKE com os 6 atributos individuais em 0.', categoria: 'genetica', nivel: 'impossivel', regra: ter({ ivs_zero: true }), secreta: true },

  // --- Combate ----------------------------------------------------------------
  { id: 'primeiro_nivel_100', nome: 'Primeiro Nível 100', descricao: 'Tenha um POKE nível 100.', categoria: 'combate', nivel: 'prata', regra: ter({ nivel_min: 100 }) },
  { id: 'time_de_elite', nome: 'Time de Elite', descricao: 'Tenha 6 POKEs nível 100 na equipe.', categoria: 'combate', nivel: 'ouro', regra: { t: 'time', f: { nivel_min: 100 }, qtd: 6 } },
  { id: 'mestre_do_tipo', nome: 'Mestre do Tipo', descricao: 'Leve uma Especialidade ao nível máximo de dano e defesa.', categoria: 'combate', nivel: 'prata', regra: metrica('especialidades_max', 1) },
  { id: 'cem_niveis_de_especialidade', nome: 'Especialista', descricao: 'Some 100 níveis de Especialidade.', categoria: 'combate', nivel: 'ouro', regra: metrica('especialidade_niveis', 100) },
  { id: 'mestre_de_todos_os_tipos', nome: 'Mestre de Todos os Tipos', descricao: 'Leve as 18 Especialidades ao nível máximo.', categoria: 'combate', nivel: 'impossivel', regra: metrica('especialidades_max', 18) },
  { id: 'professor_de_golpes', nome: 'Professor de Golpes', descricao: 'Ensine 50 máquinas aos seus POKEs.', categoria: 'combate', nivel: 'prata', regra: metrica('tms', 50) },
  { id: 'ressurreicao', nome: 'Ressurreição', descricao: 'Use 100 Revive ou Max Revive.', categoria: 'combate', nivel: 'prata', regra: { t: 'contadores', chaves: ['item:revive', 'item:max_revive'], alvo: 100 } },
  { id: 'pocao_na_veia', nome: 'Poção na Veia', descricao: 'Use 1.000 poções.', categoria: 'combate', nivel: 'prata', regra: { t: 'contadores', chaves: ['item:potion', 'item:super_potion', 'item:hyper_potion', 'item:max_potion'], alvo: 1000 } },
  { id: 'elite_four_de_kanto', nome: 'Elite Four de Kanto', descricao: 'Derrote 1.000 POKEs de cada tipo: Gelo, Lutador, Fantasma e Dragão.', categoria: 'combate', nivel: 'ouro', regra: { t: 'abates_tipos', tipos: ['ICE', 'FIGHTING', 'GHOST', 'DRAGON'], alvo_cada: 1000 }, ref: 'Lorelei, Bruno, Agatha, Lance' },

  // --- Treinador --------------------------------------------------------------
  { id: 'treinador_10', nome: 'Treinador Nível 10', descricao: 'Chegue ao nível 10 de treinador.', categoria: 'treinador', nivel: 'bronze', regra: metrica('nivel_treinador', 10) },
  { id: 'treinador_50', nome: 'Treinador Nível 50', descricao: 'Chegue ao nível 50 de treinador.', categoria: 'treinador', nivel: 'prata', regra: metrica('nivel_treinador', 50) },
  { id: 'treinador_100', nome: 'Treinador Nível 100', descricao: 'Chegue ao nível 100 de treinador.', categoria: 'treinador', nivel: 'prata', regra: metrica('nivel_treinador', 100) },
  { id: 'treinador_300', nome: 'Treinador Nível 300', descricao: 'Chegue ao nível 300 de treinador.', categoria: 'treinador', nivel: 'ouro', regra: metrica('nivel_treinador', 300) },
  { id: 'treinador_1000', nome: 'Treinador Nível 1000', descricao: 'Chegue ao nível 1000 de treinador.', categoria: 'treinador', nivel: 'impossivel', regra: metrica('nivel_treinador', 1000) },
  { id: 'primeiro_milhao', nome: 'Primeiro Milhão', descricao: 'Ganhe 1.000.000 de ouro caçando.', categoria: 'treinador', nivel: 'prata', regra: { t: 'contador', chave: 'ouro_caca', alvo: 1_000_000 } },
  { id: 'cem_milhoes', nome: 'Cem Milhões', descricao: 'Ganhe 100.000.000 de ouro caçando.', categoria: 'treinador', nivel: 'ouro', regra: { t: 'contador', chave: 'ouro_caca', alvo: 100_000_000 } },
  { id: 'bilionario', nome: 'Bilionário', descricao: 'Ganhe 1.000.000.000 de ouro caçando.', categoria: 'treinador', nivel: 'impossivel', regra: { t: 'contador', chave: 'ouro_caca', alvo: 1_000_000_000 } },
  { id: 'diario_em_dia', nome: 'Diário em Dia', descricao: 'Colete o login do Diário em 30 dias.', categoria: 'treinador', nivel: 'prata', regra: metrica('diario_logins', 30) },
  { id: 'fiel', nome: 'Fiel', descricao: 'Jogue em 365 dias diferentes.', categoria: 'treinador', nivel: 'impossivel', regra: metrica('dias_jogados', 365) },
  { id: 'leiloeiro', nome: 'Leiloeiro', descricao: 'Venda 50 POKEs no Mercado.', categoria: 'treinador', nivel: 'prata', regra: metrica('vendas_mercado', 50) },

  // --- Social e PvP -------------------------------------------------------------
  { id: 'amigos_para_sempre', nome: 'Amigos para Sempre', descricao: 'Tenha 10 amigos.', categoria: 'social', nivel: 'bronze', regra: metrica('amigos', 10) },
  { id: 'troca_de_butterfree', nome: 'Troca de Butterfree', descricao: 'Faça sua primeira troca.', categoria: 'social', nivel: 'bronze', regra: metrica('trocas', 1), ref: 'EP015' },
  { id: 'primeira_vitoria_pvp', nome: 'Primeira Vitória', descricao: 'Vença um duelo PvP.', categoria: 'social', nivel: 'bronze', regra: metrica('pvp_vitorias', 1) },
  { id: 'cem_vitorias_pvp', nome: 'Cem Vitórias', descricao: 'Vença 100 duelos PvP.', categoria: 'social', nivel: 'ouro', regra: metrica('pvp_vitorias', 100) },
  { id: 'divisao_ouro', nome: 'Divisão Ouro', descricao: 'Chegue à divisão Ouro do PvP ranqueado.', categoria: 'social', nivel: 'ouro', regra: metrica('pvp_divisao', DIVISAO.ouro_1) },
  { id: 'mestre_do_pvp', nome: 'Mestre do PvP', descricao: 'Chegue à divisão Mestre do PvP ranqueado.', categoria: 'social', nivel: 'ouro', regra: metrica('pvp_divisao', DIVISAO.mestre) },
  { id: 'decolando_de_novo', nome: 'Equipe Rocket Decolando de Novo', descricao: 'Perca 100 duelos PvP.', categoria: 'social', nivel: 'prata', regra: metrica('pvp_derrotas', 100), secreta: true, ref: 'Equipe Rocket' },

  // --- Universo Pokémon -----------------------------------------------------------
  { id: 'time_do_red', nome: 'O Time do Red', descricao: 'Tenha na equipe Pikachu, Venusaur, Charizard, Blastoise, Snorlax e Lapras.', categoria: 'universo', nivel: 'ouro', regra: conjunto(['pikachu', 'venusaur', 'charizard', 'blastoise', 'snorlax', 'lapras'], true), ref: 'Gold/Silver' },
  { id: 'time_do_blue', nome: 'O Rival Blue', descricao: 'Tenha na equipe Pidgeot, Alakazam, Rhydon, Arcanine, Exeggutor e Gyarados.', categoria: 'universo', nivel: 'ouro', regra: conjunto(['pidgeot', 'alakazam', 'rhydon', 'arcanine', 'exeggutor', 'gyarados'], true), ref: 'Red/Blue' },
  { id: 'silph_co', nome: 'Silph Co.', descricao: 'Tenha um Lapras e um Porygon.', categoria: 'universo', nivel: 'prata', regra: conjunto(['lapras', 'porygon']), ref: 'Red/Blue' },
  { id: 'base_secreta', nome: 'Base Secreta', descricao: 'Tenha uma equipe de 6 POKEs de Hoenn.', categoria: 'universo', nivel: 'prata', regra: { t: 'time', f: { especies: '@hoenn' }, qtd: 6 }, ref: 'Ruby/Sapphire' },
  { id: 'pedras_do_steven', nome: 'Pedras do Steven', descricao: 'Tenha um Metagross nível 100.', categoria: 'universo', nivel: 'ouro', regra: ter({ especies: ['metagross'], nivel_min: 100 }), ref: 'Ruby/Sapphire' },
  { id: 'ralts_do_wally', nome: 'Ralts do Wally', descricao: 'Evolua um Ralts até Gardevoir.', categoria: 'universo', nivel: 'prata', regra: evoluir('gardevoir'), ref: 'Ruby/Sapphire' },
  { id: 'castform_do_instituto', nome: 'Castform do Instituto', descricao: 'Tenha um Castform.', categoria: 'universo', nivel: 'bronze', regra: ter({ especies: ['castform'] }), ref: 'Ruby/Sapphire' },
  { id: 'smeargle_pintor', nome: 'Smeargle Pintor', descricao: 'Tenha um Smeargle nível 50 ou mais.', categoria: 'universo', nivel: 'prata', regra: ter({ especies: ['smeargle'], nivel_min: 50 }), ref: 'Gold/Silver' },
  { id: 'concurso_de_insetos', nome: 'Concurso de Insetos', descricao: 'Tenha um Scyther ou Pinsir de raridade Raro ou acima.', categoria: 'universo', nivel: 'prata', regra: ter({ especies: ['scyther', 'pinsir'], raridade_min: 'raro' }), ref: 'Gold/Silver' },
  { id: 'pikachu_na_cabeca', nome: 'Pikachu na Cabeça', descricao: 'Cace por 100 horas com um Pikachu como POKE ativo.', categoria: 'universo', nivel: 'ouro', regra: { t: 'contador', chave: 'ativo_seg:pikachu', alvo: 100 * UMA_HORA }, ref: 'anime' },

  // --- Vitrine "Lenda Viva" (impossíveis de equipe) ----------------------------
  { id: 'time_brilhante', nome: 'Time Brilhante', descricao: 'Tenha 6 shiny nível 100 na equipe.', categoria: 'genetica', nivel: 'impossivel', regra: { t: 'time', f: { shiny: true, nivel_min: 100 }, qtd: 6 } },
  { id: 'lenda_mitica', nome: 'Lenda Mítica', descricao: 'Tenha 6 POKEs Mythic na equipe.', categoria: 'genetica', nivel: 'impossivel', regra: { t: 'time', f: { raridade: 'mythic' }, qtd: 6 } },
  { id: 'pokedex_brilhante', nome: 'Pokédex Brilhante', descricao: 'Tenha um shiny de cada espécie do jogo (menos lendárias).', categoria: 'genetica', nivel: 'impossivel', regra: { t: 'colecao', de: 'possuidas', especies: '@nacional', f: { shiny: true }, alvo: 'todas' } },

  // --- Platina -------------------------------------------------------------------
  { id: 'mestre_pokemon', nome: 'Mestre Pokémon', descricao: 'Desbloqueie todas as conquistas Bronze, Prata e Ouro, inclusive as secretas.', categoria: 'treinador', nivel: 'platina', regra: { t: 'platina' } },
]
