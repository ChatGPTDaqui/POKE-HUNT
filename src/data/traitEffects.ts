// A MECANICA de cada habilidade passiva, na parte que da pra escrever como
// funcao PURA: multiplicadores, listas de tipo, limiares.
//
// POR QUE UM ARQUIVO SO PRA ISSO, separado de `traits.ts` (que e a ATRIBUICAO)
// e de `combatSystem.ts` (que e o motor): as 133 habilidades tocam sete pontos
// diferentes do combate — dano, precisao, velocidade, contato, entrada, turno e
// mudanca de estagio. Espalhar 60 `if (trait === ...)` por esses sete pontos
// tornaria impossivel responder "o que a Technician faz aqui?" sem ler o
// arquivo inteiro. Aqui cada habilidade e uma entrada de tabela ou uma linha de
// funcao, e o motor so consulta.
//
// O que NAO cabe aqui e fica no motor: efeito que precisa MUTAR estado
// (Intimidate baixando estagio, Moxie subindo, Shed Skin curando status). Esses
// vivem nos hooks de `combatSystem.ts`, marcados com o nome da habilidade.
//
// A lista do que ficou de fora, com o motivo de cada uma, esta em
// `docs/14-habilidades.md` — e `traitInfo.ts` marca o status de cada uma pro
// jogador ver na Wiki.
import type { ElementType } from './generated/types'
import { ABILITIES } from './abilities'
import type { Ability } from './abilities'

// PH-140: isto era uma COPIA do union ('chuva' | 'sol' | 'granizo' | 'areia'),
// com um comentario afirmando que "casa estruturalmente com ClimaTipo". Parou
// de casar no minuto em que neve e nevoa entraram, e so houve aviso porque o
// valor atravessa a fronteira em `multiplicadorDeVelocidadePorTrait`. Copia
// conferida por acaso nao e copia segura.
//
// O ciclo que a copia existia pra evitar nao acontece com `import type`: ele e
// APAGADO na compilacao e nao vira import nenhum em runtime. `engine/types`
// importa `data/abilities` de verdade; este arquivo importa `engine/types` so
// no plano dos tipos.
import type { ClimaTipo as Clima } from '@/engine/types'

// ---------------------------------------------------------------------------
// VELOCIDADE
// ---------------------------------------------------------------------------
/** Dobra a Velocidade no clima correspondente (Gen VII: 2x, nao 1.5x). */
const VELOCIDADE_DOBRADA_NO_CLIMA: Partial<Record<string, Clima>> = {
  chlorophyll: 'sol',
  swift_swim: 'chuva',
  sand_rush: 'areia',
}

export function multiplicadorDeVelocidadePorTrait(trait: string | null, clima: Clima | null): number {
  if (!trait || !clima) return 1
  return VELOCIDADE_DOBRADA_NO_CLIMA[trait] === clima ? 2 : 1
}

// ---------------------------------------------------------------------------
// CLIMA: quem sofre, quem cura, quem ignora
// ---------------------------------------------------------------------------
/**
 * Nao toma dano de tempestade de areia / granizo.
 *
 * Sand Force e Sand Rush entram porque a descricao delas diz isso
 * explicitamente ("Protects against sandstorm damage"), nao por simetria.
 * Magic Guard entra porque dano de clima e dano INDIRETO, que e exatamente o
 * que ela anula.
 */
export const TRAIT_IMUNE_A_DANO_DE_CLIMA = new Set([
  'sand_veil', 'sand_rush', 'sand_force', 'snow_cloak', 'ice_body',
  'overcoat', 'magic_guard',
])

/**
 * Fracao do HP MAXIMO curada por turno no clima certo.
 *
 * LISTA de climas, e nao um so (PH-140): Ice Body cura tanto no GRANIZO quanto
 * na NEVE, e nos jogos e a mesma habilidade — a Gen 9 trocou o clima de gelo e
 * levou junto tudo que dependia dele. Um campo unico obrigaria a escolher um
 * dos dois e deixaria o outro em silencio.
 */
export const CURA_POR_CLIMA: Partial<Record<string, { climas: Clima[]; fracao: number }>> = {
  rain_dish: { climas: ['chuva'], fracao: 1 / 16 },
  ice_body: { climas: ['granizo', 'neve'], fracao: 1 / 16 },
  dry_skin: { climas: ['chuva'], fracao: 1 / 8 },
}

/** Fracao do HP MAXIMO PERDIDA por turno no clima certo. */
export const DANO_POR_CLIMA: Partial<Record<string, { climas: Clima[]; fracao: number }>> = {
  dry_skin: { climas: ['sol'], fracao: 1 / 8 },
  solar_power: { climas: ['sol'], fracao: 1 / 8 },
}

/**
 * Evasao 1.25x no clima certo (o que reduz a precisao de quem ataca).
 *
 * Snow Cloak vale nos DOIS climas de gelo, pelo mesmo motivo do Ice Body.
 */
export const EVASAO_POR_CLIMA: Partial<Record<string, Clima[]>> = {
  sand_veil: ['areia'],
  snow_cloak: ['granizo', 'neve'],
}

/** Cloud Nine / Air Lock: o clima continua no campo, mas nao surte efeito. */
export const TRAIT_ANULA_CLIMA = new Set(['cloud_nine', 'air_lock'])

// ---------------------------------------------------------------------------
// PODER DO GOLPE (multiplica o power, antes de STAB e efetividade)
// ---------------------------------------------------------------------------
// GOLPE DE SOCO — Iron Fist. O catalogo nao tem a flag "punch" da PokeAPI, e
// derivar do nome (terminado em _punch) deixaria Sucker Punch de fora: nao e
// soco de verdade, e o nome engana nos dois sentidos. Lista explicita.
const GOLPES_DE_SOCO = new Set([
  'comet_punch', 'mega_punch', 'fire_punch', 'ice_punch', 'thunder_punch',
  'dizzy_punch', 'mach_punch', 'dynamic_punch', 'focus_punch', 'bullet_punch',
  'shadow_punch', 'hammer_arm', 'sky_uppercut',
])
// Fora das duas listas de proposito, e o teste `golpesCitadosQueNaoExistem`
// tranca isso: sao golpes que nenhuma especie deste elenco aprende, entao nao
// estao no catalogo gerado. Citar chave inexistente aqui e a falha silenciosa
// classica deste projeto — a lista continua "certa" e nunca casa com nada.
// Socos: drain_punch, meteor_mash, power_up_punch.
// Sons: noble_roar, parting_shot, boomburst, confide.

// GOLPE DE SOM — Soundproof. Mesma razao da lista de socos: o catalogo nao tem
// a flag "sound".
export const GOLPES_DE_SOM = new Set([
  'growl', 'roar', 'sing', 'supersonic', 'screech', 'snore', 'perish_song',
  'heal_bell', 'uproar', 'hyper_voice', 'metal_sound', 'grass_whistle',
  'howl', 'bug_buzz', 'round', 'echoed_voice', 'disarming_voice',
])

/**
 * Golpe com efeito SECUNDARIO (status, mudanca de stat ou flinch pendurados num
 * golpe que causa dano). Sheer Force, Shield Dust e Serene Grace giram todas em
 * volta desta definicao.
 *
 * Golpe de status puro NAO conta: nele o efeito e o principal, nao o
 * secundario — Sheer Force nao fortalece Thunder Wave, e Shield Dust nao
 * protege dela.
 */
export function temEfeitoSecundario(ability: Ability): boolean {
  if (ability.power <= 0) return false
  return Boolean(
    (ability.status && (ability.statusChance ?? 0) > 0)
    || (ability.statChanges?.length && (ability.statChance ?? 0) > 0)
    || (ability.flinchChance ?? 0) > 0
  )
}

const SHEER_FORCE_BONUS = 1.3
const TECHNICIAN_TETO_DE_PODER = 60
const TIPOS_DO_SAND_FORCE: ElementType[] = ['ROCK', 'GROUND', 'STEEL']

/**
 * Multiplicador sobre o PODER do golpe, vindo da habilidade de quem ATACA.
 * Empilham entre si — nenhuma especie tem duas ao mesmo tempo hoje, mas a
 * conta nao depende disso.
 */
export function multiplicadorDePoderPorTrait(trait: string | null, ability: Ability, clima: Clima | null): number {
  if (!trait) return 1
  let m = 1
  // Technician olha o poder do CATALOGO, nao o ja multiplicado: nos jogos o
  // corte de 60 e sobre a base power do golpe.
  if (trait === 'technician' && ability.power > 0 && ability.power <= TECHNICIAN_TETO_DE_PODER) m *= 1.5
  if (trait === 'iron_fist' && GOLPES_DE_SOCO.has(ability.id)) m *= 1.2
  // Reckless: golpe de RECUO (drainPercent negativo — a mesma fonte que
  // resolveHit usa pra aplicar o recuo). Dreno positivo nao conta.
  if (trait === 'reckless' && (ability.drainPercent ?? 0) < 0) m *= 1.2
  if (trait === 'sheer_force' && temEfeitoSecundario(ability)) m *= SHEER_FORCE_BONUS
  if (trait === 'sand_force' && clima === 'areia' && TIPOS_DO_SAND_FORCE.includes(ability.type)) m *= 1.3
  return m
}

/** STAB: Adaptability sobe de 1.5x para 2x. */
export function stabPorTrait(trait: string | null, stabPadrao: number): number {
  return trait === 'adaptability' ? 2 : stabPadrao
}

// ---------------------------------------------------------------------------
// DANO RECEBIDO (habilidade de quem DEFENDE)
// ---------------------------------------------------------------------------
const TIPOS_DO_THICK_FAT: ElementType[] = ['FIRE', 'ICE']

/**
 * Multiplicador sobre o dano recebido, vindo da habilidade do DEFENSOR.
 * `efetividade` e o multiplicador de tipo ja calculado — Filter/Solid Rock
 * dependem dele.
 */
export function multiplicadorDeDanoRecebidoPorTrait(trait: string | null, ability: Ability, efetividade: number): number {
  if (!trait) return 1
  let m = 1
  if (trait === 'thick_fat' && TIPOS_DO_THICK_FAT.includes(ability.type)) m *= 0.5
  // Dry Skin toma 25% A MAIS de FIRE. O outro lado dela (absorver WATER) e
  // imunidade, e mora em IMUNIDADE_POR_TRAIT no motor.
  if (trait === 'dry_skin' && ability.type === 'FIRE') m *= 1.25
  if ((trait === 'filter' || trait === 'solid_rock') && efetividade > 1) m *= 0.75
  // WONDER GUARD (PH-332): so golpe SUPER EFETIVO machuca. Vale por multiplicador
  // 0, e nao por imunidade em `IMUNIDADE_POR_TRAIT`, porque a imunidade lá e por
  // TIPO — e esta habilidade nao olha o tipo, olha a efetividade resultante.
  //
  // `efetividade > 0` no teste: golpe que o tipo do defensor JA anula (0x) nao
  // precisa de Wonder Guard pra nada, e escrever `efetividade < 2` sozinho
  // devolveria 0 tambem nesse caso — mesma resposta por outro caminho, mas com o
  // motivo errado registrado em qualquer log futuro.
  //
  // Shedinja e a unica dona no elenco, e ela e a razao de a habilidade ser
  // obrigatoria e nao enfeite: com 1 de HP maximo, sem Wonder Guard ela cai pra
  // qualquer golpe e a especie inteira e piada. `efetividade` aqui e a do golpe
  // contra a tipagem dela (BUG/GHOST), que tem 5 tipos super efetivos.
  if (trait === 'wonder_guard' && efetividade > 0 && efetividade < 2) m = 0
  return m
}

/** Tinted Lens: golpe pouco efetivo do PORTADOR causa o dobro. Habilidade de quem ATACA. */
export function multiplicadorDeDanoCausadoPorTrait(trait: string | null, efetividade: number): number {
  if (trait === 'tinted_lens' && efetividade > 0 && efetividade < 1) return 2
  return 1
}

// ---------------------------------------------------------------------------
// CRITICO
// ---------------------------------------------------------------------------
/** Nao pode receber critico. */
export const TRAIT_SEM_CRITICO_RECEBIDO = new Set(['shell_armor', 'battle_armor'])

/** Estagios de critico somados pela habilidade de quem ataca. */
export function estagiosDeCriticoPorTrait(trait: string | null): number {
  return trait === 'super_luck' ? 1 : 0
}

/**
 * Sniper. Nos jogos o critico passa de 2x para 3x — 1.5x a mais. Este motor usa
 * critico de 1.5x (CRIT_MULTIPLIER, formula da planilha), entao o fiel e
 * multiplicar POR 1.5 de novo (1.5 -> 2.25), preservando a PROPORCAO e nao o
 * numero absoluto de outra geracao.
 */
export const SNIPER_MULTIPLICADOR = 1.5

// ---------------------------------------------------------------------------
// PRECISAO
// ---------------------------------------------------------------------------
/** Multiplicador de precisao dos golpes do PORTADOR. */
export function multiplicadorDePrecisaoPorTrait(trait: string | null, isPhysical: boolean): number {
  if (trait === 'compound_eyes') return 1.3
  if (trait === 'hustle' && isPhysical) return 0.8
  return 1
}

/** No Guard: enquanto UM DOS DOIS lados a tiver, todo golpe entre eles acerta. */
export const TRAIT_NO_GUARD = 'no_guard'
/** Keen Eye e Unaware ignoram a Evasao do alvo (motivos diferentes, mesmo efeito aqui). */
export const TRAIT_IGNORA_EVASAO = new Set(['keen_eye', 'unaware'])
/** Wonder Skin: golpe SEM DANO contra o portador cai para 50% de precisao. */
export const WONDER_SKIN_PRECISAO = 50

// ---------------------------------------------------------------------------
// ESTAGIOS DE ATRIBUTO
// ---------------------------------------------------------------------------
/**
 * Habilidades que barram QUEDA de estagio causada pelo oponente.
 * `null` no valor = protege TODOS os atributos (Clear Body e afins);
 * uma chave = protege so aquele.
 */
export const PROTECAO_DE_ESTAGIO: Partial<Record<string, string | null>> = {
  clear_body: null,
  white_smoke: null,
  full_metal_body: null,
  hyper_cutter: 'atkFis',
  big_pecks: 'def',
  keen_eye: 'accuracy',
}

/** Contrary: toda mudanca de estagio no portador troca de sinal. */
export const TRAIT_CONTRARY = 'contrary'

/** Simple: toda mudanca de estagio no portador conta em dobro (PH-332). */
export const TRAIT_SIMPLE = 'simple'

/** Reage a ter um atributo REBAIXADO pelo oponente: sobe outro. */
export const REACAO_A_QUEDA_DE_ESTAGIO: Partial<Record<string, { stat: 'atkFis' | 'atkEsp'; estagios: number }>> = {
  defiant: { stat: 'atkFis', estagios: 2 },
  competitive: { stat: 'atkEsp', estagios: 2 },
}

/**
 * Habilidades cujo efeito e "sobe um estagio quando levo um hit". A tabela diz
 * O QUE sobe; o gatilho fica no motor (resolveHit).
 */
export const REACAO_A_HIT: Partial<Record<string, {
  tipos?: ElementType[]
  stat: 'atkFis' | 'atkEsp' | 'speed' | 'def'
  estagios: number
  /** So dispara em golpe FISICO (a aproximacao de "contato" deste motor). */
  soFisico?: boolean
}>> = {
  justified: { tipos: ['DARK'], stat: 'atkFis', estagios: 1 },
  rattled: { tipos: ['DARK', 'GHOST', 'BUG'], stat: 'speed', estagios: 1 },
  // Weak Armor sobe Velocidade E desce Defesa. A queda mora no motor, junto
  // com o gatilho, porque e mudanca de sinal contrario na mesma reacao.
  weak_armor: { stat: 'speed', estagios: 2, soFisico: true },
  // "Ao maximo de seis estagios": 12 e um numero acima do teto de proposito —
  // quem clampa e ESTAGIO_MAXIMO, e escrever 6 aqui daria +6 SOBRE o estagio
  // atual em vez de LEVAR ao maximo.
  anger_point: { stat: 'atkFis', estagios: 12 },
}

// ---------------------------------------------------------------------------
// CONSULTAS DIRETAS (o gatilho fica no motor)
// ---------------------------------------------------------------------------
/** Ignora a habilidade DEFENSIVA do alvo (imunidade, reducao de dano, protecao de estagio). */
export const TRAIT_QUEBRA_HABILIDADE = new Set(['mold_breaker', 'teravolt', 'turboblaze'])
/** Neutralizing Gas: enquanto estiver em campo, NENHUMA habilidade vale — nem a dela. */
export const TRAIT_NEUTRALIZA_TUDO = 'neutralizing_gas'
/** Magic Guard: so sofre dano DIRETO de golpe (sem veneno/queimadura/recuo/clima/armadilha). */
export const TRAIT_SO_DANO_DIRETO = 'magic_guard'
/** Damp: ninguem em campo pode usar Explosao/Autodestruicao, e Aftermath nao dispara. */
export const TRAIT_DAMP = 'damp'
/** Infiltrator: ignora Reflect/Light Screen/Safeguard/Mist do alvo. */
export const TRAIT_INFILTRATOR = 'infiltrator'
/** Liquid Ooze: quem drena HP do portador toma o valor em vez de curar. */
export const TRAIT_LIQUID_OOZE = 'liquid_ooze'
/** Scrappy: NORMAL e FIGHTING do portador acertam GHOST. */
export const TRAIT_SCRAPPY = 'scrappy'
/** Rock Head: golpe de recuo nao machuca o portador. */
export const TRAIT_ROCK_HEAD = 'rock_head'
/** Early Bird: o sono passa em metade dos turnos. */
export const TRAIT_EARLY_BIRD = 'early_bird'
/** Oblivious: imune a Taunt (e a atracao, que este motor nao tem). */
export const TRAIT_OBLIVIOUS = 'oblivious'
/** Shield Dust: imune ao efeito SECUNDARIO de golpe recebido. */
export const TRAIT_SHIELD_DUST = 'shield_dust'
/** Serene Grace: dobra a chance de efeito secundario dos golpes do portador. */
export const TRAIT_SERENE_GRACE = 'serene_grace'
/** Unaware: ignora os estagios de atributo do oponente na conta de dano. */
export const TRAIT_UNAWARE = 'unaware'
/** Leaf Guard: imune a status enquanto houver sol forte. */
export const TRAIT_LEAF_GUARD = 'leaf_guard'
/** Magic Bounce: golpe SEM DANO recebido volta pra quem usou. */
export const TRAIT_MAGIC_BOUNCE = 'magic_bounce'

/** Soundproof: imune a golpe de som. */
export function ehGolpeDeSom(abilityId: string): boolean {
  return GOLPES_DE_SOM.has(abilityId)
}

/** Stench: 10% de flinch em todo golpe do portador. */
export const STENCH_FLINCH_CHANCE = 10
/** Poison Touch: 30% de envenenar o ALVO num golpe de contato do portador. */
export const POISON_TOUCH_CHANCE = 30
/** Cursed Body: 30% de trancar o golpe que acertou o portador. */
export const CURSED_BODY_CHANCE = 30
/** Shed Skin: 33% de curar status no fim de cada turno. */
export const SHED_SKIN_CHANCE = 33
/** Hydration: cura status TODO turno enquanto chove (nao e chance). */
export const TRAIT_HYDRATION = 'hydration'
/** Solar Power: +50% de Ataque Especial sob sol (o custo esta em DANO_POR_CLIMA). */
export const SOLAR_POWER_BONUS = 1.5
/** Speed Boost: +1 estagio de Velocidade por turno. Moody: +2 num, -1 noutro. */
export const TRAIT_SPEED_BOOST = 'speed_boost'
export const TRAIT_MOODY = 'moody'
/** Moxie: +1 de Ataque a cada POKE derrubado. */
export const TRAIT_MOXIE = 'moxie'
/** Steadfast: +1 de Velocidade toda vez que o portador toma flinch. */
export const TRAIT_STEADFAST = 'steadfast'
/** Tangled Feet: Evasao dobrada enquanto confuso. */
export const TRAIT_TANGLED_FEET = 'tangled_feet'
/** Trace: copia a habilidade do oponente ao entrar em campo. */
export const TRAIT_TRACE = 'trace'
/**
 * Habilidades que Trace NAO copia (regra dos jogos — sao as que so fazem
 * sentido no dono original, ou que criariam copia infinita).
 */
export const TRACE_NAO_COPIA = new Set([
  'trace', 'forecast', 'flower_gift', 'multitype', 'illusion', 'imposter',
  'stance_change', 'power_of_alchemy', 'receiver', 'disguise', 'rks_system',
  'schooling', 'comatose', 'shields_down', 'battle_bond', 'power_construct',
  'neutralizing_gas', 'zen_mode',
])

/** So pra teste: toda chave de golpe citada nas listas acima existe no catalogo. */
export function golpesCitadosQueNaoExistem(): string[] {
  return [...GOLPES_DE_SOCO, ...GOLPES_DE_SOM].filter((id) => !ABILITIES[id])
}
