import { golpesUtilizaveis } from '@/data/activeAbilities'
import { BASIC_ATTACK, getAbility, isDamagingAbility, type Ability } from '@/data/abilities'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import type { ElementType } from '@/data/generated/types'
import { SPECIES, type PokeInstance, type Species } from '@/data/pokes'
import { createFormulaEngine } from '@/core/formulaEngine'

const formulaEngine = createFormulaEngine(FORMULAS)
const STAB_MULTIPLIER = formulaEngine.eval('STAB_MULTIPLIER')
const MAX_TURNOS = 120

export interface PvpCombatente {
  nome: string
  time: PokeInstance[]
}

export interface PvpEvento {
  atacante: string
  defensor: string
  golpe: string
  dano: number
  hpRestante: number
  efetividade: number
  nocaute: boolean
}

export interface PvpResultado {
  vencedor: 'jogador' | 'oponente' | 'empate'
  turnos: number
  jogadorRestantes: number
  oponenteRestantes: number
  eventos: PvpEvento[]
}

interface Lutador {
  poke: PokeInstance
  species: Species
}

function prepararTime(time: PokeInstance[]): Lutador[] {
  return time
    .filter((poke) => SPECIES[poke.speciesId])
    .slice(0, 6)
    .map((poke) => {
      const species = SPECIES[poke.speciesId]
      return {
        species,
        poke: {
          ...poke,
          hp: Math.max(1, poke.stats.hp),
          status: null,
        },
      }
    })
}

function nomeDoPoke(lutador: Lutador): string {
  return lutador.species.name
}

function statDeAtaque(poke: PokeInstance, ability: Ability): number {
  return ability.category === 'special' ? poke.stats.atkEsp : poke.stats.atkFis
}

function statDeDefesa(poke: PokeInstance, ability: Ability): number {
  return ability.category === 'special' ? poke.stats.defEsp : poke.stats.def
}

function stab(ability: Ability, species: Species): number {
  return ability.type === species.type || ability.type === species.type2 ? STAB_MULTIPLIER : 1
}

function danoDoGolpe(atacante: Lutador, defensor: Lutador, ability: Ability): number {
  if (!isDamagingAbility(ability)) return 0
  const efetividade = getEffectiveness(ability.type, defensor.species.type, defensor.species.type2)
  if (efetividade <= 0) return 0
  const base = formulaEngine.eval('DAMAGE_BASE', {
    level: atacante.poke.level,
    power: Math.max(1, ability.power),
    atk: Math.max(1, statDeAtaque(atacante.poke, ability)),
    def: Math.max(1, statDeDefesa(defensor.poke, ability)),
  })
  const precisao = Math.max(0, Math.min(100, ability.accuracy ?? 100)) / 100
  return Math.max(1, Math.round(base * stab(ability, atacante.species) * efetividade * precisao))
}

function escolherGolpe(atacante: Lutador, defensor: Lutador): Ability {
  const ids = golpesUtilizaveis(atacante.poke, atacante.species, false)
  const candidatos = ids
    .map((id) => getAbility(id))
    .filter((ability): ability is Ability => Boolean(ability))
  const ordenados = candidatos
    .map((ability) => ({ ability, dano: danoDoGolpe(atacante, defensor, ability) }))
    .filter((c) => c.dano > 0)
    .sort((a, b) => b.dano - a.dano || b.ability.power - a.ability.power || a.ability.name.localeCompare(b.ability.name))
  return ordenados[0]?.ability ?? BASIC_ATTACK
}

function aplicarAtaque(atacante: Lutador, defensor: Lutador): PvpEvento {
  const ability = escolherGolpe(atacante, defensor)
  const efetividade = isDamagingAbility(ability)
    ? getEffectiveness(ability.type as ElementType, defensor.species.type, defensor.species.type2)
    : 1
  const dano = Math.min(defensor.poke.hp, danoDoGolpe(atacante, defensor, ability))
  defensor.poke.hp = Math.max(0, defensor.poke.hp - dano)
  return {
    atacante: nomeDoPoke(atacante),
    defensor: nomeDoPoke(defensor),
    golpe: ability.name,
    dano,
    hpRestante: defensor.poke.hp,
    efetividade,
    nocaute: defensor.poke.hp <= 0,
  }
}

function vivos(time: Lutador[]): Lutador[] {
  return time.filter((lutador) => lutador.poke.hp > 0)
}

export function simularPvp(jogador: PvpCombatente, oponente: PvpCombatente): PvpResultado {
  const timeJogador = prepararTime(jogador.time)
  const timeOponente = prepararTime(oponente.time)
  const eventos: PvpEvento[] = []
  let turnos = 0

  while (vivos(timeJogador).length > 0 && vivos(timeOponente).length > 0 && turnos < MAX_TURNOS) {
    turnos += 1
    const ativoJogador = vivos(timeJogador)[0]
    const ativoOponente = vivos(timeOponente)[0]
    const ordem = ativoJogador.poke.stats.speed >= ativoOponente.poke.stats.speed
      ? [ativoJogador, ativoOponente]
      : [ativoOponente, ativoJogador]
    const alvo = new Map<Lutador, Lutador>([
      [ativoJogador, ativoOponente],
      [ativoOponente, ativoJogador],
    ])

    for (const atacante of ordem) {
      if (atacante.poke.hp <= 0) continue
      const defensor = alvo.get(atacante)
      if (!defensor || defensor.poke.hp <= 0) continue
      eventos.push(aplicarAtaque(atacante, defensor))
    }
  }

  const jogadorRestantes = vivos(timeJogador).length
  const oponenteRestantes = vivos(timeOponente).length
  const vencedor = jogadorRestantes === oponenteRestantes
    ? 'empate'
    : jogadorRestantes > oponenteRestantes ? 'jogador' : 'oponente'

  return {
    vencedor,
    turnos,
    jogadorRestantes,
    oponenteRestantes,
    eventos,
  }
}
