// Tooltip de golpe: tipo, categoria, PP, cooldown, area e descricao.
//
// A categoria e resolvida com o POKE em maos (`resolveAbilityCategory`) porque
// o golpe de nivel 50 tem categoria `dynamic` — ela depende de qual atributo do
// POKE e maior no nivel 50. Um tooltip que mostrasse "dynamic" nao diria nada.
import type { ReactNode } from 'react'
import {
  AOE_RADIUS,
  DANO_SEM_PODER_BASE,
  OHKO_DESLIGADO,
  isDamagingAbility,
  type Ability,
} from '@/data/abilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import {
  AVISO_DANO_POR_REGRA_PROPRIA,
  AVISO_OHKO_DESLIGADO,
  AVISO_SEM_DANO,
  MOVE_DESCRIPTIONS,
  golpeTemEfeitoReal,
} from '@/data/moveDescriptions'
import { colorForType } from '@/data/typeColors'
import type { PokeInstance } from '@/data/pokes'
import { Explicacao } from './Explicacao'

// 'status' e categoria de verdade desde a base de dados do Ultra Sun (ate a
// Gen III a categoria era decidida pelo TIPO do golpe e nao existia uma
// terceira). Golpe de status pode ou nao ter efeito real aqui — ver
// `golpeTemEfeitoReal` (data/moveDescriptions.ts), que decide se o aviso logo
// abaixo aparece.
const ROTULO_CATEGORIA: Record<string, string> = { physical: 'Fisico', special: 'Especial', status: 'Status' }

export function descricaoDoGolpe(ability: Ability): string {
  const pronta = MOVE_DESCRIPTIONS[ability.id]
  if (pronta) return pronta
  // Golpes que nao vem da planilha: o Ataque Basico e os 17 de nivel 50, todos
  // conteudo proprio deste jogo. Descrever pelo que eles fazem AQUI e mais
  // correto que inventar texto de um golpe que nao existe no original.
  if (ability.id === 'basic_attack') {
    return 'Golpe universal: todo POKE sempre tem este, mesmo sem nenhum outro golpe de dano aprendido.'
  }
  if (ability.id.startsWith('aoe50_')) {
    return `Golpe de area aprendido no Nivel 50, tematico do tipo ${ability.type}. A categoria acompanha o maior atributo de ataque do POKE no Nivel 50.`
  }
  return 'Sem descricao.'
}

export function AbilityTooltip({
  ability, poke, children,
}: {
  ability: Ability
  poke?: PokeInstance | null
  children: ReactNode
}) {
  const categoria = poke ? resolveAbilityCategory(ability, poke) : ability.category
  const cor = colorForType(ability.type)
  const descricao = descricaoDoGolpe(ability)
  const semDano = ability.power <= 0 && !golpeTemEfeitoReal(ability)
  // Golpe de regra propria: `power` 0 no catalogo, dano real vindo de
  // combatSystem#specialDamageFor. "Dano base 0" sozinho le como golpe fraco.
  const danoPorRegraPropria = DANO_SEM_PODER_BASE.has(ability.id)
  const ohkoDesligado = OHKO_DESLIGADO.has(ability.id)

  return (
    <Explicacao
      envolve="bloco"
      conteudo={
        <div className="flex flex-col gap-[.3em] text-left">
          <div className="flex flex-wrap items-center gap-[.4em]">
            <b>{ability.name}</b>
            <span className="rounded-[.3em] px-[.35em] text-[.85em] text-white" style={{ background: cor }}>
              {ability.type}
            </span>
            <span className="text-[.85em] opacity-80">
              {ROTULO_CATEGORIA[String(categoria)] ?? String(categoria)}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-[.55em] text-[.9em] opacity-85">
            <span>Dano base {danoPorRegraPropria ? '—' : ability.power}</span>
            {/* Precisao so pra golpe de DANO: golpe de status passa pelo mesmo
                sorteio no motor, mas mostrar "100%" nele sugere um teste de
                acerto que na pratica nunca falha.
                `isDamagingAbility` e nao `power > 0`: os 12 de
                DANO_SEM_PODER_BASE tem poder 0 e causam dano, e com o teste
                antigo a precisao deles nunca aparecia — Earthquake mostrava
                "Precisao 100%" e Magnitude, ao lado, nada. */}
            {isDamagingAbility(ability) && (
              <span className={(ability.accuracy ?? 100) < 100 ? 'text-warn' : undefined}>
                Precisao {ability.accuracy ?? 100}%
              </span>
            )}
            <span>PP {ability.pp}</span>
            {ability.cooldown != null && <span>Recarga {ability.cooldown.toFixed(1)}s</span>}
            {ability.target === 'aoe' && <span>Area (raio {ability.radius ?? AOE_RADIUS})</span>}
          </div>

          <span className="opacity-85">{descricao}</span>
          {/* So golpe SEM efeito real nenhum implementado aqui (nem dano, nem
              status/estagio/clima/escudo/etc) — ver golpeTemEfeitoReal. */}
          {semDano && <span className="text-[.85em] text-warn">{AVISO_SEM_DANO}</span>}
          {danoPorRegraPropria && (
            <span className="text-[.85em] opacity-70">{AVISO_DANO_POR_REGRA_PROPRIA}</span>
          )}
          {ohkoDesligado && <span className="text-[.85em] text-warn">{AVISO_OHKO_DESLIGADO}</span>}
        </div>
      }
    >
      {children}
    </Explicacao>
  )
}
