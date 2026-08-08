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
import { getAbility, BASIC_ATTACK, isDamagingAbility, type Ability } from '@/data/abilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { colorForType } from '@/data/typeColors'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useBreakpoints } from '@/stores/uiStore'
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

// Tamanho do slot por regime de largura. Duas coisas acontecem aqui:
//
// 1. O padrao caiu de 3.4em pra 2.6em (pedido explicito: icones menores).
// 2. Ele encolhe mais em tela estreita. O `em` sozinho ja escalava com a largura
//    (a `.hud-root` tem font-size fluido), mas nao resolvia o problema real: o
//    numero de slots cresce com o nivel do POKE, e uma fileira de 8 slotes de
//    3.4em quebra em duas ou tres linhas num celular, inflando o rodape (que o
//    chat e o botao Auto medem e ancoram em cima — ver HudLayer). Encolher por
//    breakpoint mantem a fileira baixa.
const TAMANHO_SLOT = { largo: '2.6em', medio: '2.35em', estreito: '2.05em' } as const
const TAMANHO_ROTULO = { largo: '.8em', medio: '.75em', estreito: '.68em' } as const

export function AbilityHud() {
  const poke = useWorldStore((s) => s.player?.poke ?? null)
  const cooldowns = useWorldStore((s) => s.player?.cooldowns ?? null)
  const toggleAbilityDisabled = useGameStateStore((s) => s.toggleAbilityDisabled)
  const { narrow, colStack } = useBreakpoints()

  if (!poke) return null

  const regime = narrow ? 'estreito' : colStack ? 'medio' : 'largo'
  const lado = TAMANHO_SLOT[regime]
  const fonteRotulo = TAMANHO_ROTULO[regime]

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
              'relative flex cursor-pointer items-center justify-center rounded-[.5em] select-none',
              ready && 'shadow-[0_0_0_2px_rgba(255,255,255,.85)]',
            )}
            style={{
              width: lado,
              height: lado,
              background: colorForType(ability.type),
              // Borda proporcional ao slot: em `.28em` fixos ela comia metade do
              // icone no tamanho estreito.
              border: `.2em solid ${borderColor}`,
            }}
          >
            <span
              className="font-mono font-bold text-white"
              style={{ fontSize: fonteRotulo, textShadow: '0 1px 3px rgba(0,0,0,.8)' }}
            >
              {shortLabel(ability.name)}
            </span>

            {ability.target === 'aoe' && (
              <span className="absolute -top-[.3em] -right-[.3em] h-[.8em] w-[.8em] rounded-full border border-[#052e16] bg-[#4ade80]" />
            )}

            {!ready && !isOff && (
              // Fonte acompanha o slot: "12.3s" em `.85em` fixo transbordava o
              // slot estreito.
              <span
                className="absolute inset-0 flex items-center justify-center rounded-[.32em] bg-black/65 tabular-nums text-white"
                style={{ fontSize: fonteRotulo }}
              >
                {cd.toFixed(1)}s
              </span>
            )}
            {isOff && (
              <span
                className="absolute inset-0 flex items-center justify-center rounded-[.32em] tracking-[.08em] bg-black/75 text-n400"
                style={{ fontSize: fonteRotulo }}
              >
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
