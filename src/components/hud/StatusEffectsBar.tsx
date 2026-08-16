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

const ESTAGIOS_ORDEM: StatDeEstagio[] = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed']

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
        titulo: `${STAT_LABEL[stat]} ${valor > 0 ? 'aumentado' : 'diminuido'} (${valor > 0 ? '+' : ''}${valor})`,
        contador: `${valor > 0 ? '+' : ''}${valor}`,
        aumenta: valor > 0,
      })
    }
  }

  if (badges.length === 0) return null

  return (
    <div className="pointer-events-none flex flex-wrap justify-center gap-[.3em]">
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
  )
}
