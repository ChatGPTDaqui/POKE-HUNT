// Ability (move) definitions. `power`/`type`/`category`/`pp` all come from
// the spreadsheet sync (see abilities.generated.js) — `power` is the real
// Gen2 base-power number fed into DAMAGE_BASE (CombatSystem), `type` drives
// STAB/effectiveness, and `pp` drives `cooldown`: fewer PP means a slower-
// recharging move — cooldown = TURNO_SEGUNDOS * (PP_REFERENCE / pp). Each ability's
// cooldown is tracked individually (CombatSystem.js), further scaled by the
// user's Speed stat.
//
// Level-to-learn is per SPECIES now, not per move (the real data has the
// same move learned at different levels by different species) — see
// data/pokes.js's `species.abilities` list of {key, levelReq}.
//
// BASIC_ATTACK is the one hand-authored exception: a universal fallback
// (not in the spreadsheet) so a species whose only learned moves so far are
// all 0-power status moves (e.g. a low-level Hoppip only knows Splash/
// Synthesis/Tail Whip until level 10) is never completely unable to fight —
// the same role "Struggle" plays in the real games. Being the one move every
// single POKE always has, its cooldown is a fixed BASE_ATTACK_INTERVAL (see
// CombatSystem.js) — not PP-based, and not Speed-scaled like the rest.
//
// Status/0-power moves are excluded from `isDamagingAbility` specifically —
// that function means "usable as a DAMAGE move", not "does nothing here".
// Most status/support moves (stat drops, Taunt, Leech Seed, screens, ...) DO
// have real mechanics implemented (combatSystem.ts) and compete for the same
// active-ability slots as damaging moves; see moveDescriptions.ts#golpeTemEfeitoReal
// for which power-0 moves are genuinely inert here vs which ones do something.
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { ABILITIES_DATA } from './generated/abilities.generated'
import { TYPED_AOE_MOVES } from './typedAoeMoves'
import { WILD_AGGRO_RADIUS } from './huntTypes'
import type { AbilityCategory, ElementType, StatusCondition, StatChange } from './generated/types'
// PH-140: `import type` do proprio `ClimaTipo` em vez de repetir o union aqui.
// O ciclo que a repeticao evitava (engine/types importa este arquivo) nao
// existe pra import de tipo — ele e apagado na compilacao e nao vira import em
// runtime. A copia anterior ja tinha se desatualizado uma vez, em
// data/traitEffects.ts, quando neve e nevoa entraram.
import type { ClimaTipo as ClimaDoJogo } from '@/engine/types'

export type AbilityTarget = 'single' | 'aoe'

// Golpe de ARMADILHA DE CAMPO (Spikes/Toxic Spikes/Stealth Rock/Sticky Web):
// sem alvo real, so incrementa o placar do lado inimigo (ver
// combatSystem.ts#resolveHit e WorldState#enemyHazards em engine/types.ts).
export type HazardId = 'spikes' | 'toxic_spikes' | 'stealth_rock' | 'sticky_web'

export interface Ability {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory | 'dynamic'
  power: number
  pp: number
  target: AbilityTarget
  radius?: number
  cooldown?: number
  // Efeitos, vindos do catalogo do Ultra Sun (ver AbilityDataEntry). Ausente =
  // o golpe nao tem aquele efeito. `accuracy` e o unico sempre presente.
  accuracy: number
  status?: StatusCondition
  statusChance?: number
  statChanges?: StatChange[]
  statChance?: number
  statTarget?: 'self'
  flinchChance?: number
  critStages?: number
  drainPercent?: number
  healPercent?: number
  hazard?: HazardId
  // Golpe de MULTIPLOS ACERTOS: quantas vezes ele bate num uso. Ausente = uma
  // vez, como todo golpe normal. `power` desses golpes e POR ACERTO (ver
  // MULTI_HIT_OVERRIDES abaixo).
  minHits?: number
  maxHits?: number
}

const formulaEngine = createFormulaEngine(FORMULAS)
// O turno do jogo, em segundos. E a MESMA constante que o cooldown global do
// combate (combatSystem#MIN_ACTION_GAP) — antes eram dois numeros diferentes
// (TICK_MS=1.4s aqui, 2s la), e o menor nunca teve efeito: nenhum POKE conseguia
// agir antes de 2s, entao golpe com cooldown calculado em 1.4s so exibia um
// numero que o combate ignorava.
export const TURNO_SEGUNDOS = formulaEngine.eval('TURNO_SEGUNDOS')
const PP_REFERENCE = 20 // PP que recarrega em exatamente um turno

function cooldownFromPp(pp: number): number {
  return TURNO_SEGUNDOS * (PP_REFERENCE / Math.max(1, pp))
}

export const BASIC_ATTACK: Ability = {
  id: 'basic_attack',
  name: 'Ataque Basico',
  category: 'physical',
  type: 'NORMAL',
  target: 'single',
  power: 40,
  pp: 35,
  // Sempre acerta. E o Struggle deste jogo — o golpe que sobra quando nenhum
  // outro esta pronto; errar com ele deixaria o POKE sem NADA a fazer no turno.
  accuracy: 100,
}

// Golpe em area agora vem do DADO (`ability.target`, alvo real do golpe nos
// jogos — ver AbilityDataEntry), nao de uma lista de chaves escrita a mao.
//
// POR QUE A LISTA SAIU: ela tinha 6 chaves e ja estava furada. Na migracao
// para os dados de Pokemon Ultra Sun, `selfdestruct` virou `self_destruct` e a
// entrada parou de casar — Explosao voltaria a ser golpe de alvo unico sem
// nenhum erro em lugar nenhum. E, com o catalogo novo, sao 27 golpes de area
// com dano de verdade (Terremoto, Nevasca, Deslizamento de Rochas, Onda de
// Calor, Voz Encantadora, ...) contra os 6 que a lista conhecia.
//
// Os golpes de nivel 50 continuam sendo AOE por desenho: eles nao vem do
// catalogo, sao conteudo proprio deste jogo.
const AOE_ABILITY_KEYS = new Set(Object.keys(TYPED_AOE_MOVES))
// Pedido explicito do usuario: o raio de golpe AOE passa a ser o MESMO raio
// de "lure" (aggro) do POKE selvagem — o alcance em que o jogador ja teria
// puxado o inimigo pra perto de qualquer forma. Era 240 (splash medio/alto,
// dobrado numa leva de balanceamento anterior); agora deriva do mesmo numero
// que `createEnemyEntity` usa (huntTypes.ts#WILD_AGGRO_RADIUS), sem
// reescrever o 175 uma 4a vez.
export const AOE_RADIUS = WILD_AGGRO_RADIUS

// Merged in ahead of the spreadsheet moves — TYPED_AOE_MOVES's keys
// (aoe50_fire, aoe50_water, ...) never collide with real spreadsheet move
// keys, so a plain object spread is enough.
const ALL_ABILITIES_SOURCE = { ...ABILITIES_DATA, ...TYPED_AOE_MOVES }

// Patch por cima do catalogo gerado (Ultra Sun): esses 7 golpes vinham como
// stub vazio (so type/power/pp/accuracy, sem nenhum efeito real). Sand Attack/
// Smokescreen/Kinesis baixam Precisao do alvo; Double Team/Minimize sobem a
// propria Evasao. `accuracy` de cada um continua vindo do dado gerado
// (Kinesis e 80%, os outros 100%) — este patch so preenche statChanges.
//
// FORA DE ESCOPO, DESCARTADO: Minimize nao dobra o dano recebido de golpes
// contra alvo minimizado nos jogos reais — nao implementado aqui.
//
// Foresight/Miracle Eye NAO entram aqui: o efeito deles (ignorar uma
// imunidade de tipo + a evasao do alvo) e resolvido em combatSystem.ts via
// `entity.revelado`, fora do vocabulario de statChanges.
// CAUSA RAIZ, e por que esta lista tende a crescer (PH-70): o gerador do
// catalogo (`scripts/generate-catalog-usum.js`) nao emite mudanca de estagio de
// PRECISAO nem de EVASAO. Todo golpe dessas duas familias chega vazio e precisa
// entrar aqui a mao — nao e descuido de uma vez, e uma categoria inteira que o
// gerador nao expressa. Conserta-lo obriga a rodar `usum:baixar` de novo (rede) e
// rebate o catalogo inteiro; fica como divida registrada na issue.
//
// COMO CONFERIR se falta alguem: golpe com `_categoriaPokeapi` `damage-lower` ou
// `net-good-stats` e `mudancasDeStat: []` no scripts/usum/catalog.json.
const STAT_CHANGE_OVERRIDES: Partial<Record<string, Pick<Ability, 'statChanges' | 'statChance' | 'statTarget'>>> = {
  sand_attack: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  smokescreen: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  kinesis: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  double_team: { statChanges: [{ stat: 'evasion', estagios: 1 }], statChance: 100, statTarget: 'self' },
  minimize: { statChanges: [{ stat: 'evasion', estagios: 2 }], statChance: 100, statTarget: 'self' },
  // PH-70: os 7 abaixo tinham a MESMA causa dos 5 acima e ficaram de fora.
  // Chance de cada um conforme os jogos (Gen VII).
  mud_slap: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 100 },
  mud_bomb: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 30 },
  mirror_shot: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 30 },
  muddy_water: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 30 },
  octazooka: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 50 },
  leaf_tornado: { statChanges: [{ stat: 'accuracy', estagios: -1 }], statChance: 50 },
  // Sweet Scent derruba a EVASAO do alvo em 2 estagios (Gen VI+). Era o unico
  // dos 7 completamente inerte: poder 0 e nenhum efeito, ou seja slot morto em
  // 13 especies.
  sweet_scent: { statChanges: [{ stat: 'evasion', estagios: -2 }], statChance: 100 },
}

// Patch por cima do catalogo gerado: golpe de dano com STATUS que o gerador
// descartou (PH-70). `status` guarda um valor so, e o Tri Attack tem tres —
// QUAL dos tres ele tenta em cada hit e sorteado em
// combatSystem.ts#STATUS_SORTEADO. O valor abaixo e so o que faz o golpe entrar
// no pipeline de efeito secundario (Shield Dust, Serene Grace, chance); o
// sorteio substitui antes de aplicar.
const STATUS_OVERRIDES: Partial<Record<string, Pick<Ability, 'status' | 'statusChance'>>> = {
  tri_attack: { status: 'burn', statusChance: 20 },
}

// Patch por cima do catalogo gerado (Ultra Sun): estes 4 golpes vinham como
// stub vazio (so type/power/pp/accuracy, sem nenhum efeito real, categoria
// 'status', poder 0) — plantar armadilha nao existe na planilha sincronizada.
// Overlay hand-authored, mesmo espirito do resto deste arquivo: o dado gerado
// nunca e editado direto, so complementado por cima. O efeito de fato (dano/
// status no INIMIGO que nasce depois) nao acontece no HIT — acontece no
// SPAWN do proximo inimigo, ver simulation.ts#aplicarHazardsAoInimigo.
const HAZARD_OVERRIDES: Partial<Record<string, Pick<Ability, 'hazard'>>> = {
  spikes: { hazard: 'spikes' },
  toxic_spikes: { hazard: 'toxic_spikes' },
  stealth_rock: { hazard: 'stealth_rock' },
  sticky_web: { hazard: 'sticky_web' },
}

// Patch por cima do catalogo gerado (Ultra Sun): GOLPE DE MULTIPLOS ACERTOS.
// Nem `Ability` nem o catalogo tinham a contagem — `min_hits`/`max_hits` da
// PokeAPI nunca foram importados, e a categoria PokeAPI desses golpes e so
// "damage", entao o dado perdido nao aparecia em nenhuma checagem.
//
// O QUE ISSO CORRIGIA (PH-68): o `power` do catalogo e POR ACERTO (15 a 40) e o
// motor batia UMA vez, ou seja ~1/3 do dano pretendido. E nao era slot
// desperdicado: desde 2026-08-18 o POKE do jogador roda a FILA dos 4 slots e o
// Ataque Basico (poder 40) so entra se o jogador gastar um slot nele — Fury
// Attack (15) e Fury Swipes (18) gastavam o turno batendo menos da metade do
// golpe que todo POKE tem de graca.
//
// POR QUE OVERLAY E NAO CONSERTAR O GERADOR: corrigir `generate-catalog-usum.js`
// obriga a rodar `usum:baixar` de novo (rede) e rebate o catalogo inteiro. A
// divida fica registrada em PH-70, que tem o mesmo problema com accuracy/evasao.
//
// A DISTRIBUICAO nao mora aqui, e sim em combatSystem#quantidadeDeAcertos: 2 e 3
// acertos com 3/8 de chance cada, 4 e 5 com 1/8 (Gen V+). Golpe de 2 acertos
// FIXOS (Double Kick, Double Hit, Dual Chop, Twineedle) tem min === max e nao
// sorteia nada.
const MULTI_HIT_OVERRIDES: Partial<Record<string, Pick<Ability, 'minHits' | 'maxHits'>>> = {
  arm_thrust: { minHits: 2, maxHits: 5 },
  barrage: { minHits: 2, maxHits: 5 },
  bone_rush: { minHits: 2, maxHits: 5 },
  bullet_seed: { minHits: 2, maxHits: 5 },
  comet_punch: { minHits: 2, maxHits: 5 },
  double_slap: { minHits: 2, maxHits: 5 },
  fury_attack: { minHits: 2, maxHits: 5 },
  fury_swipes: { minHits: 2, maxHits: 5 },
  icicle_spear: { minHits: 2, maxHits: 5 },
  pin_missile: { minHits: 2, maxHits: 5 },
  rock_blast: { minHits: 2, maxHits: 5 },
  spike_cannon: { minHits: 2, maxHits: 5 },
  // Dois acertos fixos.
  double_hit: { minHits: 2, maxHits: 2 },
  double_kick: { minHits: 2, maxHits: 2 },
  dual_chop: { minHits: 2, maxHits: 2 },
  twineedle: { minHits: 2, maxHits: 2 },
}

export const ABILITIES: Record<string, Ability> = Object.fromEntries(
  Object.entries(ALL_ABILITIES_SOURCE).map(([key, ability]) => {
    const isAoe = AOE_ABILITY_KEYS.has(key) || ('target' in ability && ability.target === 'aoe')
    return [
      key,
      {
        ...ability,
        ...STAT_CHANGE_OVERRIDES[key],
        ...STATUS_OVERRIDES[key],
        ...HAZARD_OVERRIDES[key],
        ...MULTI_HIT_OVERRIDES[key],
        target: isAoe ? 'aoe' : 'single',
        radius: isAoe ? AOE_RADIUS : undefined,
        cooldown: cooldownFromPp(ability.pp),
      } satisfies Ability,
    ]
  })
)

export function getAbility(id: string): Ability | null {
  if (id === BASIC_ATTACK.id) return BASIC_ATTACK
  return ABILITIES[id] || null
}

// Golpes que causam dano de verdade mas tem `power` 0 no catalogo, porque o
// dano deles nao vem de poder base — vem de uma regra propria, implementada em
// combatSystem#specialDamageFor (poder dinamico ou dano fixo).
//
// BUG QUE ISTO CORRIGE: `isDamagingAbility` filtrava por `power > 0`, entao
// esses golpes eram descartados de `pickAbility` e das telas — codigo morto.
// Passou a doer de verdade com o limite de 4 golpes: antes um golpe inerte era
// 1 de ~15 na lista, agora seria 1 dos 4 slots.
//
// FORA DA LISTA, DE PROPOSITO: `horn_drill` e `fissure`. Os dois causam
// `defenderPoke.hp` — KO instantaneo.
//
// A JUSTIFICATIVA ANTERIOR AQUI ESTAVA ERRADA E FOI CORRIGIDA EM 2026-08-19.
// Ela dizia "ESTE JOGO NAO TEM PRECISAO (nem `Ability` nem o dado gerado tem o
// campo; todo golpe sempre acerta)". Falso hoje: `accuracy` e campo OBRIGATORIO
// de `Ability` (ver a interface acima) e existe rolagem de acerto de verdade,
// com estagios de precisao/evasao, em combatSystem.ts#chanceDeAcerto. Os dois
// vem do catalogo com accuracy 30.
//
// O QUE AINDA FALTA, e por isso eles continuam de fora: nos jogos reais o OHKO
// nao e "30% de chance de matar" — a chance ESCALA com a diferenca de nivel e
// NUNCA acerta alvo de nivel maior que o usuario. Sem essa segunda regra, 30%
// aqui e um dado de "mata o inimigo agora" que funciona igual contra um BOSS 40
// niveis acima. Voltam quando existir formula de precisao por diferenca de
// nivel — nao antes.
//
// `guillotine` e `sheer_cold` sao caso DIFERENTE e mais simples: nem
// implementacao tem (nao estao em FIXED_DAMAGE_ABILITIES), entao sao golpe
// inerte comum, nao decisao de balanceamento.
//
// EXPORTADO porque `moveDescriptions.ts#golpeTemEfeitoReal` precisa saber que
// estes 12 CAUSAM dano. Sem isso a ficha estampava "este golpe nao causa dano"
// em Magnitude, Seismic Toss, Counter e companhia — golpes que o proprio motor
// escolhe como golpe de dano. Trancado em moveDescriptions.test.ts.
export const DANO_SEM_PODER_BASE = new Set([
  'magnitude', 'reversal', 'flail', 'present', 'hidden_power',
  'seismic_toss', 'night_shade', 'dragon_rage', 'super_fang', 'psywave',
  'counter', 'mirror_coat',
  // PH-69: estes 9 tinham exatamente o mesmo bug que os 12 acima e ficaram de
  // fora da leva anterior. `power: 0` no catalogo, fora de
  // DYNAMIC_POWER_ABILITIES/FIXED_DAMAGE_ABILITIES, entao `isDamagingAbility`
  // era falso e `pickAbilityDaFila` os pulava em TODA rotacao — slot morto pra
  // sempre, com a descricao prometendo dano. Alcance: 67 pares especie-golpe.
  'gyro_ball', 'electro_ball', 'wring_out', 'punishment', 'sonic_boom',
  'endeavor', 'final_gambit',
  // Os dois de PESO. Ficaram inertes na primeira versao desta issue porque o
  // catalogo nao tinha peso; agora tem — `pesoHg` foi adicionado direto da
  // PokeAPI (scripts/fetch-usum-catalog.js), 226 especies cobertas.
  'low_kick', 'heavy_slam',
])

// GOLPES DE DANO QUE CONTINUAM INERTES DE PROPOSITO (PH-69), e por que cada um.
// Todos tem `power: 0` no catalogo e o dano real dependeria de uma mecanica que
// este motor nao tem. Ficam FORA de DANO_SEM_PODER_BASE — entrar la sem
// implementacao os transformaria em golpe de dano 0 escolhivel, que e pior que
// inerte: o aviso de golpe inerte da ficha (moveDescriptions#golpeTemEfeitoReal)
// sumiria e o jogador gastaria um dos 4 slots sem nada na tela avisando.
//
//   fling, natural_gift   dependem do ITEM que o POKE carrega; nao existe POKE
//                         segurando item neste jogo.
//   beat_up               um acerto por membro da equipe; a luta aqui e sempre
//                         1 contra N, sem equipe atacando junto.
//   spit_up               consome Stockpile, que nao esta implementado.
//   bide                  acumula dano por dois turnos e devolve; exigiria
//                         estado de "golpe em carga" atravessando turnos.
//   trump_card            o poder sai do PP RESTANTE, e este motor troca PP por
//                         cooldown (ver cooldownFromPp acima) — nao ha contador
//                         de PP pra ler.
//
// Mesmo espirito da nota de `quick_guard` no fim deste arquivo: golpe morto
// documentado e diferente de golpe esquecido.
export const DANO_POR_REGRA_NAO_IMPLEMENTADA = new Set([
  'fling', 'natural_gift', 'beat_up', 'spit_up',
  'bide', 'trump_card',
])

// Os dois OHKO que TEM implementacao e estao desligados por balanceamento (ver o
// bloco acima). Existem como Set proprio porque a tela precisa distinguir "golpe
// que nao faz nada aqui" de "golpe que faz e esta desligado" — o aviso generico
// de golpe inerte era factualmente errado nestes dois.
//
// MANTER EM SINCRONIA com combatSystem.ts#FIXED_DAMAGE_ABILITIES: cada id aqui
// tem entrada la. `guillotine`/`sheer_cold` NAO entram — esses nao tem
// implementacao nenhuma e sao golpe inerte comum.
export const OHKO_DESLIGADO = new Set(['horn_drill', 'fissure'])

// quick_guard (bloqueia golpe de PRIORIDADE) fica sem implementacao mecanica
// de proposito, ao contrario dos outros 5 golpes do elenco Screens (Reflect,
// Light Screen, Safeguard, Mist, Lucky Chant, Wide Guard — ver `Escudos` em
// engine/types.ts e ESCUDO_ABILITIES em engine/systems/combatSystem.ts). ESTE
// MOTOR NAO TEM CONCEITO DE PRIORIDADE DE GOLPE: todo golpe pousa pelo mesmo
// pipeline de hit (queueHit -> resolveHit), sem ordem de turno nem "golpe que
// age primeiro" pra quick_guard bloquear. Fica no catalogo/kit como golpe de
// status comum — golpe morto de verdade, nao um esquecimento.

// Golpe de status continua inerte ate a Leva B — toda lista voltada pro jogador
// e a IA de combate filtram por aqui.
export function isDamagingAbility(ability: Ability | null | undefined): boolean {
  if (!ability) return false
  return ability.power > 0 || DANO_SEM_PODER_BASE.has(ability.id)
}

// Golpes de clima (Rain Dance/Sunny Day/Hail/Sandstorm): vazios no catalogo
// gerado (so tem type/power/pp/target/accuracy -- nenhum campo de efeito).
// Mesmo padrao das outras camadas hand-authored deste arquivo/pasta
// (DANO_SEM_PODER_BASE acima, traits.ts, typedAoeMoves.ts): patch por cima do
// dado gerado, sem tocar abilities.generated.ts. O tipo do valor casa
// estruturalmente com `ClimaTipo` (engine/types.ts) sem importa-lo daqui --
// engine/types.ts ja importa `Ability` deste arquivo, e o import reverso
// fecharia um ciclo.
//
// PH-140: NEVOA nao esta aqui, e nao e esquecimento. Nao existe golpe que crie
// neblina em geracao nenhuma — ela e clima de ambiente puro. NEVE tambem nao:
// o golpe que a poe (Snowscape, Gen 9) nao existe neste catalogo, entao ela so
// vem do ambiente tambem.
export const CLIMA_DO_GOLPE: Record<string, ClimaDoJogo> = {
  rain_dance: 'chuva',
  sunny_day: 'sol',
  hail: 'granizo',
  sandstorm: 'areia',
}

// ---------------------------------------------------------------------------
// GOLPES QUE O CLIMA MUDA (PH-140)
// ---------------------------------------------------------------------------
// Todos os golpes citados aqui EXISTEM no catalogo gerado — conferido, e o
// teste `climaDosGolpes.test.ts` tranca isso. Citar chave inexistente e a falha
// silenciosa classica deste projeto: a regra continua "certa" e nunca casa.

/**
 * Acerto GARANTIDO no clima certo, ignorando precisao, evasao e neblina.
 *
 * E o unico caso em que o x0,6 da neblina nao se aplica: nos jogos, golpe que
 * pula a checagem de precisao pula TUDO que mexe nela.
 */
export const GOLPE_NUNCA_ERRA_NO_CLIMA: Record<string, ClimaDoJogo[]> = {
  thunder: ['chuva'],
  hurricane: ['chuva'],
  // Blizzard nos dois climas de gelo: a Gen 9 trocou granizo por neve e levou
  // a regra junto.
  blizzard: ['granizo', 'neve'],
}

/** Precisao FIXA no clima certo, substituindo a do catalogo. */
export const PRECISAO_DO_GOLPE_NO_CLIMA: Record<string, { climas: ClimaDoJogo[]; precisao: number }> = {
  // O outro lado do Thunder: sob sol forte ele despenca pra 50%.
  thunder: { climas: ['sol'], precisao: 50 },
  hurricane: { climas: ['sol'], precisao: 50 },
}

/**
 * Weather Ball: muda de TIPO e DOBRA de forca conforme o clima.
 *
 * A descricao na Wiki ja prometia isso; o motor nunca cumpriu. Na neblina o
 * golpe fica NORMAL e NAO dobra — e a unica entrada que existe pra dizer
 * "clima presente, mas sem bonus".
 */
export const WEATHER_BALL_POR_CLIMA: Record<ClimaDoJogo, { tipo: ElementType; dobra: boolean }> = {
  chuva: { tipo: 'WATER', dobra: true },
  sol: { tipo: 'FIRE', dobra: true },
  granizo: { tipo: 'ICE', dobra: true },
  neve: { tipo: 'ICE', dobra: true },
  areia: { tipo: 'ROCK', dobra: true },
  nevoa: { tipo: 'NORMAL', dobra: false },
}

/**
 * Cura que depende do clima (Moonlight, Synthesis).
 *
 * Nos jogos: 2/3 do HP maximo no sol, 1/2 com ceu limpo, 1/4 em qualquer outro
 * clima. O `healPercent` do catalogo (50) e o caso de ceu limpo, entao a regra
 * aqui e um MULTIPLICADOR sobre ele — assim o dado gerado continua sendo a
 * fonte do numero base.
 */
export const CURA_SENSIVEL_AO_CLIMA = new Set(['moonlight', 'synthesis'])
export const CURA_NO_SOL = 4 / 3 // 50% * 4/3 = 66,6% ~ 2/3
export const CURA_EM_CLIMA_RUIM = 0.5 // 50% * 0.5 = 25% = 1/4

/** Growth sobe 2 estagios sob sol forte, em vez de 1 (multiplicador). */
export const GROWTH_NO_SOL = 2

// `resolveAbilityCategory` mora em data/abilityCategory.ts — ela precisa de
// `computeStatsAtLevel` (data/pokes.ts), e pokes.ts importa ESTE arquivo, entao
// trazer a funcao pra ca fecharia um ciclo de import.
