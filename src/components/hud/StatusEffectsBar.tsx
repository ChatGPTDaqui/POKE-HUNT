// Faixa de buffs/debuffs ativos no POKE em campo, acima da barra de golpes.
//
// Cobre os DOIS sistemas que hoje so tinham representacao textual (StatusBadge,
// selo "VEN"/"QUE"/...) ou nenhuma (estagios de atributo — Danca das Espadas,
// Rosnado etc nunca tiveram icone algum antes desta leva, so o numero cru na
// ficha de Status):
//   - condicao nao-volatil/volatil (`poke.status`/`player.statusVolatil`) —
//     mesmo dado do StatusBadge, agora com o GIF de statusVfx.ts (o mesmo
//     usado no flash de golpe) como icone PERSISTENTE, nao so o flash de
//     0,35-1,1s do impacto.
//   - estagio de atributo (`player.estagios`, +/-6 por stat) — pedido
//     explicito do usuario ("de maneira visual seja melhor entendido").
//
// Reusa `statusVfxUrl(tipo, direcao)` com o TIPO PRIMARIO DO PROPRIO POKE (nao
// o tipo do golpe que causou o efeito, que o flash de combate ja usa e nao
// sobrevive alem do proprio hit) — mesma linguagem visual de "tint by type"
// que aura/icone de habilidade/moldura de raridade ja usam neste jogo.
import { SPECIES } from '@/data/pokes'
import { nomeDoStatus, type StatusAtivo } from '@/data/statusEffects'
import { statusVfxUrl } from '@/data/statusVfx'
import { STAT_LABEL } from '@/data/statLabels'
import type { StatDeEstagio } from '@/data/statusEffects'
import { useWorldStore } from '@/stores/worldStore'
import { useDeviceMode } from '@/stores/uiStore'
import { Sheet } from '@/components/game/Sheet'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const ESTAGIOS_ORDEM: StatDeEstagio[] = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed', 'accuracy', 'evasion']
// `accuracy`/`evasion` nao sao um dos 6 stats reais (STAT_LABEL, indexado por
// `keyof StatBlock`) — sao eixo de combate a parte (sand_attack/smokescreen
// etc, golpes novos desta mesma leva). Rotulo proprio so pros dois; o resto
// reusa STAT_LABEL pra nao duplicar os nomes ja centralizados la.
const ROTULO_ESTAGIO: Record<StatDeEstagio, string> = {
  atkFis: STAT_LABEL.atkFis,
  atkEsp: STAT_LABEL.atkEsp,
  def: STAT_LABEL.def,
  defEsp: STAT_LABEL.defEsp,
  speed: STAT_LABEL.speed,
  accuracy: 'Precisão',
  evasion: 'Evasão',
}

interface Badge {
  key: string
  url: string | null
  titulo: string
  contador: string | null
  aumenta: boolean
}

export function StatusEffectsBar() {
  const poke = useWorldStore((s) => s.player?.poke ?? null)
  const statusVolatil = useWorldStore((s) => s.player?.statusVolatil ?? null)
  const estagios = useWorldStore((s) => s.player?.estagios ?? null)
  const { coarse } = useDeviceMode()
  // O NOME de cada efeito so existia no `title`, ou seja, so no hover: no
  // celular a faixa era uma fileira de icones sem legenda nenhuma. O toque abre
  // a lista escrita. Mesmo remendo do slot de golpe, mesma razao.
  const [aberta, setAberta] = useState(false)

  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null

  const badges: Badge[] = []

  for (const status of [poke.status, statusVolatil] as (StatusAtivo | null)[]) {
    if (!status) continue
    badges.push({
      key: `status-${status.tipo}`,
      url: statusVfxUrl(species.type, 'diminui'),
      titulo: status.turnosRestantes != null
        ? `${nomeDoStatus(status.tipo)} — ${status.turnosRestantes} turno(s) restante(s)`
        : `${nomeDoStatus(status.tipo)} — nao passa sozinho`,
      contador: status.turnosRestantes != null ? String(status.turnosRestantes) : '∞',
      aumenta: false,
    })
  }

  if (estagios) {
    for (const stat of ESTAGIOS_ORDEM) {
      const valor = estagios[stat] ?? 0
      if (valor === 0) continue
      badges.push({
        key: `estagio-${stat}`,
        url: statusVfxUrl(species.type, valor > 0 ? 'aumenta' : 'diminui'),
        titulo: `${ROTULO_ESTAGIO[stat]} ${valor > 0 ? 'aumentado' : 'diminuido'} (${valor > 0 ? '+' : ''}${valor})`,
        contador: `${valor > 0 ? '+' : ''}${valor}`,
        aumenta: valor > 0,
      })
    }
  }

  if (badges.length === 0) return null

  return (
    <>
    <div
      className={cn(
        'flex flex-wrap justify-center gap-[.3em]',
        coarse ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
      )}
      onClick={coarse ? () => setAberta(true) : undefined}
      data-keep-open={coarse ? '' : undefined}
      role={coarse ? 'button' : undefined}
      aria-label={coarse ? 'Ver efeitos ativos' : undefined}
    >
      {badges.map((badge) => (
        <div
          key={badge.key}
          title={badge.titulo}
          className="relative flex h-[1.7em] w-[1.7em] items-center justify-center overflow-hidden rounded-[.4em] border"
          style={{
            borderColor: badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)',
            background: 'color-mix(in srgb, var(--color-n900) 80%, transparent)',
          }}
        >
          {badge.url ? (
            <img
              src={badge.url}
              alt=""
              aria-hidden
              draggable={false}
              className="h-full w-full object-cover"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <span className="text-[.55em] font-bold text-n300">?</span>
          )}
          <span
            className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[.5em] font-bold tabular-nums text-white"
          >
            {badge.contador}
          </span>
        </div>
      ))}
    </div>

    {aberta && (
      <Sheet
        winKey="efeitos"
        snap="conteudo"
        zIndex={33}
        onClose={() => setAberta(false)}
        title="Efeitos ativos"
      >
        <ul className="flex flex-col gap-[.35em]">
          {badges.map((badge) => (
            <li
              key={badge.key}
              className="flex items-center gap-[.5em] rounded-[.5em] border border-n800 px-[.6em] py-[.45em] text-[.85em]"
            >
              <span
                className="h-[.6em] w-[.6em] shrink-0 rounded-full"
                style={{ background: badge.aumenta ? 'var(--color-ok)' : 'var(--color-bad)' }}
              />
              {badge.titulo}
            </li>
          ))}
        </ul>
      </Sheet>
    )}
    </>
  )
}
