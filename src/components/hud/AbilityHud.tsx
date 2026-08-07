// Port de js/ui/panels/AbilityHUD.js — barra de golpes do POKE em campo.
// Cor de fundo por tipo elemental, borda por categoria (fisico/especial),
// marca AOE, badge de dano base, overlay de cooldown.
//
// Duplo-clique num slot liga/desliga o golpe pra selecao automatica da IA
// (CombatSystem#pickAbility filtra contra `poke.disabledAbilities`) — pedido
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

// Cores fixas de UI (nao por tipo) — bater o olho no slot ja diz a categoria
// do golpe sem precisar ler o tooltip.
const CATEGORY_BORDER: Record<string, string> = { physical: '#9aa0a6', special: '#60a5fa' }

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
    <div className="pointer-events-auto flex gap-1.5">
      {abilities.map((ability) => {
        const isOff = Boolean(disabled[ability.id])
        const cd = cooldowns?.[ability.id] ?? 0
        const ready = cd <= 0 && !isOff
        const typeColor = colorForType(ability.type)
        const borderColor = CATEGORY_BORDER[resolveAbilityCategory(ability, poke)] || CATEGORY_BORDER.physical
        const isAoe = ability.target === 'aoe'

        return (
          <div
            key={ability.id}
            onDoubleClick={() => toggleAbilityDisabled(poke.uid, ability.id)}
            title={`${ability.name}${isOff ? ' (desativado — 2x clique para reativar)' : ' (2x clique para desativar)'}`}
            className={cn(
              'relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-md border-4 text-[11px] font-bold text-white shadow select-none',
              ready && 'ring-2 ring-white/70',
            )}
            style={{ background: typeColor, borderColor }}
          >
            <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">{shortLabel(ability.name)}</span>

            {isAoe && (
              <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
            )}

            {!ready && !isOff && (
              <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-black/65 text-[11px]">
                {cd.toFixed(1)}
              </div>
            )}
            {isOff && (
              <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-black/75 text-[10px] tracking-wider">
                OFF
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 z-10 rounded-b-sm bg-black/70 text-center text-[9px] leading-tight">
              {ability.power}
            </div>
          </div>
        )
      })}
    </div>
  )
}
