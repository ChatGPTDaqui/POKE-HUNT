// Placar do combate duelo (PH-549): os dois treinadores (foto, nome) e os
// POKEs em campo (face com HP/status, barra de HP, nivel, bolas do time e o
// golpe escolhido no round), lado a lado, na faixa da HUD.
//
// CHAVEIA POR `mapDef.encarada`, NUNCA POR `world.arena`. O duelo e um tipo de
// combate (arena PvP, Campeao Lance, covis de lendario — ver
// data/huntTypes.ts#encarada); `world.arena` e so um dos tres casos, e um
// placar preso a ele deixaria o Lance de fora — o mesmo acoplamento que a
// PH-541 teve que desfazer.
//
// SO APRESENTACAO: le `world.player`, `world.enemies`, `world.arena` e
// `world.rodadaDeDuelo`; nao escreve no motor nem consome `rng`. O servidor
// simula o mesmo duelo sem este componente, e o veredito dele prevalece.
//
// Quem e o rival:
//   arena  -> `useArenaStore.nomeDoRival`/`rivalId` (bot ou humano; a foto
//             vem do cache de avatares como em qualquer outra tela)
//   Lance  -> o proprio Lance, foto fixa do catalogo ('lance')
//   covil  -> POKE selvagem: sem treinador, o card mostra so o POKE
import { useMemo } from 'react'
import { SPECIES } from '@/data/pokes'
import type { PokeInstance } from '@/data/pokes'
import { escolherFace, faceEmocaoUrl, type EstadoDaFace } from '@/data/faceEmotions'
import { spriteUrl } from '@/data/sprites'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { isDead } from '@/engine/entity'
import type { EnemyEntity } from '@/engine/types'
import { useFaceDoPoke } from '@/hooks/useFaceDoPoke'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAuthStore } from '@/stores/authStore'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'
import { cn } from '@/lib/utils'
import { colorForType } from '@/data/typeColors'
import type { Ability } from '@/data/abilities'
import { useArenaStore } from './arena'

const NOME_DO_LANCE = 'Lance'

interface LadoDoPlacar {
  treinador: { nome: string; userId?: string | null; avatar?: string | null } | null
  poke: PokeInstance | null
  /** Face ja escolhida (o lado do jogador passa pelo piso de estabilidade). */
  face: ReturnType<typeof escolherFace>
  /** Bolas do time: `true` = ainda de pe. `[]` quando nao ha time (selvagem). */
  bolas: boolean[]
  golpe: Ability | null
  /** PH-551: POKEs do outro lado que este lado derrubou. */
  kos: number
  /** PH-551: este lado age primeiro no round / esta na vez agora. */
  primeiro: boolean
  naVez: boolean
}

/** O inimigo "em campo" do duelo: o vivo; se so ha corpos (Lance), o ultimo caido. */
function inimigoEmCampo(enemies: EnemyEntity[]): EnemyEntity | null {
  const vivo = enemies.find((e) => !isDead(e))
  return vivo ?? enemies[enemies.length - 1] ?? null
}

function faceDoInimigo(inimigo: EnemyEntity | null): EstadoDaFace | null {
  if (!inimigo) return null
  const { poke } = inimigo
  return {
    hpFrac: poke.stats.hp > 0 ? poke.hp / poke.stats.hp : 0,
    fainted: isDead(inimigo),
    status: poke.status ?? null,
    statusVolatil: inimigo.statusVolatil ?? null,
    emCombate: inimigo.state === 'chase' || inimigo.state === 'engaged',
    festejando: false,
  }
}

export function PlacarDoDuelo() {
  const emDuelo = useWorldStore((s) => Boolean(s.mapDef?.encarada))
  const mapId = useWorldStore((s) => s.mapDef?.id ?? null)
  const sequencia = useWorldStore((s) => s.mapDef?.sequence ?? null)
  const sequenceIndex = useWorldStore((s) => s.sequenceIndex)
  const player = useWorldStore((s) => s.player)
  const enemies = useWorldStore((s) => s.enemies)
  const arena = useWorldStore((s) => s.arena)
  const golpes = useWorldStore((s) => s.rodadaDeDuelo?.golpes ?? null)
  const ordem = useWorldStore((s) => s.rodadaDeDuelo?.ordem ?? null)
  const indiceDaVez = useWorldStore((s) => s.rodadaDeDuelo?.indice ?? null)
  const team = useGameStateStore((s) => s.team)
  const meuNome = useGameStateStore((s) => s.trainer.name)
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const nomeDoRival = useArenaStore((s) => s.nomeDoRival)
  const rivalId = useArenaStore((s) => s.rivalId)

  const meuPoke = player?.poke ?? null
  const minhaFace = useFaceDoPoke(meuPoke)
  const inimigo = useMemo(() => inimigoEmCampo(enemies), [enemies])

  if (!emDuelo || !player) return null

  // NA ARENA, O HP DO POKE EM CAMPO VEM DA ENTIDADE, nao do array do time. O
  // worldStore e immer: o motor muta `player.poke.hp` pelo caminho da entidade e
  // a copia em `arena.meuTime[i]` fica com o valor de antes (mesmo objeto de
  // origem, dois caminhos no draft). O motor nao depende disso (so olha o time
  // A PARTIR do proximo indice), o placar sim — sem isto o KO nunca contava.
  const meuTime = arena ? arena.meuTime : team
  const bolasDoTime = (time: PokeInstance[], indice: number, emCampo: PokeInstance | null) =>
    time.map((p, i) => (i === indice && emCampo ? emCampo.hp > 0 : i < indice ? false : p.hp > 0))
  const eu: LadoDoPlacar = {
    treinador: { nome: meuNome, userId: meuId },
    poke: meuPoke,
    face: minhaFace,
    bolas: arena ? bolasDoTime(arena.meuTime, arena.indiceMeu, meuPoke) : meuTime.map((p) => p.hp > 0),
    golpe: golpes?.[player.id] ?? null,
    kos: 0,
    primeiro: ordem?.[0] === player.id,
    naVez: ordem != null && indiceDaVez != null && ordem[indiceDaVez] === player.id,
  }

  const estadoDoInimigo = faceDoInimigo(inimigo)
  let treinadorRival: LadoDoPlacar['treinador'] = null
  let bolasRival: boolean[] = []
  if (arena) {
    treinadorRival = { nome: nomeDoRival, userId: rivalId }
    bolasRival = bolasDoTime(arena.rivalTime, arena.indiceRival, inimigo?.poke ?? null)
  } else if (mapId === LANCE_MAP_ID && sequencia) {
    treinadorRival = { nome: NOME_DO_LANCE, avatar: 'lance' }
    // Os ja derrotados sao os indices antes do atual; o atual cai quando morre.
    const caido = inimigo ? isDead(inimigo) : false
    bolasRival = sequencia.map((_, i) => i > sequenceIndex || (i === sequenceIndex && !caido))
  }
  const rival: LadoDoPlacar = {
    treinador: treinadorRival,
    poke: inimigo?.poke ?? null,
    face: estadoDoInimigo ? escolherFace(estadoDoInimigo) : 'normal',
    bolas: bolasRival,
    golpe: inimigo ? golpes?.[inimigo.id] ?? null : null,
    kos: 0,
    primeiro: inimigo != null && ordem?.[0] === inimigo.id,
    naVez: inimigo != null && ordem != null && indiceDaVez != null && ordem[indiceDaVez] === inimigo.id,
  }
  // KOs: o que eu derrubei do outro lado sao as bolas caidas dele, e vice-versa.
  eu.kos = rival.bolas.filter((viva) => !viva).length
  rival.kos = eu.bolas.filter((viva) => !viva).length

  return (
    <div
      data-testid="placar-do-duelo"
      className="vidro pointer-events-none flex w-full max-w-[40em] items-stretch gap-[.4em] rounded-[.7em] border border-n700 px-[.5em] py-[.35em]"
    >
      <Lado lado={eu} espelhado={false} />
      <span className="self-center px-[.2em] text-[.7em] font-black uppercase tracking-widest text-n500">vs</span>
      <Lado lado={rival} espelhado />
    </div>
  )
}

function Lado({ lado, espelhado }: { lado: LadoDoPlacar; espelhado: boolean }) {
  const { treinador, poke } = lado
  const species = poke ? SPECIES[poke.speciesId] : null
  const url = poke
    ? faceEmocaoUrl(poke.speciesId, poke.isShiny, lado.face) ?? spriteUrl(poke.speciesId, poke.isShiny)
    : null
  const hpPct = poke && poke.stats.hp > 0 ? Math.max(0, Math.min(100, (poke.hp / poke.stats.hp) * 100)) : 0
  const hpBaixo = hpPct < 30
  return (
    <div
      data-na-vez={lado.naVez || undefined}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-[.4em] rounded-[.5em] px-[.2em] transition-colors',
        espelhado && 'flex-row-reverse text-right',
        lado.naVez && 'bg-n800/70',
      )}
    >
      {treinador ? (
        <div className={cn('flex min-w-0 shrink-0 items-center gap-[.3em]', espelhado && 'flex-row-reverse')}>
          <AvatarDoTreinador userId={treinador.userId ?? null} avatar={treinador.avatar} tamanho={2.2} nome={treinador.nome} />
          <span className="flex min-w-0 flex-col gap-[.15em]">
            <span className="max-w-[6em] truncate text-[.78em] font-semibold leading-none">{treinador.nome}</span>
            {lado.bolas.length > 0 && (
              <span className="text-[.6em] leading-none text-n400" aria-label={`${lado.kos} KO`}>KO {lado.kos}</span>
            )}
          </span>
        </div>
      ) : (
        <span className="shrink-0 text-[.7em] text-n500">Selvagem</span>
      )}
      {poke && species && (
        <div className={cn('flex min-w-0 flex-1 items-center gap-[.35em]', espelhado && 'flex-row-reverse')}>
          <span className="h-[2.2em] w-[2.2em] shrink-0 overflow-hidden rounded-[.45em] bg-n800">
            {url && <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-[.15em]">
            <div className={cn('flex items-baseline gap-[.3em] text-[.72em] leading-none', espelhado && 'flex-row-reverse')}>
              <span className="truncate font-medium">{species.name}</span>
              <span className="shrink-0 text-n400">Lv {poke.level}</span>
            </div>
            <span className="relative block h-[.3em] w-full overflow-hidden rounded-full bg-n800">
              <span
                className={cn('absolute inset-y-0 rounded-full transition-[width] duration-200', espelhado ? 'right-0' : 'left-0')}
                style={{ width: `${hpPct}%`, background: hpBaixo ? 'var(--color-hp-low)' : 'var(--color-hp)' }}
              />
            </span>
            <div className={cn('flex items-center gap-[.3em] text-[.62em] leading-none text-n400', espelhado && 'flex-row-reverse')}>
              {lado.bolas.length > 0 && (
                <span className="flex gap-[.15em]" aria-label={`${lado.bolas.filter(Boolean).length} de ${lado.bolas.length} de pé`}>
                  {lado.bolas.map((viva, i) => (
                    <span key={i} className={cn('h-[.55em] w-[.55em] rounded-full border', viva ? 'border-n200 bg-n100' : 'border-n700 bg-n900')} />
                  ))}
                </span>
              )}
              {lado.golpe && (
                <span className="truncate font-medium" style={{ color: colorForType(lado.golpe.type) }}>
                  {lado.golpe.name}
                </span>
              )}
              {lado.primeiro && (
                <span className="shrink-0 rounded-full bg-n700 px-[.4em] text-[.9em] text-n200" title="Age primeiro neste round">1º</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
