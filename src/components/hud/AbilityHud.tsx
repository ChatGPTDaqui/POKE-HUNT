// Barra de golpes do POKE em campo. Fundo na cor do TIPO elemental, borda na
// cor da CATEGORIA (fisico/especial), bolinha verde = AOE, faixa inferior com o
// dano base, anel branco = pronto, overlay preto = cooldown ou desligado.
//
// Duplo-clique num slot liga/desliga o golpe pra selecao automatica da IA
// (combatSystem#pickAbility filtra contra `poke.disabledAbilities`) — pedido
// explicito do usuario, util principalmente pra optar por nao usar
// self-destruct, mas funciona como on/off geral por golpe.
//
// Cooldown vem do `WorldEntity` (worldStore), nao do PokeInstance salvo: e
// estado de combate ao vivo, atualizado a cada tick.
import { getAbility, BASIC_ATTACK, isDamagingAbility, resolveAbilityCategory, type Ability } from '@/data/abilities'
import { colorForType } from '@/data/typeColors'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { cn } from '@/lib/utils'

const CATEGORY_BORDER: Record<string, string> = {
  physical: 'var(--color-cat-physical)',
  special: 'var(--color-cat-special)',
}

function shortLabel(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

export function AbilityHud() {
  const poke = useWorldStore((s) => s.player?.poke ?? null)
  const cooldowns = useWorldStore((s) => s.player?.cooldowns ?? null)
  const toggleAbilityDisabled = useGameStateStore((s) => s.toggleAbilityDisabled)

  if (!poke) return null

  const disabled = poke.disabledAbilities || {}
  const abilities = [BASIC_ATTACK.id, ...poke.unlockedAbilities]
    .map((id) => getAbility(id))
    .filter((a): a is Ability => isDamagingAbility(a))

  if (abilities.length === 0) return null

  return (
    <div className="pointer-events-auto flex flex-wrap justify-center gap-[.45em]">
      {abilities.map((ability) => {
        const isOff = Boolean(disabled[ability.id])
        const cd = cooldowns?.[ability.id] ?? 0
        const ready = cd <= 0 && !isOff
        const borderColor = CATEGORY_BORDER[resolveAbilityCategory(ability, poke)] || CATEGORY_BORDER.physical

        return (
          <div
            key={ability.id}
            onDoubleClick={() => toggleAbilityDisabled(poke.uid, ability.id)}
            title={`${ability.name}${isOff ? ' (desligado — duplo clique religa)' : ' (duplo clique desliga da rotação)'}`}
            className={cn(
              'relative flex h-[3.4em] w-[3.4em] cursor-pointer items-center justify-center rounded-[.6em] select-none',
              ready && 'shadow-[0_0_0_2px_rgba(255,255,255,.85)]',
            )}
            style={{
              background: colorForType(ability.type),
              border: `.28em solid ${borderColor}`,
            }}
          >
            <span
              className="font-mono text-[.95em] font-bold text-white"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,.8)' }}
            >
              {shortLabel(ability.name)}
            </span>

            {ability.target === 'aoe' && (
              <span className="absolute -top-[.3em] -right-[.3em] h-[.8em] w-[.8em] rounded-full border border-[#052e16] bg-[#4ade80]" />
            )}

            {!ready && !isOff && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[.32em] bg-black/65 text-[.85em] tabular-nums text-white">
                {cd.toFixed(1)}s
              </span>
            )}
            {isOff && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[.32em] bg-black/75 text-[.8em] tracking-[.1em] text-n400">
                OFF
              </span>
            )}

            {/* z-[2] pra faixa de dano continuar legivel POR CIMA do overlay de
                cooldown, que cobre o slot inteiro. */}
            <span className="absolute inset-x-0 bottom-0 z-[2] rounded-b-[.32em] bg-black/70 text-center text-[.72em] text-[#e5e5e5]">
              {ability.power}
            </span>
          </div>
        )
      })}
    </div>
  )
}
