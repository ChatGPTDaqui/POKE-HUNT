// Port de js/systems/CombatSystem.js. Opera sobre um draft imer do
// WorldState inteiro (mesma forma que o `world` original), mutando direto.
//
// Nota (ver engine/types.ts): `entity.target`/`effect.owner`/
// `pendingHit.attacker`/`pendingHit.target` eram referencia direta no
// original — aqui viram id + lookup via findEntityById, unica mudanca de
// forma permitida no port (risco de referencia obsoleta sob Immer).
import { deriveRng, nextFloat, type Rng } from '@/core/rng'
import { getAbility, BASIC_ATTACK, isDamagingAbility, TURNO_SEGUNDOS, CLIMA_DO_GOLPE, type Ability } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import {
  multiplicadorDeVelocidade, multiplicadorDeDanoFisico, multiplicadorDeStat,
  multiplicadorDeAccuracyOuEvasion, nomeDoStatus, ESTAGIO_MAXIMO, type StatusCondition, type StatDeEstagio,
} from '@/data/statusEffects'
import { corDoStatus } from '@/data/statusColors'
import type { StatChange, ElementType } from '@/data/generated/types'
import {
  tickStatus, tentarAgir, aplicarEfeitosDoGolpe, statusVaiPegar, aplicarMudancasDeStat,
  limparEstadoVolatil, aplicarStatus, aplicarEstagioUnico, curarStatus,
} from './statusSystem'
import { traitDoPoke, type TraitId } from '@/data/traits'
import {
  multiplicadorDeVelocidadePorTrait, multiplicadorDePoderPorTrait, stabPorTrait,
  multiplicadorDeDanoRecebidoPorTrait, multiplicadorDeDanoCausadoPorTrait,
  multiplicadorDePrecisaoPorTrait, estagiosDeCriticoPorTrait, temEfeitoSecundario,
  ehGolpeDeSom, TRAIT_SEM_CRITICO_RECEBIDO, SNIPER_MULTIPLICADOR, TRAIT_NO_GUARD,
  TRAIT_IGNORA_EVASAO, WONDER_SKIN_PRECISAO, TRAIT_QUEBRA_HABILIDADE,
  TRAIT_NEUTRALIZA_TUDO, TRAIT_DAMP, TRAIT_INFILTRATOR, TRAIT_LIQUID_OOZE,
  TRAIT_SCRAPPY, TRAIT_ROCK_HEAD, TRAIT_OBLIVIOUS, TRAIT_SHIELD_DUST,
  TRAIT_SERENE_GRACE, TRAIT_UNAWARE, TRAIT_ANULA_CLIMA, EVASAO_POR_CLIMA,
  REACAO_A_HIT, STENCH_FLINCH_CHANCE, POISON_TOUCH_CHANCE, CURSED_BODY_CHANCE,
  SOLAR_POWER_BONUS, TRAIT_MOXIE, TRAIT_STEADFAST, TRAIT_TANGLED_FEET,
  TRAIT_TRACE, TRACE_NAO_COPIA, TRAIT_MAGIC_BOUNCE,
} from '@/data/traitEffects'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { SPECIES } from '@/data/pokes'
import type { PokeInstance } from '@/data/pokes'
import { colorForType } from '@/data/typeColors'
import { direcaoDoGolpeDeStatus } from '@/data/statusVfx'

import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import { rollChance, randRange } from '@/core/random'
import { triggerAttackAnim, ATTACK_ANIM_DURATION } from './animationSystem'
import { createWorldEffect, effectDone, tickEffect } from '../effect'
import {
  isDead, getGroundOffset, tickCooldowns, isAbilityReady,
  startCooldown, canAct, startGlobalCooldown, takeDamage, heal, getMaxHp, releaseEffectLane, findEntityById,
} from '../entity'
import type { ClimaTipo, EnemyEntity, Escudos, PendingHit, PlayerEntity, WorldEntity, WorldState } from '../types'

// Dano/efeitos/tratamento-de-derrota acontecem esse tempo depois do golpe
// disparar, pra aparecerem em sincronia com a pose Shoot/Charge terminando
// em vez de no instante em que o golpe e usado.
const HIT_LAND_DELAY = ATTACK_ANIM_DURATION

// Tempo de tela de um efeito de golpe.
//
// Eram 0,35s (impacto) e 0,55s (area) — herdados de quando TODO golpe era o
// burst procedural de 3 particulas, que nao tinha o que mostrar por mais
// tempo. A arte nova por tipo (data/vfxTiras.ts) tem de 14 a 40 quadros; em
// 0,35s um lote de 30 quadros roda a 11ms cada, ou seja, ninguem ve a
// animacao — ve um borrao. Pedido explicito: pelo menos 1 segundo na tela.
//
// Nestes valores as tiras rodam entre 25 e 40 quadros por segundo, que e a
// faixa em que a animacao le como movimento e nao como sequencia de imagens.
// Continua bem abaixo do MIN_ACTION_GAP (2s), entao dois golpes seguidos do
// mesmo POKE nao empilham efeito.
const IMPACT_EFFECT_DURATION = 1.0
const AOE_EFFECT_DURATION = 1.2
// Golpe de status usa GIF real (statusVfx.ts), nao os quadros PNG do burst
// procedural: um GIF de servico Tibia costuma ter 8-20 quadros a
// ~100-150ms cada (0,8-3s por ciclo). Nos 0,35/0,55s dos outros dois, o
// efeito era destruido bem antes do GIF terminar de tocar uma volta —
// pedido explicito do usuario ("sprites com maior duracao... pra ficarem
// mais tempo na tela"). So o TEMPO DE VIDA do efeito muda; o GIF em si
// continua tocando/repetindo sozinho via `<img>` nativo (ver
// drawStatusEffect em render/sprites.ts).
const STATUS_VFX_DURATION = 1.1

const formulaEngine = createFormulaEngine(FORMULAS)
const STAB_MULTIPLIER = formulaEngine.eval('STAB_MULTIPLIER')
const CRIT_CHANCE = formulaEngine.eval('CRIT_CHANCE')
const CRIT_MULTIPLIER = formulaEngine.eval('CRIT_MULTIPLIER')

// Habilidades passivas condicionadas a fracao de HP (Gen VI+): abaixo de 1/3
// do HP maximo, o atacante ganha +50% de dano nos golpes do seu tipo
// correspondente. Mapa trait -> tipo porque cada trait so amplifica o
// proprio elemento (blaze/FIRE, torrent/WATER, overgrow/GRASS, swarm/BUG).
const LOW_HP_TRAIT_TYPE_MULTIPLIER: Record<string, string> = {
  blaze: 'FIRE',
  torrent: 'WATER',
  overgrow: 'GRASS',
  swarm: 'BUG',
}
const LOW_HP_TRAIT_HP_FRACTION = 1 / 3
const LOW_HP_TRAIT_MULTIPLIER = 1.5

// Multiscale: dano recebido pela metade enquanto o HP esta CHEIO (nao so
// alto) — perde o efeito no primeiro hit que tirar HP.
const MULTISCALE_MULTIPLIER = 0.5

// --- Imunidade de tipo por Trait (permanente) + por golpe (temporaria) ----
//
// Trait -> tipo do qual ela e imune. Cobre as 8 Traits pedidas: Levitate (sem
// efeito colateral), Volt Absorb/Water Absorb (curam 1/4 do HP maximo em vez
// de zerar so o dano), Flash Fire (liga `flashFireAtivo`, +50% nos PROPRIOS
// golpes FIRE dali em diante — ver o multiplicador logo abaixo de
// LOW_HP_TRAIT em computeDamage/estimateDamage), Sap Sipper/Lightning
// Rod/Storm Drain/Motor Drive (+1 estagio no defensor). Redirecionamento de
// golpe em dupla (o que Lightning Rod/Storm Drain tambem fazem nos jogos) NAO
// e modelado — este motor nao tem multiplos aliados em campo, so
// atacante-vs-alvo — por isso as duas so dao o +1 de estagio, sem redirect.
const IMUNIDADE_POR_TRAIT: Partial<Record<TraitId, ElementType>> = {
  levitate: 'GROUND',
  volt_absorb: 'ELECTRIC',
  water_absorb: 'WATER',
  // Dry Skin absorve AGUA exatamente como Water Absorb (1/4 do HP). Os OUTROS
  // tres pedacos dela — +25% de dano de FOGO, cura na chuva, custo no sol —
  // ficam em traitEffects.ts, cada um no ponto do pipeline que lhe cabe.
  dry_skin: 'WATER',
  flash_fire: 'FIRE',
  sap_sipper: 'GRASS',
  lightning_rod: 'ELECTRIC',
  storm_drain: 'WATER',
  motor_drive: 'ELECTRIC',
}
// Qual stat cada Trait de absorcao sobe (+1 estagio) no proprio defensor.
// Levitate e Flash Fire ficam de fora de proposito: a primeira nao tem efeito
// colateral nenhum, a segunda vira buff de ataque (`flashFireAtivo`), nao
// estagio.
const ESTAGIO_DE_ABSORCAO: Partial<Record<TraitId, 'atkFis' | 'atkEsp' | 'speed'>> = {
  sap_sipper: 'atkFis',
  lightning_rod: 'atkEsp',
  storm_drain: 'atkEsp',
  motor_drive: 'speed',
}
const HP_CURADO_POR_ABSORCAO = 1 / 4
// ~5 turnos de imunidade a GROUND (Magnet Rise), self-target.
const MAGNET_RISE_TURNOS = 5
// Fire absorvido por Flash Fire amplifica os PROPRIOS golpes FIRE do
// defensor dali em diante — mesmo formato de multiplicador condicional que
// LOW_HP_TRAIT_MULTIPLIER, so que gatilho e "ja absorveu 1 vez", nao HP baixo.
const FLASH_FIRE_MULTIPLIER = 1.5

export interface ResultadoImunidadeDeTipo {
  imune: boolean
  curou?: boolean
  buffouEstagio?: boolean
}

/**
 * Resolve as DUAS fontes de imunidade a um TIPO de golpe que a tabela de
 * tipos (`getEffectiveness`) nao sabe: imunidade TEMPORARIA concedida por um
 * golpe (Magnet Rise, self-target) e imunidade PERMANENTE de Trait (Levitate
 * e as 7 Traits de absorcao). Chamada de dentro de computeDamage E
 * estimateDamage — a IA usa a segunda pra ranquear golpes, e sem isto ela
 * escolheria Terremoto contra um Levitate achando que causa dano de verdade.
 *
 * `aplicarEfeitos=false` e o modo LEITURA usado por `estimateDamage`: ela
 * documentadamente nao pode mutar nada (nem avancar o rng principal nem
 * curar/buffar de verdade) — so devolve SE seria imune, pra ranquear. So
 * `computeDamage`, resolvendo o hit de verdade, cura o HP / sobe o estagio /
 * liga `flashFireAtivo`.
 */
function resolverImunidadeDeTipo(
  rng: Rng,
  tipoDoGolpe: ElementType,
  defensor: WorldEntity,
  aplicarEfeitos: boolean,
  /**
   * A habilidade do defensor JA FILTRADA por Mold Breaker / Neutralizing Gas
   * (ver traitsDoConfronto). `undefined` = ler do proprio POKE, que e o
   * comportamento de quem chama sem contexto de atacante.
   *
   * Sem este parametro, Mold Breaker atravessava tudo MENOS a imunidade de
   * tipo — que e justamente a parte mais visivel dela (Terremoto contra
   * Levitate). A imunidade e resolvida aqui dentro, antes de qualquer
   * multiplicador, entao filtrar so no `computeDamage` chegava tarde.
   */
  traitDoDefensor?: TraitId | null,
): ResultadoImunidadeDeTipo {
  // (a) Imunidade temporaria por golpe (Magnet Rise) — so o tipo marcado, so
  // enquanto o timer nao zerar (tickCooldowns em entity.ts derruba o campo).
  if (defensor.imuneAoTipoVolatil && defensor.imuneAoTipoVolatil.tipo === tipoDoGolpe) {
    return { imune: true }
  }

  // (b) Imunidade permanente de Trait.
  const trait = traitDoDefensor !== undefined ? traitDoDefensor : traitDoPoke(defensor.poke)
  if (!trait || IMUNIDADE_POR_TRAIT[trait] !== tipoDoGolpe) return { imune: false }

  if (trait === 'levitate') return { imune: true }

  if (trait === 'volt_absorb' || trait === 'water_absorb' || trait === 'dry_skin') {
    if (aplicarEfeitos) heal(defensor, Math.round(getMaxHp(defensor) * HP_CURADO_POR_ABSORCAO))
    return { imune: true, curou: true }
  }

  if (trait === 'flash_fire') {
    if (aplicarEfeitos) defensor.flashFireAtivo = true
    return { imune: true }
  }

  const stat = ESTAGIO_DE_ABSORCAO[trait]
  if (stat) {
    if (aplicarEfeitos) {
      // Reaproveita aplicarMudancasDeStat (clamp de -6/+6 incluso) em vez de
      // duplicar a matematica de estagio — so precisa de um `Ability` valido
      // pro formato, daí o spread de BASIC_ATTACK com os 3 campos que
      // importam sobrescritos.
      aplicarMudancasDeStat(rng, defensor, defensor, {
        ...BASIC_ATTACK,
        statChanges: [{ stat, estagios: 1 }],
        statChance: 100,
        statTarget: 'self',
      })
    }
    return { imune: true, buffouEstagio: true }
  }

  return { imune: true }
}

// Foresight/Miracle Eye/Odor Sleuth: golpes de status sem statChanges (nao
// mexem em estagio nenhum) — o efeito deles e todo em `entity.revelado`, ver
// BaseEntity#revelado. Cada chave diz qual imunidade NATURAL de tipo (nao a
// de Trait acima) aquele golpe remove do alvo pelo resto da luta.
const REVELA_IMUNIDADE: Partial<Record<string, 'ghost' | 'dark'>> = {
  foresight: 'ghost',
  miracle_eye: 'dark',
  // Golpe desta leva: mesmo efeito de Foresight (ignora Fantasma vs
  // Normal/Lutador) — ver moveDescriptions.ts#odor_sleuth.
  odor_sleuth: 'ghost',
}

/**
 * Multiplicador de efetividade de tipo, mas ignorando UMA imunidade NATURAL
 * (nao a de Trait) se o defensor foi "revelado" (Foresight/Miracle
 * Eye/Odor Sleuth). So entra quando o multiplicador cru JA DEU ZERO — nao
 * mexe em resistencia parcial (0.5x), so em imunidade total, exatamente como
 * os golpes reais funcionam.
 *
 * A outra metade do efeito real (ignorar a PROPRIA Evasao do defensor contra
 * este atacante) mora em `golpeErrou`, que ja consulta `defensor.revelado`
 * direto — nao repetido aqui.
 */
function efetividadeConsiderandoRevelado(
  multiplicadorCru: number,
  ability: Ability,
  defenderEntity: WorldEntity,
  defenderSpecies: { type: ElementType; type2: ElementType | null },
): number {
  if (multiplicadorCru !== 0 || !defenderEntity.revelado) return multiplicadorCru
  const ehFantasma = defenderSpecies.type === 'GHOST' || defenderSpecies.type2 === 'GHOST'
  const ehSombrio = defenderSpecies.type === 'DARK' || defenderSpecies.type2 === 'DARK'
  if (defenderEntity.revelado === 'ghost' && ehFantasma && (ability.type === 'NORMAL' || ability.type === 'FIGHTING')) return 1
  if (defenderEntity.revelado === 'dark' && ehSombrio && ability.type === 'PSYCHIC') return 1
  return multiplicadorCru
}

// Clima de combate (Gen3+, sem item): Chuva favorece WATER e enfraquece FIRE,
// Sol faz o oposto. Afeta os dois lados por igual -- computeDamage e o mesmo
// pipeline pro jogador e pro inimigo, entao nao ha lado "dono" do clima.
const CLIMA_MULTIPLICADOR_FAVORECIDO = 1.5
const CLIMA_MULTIPLICADOR_DESFAVORECIDO = 0.5

// --- Fase 12: Traits que multiplicam ATAQUE/DEFESA FISICOS -----------------
//
// Todas as quatro so mexem no fisico (Gen VII): Huge Power/Pure Power dobram
// a stat de Ataque Fisico do portador; Hustle da +50% nela sempre; Guts da
// +50% nela SO com status alterado ativo; Marvel Scale da +50% na Defesa
// fisica do portador, tambem so com status ativo. Multiplicam a stat CRUA,
// mesma entrada que os estagios de atributo — a ficha do POKE continua
// mostrando o numero real.
// Exportadas so pra teste unitario direto (Huge/Pure Power e Marvel Scale
// nao tem dono no roster Gen1/2 atual — ver traits.ts — entao nao da pra
// exercitar via especie real; testar a funcao pura evita depender disso).
export function multiplicadorDeAtaquePorTrait(trait: TraitId | null, isPhysical: boolean, temStatus: boolean): number {
  if (!isPhysical) return 1
  if (trait === 'huge_power' || trait === 'pure_power') return 2
  if (trait === 'hustle') return 1.5
  if (trait === 'guts' && temStatus) return 1.5
  return 1
}

export function multiplicadorDeDefesaPorTrait(trait: TraitId | null, isPhysical: boolean, temStatus: boolean): number {
  if (!isPhysical) return 1
  if (trait === 'marvel_scale' && temStatus) return 1.5
  return 1
}

// ---------------------------------------------------------------------------
// QUEM ESTA COM A HABILIDADE VALENDO AGORA
// ---------------------------------------------------------------------------
//
// Duas habilidades DESLIGAM outras habilidades, e as duas precisam ser
// consultadas ANTES de qualquer outra leitura de trait — senao viram letra
// morta em silencio (o efeito continua acontecendo e ninguem percebe que a
// habilidade que deveria cancela-lo nao foi consultada).
//
//   Neutralizing Gas  desliga TODAS as habilidades em campo, dos dois lados.
//                     A propria Gas continua valendo (e ela que segura o
//                     efeito), como nos jogos.
//   Mold Breaker      desliga a habilidade DEFENSIVA do alvo, e so pra quem
//                     esta atacando com ela.
//
// `traitsDoConfronto` e a porta unica dos dois. Todo lugar do motor que precisa
// das duas habilidades de um confronto passa por aqui; leitura de UM lado so
// (hook de entrada, tick de turno) usa `traitDoPoke` direto, porque nesses
// pontos nao ha atacante nem alvo pra Mold Breaker quebrar.
interface TraitsDoConfronto {
  atacante: TraitId | null
  defensor: TraitId | null
}

function traitsDoConfronto(attackerEntity: WorldEntity, defenderEntity: WorldEntity): TraitsDoConfronto {
  const atacante = traitDoPoke(attackerEntity.poke)
  const defensor = traitDoPoke(defenderEntity.poke)
  if (atacante === TRAIT_NEUTRALIZA_TUDO) return { atacante, defensor: null }
  if (defensor === TRAIT_NEUTRALIZA_TUDO) return { atacante: null, defensor }
  if (atacante && TRAIT_QUEBRA_HABILIDADE.has(atacante)) return { atacante, defensor: null }
  return { atacante, defensor }
}

/**
 * O clima que de fato SURTE EFEITO neste confronto.
 *
 * Cloud Nine / Air Lock nao apagam o clima do campo — apagam os efeitos dele.
 * Como a diferenca so aparece quando alguem tenta LER o clima, o lugar certo de
 * resolver isso e aqui, e nao em `world.clima`.
 */
function climaEfetivo(clima: ClimaTipo | null, traits: TraitsDoConfronto): ClimaTipo | null {
  if (!clima) return null
  if (traits.atacante && TRAIT_ANULA_CLIMA.has(traits.atacante)) return null
  if (traits.defensor && TRAIT_ANULA_CLIMA.has(traits.defensor)) return null
  return clima
}

// Soak (Fase 12): tipo forcado pelo golpe substitui o tipo da especie SO pro
// calculo de efetividade do dano recebido (ver types.ts#tipoForcado) — nao
// mexe em STAB nem em imunidade de status, que continuam olhando a especie
// real.
function tiposEfetivosParaEfetividade(entity: WorldEntity, species: { type: ElementType; type2: ElementType | null }): [ElementType, ElementType | null] {
  if (entity.tipoForcado) return [entity.tipoForcado, null]
  return [species.type, species.type2]
}

// Golpes reais de auto-KO Gen1/2 — bug relatado explicitamente pelo usuario:
// causavam dano no ALVO sem nenhum recoil no usuario, diferente dos jogos
// reais. Corrigido por spec explicita: usar qualquer um dos dois custa ao
// usuario 50% do seu PROPRIO hp atual (nao um desmaio completo como nos
// jogos reais — um debuff mais leve, independente da planilha), aplicado
// uma vez por uso, nao importa quantos inimigos o AOE realmente acerte (ver
// branch isAoeVisual de resolveHit abaixo, que ja dispara exatamente uma
// vez por uso).
const SELF_DESTRUCT_ABILITY_KEYS = new Set(['explosion', 'selfdestruct'])
const SELF_DESTRUCT_HP_LOSS_PERCENT = 0.5

// Escudos ("Screens"): golpe -> chave de `Escudos` que ele liga em quem usou.
// Todos os 6 SEMPRE afetam quem usou (`attacker` do hit), nunca `hit.target`
// — mesmo padrao de cura pura (`ability.healPercent`, ver resolveHit): o
// catalogo (ABILITIES em data/abilities.ts) forca `target: 'single'|'aoe'`
// pra todo golpe sem excecao, entao golpe self-target continua chegando aqui
// com `target: 'single'` e um `hit.targetId` que e o INIMIGO, nao quem usou.
//
// quick_guard (bloqueia golpe de prioridade) fica DE FORA de proposito: este
// motor nao tem conceito de prioridade de golpe (todo golpe "pousa" no mesmo
// pipeline de hit, sem ordem de turno), entao nao ha nada pra quick_guard
// bloquear. Fica no catalogo/kit como golpe de status comum, mas sem
// nenhum efeito mecanico — golpe morto de verdade, e nao um esquecimento.
const ESCUDO_ABILITIES: Record<string, keyof Escudos> = {
  reflect: 'reflect',
  light_screen: 'lightScreen',
  safeguard: 'safeguard',
  mist: 'mist',
  lucky_chant: 'luckyChant',
  wide_guard: 'wideGuard',
}
const ESCUDO_DURACAO_TURNOS = 5 // igual aos jogos reais (Gen2-VII, fora de Dobrado item/Light Clay)
const ESCUDO_DURACAO_SEGUNDOS = ESCUDO_DURACAO_TURNOS * TURNO_SEGUNDOS

// Golpes de disable/lock (imprison/embargo descartados por decisao anterior,
// nao entram). Duracao em SEGUNDOS, nao turnos -- mesma convencao de
// imunidadeDeStatus, decrementada por dt em statusSystem#tickStatus, com
// TURNO_SEGUNDOS so pra manter a leitura em "quantos turnos" o resto do
// balanceamento do jogo usa.
const TAUNT_DURATION = TURNO_SEGUNDOS * 3 // Taunt: 3 turnos sem golpe de status (Gen6+)
const DISABLE_DURATION = TURNO_SEGUNDOS * 4 // Disable: 4 turnos travando 1 golpe especifico
const ENCORE_DURATION = TURNO_SEGUNDOS * 3 // Encore: 3 turnos forcando repetir o ultimo golpe
// Torment nos jogos reais dura ate o POKE trocar de campo -- sem troca nesta
// hunt continua, 3 turnos e a aproximacao (mesma janela de Taunt/Encore).
const TORMENT_DURATION = TURNO_SEGUNDOS * 3
// Spite: "reduz 4 PP do ultimo golpe" mapeado pro cooldown deste motor (PP e
// cooldown sao o mesmo conceito aqui, ver TURNO_SEGUNDOS acima) -- 4 PP vira
// 4 turnos de cooldown extra.
const SPITE_COOLDOWN_BONUS = TURNO_SEGUNDOS * 4

// Golpes novos de tick volatil (leech_seed/curse/nightmare/ingrain/aqua_ring/
// wish) — nenhum vem com campo dedicado no catalogo (ver
// data/generated/abilities.generated.ts: todos sao so {type, category:
// 'status', power:0}), entao o efeito de cada um e por `ability.id`, mesmo
// padrao de SELF_DESTRUCT_ABILITY_KEYS acima.
//
// Curse (variante Ghost): diferente de SELF_DESTRUCT_HP_LOSS_PERCENT (que e
// sobre o HP ATUAL do atacante), este custo e sobre o HP MAXIMO — variante
// dedicada porque o helper de cima esta hardcoded pro HP atual.
const CURSE_SELF_MAX_HP_LOSS_PERCENT = 0.5
// Ingrain/Aqua Ring: mesmo campo `regenPercent` pros dois, mesma fracao.
const INGRAIN_AQUA_RING_REGEN_PERCENT = 1 / 16
// Wish: 50% do HP MAXIMO de quem lanca, virando cura atrasada 2 turnos.
const WISH_HEAL_PERCENT = 0.5

// Ambos editaveis pela planilha (ver CLAUDE.md "Balanceamento de economia")
// com fallback batendo o valor hardcoded antigo.
const SPEED_REFERENCE = formulaEngine.evalOrDefault('ATTACK_SPEED_REFERENCE', 100)
const BASE_ATTACK_INTERVAL = formulaEngine.evalOrDefault('BASIC_ATTACK_COOLDOWN', 2)
// O turno. Um numero so, em vez dos dois que existiam antes: o `TICK_MS` de
// 1400ms (que convertia PP em cooldown) e este cooldown global de 2s, que na
// pratica ja engolia o outro — 61% dos golpes de dano batiam no piso de 2s com
// Velocidade 100, entao o ritmo real do combate sempre foi 2s, e o 1.4 so
// mentia nos numeros de cooldown mostrados. Ver data/abilities.ts.
const MIN_ACTION_GAP = TURNO_SEGUNDOS
const MELEE_RANGE_PADDING = 10

// Quao perto `attacker` precisa estar de `defender` pra lutar — sempre
// toque corpo-a-corpo, fisico ou especial. Golpes especiais tinham 3x esse
// alcance antes (mecanica de "conjurar a distancia"), mas isso lia como o
// POKE atacando sem realmente se aproximar — agora todo atacante precisa
// chegar bem perto do alvo primeiro, seja qual for o golpe usado.
export function engageRangeFor(attacker: WorldEntity, defender: WorldEntity): number {
  return attacker.radius + defender.radius + MELEE_RANGE_PADDING
}

// Cooldown de BASIC_ATTACK e um flat 1.5s pra todo POKE, sem escala por
// Velocidade (e o golpe que todo POKE sempre tem); todo outro golpe mantem
// seu proprio cooldown individual derivado de PP, escalado por Velocidade.
/**
 * Recarga CHEIA deste golpe para ESTE POKE, ja escalada pela Velocidade.
 *
 * Existe pra tela ter um denominador: o HUD desenha a barra de recarga como
 * `1 - restante/total`, e sem o total ele so teria o numero absoluto (que nao
 * diz se 3s e quase pronto ou o comeco da conta). Envolve `scaledCooldown` em
 * vez de exporta-la crua porque a Velocidade que conta e a EFETIVA (status e
 * clima entram), e deixar isso pro chamador seria mais um lugar pra esquecer.
 */
export function cooldownTotalDoGolpe(entity: WorldEntity, ability: Ability, clima: ClimaTipo | null = null): number {
  return scaledCooldown(ability, velocidadeEfetiva(entity, clima))
}

function scaledCooldown(ability: Ability, speed: number): number {
  if (ability.id === BASIC_ATTACK.id) return BASE_ATTACK_INTERVAL
  return (ability.cooldown ?? 0) * (SPEED_REFERENCE / Math.max(1, speed))
}

// A Velocidade que conta pro cooldown, ja com o efeito de status. Paralisia
// corta pela metade na Gen VII (era 75% antes) — e aqui, onde Velocidade vira
// ritmo de acao, isso significa literalmente agir na metade da frequencia.
//
// Quick Feet (Fase 12): com QUALQUER status alterado ativo, da +50% de
// Velocidade E IGNORA o multiplicador normal do status (nos jogos reais isso
// existe justamente pra apagar o corte de paralisia — um POKE paralisado com
// Quick Feet fica mais rapido do que o normal, nao mais lento).
export function velocidadeEfetiva(entity: WorldEntity, clima: ClimaTipo | null = null): number {
  const trait = traitDoPoke(entity.poke)
  // Chlorophyll (sol), Swift Swim (chuva) e Sand Rush (areia) DOBRAM a
  // Velocidade. `clima` e opcional pra todo chamador antigo continuar valido —
  // sem ele o multiplicador e 1, que e exatamente o comportamento anterior.
  const porClima = multiplicadorDeVelocidadePorTrait(trait, clima)
  if (trait === 'quick_feet' && entity.poke.status) {
    return entity.poke.stats.speed * 1.5 * porClima * multiplicadorDeStat(entity.estagios, 'speed')
  }
  return entity.poke.stats.speed
    * multiplicadorDeVelocidade(entity.poke.status?.tipo ?? null)
    * porClima
    * multiplicadorDeStat(entity.estagios, 'speed')
}

// Dano que o POKE causa em si mesmo quando confuso: golpe fisico SEM TIPO de
// poder 40, sem critico e sem STAB (Bulbapedia). Passa pelo mesmo DAMAGE_BASE
// do resto do combate, usando o proprio Ataque contra a propria Defesa.
function danoDeConfusao(entity: WorldEntity, poder: number): number {
  if (poder <= 0) return 0
  const p = entity.poke
  return Math.max(1, Math.round(formulaEngine.eval('DAMAGE_BASE', {
    level: p.level, power: poder, atk: p.stats.atkFis, def: p.stats.def,
  })))
}

function averageIv(ivs: PokeInstance['ivs'] | undefined): number {
  const vals = ivs ? Object.values(ivs) : []
  if (!vals.length) return 0
  return vals.reduce((sum, v) => sum + v, 0) / vals.length
}

// Roll real de Magnitude Gen2: 7 magnitudes possiveis (4-10), cada uma com
// sua propria probabilidade e poder fixo.
const MAGNITUDE_TABLE = [
  { chance: 5, power: 10 }, { chance: 10, power: 30 }, { chance: 20, power: 50 },
  { chance: 30, power: 70 }, { chance: 20, power: 90 }, { chance: 10, power: 110 },
  { chance: 5, power: 150 },
]
function rollMagnitudePower(rng: Rng): number {
  let roll = nextFloat(rng) * 100
  for (const tier of MAGNITUDE_TABLE) {
    if (roll < tier.chance) return tier.power
    roll -= tier.chance
  }
  return MAGNITUDE_TABLE[MAGNITUDE_TABLE.length - 1].power
}

// Reversal/Flail: poder sobe conforme o hp restante do proprio usuario cai.
function hpRatioPower(attackerPoke: PokeInstance): number {
  const ratio = Math.max(0, attackerPoke.hp) / attackerPoke.stats.hp
  if (ratio <= 0.04) return 200
  if (ratio <= 0.09) return 150
  if (ratio <= 0.16) return 100
  if (ratio <= 0.32) return 80
  if (ratio <= 0.48) return 40
  return 20
}

// O 4o resultado real de Present (curar o alvo) nao tem equivalente neste
// motor (nao existe mecanica de curar o oponente) — suas chances sao
// dobradas proporcionalmente nos 3 tiers de dano em vez disso.
function rollPresentPower(rng: Rng): number {
  const roll = nextFloat(rng)
  if (roll < 0.4) return 40
  if (roll < 0.7) return 80
  return 120
}

// Este elenco usa IVs em escala 0-31 (convencao Gen3+), nao os DVs 0-15 que
// a formula real de tipo/poder de Hidden Power da Gen2 le — sem dado DV pra
// derivar um tipo "real", mantem o placeholder NORMAL da planilha e so
// deixa o poder dinamico (faixa 30-70, escalado por quao perto do maximo
// esta a media de IV do POKE), documentado como simplificacao deliberada,
// nao port fiel da formula Gen2.
function hiddenPowerPower(attackerPoke: PokeInstance): number {
  return 30 + Math.round((averageIv(attackerPoke.ivs) / 31) * 40)
}

// Psywave real Gen1/2: dano aleatorio entre ~0.5x-1.5x o nivel do usuario,
// ignorando ATK/DEF por completo.
function psywaveDamage(rng: Rng, attackerPoke: PokeInstance): number {
  return Math.max(1, Math.round(attackerPoke.level * randRange(rng, 0.5, 1.5)))
}

// Gyro Ball: quanto mais LENTO o usuario em relacao ao alvo, mais forte. Teto
// de 150 como nos jogos. Usa a Velocidade EFETIVA (estagio, status, clima) —
// senao Scary Face num alvo rapido nao mudaria nada num golpe que existe
// justamente pra isso.
function gyroBallPower(attackerEntity: WorldEntity, defenderEntity: WorldEntity): number {
  const minha = Math.max(1, velocidadeEfetiva(attackerEntity))
  const dela = Math.max(1, velocidadeEfetiva(defenderEntity))
  return Math.min(150, Math.floor(25 * dela / minha) + 1)
}

// Electro Ball: o inverso do Gyro Ball — quanto mais RAPIDO o usuario em
// relacao ao alvo, mais forte. Faixas da Gen VI/VII.
function electroBallPower(attackerEntity: WorldEntity, defenderEntity: WorldEntity): number {
  const minha = Math.max(1, velocidadeEfetiva(attackerEntity))
  const dela = Math.max(1, velocidadeEfetiva(defenderEntity))
  const razao = minha / dela
  if (razao >= 4) return 150
  if (razao >= 3) return 120
  if (razao >= 2) return 80
  if (razao > 1) return 60
  return 40
}

// Wring Out / Crush Grip: poder proporcional ao HP que o ALVO ainda tem.
function wringOutPower(defenderPoke: PokeInstance): number {
  const fracao = Math.max(0, defenderPoke.hp) / defenderPoke.stats.hp
  return Math.max(1, Math.floor(120 * fracao))
}

// Punishment: +20 de poder por estagio POSITIVO do alvo, base 60, teto 200 —
// o golpe que pune quem passou a luta se fortalecendo.
function punishmentPower(defenderEntity: WorldEntity): number {
  const positivos = Object.values(defenderEntity.estagios)
    .reduce((soma, n) => soma + Math.max(0, n ?? 0), 0)
  return Math.min(200, 60 + 20 * positivos)
}

const DYNAMIC_POWER_ABILITIES: Record<string, (rng: Rng, attackerPoke: PokeInstance, defenderPoke: PokeInstance, attackerEntity: WorldEntity, defenderEntity: WorldEntity) => number> = {
  magnitude: (rng) => rollMagnitudePower(rng),
  reversal: (_rng, attackerPoke) => hpRatioPower(attackerPoke),
  flail: (_rng, attackerPoke) => hpRatioPower(attackerPoke),
  present: (rng) => rollPresentPower(rng),
  hidden_power: (_rng, attackerPoke) => hiddenPowerPower(attackerPoke),
  // PH-69: os quatro abaixo vinham do catalogo com `power: 0` e ficaram fora
  // desta tabela, entao `isDamagingAbility` era falso e `pickAbilityDaFila`
  // pulava eles em TODA rotacao — slot morto, e a descricao prometendo dano.
  gyro_ball: (_rng, _a, _d, attackerEntity, defenderEntity) => gyroBallPower(attackerEntity, defenderEntity),
  electro_ball: (_rng, _a, _d, attackerEntity, defenderEntity) => electroBallPower(attackerEntity, defenderEntity),
  wring_out: (_rng, _a, defenderPoke) => wringOutPower(defenderPoke),
  punishment: (_rng, _a, _d, _attackerEntity, defenderEntity) => punishmentPower(defenderEntity),
}

// Counter/Mirror Coat refletem 2x o ultimo golpe daquela categoria que o
// PROPRIO usuario sofreu — o Counter real Gen2 so lembra "este turno";
// aproximado aqui como uma janela recente curta, ja que o combate nao e
// estritamente por turno. Sem nada recente pra refletir, o Counter real so
// falha (0 de dano), mas um golpe hard-0 que a IA de um auto-battler
// idle poderia ranquear bem alto pareceria quebrado — entao o chamador
// (specialDamageFor) cai pra um hit comum em vez disso.
const COUNTER_MEMORY_WINDOW = 3 // segundos
function counterDamage(attackerEntity: WorldEntity, category: 'physical' | 'special'): number | null {
  const memory = attackerEntity.lastDamageTaken[category]
  if (memory.amount > 0 && memory.age <= COUNTER_MEMORY_WINDOW) return memory.amount * 2
  return null
}

const FIXED_DAMAGE_ABILITIES: Record<string, (attackerPoke: PokeInstance, defenderPoke: PokeInstance, attackerEntity: WorldEntity, rng: Rng) => number | null> = {
  // horn_drill/fissure continuam aqui (a regra existe e funciona se o golpe
  // chegar), mas `isDamagingAbility` nao os deixa ser escolhidos enquanto nao
  // houver precisao — ver a nota em data/abilities.ts.
  seismic_toss: (attackerPoke) => attackerPoke.level,
  night_shade: (attackerPoke) => attackerPoke.level,
  dragon_rage: () => 40,
  super_fang: (_a, defenderPoke) => Math.max(1, Math.floor(defenderPoke.hp / 2)),
  horn_drill: (_a, defenderPoke) => defenderPoke.hp,
  fissure: (_a, defenderPoke) => defenderPoke.hp,
  psywave: (attackerPoke, _d, _e, rng) => psywaveDamage(rng, attackerPoke),
  counter: (_a, _d, attackerEntity) => counterDamage(attackerEntity, 'physical'),
  mirror_coat: (_a, _d, attackerEntity) => counterDamage(attackerEntity, 'special'),
  // PH-69, mesma historia do bloco de DYNAMIC_POWER: `power: 0` no catalogo,
  // fora desta tabela, logo pulados pra sempre pela fila.
  sonic_boom: () => 20,
  // Endeavor iguala o HP do alvo ao do usuario. Alvo com HP menor ou igual:
  // devolve 0, que aqui e "o golpe falha" — e o comportamento real, e nao pode
  // devolver `null`, que a linha do Counter transforma num hit comum de 40.
  endeavor: (attackerPoke, defenderPoke) => Math.max(0, defenderPoke.hp - attackerPoke.hp),
  // Final Gambit: dano igual ao HP que o usuario tem. O CUSTO nao esta aqui, e
  // sim no bloco de auto-dano de resolveHit.
  final_gambit: (attackerPoke) => Math.max(1, attackerPoke.hp),
}

type SpecialDamage = { mode: 'dynamicPower'; power: number } | { mode: 'fixed'; amount: number } | null

// Devolve null (usa o `power` fixo do golpe pelo pipeline normal) ou uma das
// formas acima.
function specialDamageFor(rng: Rng, ability: Ability, attackerEntity: WorldEntity, defenderEntity: WorldEntity): SpecialDamage {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke

  const dynamic = DYNAMIC_POWER_ABILITIES[ability.id]
  if (dynamic) {
    return { mode: 'dynamicPower', power: dynamic(rng, attackerPoke, defenderPoke, attackerEntity, defenderEntity) }
  }

  const fixed = FIXED_DAMAGE_ABILITIES[ability.id]
  if (fixed) {
    const amount = fixed(attackerPoke, defenderPoke, attackerEntity, rng)
    if (amount === null) return { mode: 'dynamicPower', power: 40 } // Counter/Mirror Coat sem nada pra refletir
    return { mode: 'fixed', amount }
  }

  return null
}

// Estimativa aproximada de dano (sem crit, sem variacao de roll) usada so
// pra ranquear golpes candidatos contra um alvo especifico — espelha o
// pipeline de computeDamage menos os 2 passos aleatorios.
// Recebe o rng so pra DERIVAR um scratch: estimar dano nao pode consumir a
// sequencia principal. Ranquear candidatos e uma decisao interna da IA e o
// numero de candidatos varia por nivel/cooldown — se a estimativa gastasse
// sorteios, a sequencia que o servidor verifica dependeria de detalhes que nao
// sao eventos de jogo.  le o estado sem avanca-lo.
function estimateDamage(rng: Rng, attackerEntity: WorldEntity, defenderEntity: WorldEntity, ability: Ability): number {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke
  const attackerSpecies = SPECIES[attackerPoke.speciesId]
  const defenderSpecies = SPECIES[defenderPoke.speciesId]
  const [defType1, defType2] = tiposEfetivosParaEfetividade(defenderEntity, defenderSpecies)
  const effectivenessMultiplier = efetividadeConsiderandoRevelado(
    getEffectiveness(ability.type, defType1, defType2),
    ability, defenderEntity, defenderSpecies,
  )
  // Leitura, nao aplica efeito (`aplicarEfeitos=false`): estimar dano nao pode
  // curar/buffar de verdade, so responder "esse golpe seria inutil aqui" pra
  // IA nao rankear Terremoto contra um Levitate como se causasse dano.
  if (resolverImunidadeDeTipo(
    deriveRng(rng.state, 'estimate-imunidade'), ability.type, defenderEntity, false,
    traitsDoConfronto(attackerEntity, defenderEntity).defensor,
  ).imune) return 0
  if (effectivenessMultiplier === 0) return 0

  const special = specialDamageFor(deriveRng(rng.state, 'estimate'), ability, attackerEntity, defenderEntity)
  if (special && special.mode === 'fixed') return special.amount

  const isPhysical = resolveAbilityCategory(ability, attackerPoke) === 'physical'
  // Mesmo filtro de Neutralizing Gas / Mold Breaker do dano real: se a
  // estimativa lesse a habilidade crua, a IA ranquearia contando com um efeito
  // que o hit nao vai ter.
  const { atacante: attackerTraitEstimate, defensor: defenderTraitEstimate } = traitsDoConfronto(attackerEntity, defenderEntity)
  const atk = (isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp)
    * multiplicadorDeAtaquePorTrait(attackerTraitEstimate, isPhysical, Boolean(attackerPoke.status))
  const def = (isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp)
    * multiplicadorDeDefesaPorTrait(defenderTraitEstimate, isPhysical, Boolean(defenderPoke.status))
  const poderBruto = special && special.mode === 'dynamicPower' ? special.power : ability.power
  // Sem o multiplicador de poder aqui, a IA ranquearia um golpe de 60 de poder
  // como pior que um de 80 mesmo com Technician transformando o primeiro em 90.
  // O clima nao entra na estimativa (ela nao recebe `world`), o que subestima
  // Sand Force — aceitavel: a estimativa so ordena golpes do MESMO atacante, e
  // o clima e igual pra todos eles.
  const power = poderBruto * multiplicadorDePoderPorTrait(attackerTraitEstimate, ability, null)
  if (power === 0) return 0

  let dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def })

  const isStab = Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)
  if (isStab) dmg *= stabPorTrait(attackerTraitEstimate, STAB_MULTIPLIER)

  if (attackerTraitEstimate && LOW_HP_TRAIT_TYPE_MULTIPLIER[attackerTraitEstimate] === ability.type
    && attackerPoke.hp / attackerPoke.stats.hp < LOW_HP_TRAIT_HP_FRACTION) {
    dmg *= LOW_HP_TRAIT_MULTIPLIER
  }
  // Flash Fire: buff permanente-ate-fim-de-luta no ATACANTE (nao no
  // defensor), ligado quando ele mesmo absorveu um golpe FIRE antes — ver
  // resolverImunidadeDeTipo.
  if (attackerEntity.flashFireAtivo && ability.type === 'FIRE') dmg *= FLASH_FIRE_MULTIPLIER

  dmg *= effectivenessMultiplier
  // Espelha o dano real: Thick Fat/Dry Skin/Filter do lado do defensor,
  // Tinted Lens do lado do atacante. Sem isto a IA acha que Chama vale a pena
  // contra um Thick Fat que corta o dano dela pela metade.
  dmg *= multiplicadorDeDanoRecebidoPorTrait(defenderTraitEstimate, ability, effectivenessMultiplier)
  dmg *= multiplicadorDeDanoCausadoPorTrait(attackerTraitEstimate, effectivenessMultiplier)
  return dmg
}

// Ate que estagio a IA se da ao trabalho de buffar/debuffar.
//
// O teto NAO e +6 de proposito. Cada uso de Danca das Espadas custa um turno
// inteiro, e o ganho por estagio cai rapido: de 0 pra +2 o Ataque dobra, de +4
// pra +6 sobe 33%. Sem teto o POKE gastaria seis turnos se preparando enquanto
// apanha — que e um jeito de perder a luta com a stat mais alta da hunt.
const ESTAGIO_ALVO_DA_IA = 2

// Teto de `estagioDeCritico` (Focus Energy) que a IA persegue. Nao e um valor
// arbitrario tipo ESTAGIO_ALVO_DA_IA: a formula de critico (computeDamage) usa
// `Math.pow(3, Math.min(3, critStagesTotal))`, entao qualquer total >= 3 JA
// SATURA no teto de 50% de chance (CRIT_CHANCE=1/24, 3^3=27 -> 27/24 > 0.5).
// Cada uso soma +2: comecando de 0, a IA usa em 0 (0<3), fica em 2, usa nao
// de novo (2<3), fica em 4 -- primeiro total >= 3, para. Um teto menor (ex:
// 2) pararia em 37.5% pra sempre sem nunca saturar; um teto maior (ex: 6)
// gastaria mais um turno inteiro depois de ja estar saturado.
const FOCUS_ENERGY_TETO_DA_IA = 3

/**
 * Vale a pena usar este golpe de APOIO puro (sem dano, sem status) agora?
 *
 * Cobre buff em si mesmo (Danca das Espadas), debuff no oponente (Rosnado) e
 * ARMADILHA DE CAMPO (Spikes/Toxic Spikes/Stealth Rock/Sticky Web). Nos dois
 * primeiros, so vale se o estagio ainda nao chegou no alvo da IA — repetir um
 * buff no teto e um turno jogado fora, e o jogador ve o POKE "dancando" em
 * vez de atacar. No terceiro, so vale enquanto o teto daquela armadilha (3
 * camadas de Spikes, 2 de Toxic Spikes, 1 flag de Stealth Rock/Sticky Web)
 * ainda nao foi atingido do lado INIMIGO.
 *
 * Focus Energy e Laser Focus NAO usam StatChange (contador/flag paralelos, ver
 * types.ts), entao caem fora do `ability.statChanges` generico abaixo e
 * precisam de um `if` proprio cada. Golpe de clima (Rain Dance/Sunny
 * Day/Hail/Sandstorm) entra pelo mesmo crivo: so vale usar se o clima ativo
 * agora NAO for o que este golpe ligaria — sem isso a IA repetiria Chuva a
 * cada cooldown com Chuva ja ativa, jogando o turno fora (e sobrescrevendo os
 * mesmos 5 turnos por cima dos que ja tinha).
 */
// Soma de todos os estagios de uma entidade — usada so pelas heuristicas
// abaixo (Haze/Psych Up) pra comparar "quem esta mais buffado" sem precisar
// somar stat a stat toda vez.
function somaDeEstagios(entity: WorldEntity): number {
  return Object.values(entity.estagios).reduce((soma: number, v) => soma + (v ?? 0), 0)
}

/**
 * GOLPE DE PROTECAO: Protect, Detect e Endure.
 *
 * Os tres anulam o resultado do golpe recebido, e por isso sao os unicos do
 * elenco que, repetidos, impedem a batalha de TERMINAR em vez de so mudar o
 * ritmo dela. O caso relatado pelo usuario era literalmente esse: um Kangaskhan
 * selvagem (que leva Endure no kit a partir do Nv50) parado em 1 de HP enquanto
 * o POKE do jogador batia nele por minutos.
 *
 * A REGRA QUE OS EQUILIBRA NOS JOGOS NAO E O PP — E A FALHA POR USO
 * CONSECUTIVO. Desde a Gen V, cada uso seguido bem-sucedido de um golpe de
 * protecao tem 1/2 da chance do anterior: 100%, 50%, 25%, 12,5%... Usar
 * QUALQUER outro golpe zera o contador. E o que impede exatamente este travamento
 * no jogo real, e nao o PP (que so limitaria depois de 10 usos).
 *
 * POR QUE NAO O PP: este motor nao gasta PP de proposito — o PP e a BASE DO
 * COOLDOWN (`abilities.ts#cooldownFromPp`), e um golpe de 5 PP ja recarrega em
 * 8s por causa disso. Contar usos aqui seria inventar um segundo significado pro
 * mesmo campo.
 */
const PROTECAO_ABILITY_KEYS = new Set(['protect', 'detect', 'endure'])

/**
 * Chance de o golpe de protecao FUNCIONAR agora, dado quantas vezes seguidas ele
 * ja funcionou. 1 no primeiro uso, metade a cada repeticao.
 */
function chanceDeProtecao(entity: WorldEntity): number {
  return 1 / Math.pow(2, entity.protecoesSeguidas ?? 0)
}

/**
 * Zera o contador de protecoes seguidas quando o POKE usa OUTRA coisa.
 *
 * Chamado no momento do CAST (nao do acerto), pros dois lados, porque e assim
 * que os jogos contam: o que reseta e ter USADO outro golpe, acerte ele ou nao.
 */
function registrarUsoParaProtecao(entity: WorldEntity, ability: Ability): void {
  if (!PROTECAO_ABILITY_KEYS.has(ability.id)) entity.protecoesSeguidas = 0
}

function golpeDeApoioUtil(
  world: WorldState,
  entity: WorldEntity,
  defenderEntity: WorldEntity,
  ability: Ability,
  golpesDeDanoProntos: Ability[],
  clima: ClimaTipo | null,
): boolean {
  // Golpes de disable/lock (Taunt/Spite/Disable/Encore/Torment): nenhum tem
  // `status` nem `statChanges` no catalogo, entao sem este bloco eles NUNCA
  // entrariam em statusPronto -- ficariam catalogados mas inalcancaveis pela
  // IA. So vale a pena se o efeito ainda vai pegar em algo (senao e um turno
  // jogado fora re-taunting quem ja esta calado, por exemplo).
  if (ability.id === 'taunt') return !(defenderEntity.silenciadoAte && defenderEntity.silenciadoAte > 0)
  if (ability.id === 'torment') return !(defenderEntity.tormentedUntil && defenderEntity.tormentedUntil > 0)
  if (ability.id === 'disable') {
    return !!defenderEntity.lastUsedAbilityId
      && !(defenderEntity.disabledAbilityUntil && defenderEntity.disabledAbilityUntil > 0)
  }
  if (ability.id === 'encore') {
    return !!defenderEntity.lastUsedAbilityId
      && !(defenderEntity.forcedAbilityUntil && defenderEntity.forcedAbilityUntil > 0)
  }
  if (ability.id === 'spite') return !!defenderEntity.lastUsedAbilityId

  // Golpes novos de tick volatil (leech_seed/curse/nightmare/ingrain/aqua_ring/
  // wish): nenhum usa `ability.status`/`statChanges`/`healPercent` do
  // catalogo — o efeito inteiro e custom (ver resolveHit) — entao a
  // heuristica de "vale a pena usar" tambem precisa ser custom por golpe.
  // SEM ISTO os 6 nunca sairiam do papel: `pickAbility` so considera um golpe
  // power:0 quando `ability.status` pega OU `golpeDeApoioUtil` diz sim — e
  // nenhum dos 6 tem `ability.status` setado.
  switch (ability.id) {
    case 'leech_seed': {
      if (defenderEntity.seeded) return false
      const especie = SPECIES[defenderEntity.poke.speciesId]
      return especie.type !== 'GRASS' && especie.type2 !== 'GRASS'
    }
    case 'curse': {
      // So vale se o alvo ainda nao tiver, e o atacante sobreviver ao custo
      // de 50% do proprio HP MAXIMO — sem este segundo check o POKE Ghost se
      // suicidaria toda vez que Curse saisse do cooldown.
      if (defenderEntity.curseDot) return false
      return entity.poke.hp > entity.poke.stats.hp * CURSE_SELF_MAX_HP_LOSS_PERCENT
    }
    case 'nightmare':
      // So e util se o alvo JA estiver dormindo agora — nao ha timer aqui pra
      // "esperar ele dormir depois".
      return !defenderEntity.nightmareDot && defenderEntity.poke.status?.tipo === 'sleep'
    case 'ingrain':
    case 'aqua_ring':
      return !entity.regenPercent && entity.poke.hp < entity.poke.stats.hp
    case 'wish':
      // Mesmo limiar que healPercent usa embaixo (so vale gastar o turno se
      // realmente falta HP pra recuperar), com a fracao equivalente de Wish.
      return entity.poke.hp / entity.poke.stats.hp <= 1 - WISH_HEAL_PERCENT
    default:
      break
  }

  // Cura pura (Recover): so quando ha HP de verdade a recuperar. O limiar existe
  // pra o POKE nao gastar turno curando 5 de HP com a vida quase cheia.
  if (ability.healPercent) {
    return entity.poke.hp / entity.poke.stats.hp <= 1 - ability.healPercent / 100
  }
  // Escudo (Screen): so vale usar se o proprio escudo daquele golpe ainda nao
  // esta de pe — repetir Reflect com 4s restantes de 10s e turno jogado fora.
  const chaveDeEscudo = ESCUDO_ABILITIES[ability.id]
  if (chaveDeEscudo) {
    return (entity.escudos?.[chaveDeEscudo] ?? 0) <= 0
  }
  // Magnet Rise: self-buff sem statChanges (nao ativa nenhum estagio) — so
  // vale enquanto a imunidade a GROUND nao esta ativa nele mesmo. Sem esta
  // checagem o golpe nunca entraria em `statusPronto` (nao tem `.status` nem
  // `.statChanges`) e ficaria inerte mesmo escolhido pro moveset.
  if (ability.id === 'magnet_rise') {
    return !entity.imuneAoTipoVolatil || entity.imuneAoTipoVolatil.tipo !== 'GROUND'
  }
  // Odor Sleuth: so vale contra um alvo Fantasma ainda nao revelado — e o
  // unico caso em que ele desbloqueia dano de verdade (Normal/Lutador contra
  // Fantasma, ver REVELA_IMUNIDADE/efetividadeConsiderandoRevelado).
  if (ability.id === 'odor_sleuth') {
    const especieAlvo = SPECIES[defenderEntity.poke.speciesId]
    const ehFantasma = especieAlvo.type === 'GHOST' || especieAlvo.type2 === 'GHOST'
    return ehFantasma && defenderEntity.revelado !== 'ghost'
  }
  // Focus Energy: so vale enquanto o estagio de critico nao saturou (ver
  // FOCUS_ENERGY_TETO_DA_IA acima).
  if (ability.id === 'focus_energy') {
    return (entity.estagioDeCritico ?? 0) < FOCUS_ENERGY_TETO_DA_IA
  }
  // Laser Focus: so vale se tiver um golpe de DANO pronto pra render o
  // critico garantido no proximo turno — gastar o turno nisso sem golpe de
  // dano pronto pra seguir e um turno perdido esperando cooldown, o mesmo
  // raciocinio de "so abre status se o alvo for sobreviver" mais abaixo em
  // pickAbility.
  if (ability.id === 'laser_focus') {
    return golpesDeDanoProntos.length > 0
  }
  const climaDoGolpe = CLIMA_DO_GOLPE[ability.id]
  if (climaDoGolpe) return clima !== climaDoGolpe
  if (ability.hazard) {
    // So a IA do JOGADOR planta armadilha — ela mira o campo INIMIGO
    // (`world.enemyHazards`), que so faz sentido do lado de quem caca. O
    // selvagem nao tem conceito de "seu proprio lado" pra isto.
    if (entity.kind !== 'player') return false
    const hazards = world.enemyHazards
    switch (ability.hazard) {
      case 'spikes': return (hazards?.spikes ?? 0) < 3
      case 'toxic_spikes': return (hazards?.toxicSpikes ?? 0) < 2
      case 'stealth_rock': return !hazards?.stealthRock
      case 'sticky_web': return !hazards?.stickyWeb
    }
  }
  if (ability.statChanges && ability.statChanges.length) {
    const destino = ability.statTarget === 'self' ? entity : defenderEntity
    return ability.statChanges.some((m) => {
      const atual = destino.estagios[m.stat] ?? 0
      return m.estagios > 0 ? atual < ESTAGIO_ALVO_DA_IA : atual > -ESTAGIO_ALVO_DA_IA
    })
  }

  // Golpes de suporte da Fase 12: nao tem `statChanges`/`healPercent` no
  // catalogo (o efeito inteiro e hardcoded por id em resolveHit), entao cada
  // um precisa da propria heuristica de "vale usar agora" aqui.
  switch (ability.id) {
    case 'rest':
      return entity.poke.hp / entity.poke.stats.hp <= 0.5 && !entity.poke.status
    case 'belly_drum':
      return (entity.estagios.atkFis ?? 0) < ESTAGIO_MAXIMO && entity.poke.hp / entity.poke.stats.hp > 0.5
    case 'acupressure':
      return true // sempre sobe algum stat aleatorio em +2 — nunca e turno jogado fora
    case 'endure':
      return entity.poke.hp / entity.poke.stats.hp <= 0.25 && !entity.enduraAtiva
    case 'protect':
    case 'detect':
      return !entity.protegida
    case 'destiny_bond':
      return entity.poke.hp / entity.poke.stats.hp <= 0.15 && !entity.destinyBondAtiva
    case 'aromatherapy':
    case 'heal_bell':
      return Boolean(entity.poke.status)
    case 'yawn':
      return !defenderEntity.poke.status
    case 'heal_block':
      return !(defenderEntity.curaBloqueadaAte && defenderEntity.curaBloqueadaAte > 0)
    case 'soak':
      return defenderEntity.tipoForcado !== 'WATER'
    case 'perish_song':
      return entity.perishCountdown == null
    case 'lock_on':
    case 'mind_reader':
      return entity.miraGarantidaAlvoId !== defenderEntity.id
    case 'psycho_shift':
      return Boolean(entity.poke.status) && !defenderEntity.poke.status
    case 'guard_swap':
      return (defenderEntity.estagios.def ?? 0) + (defenderEntity.estagios.defEsp ?? 0)
        > (entity.estagios.def ?? 0) + (entity.estagios.defEsp ?? 0)
    case 'power_swap':
      return (defenderEntity.estagios.atkFis ?? 0) + (defenderEntity.estagios.atkEsp ?? 0)
        > (entity.estagios.atkFis ?? 0) + (entity.estagios.atkEsp ?? 0)
    case 'psych_up':
      return somaDeEstagios(defenderEntity) > somaDeEstagios(entity)
    case 'haze':
      return somaDeEstagios(entity) < 0 || somaDeEstagios(defenderEntity) > 0
    case 'pain_split':
      return defenderEntity.poke.hp > entity.poke.hp
    // Rage Powder: no-op estrutural (ver resolveHit) — engine e sempre 1
    // jogador vs N inimigos, sem aliado do jogador pra redirecionar aggro.
    // Nunca vale a pena escolher.
    case 'rage_powder':
    default:
      return false
  }
}

/**
 * Dano estimado JA DESCONTADA a chance de errar.
 *
 * `estimateDamage` responde "quanto isso tira se acertar", que era a pergunta
 * certa enquanto todo golpe sempre acertava. Com precisao valendo, ranquear por
 * ela faz o POKE escolher Blizzard (110 de poder, 70% de precisao) em vez de um
 * golpe de 100% quase tao forte — e perder o turno inteiro em 3 de cada 10
 * tentativas.
 *
 * Medido: so essa troca vale 15% das kills/hora numa hunt onde o jogador esta
 * muito acima do nivel, que e onde os golpes fortes e imprecisos dominam o
 * moveset.
 */
function danoEsperado(rng: Rng, atacante: WorldEntity, defensor: WorldEntity, ability: Ability): number {
  return estimateDamage(rng, atacante, defensor, ability) * ((ability.accuracy ?? 100) / 100)
}

export type Effectiveness = 'normal' | 'immune' | 'super' | 'effective' | 'weak'

export interface DamageResult {
  amount: number
  effectiveness: Effectiveness
  effectivenessLabel: string | null
  isCrit: boolean
}

// Pipeline de dano real Gen2: DAMAGE_BASE -> STAB -> efetividade de tipo ->
// crit -> variacao 85-100%. Golpes de dano fixo (ver specialDamageFor) vao
// direto pro valor bruto e pulam STAB/crit/variancia, igual ao real — mas
// ainda zerados por imunidade total de tipo.
// `DANO_VARIACAO_MINIMA` e o piso da formula DAMAGE_VARIATION da planilha
// ((floor(random()*16)+85)/100). Repetido aqui como constante, e nao lido de la,
// porque o que o modo pessimista precisa e o MINIMO da distribuicao — a formula
// so sabe sortear dentro dela.
const DANO_VARIACAO_MINIMA = 0.85

function computeDamage(rng: Rng, attackerEntity: WorldEntity, defenderEntity: WorldEntity, ability: Ability, pessimista = false, clima: ClimaTipo | null = null): DamageResult {
  const attackerPoke = attackerEntity.poke
  const defenderPoke = defenderEntity.poke
  const attackerSpecies = SPECIES[attackerPoke.speciesId]
  const defenderSpecies = SPECIES[defenderPoke.speciesId]
  // Neutralizing Gas e Mold Breaker resolvidos AQUI, uma vez, pra todo o resto
  // da funcao ler o valor ja filtrado — ver traitsDoConfronto.
  const { atacante: attackerTrait, defensor: defenderTrait } = traitsDoConfronto(attackerEntity, defenderEntity)
  const climaAtivo = climaEfetivo(clima, { atacante: attackerTrait, defensor: defenderTrait })
  const [defType1, defType2] = tiposEfetivosParaEfetividade(defenderEntity, defenderSpecies)
  let effectivenessMultiplier = efetividadeConsiderandoRevelado(
    getEffectiveness(ability.type, defType1, defType2),
    ability, defenderEntity, defenderSpecies,
  )
  // Hit de verdade (`aplicarEfeitos=true`): imunidade de Trait/golpe zera o
  // multiplicador igual a imunidade natural de tipo, e AQUI de fato cura o
  // HP / sobe o estagio / liga `flashFireAtivo` quando a Trait pedir.
  if (resolverImunidadeDeTipo(rng, ability.type, defenderEntity, true, defenderTrait).imune) effectivenessMultiplier = 0
  // SCRAPPY: NORMAL e FIGHTING do portador acertam GHOST. E a UNICA coisa que
  // ela muda na tabela de tipos, dai o teste ser "isto zerou por causa do
  // fantasma?" e nao um recalculo geral. Mesmo efeito que Odor Sleuth/Foresight
  // conseguem pelo caminho de `revelado` (REVELA_IMUNIDADE acima), so que
  // permanente e sem gastar turno.
  if (attackerTrait === TRAIT_SCRAPPY && effectivenessMultiplier === 0
    && (ability.type === 'NORMAL' || ability.type === 'FIGHTING')) {
    const ehFantasma = defType1 === 'GHOST' || defType2 === 'GHOST'
    if (ehFantasma) {
      effectivenessMultiplier = getEffectiveness(
        ability.type,
        defType1 === 'GHOST' ? 'NORMAL' : defType1,
        defType2 === 'GHOST' ? null : defType2,
      )
    }
  }
  const special = specialDamageFor(rng, ability, attackerEntity, defenderEntity)

  let dmg: number
  let isCrit = false

  if (special && special.mode === 'fixed') {
    dmg = effectivenessMultiplier === 0 ? 0 : special.amount
  } else {
    const isPhysical = resolveAbilityCategory(ability, attackerPoke) === 'physical'
    // Estagios entram MULTIPLICANDO a stat crua, nao alterando-a: a ficha do
    // POKE continua mostrando o Ataque de verdade, e o buff some quando ele sai
    // de campo. E como os jogos fazem. Traits de Fase 12 (Huge/Pure Power,
    // Hustle, Guts, Marvel Scale) empilham do mesmo jeito, multiplicando a
    // stat crua.
    // UNAWARE dos dois lados: quem a tem IGNORA os estagios do oponente. Do
    // lado do atacante isso apaga os buffs de Defesa do alvo; do lado do
    // defensor, apaga os buffs de Ataque de quem bate nele. A stat crua
    // continua valendo — Unaware nao anula estagio, so nao enxerga.
    const estagiosDoDefensorValem = attackerTrait !== TRAIT_UNAWARE
    const estagiosDoAtacanteValem = defenderTrait !== TRAIT_UNAWARE
    const atk = (isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp)
      * (estagiosDoAtacanteValem ? multiplicadorDeStat(attackerEntity.estagios, isPhysical ? 'atkFis' : 'atkEsp') : 1)
      * multiplicadorDeAtaquePorTrait(attackerTrait, isPhysical, Boolean(attackerPoke.status))
      // SOLAR POWER: +50% de Ataque Especial sob sol. O custo (1/8 do HP por
      // turno) e cobrado no tick de turno, nao aqui.
      * (attackerTrait === 'solar_power' && !isPhysical && climaAtivo === 'sol' ? SOLAR_POWER_BONUS : 1)
    const def = (isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp)
      * (estagiosDoDefensorValem ? multiplicadorDeStat(defenderEntity.estagios, isPhysical ? 'def' : 'defEsp') : 1)
      * multiplicadorDeDefesaPorTrait(defenderTrait, isPhysical, Boolean(defenderPoke.status))
    // PODER: Technician, Iron Fist, Reckless, Sheer Force, Sand Force.
    // Multiplica o poder ANTES de DAMAGE_BASE, como nos jogos — a diferenca
    // aparece de verdade porque DAMAGE_BASE tem divisao inteira no meio.
    const poderBruto = special && special.mode === 'dynamicPower' ? special.power : ability.power
    const power = poderBruto * multiplicadorDePoderPorTrait(attackerTrait, ability, climaAtivo)

    // DAMAGE_BASE tem um +2 fixo na formula (Gen2 legitimo pra golpe de dano
    // real), mas golpe de status puro (power 0, sem dynamicPower/fixed) nao
    // pode causar esse chip damage silencioso.
    dmg = power === 0 ? 0 : formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def })

    // Queimadura corta o dano FISICO do atacante pela metade (Gen VII). Entra
    // aqui, e nao na stat de Ataque, exatamente como nos jogos desde a Gen IV:
    // "a burn now technically halves the damage a burned Pokemon does with
    // physical moves" — a diferenca importa porque a stat crua continua sendo
    // a exibida na ficha do POKE.
    if (isPhysical) dmg *= multiplicadorDeDanoFisico(attackerPoke.status?.tipo ?? null)

    const isStab = Boolean(ability.type) && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2)
    // ADAPTABILITY sobe o STAB de 1.5x pra 2x. Passa por `stabPorTrait` em vez
    // de um `if` solto pra o 1.5 continuar vindo da planilha (STAB_MULTIPLIER)
    // num lugar so.
    if (isStab) dmg *= stabPorTrait(attackerTrait, STAB_MULTIPLIER)

    if (attackerTrait && LOW_HP_TRAIT_TYPE_MULTIPLIER[attackerTrait] === ability.type
      && attackerPoke.hp / attackerPoke.stats.hp < LOW_HP_TRAIT_HP_FRACTION) {
      dmg *= LOW_HP_TRAIT_MULTIPLIER
    }
    // Flash Fire: buff permanente-ate-fim-de-luta no ATACANTE, ligado quando
    // ele mesmo absorveu um golpe FIRE antes (ver resolverImunidadeDeTipo).
    if (attackerEntity.flashFireAtivo && ability.type === 'FIRE') dmg *= FLASH_FIRE_MULTIPLIER

    dmg *= effectivenessMultiplier

    // Clima: Chuva/Sol -- entra depois da efetividade de tipo, igual ao
    // Multiscale logo abaixo (mais um multiplicador de "estado do combate"
    // empilhando sobre o resto). So mexe em golpe WATER/FIRE; qualquer outro
    // tipo passa ileso pelos dois climas.
    if (climaAtivo === 'chuva') {
      if (ability.type === 'WATER') dmg *= CLIMA_MULTIPLICADOR_FAVORECIDO
      else if (ability.type === 'FIRE') dmg *= CLIMA_MULTIPLICADOR_DESFAVORECIDO
    } else if (climaAtivo === 'sol') {
      if (ability.type === 'FIRE') dmg *= CLIMA_MULTIPLICADOR_FAVORECIDO
      else if (ability.type === 'WATER') dmg *= CLIMA_MULTIPLICADOR_DESFAVORECIDO
    }

    // HABILIDADES QUE MEXEM NO DANO JA CALCULADO, depois da efetividade de tipo
    // (que duas delas leem) e junto com Multiscale, que e o mesmo tipo de
    // multiplicador "estado do confronto":
    //   defensor: Thick Fat (metade de FIRE/ICE), Dry Skin (+25% de FIRE),
    //             Filter/Solid Rock (-25% do super efetivo);
    //   atacante: Tinted Lens (dobro no pouco efetivo).
    dmg *= multiplicadorDeDanoRecebidoPorTrait(defenderTrait, ability, effectivenessMultiplier)
    dmg *= multiplicadorDeDanoCausadoPorTrait(attackerTrait, effectivenessMultiplier)

    // Multiscale: HP do defensor CHEIO (nao so alto) corta o dano recebido
    // pela metade. Depois da efetividade de tipo, igual ao pipeline real —
    // um multiplicador de "estado do defensor" empilha sobre o resto.
    if (defenderTrait === 'multiscale' && defenderPoke.hp === defenderPoke.stats.hp) {
      dmg *= MULTISCALE_MULTIPLIER
    }

    // Reflect/Light Screen: escudo do DEFENSOR corta pela metade o dano da
    // categoria correspondente. Reflect cobre fisico, Light Screen cobre
    // especial — os dois podem estar de pe ao mesmo tempo sem se somar (cada
    // um so mexe na sua propria categoria).
    // INFILTRATOR atravessa Reflect/Light Screen (e Safeguard/Mist, ver
    // statusSystem). O escudo continua de pe pros outros golpes.
    const escudosValem = attackerTrait !== TRAIT_INFILTRATOR
    if (escudosValem && isPhysical && (defenderEntity.escudos?.reflect ?? 0) > 0) dmg *= 0.5
    if (escudosValem && !isPhysical && (defenderEntity.escudos?.lightScreen ?? 0) > 0) dmg *= 0.5

    // Estagio de critico: Slash/Razor Leaf e outros 16 golpes tem +1 estagio,
    // que na Gen VII e 1/8 em vez de 1/24. A tabela real vai ate +3 (1/2), mas
    // nenhum golpe deste elenco passa de +1 — o `Math.min` existe pra ela nao
    // virar um multiplicador solto se algum dia passar.
    //
    // Focus Energy soma `estagioDeCritico` (contador PARALELO, ver types.ts)
    // ao estagio do PROPRIO golpe antes do teto — mesma formula, so mais
    // estagio somado. O `Math.min(3, ...)` de baixo ja tampa os dois juntos.
    // SUPER LUCK soma +1 estagio de critico, na mesma conta do golpe e do Focus
    // Energy. SHELL ARMOR / BATTLE ARMOR sao o oposto e entram logo abaixo: nao
    // reduzem a chance, ZERAM a possibilidade.
    const critStagesTotal = (ability.critStages ?? 0)
      + (attackerEntity.estagioDeCritico ?? 0)
      + estagiosDeCriticoPorTrait(attackerTrait)
    const chanceDeCritico = CRIT_CHANCE * Math.pow(3, Math.min(3, critStagesTotal))
    const imuneACritico = Boolean(defenderTrait && TRAIT_SEM_CRITICO_RECEBIDO.has(defenderTrait))

    // Lucky Chant: escudo do DEFENSOR ignora o sorteio inteiro E o critico
    // garantido de Laser Focus — nunca critico contra quem esta protegido,
    // nao so "chance reduzida".
    const protegidoPorLuckyChant = (defenderEntity.escudos?.luckyChant ?? 0) > 0

    // Laser Focus: flag de uso unico que forca o PROXIMO golpe de DANO
    // (power > 0) a sair critico garantido — bypass completo do roll e do
    // teto de 50% logo abaixo. So conta pra golpe de DANO de verdade: este
    // mesmo pipeline roda ate pra golpe de status (power 0, dmg fica 0), e
    // esse caso nao pode consumir a flag (ver types.ts#proximoGolpeCriticoGarantido).
    // Consumida mesmo se Lucky Chant bloquear o critico — senao a flag
    // ficaria pendurada pra sempre contra um defensor com o escudo de pe.
    // Nao gated por `pessimista` de proposito: e uma garantia determinada
    // pela propria entidade, nao um sorteio de sorte — pessimista so zera
    // ALEATORIEDADE (ver PH-15), e aplica identico nos dois modos, entao nao
    // quebra a invariante de "farm offline nunca renderiza melhor que ao vivo".
    const criticoGarantido = ability.power > 0 && attackerEntity.proximoGolpeCriticoGarantido === true
    if (criticoGarantido) attackerEntity.proximoGolpeCriticoGarantido = false
    if (protegidoPorLuckyChant || imuneACritico) {
      isCrit = false
    } else if (criticoGarantido) {
      isCrit = true
    } else {
      isCrit = pessimista ? false : rollChance(rng, Math.min(0.5, chanceDeCritico))
    }
    // SNIPER amplifica o proprio critico. Ver a nota em SNIPER_MULTIPLICADOR
    // sobre por que e uma multiplicacao SOBRE o CRIT_MULTIPLIER deste jogo, e
    // nao o "3x" literal dos jogos (que pressupoe critico base de 2x).
    if (isCrit) dmg *= CRIT_MULTIPLIER * (attackerTrait === 'sniper' ? SNIPER_MULTIPLICADOR : 1)

    dmg *= pessimista ? DANO_VARIACAO_MINIMA : formulaEngine.eval('DAMAGE_VARIATION', {}, rng)
  }

  let effectiveness: Effectiveness = 'normal'
  let effectivenessLabel: string | null = null
  if (effectivenessMultiplier === 0) {
    effectiveness = 'immune'
    effectivenessLabel = 'Imune!'
  } else if (effectivenessMultiplier > 2) {
    effectiveness = 'super'
    effectivenessLabel = 'Super efetivo!'
  } else if (effectivenessMultiplier > 1) {
    effectiveness = 'effective'
    effectivenessLabel = 'Efetivo!'
  } else if (effectivenessMultiplier < 1) {
    effectiveness = 'weak'
    effectivenessLabel = 'Pouco efetivo'
  }

  return {
    amount: effectivenessMultiplier === 0 ? 0 : Math.max(1, Math.round(dmg)),
    effectiveness,
    effectivenessLabel,
    isCrit,
  }
}

// Cor do numero de dano segue a efetividade de tipo, nao o crit.
const EFFECTIVENESS_COLORS: Record<Effectiveness, string> = {
  super: '#ff8c1a',
  effective: '#ffe14d',
  normal: '#ffffff',
  weak: '#5a5a5a',
  immune: '#000000',
}

// Texto de combate flutuante acima do alvo. Hits com rotulo de efetividade
// (ex: "Super efetivo!") desenham 2 linhas empilhadas, entao reservam 2
// slots de raia em vez de 1.
function spawnDamageNumber(world: WorldState, target: WorldEntity, result: DamageResult): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'damageNumber',
    x: target.x, y: target.y,
    targetX: target.x, targetY: target.y - target.radius - 40,
    color: EFFECTIVENESS_COLORS[result.effectiveness],
    duration: 0.9,
    value: result.amount,
    effectiveness: result.effectiveness !== 'normal' ? result.effectiveness : undefined,
    effectivenessLabel: result.effectivenessLabel,
    owner: target,
    laneSize: result.effectivenessLabel ? 2 : 1,
  }))
}

// BASIC_ATTACK e um unico objeto module-level compartilhado — mutar seu
// `.type` direto corromperia pra qualquer outra entidade usando ele no meio
// de outra luta. Isso monta um override por-ataque tipado pro tipo primario
// do atacante.
function basicAttackFor(attackerSpecies: { type: Ability['type'] }): Ability {
  return { ...BASIC_ATTACK, type: attackerSpecies.type }
}

// Escolhe o golpe pronto (fora de cooldown) que causa mais dano no
// `defenderEntity`. Golpes de status/nao-dano (power 0) sao excluidos da
// selecao. Golpes que o jogador desligou manualmente (poke.disabledAbilities)
// tambem sao excluidos da auto-selecao — inimigos selvagens nunca tem esse
// campo setado, entao o filtro e um no-op pra eles.
// `aoeTargetCounter` e uma funcao (ability) => numero de alvos que um cast
// AOE atingiria, usada pra preferir AOE quando atingiria 2+ alvos.
// Ataque Basico e o Struggle deste jogo pro caminho GREEDY (inimigo): entra
// quando NENHUM dos golpes selecionados pode ser usado agora. Nos jogos
// reais Struggle dispara por falta de PP; aqui o cooldown E o PP, entao
// "todos em cooldown" e o mesmo estado. Sem isto, um POKE de poucos golpes de
// dano (Igglybuff tem 1, e Togepi/Unown/Forretress ficam perto disso)
// passaria metade dos turnos parado.
//
// SO PRO SELVAGEM desde 2026-08-18. O POKE do jogador escolhe os 4 golpes, e
// o Ataque Basico e um deles se ele quiser — dar de graca aqui devolveria por
// baixo o slot gratis que a leva tirou.
function tentarAtaqueBasico(entity: WorldEntity, attackerSpecies: { type: Ability['type'] }, disabled: Record<string, boolean>): Ability | null {
  if (disabled[BASIC_ATTACK.id] || !isAbilityReady(entity, BASIC_ATTACK.id)) return null
  return basicAttackFor(attackerSpecies)
}

// Selvagem nao tem `activeAbilities` escolhido por ninguem (ver
// data/activeAbilities.ts#activeAbilitiesSelvagem) — sem uma ORDEM com
// significado pra respeitar, mantem a heuristica antiga: golpe de maior dano
// esperado entre os prontos, com golpe de status entrando so quando vale a
// pena (ver golpeDeApoioUtil) e preferencia por AOE que atinge 2+ alvos.
function pickAbilityGreedy(
  world: WorldState, entity: WorldEntity, defenderEntity: WorldEntity,
  prontos: Ability[], estaSilenciado: boolean, clima: ClimaTipo | null,
  aoeTargetCounter: (a: Ability) => number,
): Ability | null {
  const rng = world.rng
  const ready = prontos.filter((ability) => isDamagingAbility(ability))

  // ...MAS SO SE O ALVO FOR SOBREVIVER AO MELHOR GOLPE DE DANO.
  //
  // Sem essa condicao o POKE abre TODA luta com um golpe de status, inclusive
  // contra inimigo que ele mata em um golpe — e ai o status e um turno jogado
  // fora num alvo que nem chega a sofrer o efeito. Medido: sem a checagem, uma
  // hunt onde o jogador esta muito acima do nivel (Clareira Nv85) caiu de 1.308
  // para 997 kills/hora, um quarto do farm, porque metade dos turnos virava
  // abertura de status inutil.
  const statusPronto = estaSilenciado ? [] : prontos.filter((a) => (
    !isDamagingAbility(a) && (
      (a.status != null && statusVaiPegar(defenderEntity, a.status, a.id))
      || golpeDeApoioUtil(world, entity, defenderEntity, a, ready, clima)
    )
  ))
  if (statusPronto.length > 0) {
    // Dano CRU aqui, nao o esperado: a pergunta e "esse golpe mata se acertar?",
    // nao "quanto ele tira em media". Medido: com a comparacao errada, a hunt
    // de nivel alto caiu de 1.052 pra 796 kills/hora.
    const maiorDano = ready.reduce(
      (max, a) => Math.max(max, estimateDamage(rng, entity, defenderEntity, a)),
      0,
    )
    if (maiorDano < defenderEntity.poke.hp) {
      return statusPronto.reduce((melhor, a) => (
        (a.statusChance ?? 0) > (melhor.statusChance ?? 0) ? a : melhor
      ))
    }
  }

  if (ready.length === 0) return null

  const aoeReady = ready.filter((a) => a.target === 'aoe' && aoeTargetCounter(a) >= 2)
  const pool = aoeReady.length > 0 ? aoeReady : ready
  return pool.reduce((best, a) => (
    danoEsperado(rng, entity, defenderEntity, a) > danoEsperado(rng, entity, defenderEntity, best) ? a : best
  ))
}

// POKE do jogador: percorre a rotacao NA ORDEM — `activeAbilities`, do jeito
// que o jogador ordenou na tela de golpes (ver data/activeAbilities.ts) —
// comecando de
// `entity.filaGolpeIndex`. Golpe da vez em cooldown/filtrado nao trava o
// turno — pula pro proximo da fila, sem avancar o indice (ele tenta de novo
// no proximo turno, e nao "perde a vez" pra sempre). So avanca o indice
// quando um golpe da fila e de fato escolhido.
//
// Pedido explicito do usuario: com golpes de buff/debuff/area no jogo agora,
// quem decide QUANDO usar cada um e o jogador pela ordem dos slots — nao mais
// uma IA que sempre repete os 1-2 golpes de maior dano esperado e deixa o
// resto do moveset parado.
//
// O Ataque Basico participa da fila como QUALQUER outro golpe, se o jogador
// tiver gasto um dos 4 slots nele. Quando esta na fila ele executa toda vez
// que a vez dele chega e nao esta em cooldown, mesmo com golpe forte pronto —
// custa DPS de proposito (cooldown curto e fixo rouba turno de golpe real), e
// isso agora e uma escolha do jogador, nao uma imposicao do motor.
function pickAbilityDaFila(
  world: WorldState, entity: WorldEntity, defenderEntity: WorldEntity,
  candidatos: Ability[], estaSilenciado: boolean, clima: ClimaTipo | null,
): Ability | null {
  const rng = world.rng
  const n = candidatos.length
  if (n === 0) return null
  const inicio = ((entity.filaGolpeIndex ?? 0) % n + n) % n
  // Ataque Basico FICA FORA desta conta mesmo agora que ele ocupa slot: o
  // cooldown dele e curto e fixo, entao ele quase sempre esta pronto, e
  // inclui-lo faria o overkill-guard abaixo concluir que SEMPRE ha dano letal
  // disponivel — nenhum golpe de status executaria nunca. O guard pergunta
  // "o alvo sobrevive ao meu melhor golpe?", e o Basico nao e resposta pra
  // isso em POKE nenhum.
  const prontosDeDano = candidatos.filter((a) => (
    a.id !== BASIC_ATTACK.id && isDamagingAbility(a) && isAbilityReady(entity, a.id)
  ))

  // So calcula (e so uma vez) se algum golpe de status da fila realmente
  // pedir a checagem de overkill abaixo.
  let maiorDanoCache: number | null = null
  const maiorDanoSePronto = () => {
    if (maiorDanoCache == null) {
      maiorDanoCache = prontosDeDano.reduce(
        (max, a) => Math.max(max, estimateDamage(rng, entity, defenderEntity, a)), 0,
      )
    }
    return maiorDanoCache
  }

  for (let passo = 0; passo < n; passo++) {
    const idx = (inicio + passo) % n
    const ability = candidatos[idx]
    if (!isAbilityReady(entity, ability.id)) continue
    // NAO e `ability.power === 0`. Os 12 golpes de DANO SEM PODER BASE
    // (data/abilities.ts#DANO_SEM_PODER_BASE: Flail, Reversal, Seismic Toss,
    // Night Shade, Dragon Rage, Super Fang, Psywave, Magnitude, Present,
    // Hidden Power, Counter, Mirror Coat) tem `power` 0 no catalogo e o dano
    // deles nasce em `specialDamageFor`. Com a comparacao crua eles caiam
    // nesta perna de "golpe de status": nao tem `status`, nao valem como
    // apoio, e o `continue` logo abaixo os pulava — PARA SEMPRE, em toda
    // rotacao de POKE do jogador. Sintoma medido: Magikarp Nv30+ recebe Flail
    // no padrao (`activeAbilitiesPadrao` filtra por `isDamagingAbility`, que
    // os aceita), o slot aparecia cheio no HUD e o golpe nunca disparava.
    if (!isDamagingAbility(ability)) {
      // Mesma sanidade do caminho selvagem: nao gastar o turno com status que
      // nao vai pegar (Taunt/silencio, alvo ja com o status, buff saturado) —
      // isso e "golpe sem efeito nenhum agora", nao uma escolha estrategica.
      if (estaSilenciado) continue
      const statusVale = (ability.status != null && statusVaiPegar(defenderEntity, ability.status, ability.id))
        || golpeDeApoioUtil(world, entity, defenderEntity, ability, prontosDeDano, clima)
      if (!statusVale) continue
      // Mesmo overkill-guard do caminho selvagem: se um golpe de dano pronto
      // ja mata o alvo, nao abre com status na frente dele.
      if (maiorDanoSePronto() >= defenderEntity.poke.hp) continue
    }
    entity.filaGolpeIndex = (idx + 1) % n
    return ability
  }
  return null
}

function pickAbility(world: WorldState, entity: WorldEntity, defenderEntity: WorldEntity, aoeTargetCounter: (a: Ability) => number): Ability | null {
  const clima = world.clima?.tipo ?? null
  const attackerSpecies = SPECIES[entity.poke.speciesId]
  const disabled = entity.poke.disabledAbilities || {}
  // No maximo 4 golpes (+ o AOE de nivel 50 pro POKE do jogador). Selvagem usa
  // os 4 ultimos que a especie aprenderia naquele nivel, sem AOE — ver
  // data/activeAbilities.ts.
  const candidateIds = golpesUtilizaveis(entity.poke, attackerSpecies, entity.kind === 'enemy')
    .filter((id) => !disabled[id])
    // Disable: golpe especifico temporariamente fora dos candidatos enquanto
    // o timer nao zera -- mesmo ponto de filtro do "desligado pelo jogador"
    // acima, so que temporario (ver types.ts#disabledAbilityId).
    .filter((id) => !(entity.disabledAbilityUntil && entity.disabledAbilityUntil > 0 && id === entity.disabledAbilityId))
    // Torment: nunca deixa repetir o ultimo golpe usado enquanto o timer nao
    // zera. Recalculado a cada chamada (nao fixado no momento do cast): "o
    // ultimo usado" muda de golpe a cada turno.
    .filter((id) => !(entity.tormentedUntil && entity.tormentedUntil > 0 && id === entity.lastUsedAbilityId))
    // Curse (variante Ghost): a variante pra outros tipos (buff proprio, sem
    // custo de HP) nao esta implementada neste motor — fora do tipo GHOST o
    // golpe fica descartado aqui mesmo, antes de golpeDeApoioUtil decidir se
    // "vale a pena". Sem precedente de golpe restrito por tipo neste arquivo
    // (conferido: nenhum outro golpe filtra `candidateIds` por tipo do
    // atacante) — checagem nova.
    .filter((id) => id !== 'curse' || attackerSpecies.type === 'GHOST' || attackerSpecies.type2 === 'GHOST')

  // Encore: enquanto o timer nao zera, SO o golpe forcado entra na escolha.
  // Se ele estiver em cooldown, o fallback pro Ataque Basico (mais abaixo) ja
  // cobre o caso, sem logica nova.
  const encoreAtivo = !!(entity.forcedAbilityUntil && entity.forcedAbilityUntil > 0 && entity.forcedAbilityId)
  const candidatosFinais = encoreAtivo
    ? candidateIds.filter((id) => id === entity.forcedAbilityId)
    : candidateIds

  // Taunt: enquanto silenciado, golpe de status nunca entra na escolha (nos
  // jogos, estar calado significa exatamente isso).
  const estaSilenciado = !!(entity.silenciadoAte && entity.silenciadoAte > 0)

  const abilidadesFinais = candidatosFinais.map((id) => getAbility(id)).filter((a): a is Ability => a != null)

  // O Ataque Basico do JOGADOR nao e mais injetado aqui. Ate 2026-08-18 ele
  // entrava como primeira posicao fixa da fila, de graca, alem dos 4 slots —
  // o POKE lutava com 5 (6 com a Explosao Elemental) enquanto a tela dizia
  // "4/4". Agora ele so luta se o jogador o tiver escolhido, e ai ja chega em
  // `abilidadesFinais` como qualquer outro golpe, na posicao que o jogador
  // deu a ele. Ver data/activeAbilities.ts.
  //
  // `basicAttackFor` continua sendo a fonte do objeto: o Ataque Basico assume
  // o tipo primario do atacante, e o `getAbility` que montou `abilidadesFinais`
  // devolve a versao NORMAL, module-level.
  const rotacaoDoJogador = abilidadesFinais.map(
    (a) => (a.id === BASIC_ATTACK.id ? basicAttackFor(attackerSpecies) : a),
  )

  const escolhido = entity.kind === 'enemy'
    ? pickAbilityGreedy(
      world, entity, defenderEntity,
      abilidadesFinais.filter((a) => isAbilityReady(entity, a.id)),
      estaSilenciado, clima, aoeTargetCounter,
    )
    : pickAbilityDaFila(
      world, entity, defenderEntity,
      rotacaoDoJogador,
      estaSilenciado, clima,
    )

  // Fallback SO pro selvagem. E o Struggle dele: o moveset selvagem e derivado
  // (4 ultimos aprendidos, sem escolha de ninguem), entao uma especie com 1
  // golpe de dano passaria metade dos turnos parada. O jogador nao tem esse
  // problema — ele escolhe os 4, e se quiser a rede de seguranca basta por o
  // Ataque Basico num slot. Dar a ele um golpe que ele NAO escolheu seria
  // desfazer o pedido desta leva por outro caminho.
  if (escolhido) return escolhido
  return entity.kind === 'enemy' ? tentarAtaqueBasico(entity, attackerSpecies, disabled) : null
}

// Contador no WorldState, nao em modulo — ver a nota em types.ts#WorldCounters.

// Enfileira um hit pra acontecer HIT_LAND_DELAY segundos a partir de agora —
// resolveHit() aplica o dano/efeito/derrota real quando esse timer zera, em
// sincronia com a pose Shoot/Charge terminando.
function queueHit(world: WorldState, attacker: WorldEntity, target: WorldEntity, ability: Ability): void {
  world.pendingHits.push({ id: `hit-${world.counters.pendingHit++}`, timer: HIT_LAND_DELAY, attackerId: attacker.id, targetId: target.id, ability })
}

// Golpes AOE ganham EXATAMENTE UM anel visual, centrado no atacante,
// pousando no mesmo instante que os hits de dano por-alvo. Enfileirado do
// mesmo jeito que um hit de verdade (sem `target`) pra pousar em sincronia
// com a pose de ataque terminando; resolveHit trata `isAoeVisual` como caso
// especial e pula o anel por-alvo abaixo.
function queueAoeVisual(world: WorldState, attacker: WorldEntity, ability: Ability): void {
  world.pendingHits.push({ id: `hit-${world.counters.pendingHit++}`, timer: HIT_LAND_DELAY, attackerId: attacker.id, targetId: null, ability, isAoeVisual: true })
}

// Texto flutuante de status ("Envenenado!", "Acordou"). Reusa o mesmo efeito
// `abilityName` do nome do golpe: o jogador precisa VER o status entrando e
// saindo, senao o POKE simplesmente para de agir sem explicacao — e o tipo de
// coisa que le como travamento do jogo.
function anunciarStatus(world: WorldState, alvo: WorldEntity, tipo: StatusCondition, quando: 'entrou' | 'saiu' = 'entrou'): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: quando === 'entrou' ? `${nomeDoStatus(tipo)}!` : `${nomeDoStatus(tipo)} passou`,
    color: corDoStatus(tipo),
    duration: 0.8,
    owner: alvo,
  }))
}

// Texto flutuante de mudanca de atributo ("Ataque ↑↑", "Defesa ↓").
// Uma seta por estagio: e o mesmo vocabulario dos jogos, e diz de relance se o
// golpe subiu um ou dois.
const ROTULO_DE_STAT: Record<string, string> = {
  atkFis: 'Ataque', atkEsp: 'Atq. Esp.', def: 'Defesa', defEsp: 'Def. Esp.', speed: 'Velocidade',
  accuracy: 'Precisão', evasion: 'Evasão',
}

function anunciarEstagios(world: WorldState, alvo: WorldEntity, mudancas: StatChange[]): void {
  const texto = mudancas
    .map((m) => `${ROTULO_DE_STAT[m.stat] ?? m.stat} ${(m.estagios > 0 ? '↑' : '↓').repeat(Math.abs(m.estagios))}`)
    .join('  ')
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: texto,
    color: mudancas[0].estagios > 0 ? '#4ade80' : '#fb7185',
    duration: 0.9,
    owner: alvo,
  }))
}

// Aparece o nome do golpe logo abaixo do usuario no instante em que e
// usado — separado do numero de dano de queueHit, que so aparece quando o
// hit realmente pousa HIT_LAND_DELAY segundos depois.
function announceAbility(world: WorldState, attacker: WorldEntity, ability: Ability): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: attacker.x, y: attacker.y,
    targetX: attacker.x, targetY: attacker.y + getGroundOffset(attacker) + 14,
    text: ability.name,
    color: colorForType(ability.type),
    duration: 0.8,
    owner: attacker,
  }))
}

// Mira de AOE precisa alcancar todo inimigo vivo dentro do raio real do
// splash, nao so os que ja estao a distancia de toque melee
// (`engagedEnemies` — o pool que updateCombat usa so pra decidir se o
// jogador pode agir). Bug relatado explicitamente: com um raio de AOE de
// 240 unidades mas alvos pegos so de engagedEnemies (~raio+raio+10), o
// splash nunca alcancava alem de qualquer inimigo unico ja tocando o
// jogador — o raio grande nao tinha efeito real nenhum.
function nearbyAliveEnemies(world: WorldState): EnemyEntity[] {
  return world.enemies.filter((e) => !isDead(e))
}

/**
 * O status deixa este POKE agir agora? Roda ANTES de escolher o golpe, como
 * nos jogos: sono, congelamento e paralisia comem o turno inteiro, e a
 * confusao troca o golpe por uma pancada em si mesmo.
 *
 * Consome o cooldown global mesmo quando o turno e perdido. Sem isso um POKE
 * dormindo tentaria agir a cada frame e o sono viraria um sorteio de 60 vezes
 * por segundo em vez de um por turno.
 */
/**
 * O golpe errou?
 *
 * A precisao existia no catalogo desde a migracao pro Ultra Sun, mas nao era
 * emitida pro cliente nem usada — todo golpe sempre acertava. Passa a valer
 * agora porque sem ela o status nao tem como ser fiel: Hypnosis com 60% de
 * precisao e Sing com 55% viram sono garantido, e um golpe de sono garantido
 * desequilibra o combate inteiro.
 *
 * UM sorteio por USO, nao por alvo. Nos jogos, um golpe de area rola precisao
 * contra cada alvo; aqui o AOE ja e uma aproximacao (raio em pixels, sem
 * posicionamento de batalha), e rolar por alvo so somaria variancia invisivel
 * a uma mecanica que o jogador nem ve alvo a alvo.
 *
 * PRECISAO EFETIVA leva em conta os estagios de Precisao do atacante e Evasao
 * do defensor (Areia-Fina, Fumaca, Duplo Time, ...) — formula real dos jogos,
 * base 3 (`multiplicadorDeAccuracyOuEvasion`), NAO a formula generica de
 * estagio (base 2) que atkFis/def usam. Precisao do atacante SOBE a chance de
 * acerto; Evasao do defensor DESCE. Foresight/Miracle Eye (`revelado`) fazem o
 * defensor ignorar a propria Evasao contra este atacante.
 *
 * Hustle (Fase 12): +50% de Ataque Fisico custa -20% de precisao nos golpes
 * FISICOS do proprio portador — aplicado ANTES dos estagios de accuracy/evasao.
 */
function golpeErrou(
  rng: Rng, ability: Ability, atacante: WorldEntity, defensor: WorldEntity,
  clima: ClimaTipo | null = null,
): boolean {
  const { atacante: traitAtk, defensor: traitDef } = traitsDoConfronto(atacante, defensor)

  // NO GUARD, dos DOIS lados: nos jogos ela garante acerto tanto dos golpes
  // DELA quanto dos golpes CONTRA ela — e uma faca de dois gumes, nao um buff.
  if (traitAtk === TRAIT_NO_GUARD || traitDef === TRAIT_NO_GUARD) return false

  const isPhysical = resolveAbilityCategory(ability, atacante.poke) === 'physical'
  // Compound Eyes (1.3x) e Hustle (-20% no fisico) vivem na mesma funcao pura.
  let precisaoBase = (ability.accuracy ?? 100) * multiplicadorDePrecisaoPorTrait(traitAtk, isPhysical)
  // WONDER SKIN: golpe SEM DANO contra o portador cai pra 50% fixos — o
  // "exatamente 50%" da descricao e um TETO, entao golpe de 30% de precisao
  // continua com 30%.
  if (traitDef === 'wonder_skin' && ability.power <= 0) {
    precisaoBase = Math.min(precisaoBase, WONDER_SKIN_PRECISAO)
  }

  const multAtacante = multiplicadorDeAccuracyOuEvasion(atacante.estagios.accuracy ?? 0)
  // KEEN EYE e UNAWARE ignoram a Evasao do alvo — a primeira por regra propria,
  // a segunda porque evasao E estagio de atributo do oponente. Mesmo efeito
  // que `revelado` (Foresight/Odor Sleuth) ja tinha.
  const ignoraEvasao = defensor.revelado || (traitAtk != null && TRAIT_IGNORA_EVASAO.has(traitAtk))
  let multDefensor = ignoraEvasao ? 1 : multiplicadorDeAccuracyOuEvasion(defensor.estagios.evasion ?? 0)
  if (!ignoraEvasao) {
    // SAND VEIL / SNOW CLOAK: 1.25x de evasao no clima certo.
    if (traitDef && EVASAO_POR_CLIMA[traitDef] && EVASAO_POR_CLIMA[traitDef] === clima) multDefensor *= 1.25
    // TANGLED FEET: evasao DOBRADA enquanto o portador esta confuso — a
    // habilidade transforma o proprio atrapalho em esquiva.
    if (traitDef === TRAIT_TANGLED_FEET && defensor.statusVolatil?.tipo === 'confusion') multDefensor *= 2
  }

  const precisaoEfetiva = precisaoBase * multAtacante / multDefensor
  if (precisaoEfetiva >= 100) return false
  return nextFloat(rng) * 100 >= precisaoEfetiva
}

function anunciarErro(world: WorldState, atacante: WorldEntity): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: atacante.x, y: atacante.y,
    targetX: atacante.x, targetY: atacante.y + getGroundOffset(atacante) + 14,
    text: 'Errou!',
    color: '#94a3b8',
    duration: 0.7,
    owner: atacante,
  }))
}

function statusImpedeAcao(world: WorldState, entity: WorldEntity, silent: boolean): boolean {
  const r = tentarAgir(world.rng, entity, (poder) => danoDeConfusao(entity, poder))
  if (r.agir) return false

  startGlobalCooldown(entity, MIN_ACTION_GAP)
  if (r.autoDano != null && r.autoDano > 0) {
    takeDamage(entity, r.autoDano, 'physical')
    if (!silent) spawnDamageNumber(world, entity, { amount: r.autoDano, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
  }
  if (!silent) anunciarStatus(world, entity, r.motivo)
  return true
}

function executePlayerAction(world: WorldState, player: PlayerEntity, engagedEnemies: EnemyEntity[], silent: boolean): void {
  if (!canAct(player)) return
  if (statusImpedeAcao(world, player, silent)) return

  const primaryTarget = engagedEnemies[0]
  const allEnemies = nearbyAliveEnemies(world)
  const ability = pickAbility(world, player, primaryTarget, (a) =>
    allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (a.radius ?? 0)).length,
  )
  if (!ability) return

  // Registrado no momento da ESCOLHA, nao do acerto: nos jogos o "ultimo
  // golpe usado" (o que Spite/Disable/Encore leem) e fixado quando o golpe e
  // usado, PP gasto ou nao, golpe acertando ou nao. Ataque Basico fica de
  // fora -- e o Struggle deste jogo, nao um golpe de moveset de verdade.
  if (ability.id !== BASIC_ATTACK.id) player.lastUsedAbilityId = ability.id

  registrarUsoParaProtecao(player, ability)
  startCooldown(player, ability.id, scaledCooldown(ability, velocidadeEfetiva(player, world.clima?.tipo ?? null)))
  startGlobalCooldown(player, MIN_ACTION_GAP)
  triggerAttackAnim(player, ability.target === 'aoe', primaryTarget)
  announceAbility(world, player, ability)

  // Lock-On/Mind Reader (Fase 12): garantia de acerto e "uma vez, contra
  // aquele alvo especifico" — consumida aqui, acerte ou nao precisasse do
  // sorteio, exatamente como nos jogos (o proximo golpe usado contra o alvo
  // marcado e o unico que se beneficia).
  const miraGarantida = player.miraGarantidaAlvoId != null && player.miraGarantidaAlvoId === primaryTarget?.id
  if (miraGarantida) player.miraGarantidaAlvoId = null
  if (!miraGarantida && golpeErrou(world.rng, ability, player, primaryTarget, world.clima?.tipo ?? null)) {
    if (!silent) anunciarErro(world, player)
    return
  }

  const targets = ability.target === 'aoe'
    ? allEnemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= (ability.radius ?? 0))
    : [engagedEnemies[0]].filter(Boolean)

  // Dano real primeiro, visual/recoil de AOE depois (PH-10): os dois pousam
  // no MESMO tick (mesmo timer), mas `landed` processa na ordem de insercao
  // e `resolveHit` cancela um hit inteiro se o atacante ja estiver morto
  // (guard contra acao enfileirada antes de um desmaio anterior). Recoil de
  // Explosao/Autodestruicao mata o proprio atacante — enfileirado antes dos
  // hits de dano real, o guard cancelava o dano no(s) alvo(s) sempre que o
  // recoil terminava de matar quem usou o golpe.
  for (const target of targets) {
    queueHit(world, player, target, ability)
  }
  if (ability.target === 'aoe') queueAoeVisual(world, player, ability)
}

function executeEnemyAction(world: WorldState, enemy: EnemyEntity, player: PlayerEntity, silent: boolean): void {
  // Boneco de treino (data/trainingDummy.ts, `HuntMapDef.passiveEnemies`):
  // NUNCA revida. Apanha a distancia inteira (IVs de ataque no minimo,
  // ver TREINO_IVS) nao bastava — medido AO VIVO nesta leva, um Wobbuffet
  // Lv60 desmaiou um Charmander Lv2 de 11 HP com o proprio Ataque Basico so
  // pelo tamanho do gap de nivel na formula de dano (o termo de nivel pesa
  // mais que o ATK quase zerado). "Seguro pra qualquer time" so fica
  // verdadeiro travando o ataque aqui, nao ajustando atributo.
  if (world.mapDef?.passiveEnemies) return
  if (!canAct(enemy)) return
  if (statusImpedeAcao(world, enemy, silent)) return

  const ability = pickAbility(world, enemy, player, () => 1) // inimigos so miram no jogador unico
  if (!ability) return

  // Mesma logica de executePlayerAction acima -- registrado na escolha, nao
  // no acerto.
  if (ability.id !== BASIC_ATTACK.id) enemy.lastUsedAbilityId = ability.id

  registrarUsoParaProtecao(enemy, ability)
  startCooldown(enemy, ability.id, scaledCooldown(ability, velocidadeEfetiva(enemy, world.clima?.tipo ?? null)))
  startGlobalCooldown(enemy, MIN_ACTION_GAP)
  triggerAttackAnim(enemy, ability.target === 'aoe', player)
  announceAbility(world, enemy, ability)

  const miraGarantida = enemy.miraGarantidaAlvoId != null && enemy.miraGarantidaAlvoId === player.id
  if (miraGarantida) enemy.miraGarantidaAlvoId = null
  if (!miraGarantida && golpeErrou(world.rng, ability, enemy, player, world.clima?.tipo ?? null)) {
    if (!silent) anunciarErro(world, enemy)
    return
  }

  // Mesma ordem de executePlayerAction acima — dano real antes do recoil de
  // AOE (PH-10).
  queueHit(world, enemy, player, ability)
  if (ability.target === 'aoe') queueAoeVisual(world, enemy, ability)
}

// Credita a morte de `entity` pelo mesmo caminho que qualquer outra —
// recoil de Explosao, Rough Skin/Iron Barbs, Aftermath, drenagem negativa,
// Destiny Bond. Helper pra nao repetir o mesmo par de ifs em cada ponto do
// hit que pode matar alguem fora do dano principal.
function creditarMorteSeNecessario(entity: WorldEntity, defeatedEnemyIds: string[], onPlayerFainted: () => void): void {
  if (!isDead(entity)) return
  if (entity.kind === 'player') {
    if (!entity.fainted) {
      entity.fainted = true
      onPlayerFainted()
    }
  } else if (!entity.deathHandled) {
    entity.deathHandled = true
    defeatedEnemyIds.push(entity.id)
  }
}

// Golpes de suporte da Fase 12 cujo "alvo" na fila de hits deste motor
// (`hit.targetId`) e so um inimigo pra fila TER alguem — o efeito de
// verdade e todo no proprio usuario (Endure, Protect/Detect, Destiny Bond,
// Rest, Belly Drum, Acupressure, Aromatherapy/Heal Bell) ou nao mira
// ninguem de verdade (Haze e campo inteiro; Psych Up, por regra dos jogos
// reais, ignora Protect). Protect/Detect do ALVO nao bloqueia nenhum
// destes — mesma excecao dos jogos reais pro Psych Up, generalizada pros
// golpes de auto-alvo deste catalogo.
const PROTECT_BYPASS_ABILITY_IDS = new Set([
  'endure', 'protect', 'detect', 'destiny_bond', 'rest', 'belly_drum',
  'acupressure', 'aromatherapy', 'heal_bell', 'haze', 'psych_up',
  'perish_song', 'rage_powder',
])

// Alem da lista acima, qualquer golpe pre-existente que ja mirava o proprio
// usuario (Danca das Espadas, Recover, ...) tambem nao e "recebido" por quem
// tem Protect ativo — ele nunca tocou no alvo pra comecar.
function golpeAtingeOAlvo(ability: Ability): boolean {
  if (ability.statTarget === 'self') return false
  if (ability.healPercent) return false
  if (PROTECT_BYPASS_ABILITY_IDS.has(ability.id)) return false
  return true
}

function anunciarProtegido(world: WorldState, alvo: WorldEntity): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: 'Protegido!',
    color: '#94a3b8',
    duration: 0.7,
    owner: alvo,
  }))
}

/**
 * "Falhou!" — o golpe foi usado, gastou o turno e nao surtiu efeito. Hoje so o
 * sorteio de uso consecutivo de Protect/Detect/Endure produz isso.
 */
function anunciarFalhou(world: WorldState, alvo: WorldEntity): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: 'Falhou!',
    color: '#94a3b8',
    duration: 0.7,
    owner: alvo,
  }))
}

function anunciarAguentou(world: WorldState, alvo: WorldEntity): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: 'Aguentou!',
    color: '#facc15',
    duration: 0.7,
    owner: alvo,
  }))
}

function anunciarPereceu(world: WorldState, alvo: WorldEntity): void {
  world.effects.push(createWorldEffect(world.counters, {
    type: 'abilityName',
    x: alvo.x, y: alvo.y,
    targetX: alvo.x, targetY: alvo.y + getGroundOffset(alvo) + 14,
    text: 'Perish Song!',
    color: '#c084fc',
    duration: 0.9,
    owner: alvo,
  }))
}

// Heal Block (Fase 12): dura alguns turnos, convertidos em segundos pelo
// mesmo padrao de `SEGUNDOS_DE_IMUNIDADE_APOS_CURA`.
const HEAL_BLOCK_TURNOS = 5
const HEAL_BLOCK_SEGUNDOS = HEAL_BLOCK_TURNOS * TURNO_SEGUNDOS

function curaBloqueada(entity: WorldEntity): boolean {
  return Boolean(entity.curaBloqueadaAte && entity.curaBloqueadaAte > 0)
}

// Troca os estagios de `stats` entre duas entidades (Guard Swap/Power Swap).
// `delete` em vez de setar 0 — estagio ausente e estagio 0, mas o objeto fica
// mais limpo e bate com o resto do codebase (aplicarMudancasDeStat nunca
// grava estagio 0 explicito).
function trocarEstagios(a: WorldEntity, b: WorldEntity, stats: StatDeEstagio[]): void {
  for (const stat of stats) {
    const av = a.estagios[stat]
    const bv = b.estagios[stat]
    if (bv === undefined) delete a.estagios[stat]
    else a.estagios[stat] = bv
    if (av === undefined) delete b.estagios[stat]
    else b.estagios[stat] = av
  }
}

// Aplica o dano/texto/efeito-de-golpe/tratamento-de-derrota de um hit
// enfileirado — chamado quando seu timer chega a 0, ou seja, quando a pose
// Shoot/Charge do atacante ja terminou de tocar.
function resolveHit(world: WorldState, hit: PendingHit, defeatedEnemyIds: string[], onPlayerFainted: () => void, silent: boolean): void {
  const attacker = findEntityById(world.player, world.enemies, hit.attackerId)
  if (!attacker) return
  const { ability } = hit

  // Bug relatado explicitamente: um POKE derrotado entre o enfileiramento
  // de um hit (pose de ataque comeca) e o hit realmente pousar
  // (HIT_LAND_DELAY depois) ainda causava dano. Um atacante desmaiado/morto
  // nao pode mais concretizar nada que enfileirou antes de morrer — cancela
  // a acao inteira, dano incluso.
  if (isDead(attacker)) return

  if (hit.isAoeVisual) {
    // O unico anel deste cast AOE, centrado no atacante — ver
    // queueAoeVisual. Hits individuais por-alvo abaixo pulam desenhar o
    // proprio. Pulado em silent (PH-11): farm offline/flush headless roda
    // isto ate 250k vezes por chamada sem ninguem renderizando.
    if (!silent) {
      world.effects.push(createWorldEffect(world.counters, {
        type: 'abilityEffect',
        x: attacker.x, y: attacker.y,
        targetX: attacker.x, targetY: attacker.y - attacker.radius * 0.6,
        color: colorForType(ability.type),
        isAoe: true,
        duration: !isDamagingAbility(ability) ? STATUS_VFX_DURATION : AOE_EFFECT_DURATION,
        worldSize: (ability.radius ?? 0) * 2,
        elementType: ability.type,
        abilityId: ability.id,
        // Anel unico do cast AOE inteiro (nao um por alvo) — gate por
        // `power === 0` aqui e o mais fino que da pra fazer sem duplicar
        // a checagem de sucesso por alvo (statusVaiPegar corre depois, por
        // hit individual). Golpe de status em area troca pra arte de
        // buff/debuff mesmo que acerte 0 alvos de verdade — mesmo espirito
        // do resto do jogo, que mostra a animacao do golpe independente do
        // resultado (ver announceAbility).
        statusDirection: !isDamagingAbility(ability) ? direcaoDoGolpeDeStatus(ability.statChanges) : undefined,
      }))
    }

    // DAMP: "enquanto o Pokemon estiver EM CAMPO" — por isso a varredura no
    // mundo inteiro e nao no par atacante/alvo. Este ramo e o do anel visual da
    // Explosao, que roda uma vez por uso e ainda nao tem alvo nenhum resolvido.
    //
    // O que fica de fora do fiel: a habilidade real cancela o golpe INTEIRO, e
    // aqui os hits por alvo ja pousaram quando este ramo roda. O que da pra
    // impedir sem reescrever a ordem da fila e o auto-KO de quem usou, que e a
    // parte que muda o resultado da luta.
    const alguemComDamp = [world.player, ...world.enemies].some(
      (e) => e && !isDead(e) && traitDoPoke(e.poke) === TRAIT_DAMP,
    )
    if (SELF_DESTRUCT_ABILITY_KEYS.has(ability.id) && !isDead(attacker) && !alguemComDamp) {
      const recoil = Math.round(attacker.poke.hp * SELF_DESTRUCT_HP_LOSS_PERCENT)
      takeDamage(attacker, recoil)
      if (!silent) spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      if (isDead(attacker)) {
        if (attacker.kind === 'player') {
          if (!attacker.fainted) {
            attacker.fainted = true
            onPlayerFainted()
          }
        } else if (!attacker.deathHandled) {
          attacker.deathHandled = true
          defeatedEnemyIds.push(attacker.id)
        }
      }
    }
    return
  }

  const alvoDoHit = findEntityById(world.player, world.enemies, hit.targetId)
  if (!alvoDoHit || isDead(alvoDoHit)) return // ex: um aliado de AOE ja tinha finalizado antes

  // SOUNDPROOF: imune a golpe de SOM, seja ele de dano ou de status. Antes de
  // qualquer outro guard porque a habilidade cancela o golpe inteiro, e nao
  // uma parte dele.
  if (traitDoPoke(alvoDoHit.poke) === 'soundproof' && ehGolpeDeSom(ability.id)) return

  // MAGIC BOUNCE: golpe SEM DANO volta pra quem usou. Modelado como troca de
  // alvo (o resto de `resolveHit` roda inteiro, so que com os papeis
  // invertidos) — e o efeito observavel exato, e evita duplicar o pipeline de
  // status/estagio num ramo proprio.
  //
  // O guard `golpeAtingeOAlvo` e o mesmo do Protect: golpe de auto-alvo (Danca
  // das Espadas, Recover) nunca mirou o oponente, entao nao ha o que refletir.
  // Sem ele, um Recover do inimigo "refletiria" e curaria o jogador.
  const refletido = ability.power <= 0
    && golpeAtingeOAlvo(ability)
    && traitDoPoke(alvoDoHit.poke) === TRAIT_MAGIC_BOUNCE
    && alvoDoHit.id !== attacker.id
  const target = refletido ? attacker : alvoDoHit
  if (isDead(target)) return

  // Wide Guard: escudo do ALVO cancela o hit de AREA inteiro nele — sem dano,
  // sem efeito colateral, como se o golpe nunca tivesse pousado. So mexe em
  // AOE (`ability.target === 'aoe'`); golpe de alvo unico passa direto, igual
  // aos jogos reais (Wide Guard nao bloqueia golpe single-target).
  if (ability.target === 'aoe' && (target.escudos?.wideGuard ?? 0) > 0) return

  // PROTECT/DETECT (Fase 12): bloqueia o hit INTEIRO — dano, status, estagio
  // — exceto os golpes de auto-alvo que nunca miraram o `target` de verdade
  // (ver golpeAtingeOAlvo). Consumida por este hit, bloqueado ou nao seria o
  // caso de bloquear.
  if (target.protegida && golpeAtingeOAlvo(ability)) {
    target.protegida = false
    if (!silent) anunciarProtegido(world, target)
    return
  }

  const result = computeDamage(world.rng, attacker, target, ability, world.pessimista, world.clima?.tipo ?? null)

  // ENDURE / STURDY (Fase 12): sobrevive com 1 HP num golpe que mataria.
  // Endure e um golpe (flag consumida no proximo hit recebido, mate ele ou
  // nao); Sturdy e a MESMA mecanica sempre ativa via Trait, mas so em HP
  // CHEIO — perde o efeito no primeiro hit que ja tirou HP, igual ao
  // Multiscale acima.
  let danoFinal = result.amount
  const enduraGolpe = target.enduraAtiva === true
  if (enduraGolpe) target.enduraAtiva = false
  const sturdyTrait = !enduraGolpe
    && traitDoPoke(target.poke) === 'sturdy'
    && target.poke.hp === target.poke.stats.hp
  const aguentou = (enduraGolpe || sturdyTrait) && danoFinal >= target.poke.hp && target.poke.hp > 0
  if (aguentou) danoFinal = target.poke.hp - 1

  // Dano REALMENTE causado, limitado ao HP que o alvo tinha. `result.amount` e
  // o numero cru da formula e pode passar MUITO do HP do alvo (um POKE Nivel 85
  // batendo num Nivel 40 causa varias vezes a vida dele). E o que dreno e recuo
  // precisam usar, como nos jogos: Double-Edge devolve 33% do que TIROU, nao
  // 33% do que teria tirado num alvo infinito.
  //
  // BUG QUE ISTO CORRIGE: sem o teto, um golpe de recuo virava suicidio em
  // qualquer hunt onde o jogador estivesse acima do nivel. Medido, custava um
  // quarto das kills/hora no Nivel 85 — o POKE se matava sozinho.
  const danoCausado = Math.min(danoFinal, target.poke.hp)
  // Golpe de status causa 0 de dano — nao mostra "0" flutuando sobre o alvo
  // nem registra "ultimo dano recebido" (Counter/Mirror Coat refletiriam nada).
  if (danoFinal > 0) {
    takeDamage(target, danoFinal, resolveAbilityCategory(ability, attacker.poke))
    if (!silent) spawnDamageNumber(world, target, { ...result, amount: danoFinal })
    if (aguentou && !silent) anunciarAguentou(world, target)
  }

  // HABILIDADES QUE REAGEM A LEVAR UM HIT (Justified, Rattled, Weak Armor,
  // Anger Point, Steadfast). Todas do lado de QUEM LEVOU, todas subindo algum
  // estagio, todas so quando o hit de fato causou dano — a tabela do que sobe
  // esta em data/traitEffects.ts#REACAO_A_HIT.
  //
  // Fica DEPOIS de `takeDamage` e ANTES do tratamento de morte de proposito:
  // subir estagio num POKE que ja caiu neste hit seria buff em cadaver, e o
  // guard `!isDead(target)` cobre isso.
  if (danoFinal > 0 && !isDead(target)) {
    const traitDoAlvo = traitsDoConfronto(attacker, target).defensor
    const reacao = traitDoAlvo ? REACAO_A_HIT[traitDoAlvo] : undefined
    const ehFisico = resolveAbilityCategory(ability, attacker.poke) === 'physical'
    const tipoBate = !reacao?.tipos || reacao.tipos.includes(ability.type)
    const categoriaBate = !reacao?.soFisico || ehFisico
    // ANGER POINT so dispara em CRITICO recebido — a unica das cinco com
    // gatilho proprio, entao o `if` extra em vez de mais um campo na tabela.
    const gatilhoDeAngerPoint = traitDoAlvo !== 'anger_point' || result.isCrit
    if (reacao && tipoBate && categoriaBate && gatilhoDeAngerPoint) {
      const mudanca = aplicarEstagioUnico(target, reacao.stat as StatDeEstagio, reacao.estagios)
      if (mudanca && !silent) anunciarEstagios(world, target, [mudanca])
      // WEAK ARMOR e a unica com DOIS lados: sobe Velocidade (acima) e desce
      // Defesa (aqui). Nao cabe na tabela, que so guarda um par stat/estagio.
      if (traitDoAlvo === 'weak_armor') {
        const queda = aplicarEstagioUnico(target, 'def', -1)
        if (queda && !silent) anunciarEstagios(world, target, [queda])
      }
    }
  }

  // DESTINY BOND (Fase 12): se quem primou o vinculo morreu NESTE hit, quem
  // matou tambem morre — dano fixo = HP atual do atacante (equivale a zerar
  // o HP dele). So cobre morte por dano DIRETO deste hit (o caso comum); nao
  // persegue morte por dano residual (veneno/recoil) num tick separado —
  // simplificacao deliberada, documentada aqui em vez de tentar interceptar
  // toda chamada de takeDamage do arquivo.
  if (target.destinyBondAtiva && isDead(target)) {
    target.destinyBondAtiva = false
    const contraAtaque = attacker.poke.hp
    if (contraAtaque > 0) {
      takeDamage(attacker, contraAtaque)
      if (!silent) spawnDamageNumber(world, attacker, { amount: contraAtaque, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      creditarMorteSeNecessario(attacker, defeatedEnemyIds, onPlayerFainted)
    }
  }

  // ARMADILHA DE CAMPO (Spikes/Toxic Spikes/Stealth Rock/Sticky Web): golpe
  // sem alvo real de verdade — o "hit" acima e so o veiculo que o resto do
  // pipeline exige, o efeito de fato e incrementar o placar do lado INIMIGO
  // (`world.enemyHazards`), descarregado no proximo inimigo que nascer (ver
  // simulation.ts#aplicarHazardsAoInimigo). So o JOGADOR planta — golpeDeApoioUtil
  // acima ja restringe a IA a so considerar isto util nesse lado.
  if (ability.hazard && attacker.kind === 'player') {
    world.enemyHazards ??= { spikes: 0, toxicSpikes: 0, stealthRock: false, stickyWeb: false }
    switch (ability.hazard) {
      case 'spikes':
        world.enemyHazards.spikes = Math.min(3, world.enemyHazards.spikes + 1)
        break
      case 'toxic_spikes':
        world.enemyHazards.toxicSpikes = Math.min(2, world.enemyHazards.toxicSpikes + 1)
        break
      case 'stealth_rock':
        world.enemyHazards.stealthRock = true
        break
      case 'sticky_web':
        world.enemyHazards.stickyWeb = true
        break
    }
  }

  // HABILIDADES PASSIVAS DE PUNICAO POR CONTATO (Static, Flame Body, Poison
  // Point, Rough Skin, Aftermath, Effect Spore, Iron Barbs).
  //
  // SIMPLIFICACAO CONSCIENTE: este catalogo de golpes nao tem um campo
  // "contact"/"makesContact" como a PokeAPI real -- `ability.category ===
  // 'physical'` e usado aqui como aproximacao de "golpe de contato" (na
  // Pokedex de verdade a maioria dos golpes fisicos encosta no alvo; os
  // poucos que nao encostam ficam fora de escopo).
  //
  // A Trait pertence a quem FOI ATINGIDO (`target`) e reage contra quem
  // golpeou (`attacker`) -- como nos jogos: encostar num POKE com Static
  // pode paralisar VOCE, nao ele.
  if (ability.category === 'physical' && danoFinal > 0) {
    const trait = traitDoPoke(target.poke)
    switch (trait) {
      case 'static':
        aplicarStatus(world.rng, attacker, 'paralysis', 30)
        break
      case 'flame_body':
        aplicarStatus(world.rng, attacker, 'burn', 30)
        break
      case 'poison_point':
        aplicarStatus(world.rng, attacker, 'poison', 30)
        break
      case 'effect_spore': {
        // Golpe de po real (Spore/Stun Spore/etc) e imune pra GRASS -- aqui
        // e uma Trait, nao um golpe, entao a checagem de tipo e manual: se o
        // ATACANTE (quem receberia o status) e GRASS, nem sorteia.
        const especieAtacante = SPECIES[attacker.poke.speciesId]
        const atacanteEhGrass = especieAtacante.type === 'GRASS' || especieAtacante.type2 === 'GRASS'
        if (!atacanteEhGrass && nextFloat(world.rng) * 100 < 30) {
          const opcoes: StatusCondition[] = ['poison', 'paralysis', 'sleep']
          const escolhido = opcoes[Math.floor(nextFloat(world.rng) * opcoes.length)]
          aplicarStatus(world.rng, attacker, escolhido, 100)
        }
        break
      }
      case 'rough_skin':
      case 'iron_barbs': {
        // Sempre dispara (nao e chance) -- recoil de 1/8 do HP MAXIMO do
        // atacante, minimo 1. Mesmo guard de morte em cascata que
        // SELF_DESTRUCT_ABILITY_KEYS usa acima: se o recoil matar o
        // atacante, credita o kill/desmaio corretamente.
        const recoil = Math.max(1, Math.round(attacker.poke.stats.hp / 8))
        takeDamage(attacker, recoil)
        if (!silent) spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
        creditarMorteSeNecessario(attacker, defeatedEnemyIds, onPlayerFainted)
        break
      }
      case 'cursed_body': {
        // 30% de TRANCAR o golpe que acabou de acertar — reusa o mesmo par de
        // campos que o golpe Disable ja usa (`disabledAbilityId`/`Until`), pra
        // nao existirem dois mecanismos de "golpe trancado" no mesmo motor.
        if (nextFloat(world.rng) * 100 < CURSED_BODY_CHANCE) {
          attacker.disabledAbilityId = ability.id
          attacker.disabledAbilityUntil = DISABLE_DURATION
        }
        break
      }
      case 'aftermath': {
        // Diferente das outras: so dispara quando o ALVO (portador da
        // Trait) DESMAIA por este hit fisico. `target` ja tomou o dano
        // acima nesta mesma resolveHit, entao isDead(target) aqui reflete
        // o resultado real deste hit.
        //
        // DAMP tambem cancela Aftermath (a descricao dela cita as tres coisas:
        // Self-Destruct, Explosion e Aftermath).
        if (isDead(target) && traitDoPoke(attacker.poke) !== TRAIT_DAMP) {
          const recoil = Math.round(attacker.poke.stats.hp / 4)
          takeDamage(attacker, recoil)
          if (!silent) spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
          creditarMorteSeNecessario(attacker, defeatedEnemyIds, onPlayerFainted)
        }
        break
      }
      default:
        break
    }
  }

  // POISON TOUCH: o espelho das habilidades de contato acima — aqui quem tem a
  // habilidade e quem ATACA, e quem sofre e o alvo. 30% de veneno em golpe de
  // contato (a aproximacao deste motor: golpe fisico).
  if (ability.category === 'physical' && danoFinal > 0 && !isDead(target)
    && traitsDoConfronto(attacker, target).atacante === 'poison_touch') {
    aplicarStatus(world.rng, target, 'poison', POISON_TOUCH_CHANCE)
  }

  // Golpes de clima (Rain Dance/Sunny Day/Hail/Sandstorm): efeito de CAMPO, nao
  // de status numa entidade -- sobrescreve o clima atual (last-caster-wins,
  // sem empilhar) e passa a afetar os dois lados do combate dali em diante.
  // Fora do `if (!isDead(target))` de proposito: poder 0, nunca mata ninguem,
  // e o efeito nao depende do alvo ter sobrevivido.
  const climaDoGolpe = CLIMA_DO_GOLPE[ability.id]
  if (climaDoGolpe) {
    world.clima = { tipo: climaDoGolpe, turnosRestantes: 5 }
  }

  // Efeito de status DEPOIS do dano, como nos jogos: um golpe que mata nao
  // chega a envenenar. `aplicarEfeitosDoGolpe` tambem descongela o alvo quando
  // o golpe e de FIRE.
  //
  // `statusRecebeuEm` guarda quem de fato recebeu ALGUM efeito (pra decidir,
  // logo abaixo, se mostra o VFX de status e em cima de quem) — nao existia
  // antes desta leva porque nada fora deste `if` precisava saber.
  let statusRecebeuEm: WorldEntity | null = null
  if (!isDead(target)) {
    // SHIELD DUST (alvo) apaga o efeito SECUNDARIO do golpe; SERENE GRACE
    // (atacante) dobra a chance dele. As duas mexem no MESMO campo, entao a
    // forma mais honesta e montar a versao do golpe que de fato vai valer
    // neste hit, em vez de espalhar os dois testes por dentro de
    // `aplicarEfeitosDoGolpe`/`aplicarMudancasDeStat` (que sao compartilhados
    // com o caminho de golpe de status puro, onde nenhuma das duas se aplica).
    const traits = traitsDoConfronto(attacker, target)
    const secundario = temEfeitoSecundario(ability)
    let abilityEfetiva = ability
    if (secundario && traits.defensor === TRAIT_SHIELD_DUST) {
      abilityEfetiva = { ...ability, statusChance: 0, statChance: 0, flinchChance: 0 }
    } else if (secundario && traits.atacante === TRAIT_SERENE_GRACE) {
      abilityEfetiva = {
        ...ability,
        statusChance: Math.min(100, (ability.statusChance ?? 0) * 2),
        statChance: Math.min(100, (ability.statChance ?? 0) * 2),
      }
    }
    const aplicado = aplicarEfeitosDoGolpe(world.rng, target, abilityEfetiva, world.clima?.tipo ?? null)
    if (aplicado) {
      statusRecebeuEm = target
      if (!silent) anunciarStatus(world, target, aplicado.tipo, 'entrou')

      // Synchronize (Fase 12): se quem RECEBEU o status tem a Trait, o
      // ATACANTE (quem aplicou) leva o mesmo de volta — so pros tres status
      // que o jogo real cobre (poison/paralysis/burn; sleep e freeze ficam de
      // fora mesmo nos jogos). `aplicarStatus` de novo, nao um assignment
      // direto: o atacante ainda pode ser imune por tipo/trait/ja ter status.
      if (
        (aplicado.tipo === 'poison' || aplicado.tipo === 'paralysis' || aplicado.tipo === 'burn')
        && traitDoPoke(target.poke) === 'synchronize'
      ) {
        aplicarStatus(world.rng, attacker, aplicado.tipo, 100)
      }
    }

    // Mudanca de atributo. O anuncio vai em quem RECEBEU (o proprio usuario num
    // Danca das Espadas, o alvo num Rosnado) — mostrar "+Ataque" flutuando
    // sobre o inimigo quando quem se fortaleceu foi voce leria como o contrario
    // do que aconteceu.
    const mudancas = aplicarMudancasDeStat(world.rng, attacker, target, abilityEfetiva)
    if (mudancas.length) {
      statusRecebeuEm = ability.statTarget === 'self' ? attacker : target
      if (!silent) anunciarEstagios(world, statusRecebeuEm, mudancas)
    }

    // Odor Sleuth/Foresight/Miracle Eye: ignora UMA imunidade natural de tipo
    // do ALVO pelo resto da luta — sem timer, so `limparEstadoVolatil` (fim
    // de luta) tira. Generico por id (mesmo golpe novo que entrar no mapa
    // funciona sem tocar aqui de novo) — ver REVELA_IMUNIDADE.
    const imunidadeRevelada = REVELA_IMUNIDADE[ability.id]
    if (imunidadeRevelada) target.revelado = imunidadeRevelada

    // Magnet Rise: self-target, ~5 turnos de imunidade a GROUND. Golpe de
    // status sem statChanges (nao passa por aplicarMudancasDeStat acima) —
    // por isso o id do golpe e checado direto, mesmo padrao do bloco acima.
    if (ability.id === 'magnet_rise') {
      attacker.imuneAoTipoVolatil = { tipo: 'GROUND', restante: MAGNET_RISE_TURNOS * TURNO_SEGUNDOS }
    }

    // Golpes de disable/lock (Taunt/Spite/Disable/Encore/Torment). Depois do
    // dano, como o resto dos efeitos colaterais acima: golpe que mata nao
    // chega a travar nada. Spite/Disable/Encore agem sobre o ULTIMO golpe que
    // o ALVO usou (`target.lastUsedAbilityId`) -- se o alvo nunca usou nenhum
    // golpe ainda, o efeito falha em silencio, sem VFX (mesmo espirito de
    // statusVaiPegar acima: nao ha "acertou nada" pra anunciar).
    switch (ability.id) {
      case 'taunt':
        // OBLIVIOUS: "previne atracao e protege contra Captivate" nos jogos —
        // e, desde a Gen VI, tambem contra Taunt. Atracao e Captivate nao
        // existem neste motor; Taunt existe, e e a parte da descricao que da
        // pra honrar.
        if (traitDoPoke(target.poke) !== TRAIT_OBLIVIOUS) {
          target.silenciadoAte = TAUNT_DURATION
          statusRecebeuEm = target
        }
        break
      case 'torment':
        target.tormentedUntil = TORMENT_DURATION
        statusRecebeuEm = target
        break
      case 'spite': {
        const golpeAnterior = target.lastUsedAbilityId
        if (golpeAnterior) {
          target.cooldowns[golpeAnterior] = (target.cooldowns[golpeAnterior] ?? 0) + SPITE_COOLDOWN_BONUS
          statusRecebeuEm = target
        }
        break
      }
      case 'disable': {
        const golpeAnterior = target.lastUsedAbilityId
        if (golpeAnterior) {
          target.disabledAbilityId = golpeAnterior
          target.disabledAbilityUntil = DISABLE_DURATION
          statusRecebeuEm = target
        }
        break
      }
      case 'encore': {
        const golpeAnterior = target.lastUsedAbilityId
        if (golpeAnterior) {
          target.forcedAbilityId = golpeAnterior
          target.forcedAbilityUntil = ENCORE_DURATION
          statusRecebeuEm = target
        }
        break
      }
      default:
        break
    }

    // LEECH_SEED / NIGHTMARE: setam flag volatil no ALVO, sem timer —
    // tickada por tickStatus (statusSystem.ts) a cada turno DELE. Nenhum dos
    // dois usa o sistema de `ability.status` do catalogo (paralysis/poison/
    // etc), entao a aplicacao e toda custom aqui, no mesmo espirito do resto
    // desta secao.
    if (ability.id === 'leech_seed' && !target.seeded) {
      const especieAlvo = SPECIES[target.poke.speciesId]
      const alvoEhGrass = especieAlvo.type === 'GRASS' || especieAlvo.type2 === 'GRASS'
      if (!alvoEhGrass) target.seeded = { sourceId: attacker.id }
    }
    if (ability.id === 'nightmare') target.nightmareDot = true
  }

  // FOCUS ENERGY (self-target): soma +2 num contador PARALELO de estagio de
  // critico (`estagioDeCritico`, ver types.ts), que persiste ate fim de luta
  // sem timer proprio — igual `estagios`, mas NAO e um deles (aqueles estao
  // presos aos 5 stats do catalogo gerado). Consumido pela formula de critico
  // em computeDamage.
  if (ability.id === 'focus_energy') {
    attacker.estagioDeCritico = (attacker.estagioDeCritico ?? 0) + 2
  }

  // LASER FOCUS (self-target): seta a flag de uso unico que garante critico
  // no PROXIMO golpe de DANO deste atacante (ver computeDamage, que consome a
  // flag). Nada acontece aqui alem de setar a flag — o bypass e a chance
  // moram todos no calculo de dano.
  if (ability.id === 'laser_focus') {
    attacker.proximoGolpeCriticoGarantido = true
  }

  // CURA PURA (Recover, Synthesis, Soft-Boiled — 10 golpes). Cura sempre o
  // ATACANTE, nunca o alvo do hit: todos eles tem `target: 'user'` no catalogo,
  // e o "alvo" so existe aqui porque a fila de hits deste motor sempre tem um.
  // Heal Block (Fase 12) trava isto: nao cura nada enquanto ativo.
  if (ability.healPercent && !curaBloqueada(attacker)) {
    const quanto = Math.max(1, Math.round(attacker.poke.stats.hp * ability.healPercent / 100))
    heal(attacker, quanto)
    if (!silent) spawnDamageNumber(world, attacker, { amount: -quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
  }

  // ESCUDOS (Screens: Reflect/Light Screen/Safeguard/Mist/Lucky Chant/Wide
  // Guard). Mesma logica de "self-target" da cura pura acima: liga o timer no
  // proprio ATACANTE, nunca no `target` do hit — ver ESCUDO_ABILITIES no topo
  // do arquivo pro porque disso.
  const chaveDeEscudo = ESCUDO_ABILITIES[ability.id]
  if (chaveDeEscudo) {
    attacker.escudos ??= {}
    attacker.escudos[chaveDeEscudo] = ESCUDO_DURACAO_SEGUNDOS
  }

  // CURSE (variante Ghost): custa 50% do PROPRIO HP MAXIMO do atacante
  // (CURSE_SELF_MAX_HP_LOSS_PERCENT — variante de SELF_DESTRUCT_HP_LOSS_PERCENT
  // com HP maximo em vez de atual). Gate por tipo GHOST ja filtra em
  // pickAbility/candidateIds; repetido aqui como defesa — se por algum motivo
  // um curse escapar do filtro (ex.: chamado direto num teste), fizzla
  // silenciosamente em vez de aplicar o efeito errado num atacante nao-Ghost.
  if (ability.id === 'curse') {
    const especieAtacante = SPECIES[attacker.poke.speciesId]
    const atacanteEhGhost = especieAtacante.type === 'GHOST' || especieAtacante.type2 === 'GHOST'
    if (atacanteEhGhost && !isDead(attacker)) {
      const custo = Math.max(1, Math.round(attacker.poke.stats.hp * CURSE_SELF_MAX_HP_LOSS_PERCENT))
      takeDamage(attacker, custo)
      if (!silent) spawnDamageNumber(world, attacker, { amount: custo, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      if (!isDead(target)) target.curseDot = true
      if (isDead(attacker)) {
        if (attacker.kind === 'player') {
          if (!attacker.fainted) {
            attacker.fainted = true
            onPlayerFainted()
          }
        } else if (!attacker.deathHandled) {
          attacker.deathHandled = true
          defeatedEnemyIds.push(attacker.id)
        }
      }
    }
  }

  // INGRAIN / AQUA RING: mesmo campo `regenPercent` pros dois (HoT self-target
  // sem timer, dura ate o fim da luta — ver limparEstadoVolatil).
  if (ability.id === 'ingrain' || ability.id === 'aqua_ring') {
    attacker.regenPercent = INGRAIN_AQUA_RING_REGEN_PERCENT
  }

  // WISH: enfileira uma cura atrasada 2 turnos, MESMO PADRAO de pendingHits
  // (tick down em updateCombat, resolve quando timer<=0, lookup por id em vez
  // de referencia direta). `targetId` e o id da ENTIDADE que lancou (nao do
  // poke): world.player mantem o mesmo id mesmo trocando de poke ativo por
  // desmaio (autoSwitchTeamOnFaint em simulation.ts so troca `player.poke`).
  if (ability.id === 'wish') {
    const healAmount = Math.max(1, Math.round(attacker.poke.stats.hp * WISH_HEAL_PERCENT))
    world.pendingWishes.push({ timer: 2 * TURNO_SEGUNDOS, healAmount, targetId: attacker.id })
  }

  // FLINCH: o alvo perde o proximo turno.
  //
  // DESVIO CONSCIENTE. Nos jogos flinch so pega se quem usou agir PRIMEIRO no
  // turno — aqui nao ha ordem de turno pra consultar, o combate e continuo.
  // Modelado como "o alvo leva um cooldown global extra", que e o efeito
  // observavel do flinch. Mais fiel que ignorar (25 golpes voltariam a ser
  // dado morto) e mais honesto que fingir uma ordem de turno que nao existe.
  //
  // Inner Focus (Fase 12): imune a flinch — nunca perde o turno por isto.
  //
  // STENCH da 10% de flinch a QUALQUER golpe de quem a tem — somado a chance
  // do proprio golpe, nao substituindo. SERENE GRACE dobra a chance do golpe
  // (nao a do Stench, que nao e "efeito secundario do golpe"). SHIELD DUST do
  // lado do alvo apaga o efeito secundario, e flinch e um.
  {
    const { atacante: traitAtk, defensor: traitDef } = traitsDoConfronto(attacker, target)
    const chanceDoGolpe = (ability.flinchChance ?? 0) * (traitAtk === TRAIT_SERENE_GRACE ? 2 : 1)
    const chanceDoStench = danoFinal > 0 && traitAtk === 'stench' ? STENCH_FLINCH_CHANCE : 0
    const chance = Math.max(chanceDoGolpe, chanceDoStench)
    const bloqueadoPorShieldDust = traitDef === TRAIT_SHIELD_DUST && chanceDoGolpe > 0 && chanceDoStench === 0
    if (
      chance > 0 && !bloqueadoPorShieldDust
      && nextFloat(world.rng) * 100 < chance
      && traitDef !== 'inner_focus'
    ) {
      startGlobalCooldown(target, MIN_ACTION_GAP)
      // STEADFAST: cada flinch sofrido vira +1 de Velocidade. A habilidade
      // transforma a punicao em buff, e por isso mora aqui dentro e nao num
      // bloco proprio — ela precisa do flinch ter DE FATO acontecido.
      if (traitDef === TRAIT_STEADFAST) {
        const mudanca = aplicarEstagioUnico(target, 'speed', 1)
        if (mudanca && !silent) anunciarEstagios(world, target, [mudanca])
      }
    }
  }

  // DRENO e RECUO, os dois no mesmo campo: `drainPercent` positivo cura o
  // atacante (Absorb = 50% do dano causado), negativo machuca (Double-Edge =
  // -33%). E como a PokeAPI modela, e manter os dois juntos evita que um golpe
  // de recuo passe a curar por engano de sinal. Heal Block so trava o lado
  // POSITIVO (e cura); o recuo negativo continua machucando normalmente.
  if (ability.drainPercent && danoCausado > 0) {
    const quanto = Math.max(1, Math.round(danoCausado * Math.abs(ability.drainPercent) / 100))
    const { atacante: traitAtk, defensor: traitDef } = traitsDoConfronto(attacker, target)
    if (ability.drainPercent > 0) {
      // LIQUID OOZE inverte o dreno: quem sugar HP deste alvo TOMA o valor em
      // vez de curar. Mesmo numero, sinal trocado — e por isso que ela e
      // perigosa de verdade e nao so um cancelamento.
      if (traitDef === TRAIT_LIQUID_OOZE) {
        takeDamage(attacker, quanto)
        if (!silent) spawnDamageNumber(world, attacker, { amount: quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
        creditarMorteSeNecessario(attacker, defeatedEnemyIds, onPlayerFainted)
      } else if (!curaBloqueada(attacker)) {
        heal(attacker, quanto)
        if (!silent) spawnDamageNumber(world, attacker, { amount: -quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      }
    } else if (traitAtk !== TRAIT_ROCK_HEAD) {
      // ROCK HEAD: recuo simplesmente nao acontece. Nao e reducao, e imunidade.
      takeDamage(attacker, quanto)
      if (!silent) spawnDamageNumber(world, attacker, { amount: quanto, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      creditarMorteSeNecessario(attacker, defeatedEnemyIds, onPlayerFainted)
    }
  }

  // FINAL GAMBIT (PH-69): o dano sai em FIXED_DAMAGE_ABILITIES (HP atual do
  // usuario) e o CUSTO e aqui.
  //
  // DESVIO CONSCIENTE DO JOGO ORIGINAL: la o usuario desmaia. Aqui a fila dos 4
  // slots dispara sozinha em rotacao, entao um auto-KO fiel faria o POKE se
  // suicidar a cada volta da fila e encerrar a hunt — o mesmo motivo pelo qual
  // horn_drill/fissure ficaram fora da selecao (ver data/abilities.ts). Cobra
  // metade do HP atual, reaproveitando SELF_DESTRUCT_HP_LOSS_PERCENT, que existe
  // exatamente por esta razao: Explosao/Autodestruicao tambem foram suavizadas
  // de auto-KO pra -50%. Sem custo nenhum seria o bug do PH-73 de novo.
  if (ability.id === 'final_gambit' && danoCausado > 0 && !isDead(attacker)) {
    const custo = Math.max(1, Math.round(attacker.poke.hp * SELF_DESTRUCT_HP_LOSS_PERCENT))
    takeDamage(attacker, custo)
    if (!silent) spawnDamageNumber(world, attacker, { amount: custo, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
    creditarMorteSeNecessario(attacker, defeatedEnemyIds, onPlayerFainted)
  }

  // --- GOLPES DE SUPORTE SEM DANO (Fase 12) ---------------------------------
  //
  // Nenhum destes vem com `status`/`statChanges`/`healPercent` no catalogo —
  // o efeito inteiro e hardcoded por id aqui, no mesmo espirito de
  // FIXED_DAMAGE_ABILITIES/DYNAMIC_POWER_ABILITIES la em cima. `golpeDeApoioUtil`
  // decide QUANDO a IA usa cada um; aqui e so O QUE acontece quando usa.
  switch (ability.id) {
    // PROTECT / DETECT / ENDURE: sorteio de USO CONSECUTIVO (Gen V+). O
    // primeiro uso vale 100%, o segundo seguido 50%, o terceiro 25%... Falhar
    // gasta o turno e ZERA o contador, que e o que impede o travamento em 1 de
    // HP. Ver a nota em chanceDeProtecao / types.ts#protecoesSeguidas.
    //
    // O sorteio fica AQUI, no efeito, e nao em `golpeDeApoioUtil`: nos jogos o
    // golpe e USADO e FALHA (perdendo o turno), nao "nao esta disponivel".
    // Deixar a IA saber da chance a faria parar de tentar, e o custo do turno
    // perdido — que e metade do equilibrio — sumiria junto.
    case 'endure':
    case 'protect':
    case 'detect': {
      const funcionou = world.pessimista
        // PESSIMISTA (farm offline) NAO E "sempre falha" — e "sempre pior PRO
        // JOGADOR". A protecao DELE falha; a do INIMIGO pega. Zerar os dois
        // lados faria o farm offline render MELHOR que a mesma luta ao vivo
        // (todo Endure inimigo falharia), que e exatamente a invariante que o
        // modo existe pra nunca quebrar.
        ? attacker.kind === 'enemy'
        : rollChance(world.rng, chanceDeProtecao(attacker))
      if (funcionou) {
        if (ability.id === 'endure') attacker.enduraAtiva = true
        else attacker.protegida = true
        attacker.protecoesSeguidas = (attacker.protecoesSeguidas ?? 0) + 1
      } else {
        attacker.protecoesSeguidas = 0
        if (!silent) anunciarFalhou(world, attacker)
      }
      break
    }
    case 'destiny_bond':
      attacker.destinyBondAtiva = true
      break
    case 'haze':
      // Reseta TODOS os estagios dos DOIS lados — nao mexe em status (nem o
      // nao-volatil nem a confusao), so nos estagios de atributo.
      attacker.estagios = {}
      if (!isDead(target)) target.estagios = {}
      break
    case 'psych_up':
      // Copia os estagios do ALVO pro usuario — golpe reconhecidamente ignora
      // Protect nos jogos reais (ver PROTECT_BYPASS_ABILITY_IDS).
      if (!isDead(target)) attacker.estagios = { ...target.estagios }
      break
    case 'pain_split':
      if (!isDead(target)) {
        const media = Math.round((attacker.poke.hp + target.poke.hp) / 2)
        attacker.poke.hp = Math.min(attacker.poke.stats.hp, media)
        target.poke.hp = Math.min(target.poke.stats.hp, media)
      }
      break
    case 'heal_block':
      if (!isDead(target)) target.curaBloqueadaAte = HEAL_BLOCK_SEGUNDOS
      break
    case 'rest': {
      // Cura 100% e aplica sono de 2 turnos no proprio usuario — sempre, sem
      // sorteio de chance nem checagem de "ja tem status" (Rest SUBSTITUI
      // qualquer status que o usuario tivesse, como nos jogos). Insomnia/
      // Vital Spirit ainda assim impedem o proprio sono — o portador so cura.
      attacker.poke.hp = attacker.poke.stats.hp
      const traitAttacker = traitDoPoke(attacker.poke)
      if (traitAttacker !== 'insomnia' && traitAttacker !== 'vital_spirit') {
        attacker.poke.status = { tipo: 'sleep', turnosRestantes: 2 }
        attacker.imunidadeDeStatus = 0
      }
      break
    }
    case 'yawn':
      // Sono ATRASADO: nao pega no fechamento do turno em que foi usado, so
      // no seguinte — por isso 2, nao 1 (o primeiro tickStatus so fecha o
      // turno ATUAL; o segundo e que fecha "o proximo turno" de verdade,
      // batendo com a regra real: "falls asleep at the end of the next
      // turn"). So agenda o contador aqui; quem realmente aplica o sono
      // (respeitando imunidade no momento em que pega) e tickStatus, ver
      // statusSystem.ts.
      if (!isDead(target) && !target.poke.status) target.yawnTurnos = 2
      break
    case 'belly_drum': {
      // Perde 50% do HP MAXIMO (nao do atual — bate com o poder real do
      // golpe), nunca menos que 1 HP restante, em troca sobe Ataque Fisico
      // pro TETO de uma vez.
      const perda = Math.round(attacker.poke.stats.hp / 2)
      attacker.poke.hp = Math.max(1, attacker.poke.hp - perda)
      attacker.estagios.atkFis = ESTAGIO_MAXIMO
      break
    }
    case 'acupressure': {
      const stats: StatDeEstagio[] = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed']
      const stat = stats[Math.floor(nextFloat(world.rng) * stats.length)]
      const atual = attacker.estagios[stat] ?? 0
      attacker.estagios[stat] = Math.min(ESTAGIO_MAXIMO, atual + 2)
      break
    }
    case 'aromatherapy':
    case 'heal_bell':
      // Nos jogos cura o TIME inteiro; sem time de reserva neste motor 1v1,
      // cura so o proprio usuario (ver instrucao da Fase 12).
      curarStatus(attacker)
      break
    case 'lock_on':
    case 'mind_reader':
      if (!isDead(target)) attacker.miraGarantidaAlvoId = target.id
      break
    case 'guard_swap':
      if (!isDead(target)) trocarEstagios(attacker, target, ['def', 'defEsp'])
      break
    case 'power_swap':
      if (!isDead(target)) trocarEstagios(attacker, target, ['atkFis', 'atkEsp'])
      break
    case 'rage_powder':
      // No-op ESTRUTURAL, documentado: este motor e sempre 1 jogador vs N
      // inimigos — nunca ha um ALIADO do jogador pra redirecionar aggro, e
      // todo inimigo engajado ja mira so no jogador de qualquer forma. Nao
      // ha estado nenhum pra setar.
      break
    case 'soak':
      if (!isDead(target)) target.tipoForcado = 'WATER'
      break
    case 'perish_song':
      // Contador independente pros DOIS lados que estavam em campo quando o
      // golpe foi usado — chegar a 0 mata (ver tickStatus#pereceu).
      if (attacker.perishCountdown == null) attacker.perishCountdown = 3
      if (!isDead(target) && target.perishCountdown == null) target.perishCountdown = 3
      break
    case 'psycho_shift': {
      // Transfere o proprio status nao-volatil pro alvo (se ele puder
      // receber) e cura o usuario. `statusVaiPegar` ja cobre imunidade por
      // tipo/trait/status atual — so falta reaplicar manualmente porque o
      // status esta pronto (nao e um sorteio de chance, e uma transferencia).
      const meuStatus = attacker.poke.status
      if (meuStatus && !isDead(target) && statusVaiPegar(target, meuStatus.tipo)) {
        target.poke.status = { ...meuStatus }
        attacker.poke.status = null
      }
      break
    }
    default:
      break
  }

  const isPlayerAttacker = attacker.kind === 'player'
  const isAoe = ability.target === 'aoe'
  // Golpe de status alvo-unico: SO mostra VFX quando algo de fato pegou
  // (`statusRecebeuEm`) — golpe que falhou (imunidade, ja tinha status,
  // janela de reaplicacao) nao fica com um circulo colorido em cima de nada
  // ter acontecido. Em cima de quem RECEBEU, nao sempre do alvo do hit
  // (Danca das Espadas acerta o proprio atacante).
  if (!isAoe && !silent && (ability.power > 0 || statusRecebeuEm)) {
    const local = !isDamagingAbility(ability) && statusRecebeuEm ? statusRecebeuEm : target
    // Golpe em si mesmo (Danca das Espadas e afins) nao tem direcao: dx=dy=0
    // sairia como angulo 0 e apontaria a arte pra direita sem motivo.
    const mesmoLugar = local.x === attacker.x && local.y === attacker.y
    world.effects.push(createWorldEffect(world.counters, {
      type: 'abilityEffect',
      x: local.x, y: local.y,
      targetX: local.x, targetY: local.y - local.radius * 0.6,
      anguloDeAtaque: mesmoLugar ? undefined : Math.atan2(local.y - attacker.y, local.x - attacker.x),
      color: colorForType(ability.type),
      isAoe: false,
      duration: !isDamagingAbility(ability) ? STATUS_VFX_DURATION : IMPACT_EFFECT_DURATION,
      elementType: ability.type,
      abilityId: ability.id,
      statusDirection: !isDamagingAbility(ability) ? direcaoDoGolpeDeStatus(ability.statChanges) : undefined,
    }))
  }

  if (!isDead(target)) return

  // MOXIE: +1 de Ataque a cada POKE derrubado. Aqui, e nao no tratamento de
  // morte logo abaixo, porque so este ponto sabe QUEM matou.
  if (traitDoPoke(attacker.poke) === TRAIT_MOXIE && !isDead(attacker)) {
    const mudanca = aplicarEstagioUnico(attacker, 'atkFis', 1)
    if (mudanca && !silent) anunciarEstagios(world, attacker, [mudanca])
  }

  if (isPlayerAttacker) {
    if (!target.deathHandled) {
      target.deathHandled = true
      defeatedEnemyIds.push(target.id)
    }
  } else if (target.kind === 'player' && !target.fainted) {
    target.fainted = true
    onPlayerFainted()
  }
}

// Trait -> tipo de clima que ela liga automaticamente (Drizzle/Sand Stream/
// Snow Warning/Drought — ver data/traits.ts). So estas 4 tem efeito aqui.
const TRAIT_CLIMA: Partial<Record<TraitId, ClimaTipo>> = {
  drizzle: 'chuva',
  sand_stream: 'areia',
  snow_warning: 'granizo',
  drought: 'sol',
}

// Clima ligado por TRAIT (Drizzle/Sand Stream/Snow Warning/Drought) e
// INDEFINIDO nos jogos reais — dura ate outra Trait ou golpe de clima
// substituir, sem contagem de turnos (diferente do clima ligado por GOLPE tipo
// Rain Dance, que dura 5 turnos e nao existe neste motor ainda). `Infinity` e
// o mesmo sentinela de "sem timer" que `lastDamageTaken.age` ja usa neste
// motor (ver engine/entity.ts).
const CLIMA_DE_TRAIT_TURNOS = Infinity

/**
 * HOOK DE ENTRADA EM COMBATE: dispara UMA vez, no primeiro frame em que
 * `self` fica engajado (ver updateCombat#entradaProcessada), pra Traits que
 * reagem a "acabou de entrar em campo" — Intimidate, Download, e o clima
 * automatico (Drizzle/Sand Stream/Snow Warning/Drought). Chamado
 * simetricamente: uma vez pro jogador contra o alvo principal, e uma vez por
 * cada inimigo que acabou de engajar contra o jogador.
 */
function resolveEntryHook(world: WorldState, self: WorldEntity, opponent: WorldEntity, silent: boolean): void {
  const trait = traitDoPoke(self.poke)
  if (!trait) return

  const climaTipo = TRAIT_CLIMA[trait]
  if (climaTipo) {
    if (world.clima?.tipo !== climaTipo) {
      world.clima = { tipo: climaTipo, turnosRestantes: CLIMA_DE_TRAIT_TURNOS }
    }
    return
  }

  if (trait === 'intimidate') {
    const mudanca = aplicarEstagioUnico(opponent, 'atkFis', -1)
    if (mudanca && !silent) anunciarEstagios(world, opponent, [mudanca])
    return
  }

  // TRACE: copia a habilidade do oponente ao entrar em campo. Grava em
  // `self.poke.trait` — o mesmo campo que o save usa — porque no jogo real a
  // copia dura ate o fim da batalha e TUDO neste motor le a habilidade dali.
  // O POKE do jogador so e gravado no banco pelo snapshot da sessao, entao um
  // Trace levado pra fora da luta seria um bug de persistencia; `limparEstadoVolatil`
  // devolve o valor original no fim da batalha (ver traitOriginal em types.ts).
  if (trait === TRAIT_TRACE) {
    const alvo = traitDoPoke(opponent.poke)
    if (alvo && !TRACE_NAO_COPIA.has(alvo)) {
      self.traitOriginal ??= self.poke.trait ?? null
      self.poke.trait = alvo
    }
    return
  }

  if (trait === 'download') {
    // Mesmos valores (stat crua x multiplicador de estagio) que computeDamage
    // usa pro calculo de dano fisico/especial — ver computeDamage#def acima.
    const opponentPoke = opponent.poke
    const defFis = opponentPoke.stats.def * multiplicadorDeStat(opponent.estagios, 'def')
    const defEsp = opponentPoke.stats.defEsp * multiplicadorDeStat(opponent.estagios, 'defEsp')
    const stat: StatDeEstagio = defFis <= defEsp ? 'atkFis' : 'atkEsp'
    const mudanca = aplicarEstagioUnico(self, stat, 1)
    if (mudanca && !silent) anunciarEstagios(world, self, [mudanca])
  }
}

export interface CombatResult {
  defeatedEnemyIds: string[]
  playerJustFainted: boolean
}

// Devolve { defeatedEnemyIds, playerJustFainted } pro chamador (controller.ts)
// distribuir EXP/loot/rolls de captura e disparar reacoes de UI.
export function updateCombat(world: WorldState, dt: number, opts: { silent?: boolean } = {}): CombatResult {
  const silent = opts.silent ?? false
  const { player, enemies } = world
  if (!player) return { defeatedEnemyIds: [], playerJustFainted: false }

  const defeatedEnemyIds: string[] = []
  let playerJustFainted = false

  tickCooldowns(player, dt)
  for (const enemy of enemies) tickCooldowns(enemy, dt)

  // Turno de clima fecha na MESMA cadencia do relogio de status do jogador
  // (`proximoTurnoDeStatus`, mesmo epsilon que tickStatus usa) -- capturado
  // ANTES do loop abaixo mutar esse relogio. Decrementa uma vez por
  // updateCombat, nao por entidade: o clima e do WORLD, nao de cada POKE.
  const turnoDeClimaFechou = !isDead(player) && player.proximoTurnoDeStatus - dt <= 1e-9

  // Status ANTES das acoes: veneno/queimadura podem derrubar o POKE neste
  // frame, e um POKE derrubado nao age. Passa pelo mesmo caminho de morte que
  // o dano de golpe (loot, EXP, desmaio) — dano de veneno que matasse sem
  // creditar o kill seria um buraco silencioso na economia.
  for (const entity of [player, ...enemies]) {
    if (isDead(entity)) continue
    const { dano, expirados, drenoParaOrigem, pereceu } = tickStatus(world.rng, entity, dt, world.clima?.tipo ?? null)
    if (!silent) {
      for (const tipo of expirados) anunciarStatus(world, entity, tipo, 'saiu')
    }
    // Perish Song (Fase 12): contador chegou a 0 — mata pelo mesmo caminho de
    // qualquer outro dano de turno (veneno/queimadura), so que sempre letal.
    if (pereceu && !silent) anunciarPereceu(world, entity)
    const danoDoTurno = pereceu ? Math.max(dano, entity.poke.hp) : dano
    if (danoDoTurno <= 0) continue

    takeDamage(entity, danoDoTurno)
    if (!silent) spawnDamageNumber(world, entity, { amount: danoDoTurno, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })

    // LEECH_SEED: dreno vai pra quem plantou a semente, se ela ainda estiver
    // viva. Se a origem ja saiu de campo (derrotada/removida), fizzle
    // parcial — o dano acima ja foi aplicado, so a cura falha em silencio.
    if (drenoParaOrigem) {
      const origem = findEntityById(player, enemies, drenoParaOrigem.sourceId)
      if (origem && !isDead(origem)) {
        heal(origem, drenoParaOrigem.amount)
        if (!silent) spawnDamageNumber(world, origem, { amount: -drenoParaOrigem.amount, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
      }
    }

    creditarMorteSeNecessario(entity, defeatedEnemyIds, () => {
      playerJustFainted = true
    })
  }

  if (turnoDeClimaFechou && world.clima) {
    world.clima.turnosRestantes -= 1
    if (world.clima.turnosRestantes <= 0) world.clima = null
  }

  for (const effect of world.effects) tickEffect(effect, dt)
  for (const effect of world.effects) {
    if (effectDone(effect) && effect.ownerId) {
      const owner = findEntityById(player, enemies, effect.ownerId)
      if (owner) releaseEffectLane(owner, effect.id)
    }
  }
  world.effects = world.effects.filter((e) => !effectDone(e))

  for (const hit of world.pendingHits) hit.timer -= dt
  const landed = world.pendingHits.filter((hit) => hit.timer <= 0)
  world.pendingHits = world.pendingHits.filter((hit) => hit.timer > 0)
  for (const hit of landed) {
    resolveHit(world, hit, defeatedEnemyIds, () => {
      playerJustFainted = true
    }, silent)
  }

  // WISH: mesmo padrao de pendingHits acima (tick down, resolve quando
  // timer<=0, lookup por id).
  for (const wish of world.pendingWishes) wish.timer -= dt
  const wishesResolvidas = world.pendingWishes.filter((w) => w.timer <= 0)
  world.pendingWishes = world.pendingWishes.filter((w) => w.timer > 0)
  for (const wish of wishesResolvidas) {
    // Se nao encontrar (lado inimigo, quem lancou ja foi derrotado e removido
    // de world.enemies) ou a entidade estiver morta, a wish fizzla em
    // silencio — sem erro, sem efeito.
    const alvo = findEntityById(player, enemies, wish.targetId)
    if (alvo && !isDead(alvo)) {
      heal(alvo, wish.healAmount)
      if (!silent) spawnDamageNumber(world, alvo, { amount: -wish.healAmount, effectiveness: 'normal', effectivenessLabel: null, isCrit: false })
    }
  }

  if (player.fainted) {
    return { defeatedEnemyIds, playerJustFainted }
  }

  // Reset por-entidade do HOOK DE ENTRADA EM COMBATE (ver resolveEntryHook):
  // quem desengajou (perdeu o aggro, ou o jogador se afastou) esquece que ja
  // disparou — a proxima vez que reengajar, Intimidate/Download/clima
  // automatico disparam de novo, como uma troca de POKE nos jogos reais. Roda
  // TODO frame, nao so no fim de luta: um unico inimigo pode desengajar
  // enquanto outros continuam engajados com o jogador.
  if (player.state !== 'engaged' && player.entradaProcessada) player.entradaProcessada = false
  for (const enemy of enemies) {
    if (enemy.state !== 'engaged' && enemy.entradaProcessada) enemy.entradaProcessada = false
  }

  const engagedEnemies = enemies.filter((e) => !isDead(e) && e.state === 'engaged' && e.targetId === player.id)

  if (engagedEnemies.length > 0) {
    const primaryTarget = engagedEnemies[0]

    // HOOK DE ENTRADA EM COMBATE — dispara so no primeiro frame de cada lado
    // engajado (ver resolveEntryHook), simetrico: o jogador contra o alvo
    // principal, e cada inimigo recem-engajado contra o jogador.
    if (!player.entradaProcessada) {
      player.entradaProcessada = true
      resolveEntryHook(world, player, primaryTarget, silent)
    }
    for (const enemy of engagedEnemies) {
      if (!enemy.entradaProcessada) {
        enemy.entradaProcessada = true
        resolveEntryHook(world, enemy, player, silent)
      }
    }

    executePlayerAction(world, player, engagedEnemies, silent)

    for (const enemy of engagedEnemies) {
      if (isDead(enemy) || player.fainted) continue
      executeEnemyAction(world, enemy, player, silent)
    }
  } else {
    // FIM DE BATALHA. Sem nenhum inimigo engajado, a luta acabou — e nos jogos
    // e exatamente ai que TODO estado volatil some: estagios de atributo voltam
    // a zero e a confusao passa.
    //
    // Sem este ponto o jogo nao teria fim de batalha nenhum, e a consequencia
    // nao e teorica: medida, ela custava 27% das kills/hora numa hunt de nivel
    // alto. Cada inimigo novo empilhava mais um Rosnado ou String Shot no
    // jogador, os estagios desciam ate -6 (Velocidade e Ataque a um quarto) e
    // NUNCA voltavam, porque nao existe item que cure estagio nem batalha que
    // termine. O POKE ia ficando permanentemente pior a cada inimigo que
    // matava.
    limparEstadoVolatil(player)
    // Clima e do WORLD, nao da entidade -- por isso reset separado aqui, e
    // nao dentro de `limparEstadoVolatil` (que so mexe em campos de
    // WorldEntity). Mesmo ponto porque e aqui que "fim de batalha" e
    // detectado e quem chama ja tem `world` em maos.
    world.clima = null
  }

  return { defeatedEnemyIds, playerJustFainted }
}
