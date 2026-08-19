// Trilho de status — a UNICA superficie permanente do topo.
//
// Substitui quatro superficies que antes disputavam a mesma faixa e, em 390px,
// literalmente se cobriam: `ActivePokeCard` (esquerda), `RatesCard` (ao lado),
// `CenterBlock` (centro, que em <1140px DESCIA pra cima dos outros dois) e
// `TrainerCard` + `SideMenuColumn` (direita). Medido no aparelho: os cards da
// esquerda e da direita somavam ~450px de largura numa tela de 374px uteis, e o
// HP do POKE ficava atras da carteira.
//
// O criterio pra estar no trilho e um so: o dado muda sozinho e o jogador olha
// pra ele sem ter pedido. HP, XP, carteira. Todo o resto (local, Pokedex,
// taxas) mora atras de um toque, na gaveta de detalhes — nao porque importe
// menos, mas porque ele NAO muda entre um olhar e outro.
import { useState } from 'react'
import { CaretDown, ChartLineUp, Coin, Diamond, User } from '@phosphor-icons/react'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { faceIconUrl, spriteUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { stoneName } from '@/data/stones'
import {
  canEvolve, evolutionStoneRequirement, expProgressForInstance, trainerExpProgress,
} from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { getPerfStats } from '@/engine/systems/farmRates'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useUiStore, useDeviceMode } from '@/stores/uiStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { GameButton } from '@/components/game/controls'
import { useIntervalo } from '@/hooks/useIntervalo'
import { cn } from '@/lib/utils'

const TOTAL_ESPECIES = Object.keys(SPECIES).length
const fmtCheio = new Intl.NumberFormat('pt-BR')

// No celular a carteira divide ~90px com o avatar do treinador, e a conta de
// teste tem 1.000.403.360 de ouro — 13 digitos que empurravam o avatar pra fora
// da tela. Abreviar e o unico jeito de a carteira caber sem virar reticencia; o
// valor exato continua no perfil do treinador e na gaveta de detalhes.
function fmtCurto(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000_000) return `${(valor / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 10_000) return `${(valor / 1000).toFixed(0)}k`
  return fmtCheio.format(valor)
}

function fmtTaxa(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000) return `${(valor / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(valor)
}

export function StatusRail() {
  // 'deitado' conta como LARGO aqui, nao como celular: a tela tem 844px de
  // largura sobrando e esconder local/taxas atras de um toque so criaria um
  // toque a mais. O que falta deitado e altura, e nada do que entra na faixa
  // do meio aumenta a altura do trilho.
  const mode = useDeviceMode().mode
  const estreito = mode === 'compacto'
  const [gavetaAberta, setGavetaAberta] = useState(false)

  return (
    <div className="pointer-events-auto flex flex-col items-stretch gap-[.4em]">
      <div
        className={cn(
          // `overflow-hidden` e rede de seguranca, nao layout: se algum dado
          // novo (um nome de treinador longo, uma moeda de 13 digitos) estourar
          // a conta de novo, ele corta em vez de deixar o avatar sair da tela.
          'vidro flex items-center gap-[.5em] overflow-hidden rounded-[1.1em] py-[.35em] pr-[.4em] pl-[.35em]',
        )}
      >
        <FacePoke />
        <VitaisPoke />
        {!estreito && <ResumoLocal />}
        {/* Taxas so no amplo. Deitado a largura parece sobrar e nao sobra: com
            as taxas na faixa do meio, o nome do POKE truncava pra "Ent…" com a
            barra de HP em 180px enquanto o ouro exibia 13 digitos. O dado menos
            urgente e o que sai. */}
        {mode === 'amplo' && <TaxasInline />}
        <Carteira abreviada={mode !== 'amplo'} />
        <BotaoDetalhes aberta={gavetaAberta} onToggle={() => setGavetaAberta((v) => !v)} />
        {/* No compacto o avatar era um botao mudo: sem largura pro nome e pro
            nivel, sobrava um icone generico ocupando ~46px permanentes da faixa
            mais disputada da tela — a mesma que ja tinha empurrado o avatar
            pra fora em 320px. Ele desce pra gaveta, onde cabe COM o nome e o
            nivel escritos. */}
        {!estreito && <AvatarTreinador />}
      </div>

      {gavetaAberta && <GavetaDetalhes comTreinador={estreito} />}
      <ChipEvolucao />
    </div>
  )
}

// --- POKE em campo -----------------------------------------------------------
// FONTE DE HP/EXP: `worldStore.player.poke`, nao `gameStateStore.team`. Durante
// a hunt o HP muda a cada tick no worldStore e so volta pro gameState de tempos
// em tempos — ler do save mostra HP defasado no meio do combate.
function usePokeAtivo(): PokeInstance | null {
  const worldPoke = useWorldStore((s) => s.player?.poke ?? null)
  const teamPoke = useGameStateStore((s) => s.team[s.activeIndex] ?? null)
  return worldPoke ?? teamPoke
}

function FacePoke() {
  const poke = usePokeAtivo()
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null
  const url = faceIconUrl(poke.speciesId, poke.isShiny) ?? spriteUrl(poke.speciesId, poke.isShiny)
  const rarity = rarityOf(poke)
  return (
    <button
      type="button"
      data-keep-open
      aria-label={`Perfil de ${species.name}`}
      onClick={() => showProfile(poke, species)}
      // A raridade vira a MOLDURA em vez de um selo de texto ao lado do nome:
      // no trilho de uma linha nao ha largura pra "MYTHIC" escrito, e a cor
      // carrega a mesma informacao de relance.
      className="h-[2.5em] w-[2.5em] shrink-0 cursor-pointer overflow-hidden rounded-[.6em] border-2 bg-n900"
      style={{ borderColor: rarity.color }}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />}
    </button>
  )
}

function VitaisPoke() {
  const poke = usePokeAtivo()
  const fainted = useWorldStore((s) => s.player?.fainted ?? false)
  const statusVolatil = useWorldStore((s) => (
    s.player && poke && s.player.poke.uid === poke.uid ? s.player.statusVolatil : null
  ))
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null

  const hpPct = Math.max(0, Math.min(100, (poke.hp / poke.stats.hp) * 100))
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    // Piso de largura pro nome do POKE e pra barra de HP: eles sao o conteudo
    // mais importante do trilho e eram os primeiros a encolher, porque todo
    // vizinho e `shrink-0`.
    //
    // `min(9em, 34vw)` e nao `9em` seco: num aparelho de 320px os 9em (144px)
    // mais os vizinhos de tamanho fixo somavam 324px numa caixa de 302px, e
    // quem saia pela borda era o avatar do treinador. O piso passa a ceder
    // junto com a tela — 34vw e o valor em que o conteudo cabe inteiro em 320px
    // (medido, nao chutado).
    <div className="flex min-w-[min(9em,34vw)] flex-1 flex-col gap-[.18em]">
      <div className="flex min-w-0 items-center gap-[.35em] text-[.82em] leading-none">
        <span className={cn('truncate font-medium', poke.isShiny && 'text-shiny')}>
          {poke.isShiny && '✨'}{species.name}
        </span>
        <span className="shrink-0 text-[.85em] text-n400">Lv {poke.level}</span>
        {fainted && <span className="shrink-0 text-[.85em] font-medium text-bad">KO</span>}
        <StatusBadge status={poke.status} />
        <StatusBadge status={statusVolatil} />
      </div>
      {/* Duas barras coladas, sem numero: o numero de HP exato so importa quando
          o jogador ja esta olhando o POKE, e ai ele esta no perfil. O que a
          barra precisa dizer de relance e "esta acabando". */}
      <div className="flex flex-col gap-[.12em]">
        <Barra pct={hpPct} altura=".34em" cor={hpPct < 30 ? 'var(--color-hp-low)' : 'var(--color-hp)'} />
        <Barra pct={expPct} altura=".18em" cor="var(--color-exp)" />
      </div>
    </div>
  )
}

function Barra({ pct, altura, cor }: { pct: number; altura: string; cor: string }) {
  return (
    <span className="relative block w-full overflow-hidden rounded-full bg-n800" style={{ height: altura }}>
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
        style={{ width: `${pct}%`, background: cor }}
      />
    </span>
  )
}

// --- carteira e treinador ----------------------------------------------------
function Carteira({ abreviada }: { abreviada: boolean }) {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  const fmt = abreviada ? fmtCurto : fmtCheio.format.bind(fmtCheio)
  return (
    <div
      className={cn(
        'shrink-0 text-[.72em] leading-[1.15] tabular-nums',
        abreviada ? 'flex flex-col items-end' : 'flex items-center gap-[.6em]',
      )}
      title={`${fmtCheio.format(gold)} ouro · ${fmtCheio.format(diamonds)} diamantes`}
    >
      <span className="flex items-center gap-[.25em] font-medium text-gold">
        <Coin weight="fill" /> {fmt(gold)}
      </span>
      <span className="flex items-center gap-[.25em] font-medium text-diamond">
        <Diamond weight="fill" /> {fmt(diamonds)}
      </span>
    </div>
  )
}

function AvatarTreinador() {
  const trainer = useGameStateStore((s) => s.trainer)
  const setPerfilOpen = useUiStore((s) => s.setPerfilOpen)
  const compacto = useDeviceMode().mode === 'compacto'
  const progress = trainerExpProgress(trainer)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <button
      type="button"
      data-keep-open
      aria-label="Perfil do treinador"
      onClick={() => setPerfilOpen(true)}
      className="relative flex shrink-0 cursor-pointer items-center gap-[.4em] rounded-[.7em] border border-n700 bg-n900 p-[.25em] pr-[.35em]"
    >
      <span className="flex h-[2em] w-[2em] items-center justify-center rounded-[.5em] text-[1.1em] text-n300">
        <User weight="fill" />
      </span>
      {!compacto && (
        <span className="flex flex-col items-start gap-[.2em] pr-[.2em]">
          <span className="max-w-[7em] truncate text-[.78em] leading-none">{trainer.name}</span>
          <span className="text-[.7em] leading-none text-n400">Lv {trainer.level}</span>
        </span>
      )}
      {/* Anel de EXP do treinador em vez de barra: no compacto nao ha largura
          pra uma barra, e o progresso e um dado de fundo — a borda inferior
          preenchendo ja diz "esta subindo". */}
      <span
        className="absolute inset-x-[.25em] bottom-[.15em] h-[.15em] overflow-hidden rounded-full bg-n800"
        aria-hidden
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${expPct}%` }} />
      </span>
    </button>
  )
}

// --- gaveta de detalhes ------------------------------------------------------
function BotaoDetalhes({ aberta, onToggle }: { aberta: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-keep-open
      aria-label={aberta ? 'Esconder detalhes' : 'Mostrar detalhes'}
      aria-expanded={aberta}
      onClick={onToggle}
      // `alvo-estendido`: a seta e estreita de proposito (esticar engordaria o
      // trilho inteiro), entao quem cresce no toque e so a area.
      className="alvo-estendido relative flex h-[1.9em] w-[1.5em] shrink-0 cursor-pointer items-center justify-center rounded-[.4em] text-n400"
    >
      <CaretDown className={cn('transition-transform duration-150', aberta && 'rotate-180')} />
    </button>
  )
}

function useTaxas() {
  const perfStats = useGameStateStore((s) => s.perfStats)
  // O denominador e tempo decorrido: ele avanca sozinho mesmo sem nenhum abate,
  // entao o valor precisa ser recalculado no relogio, nao no estado.
  useIntervalo(1000)
  return getPerfStats({ perfStats } as Parameters<typeof getPerfStats>[0])
}

// So o NOME do lugar. O contador da Pokedex saiu daqui: ele muda umas poucas
// vezes por sessao, tem slot proprio na barra de navegacao e continua na
// gaveta — permanente no trilho ele era uma linha de texto que ninguem le duas
// vezes. O nome fica porque em hunt de BOSS nao ha chip de sala, e sem ele o
// jogador nao tem em lugar nenhum da tela onde esta.
function ResumoLocal() {
  const huntName = useWorldStore((s) => s.mapDef?.name ?? 'Hospital')
  return <div className="max-w-[8em] shrink-0 truncate text-right text-[.72em] text-n300">{huntName}</div>
}

function TaxasInline() {
  const stats = useTaxas()
  const abrirAnalyzer = useUiStore((s) => s.setAnalyzerOpen)
  return (
    <button
      type="button"
      data-keep-open
      onClick={() => abrirAnalyzer(true)}
      className="flex shrink-0 cursor-pointer items-center gap-[.6em] rounded-[.5em] px-[.3em] py-[.2em] font-[inherit] text-[.72em] text-n400"
    >
      <span>Gold/h <b className="font-medium text-gold">{fmtTaxa(stats.goldPerHour)}</b></span>
      <span>XP/h <b className="font-medium text-n200">{fmtTaxa(stats.xpPerHour)}</b></span>
      <span>Mobs/h <b className="font-medium text-n200">{stats.mobsPerHour}</b></span>
    </button>
  )
}

function GavetaDetalhes({ comTreinador }: { comTreinador: boolean }) {
  const stats = useTaxas()
  const abrirAnalyzer = useUiStore((s) => s.setAnalyzerOpen)
  const setPerfilOpen = useUiStore((s) => s.setPerfilOpen)
  const trainer = useGameStateStore((s) => s.trainer)
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const huntName = useWorldStore((s) => s.mapDef?.name ?? 'Hospital')
  const registradas = Object.keys(pokedexKills).length

  return (
    <div className="vidro flex flex-col gap-[.45em] rounded-[.9em] px-[.8em] py-[.6em] text-[.78em]">
      <div className="flex items-baseline justify-between gap-[.6em]">
        <span className="truncate font-medium text-n100">{huntName}</span>
        <span className="shrink-0 text-n400">Pokedex <b className="font-medium text-n200">{registradas}/{TOTAL_ESPECIES}</b></span>
      </div>
      {comTreinador && (
        <GameButton
          variant="secondary"
          data-keep-open
          block
          className="justify-between"
          onClick={() => setPerfilOpen(true)}
        >
          <span className="flex items-center gap-[.4em]"><User weight="fill" /> {trainer.name}</span>
          <span className="text-n400">Lv {trainer.level}</span>
        </GameButton>
      )}
      <div className="grid grid-cols-4 gap-[.3em] text-center text-[.85em]">
        <Taxa rotulo="Gold/h" valor={fmtTaxa(stats.goldPerHour)} cor="var(--color-gold)" />
        <Taxa rotulo="XP/h" valor={fmtTaxa(stats.xpPerHour)} />
        <Taxa rotulo="Mobs/h" valor={String(stats.mobsPerHour)} />
        <Taxa rotulo="Shinys" valor={String(stats.shinys)} cor="var(--color-shiny)" />
      </div>
      <div className="flex gap-[.4em]">
        <GameButton
          variant="secondary"
          data-keep-open
          className="flex-1 justify-center"
          onClick={() => abrirAnalyzer(true)}
        >
          <ChartLineUp /> Hunt Analyzer
        </GameButton>
        {/* Resetar fica separado do resto: ele descarta a amostra inteira e nao
            pode dividir area de toque com "ver detalhes". */}
        <GameButton
          variant="ghost"
          className="shrink-0 justify-center"
          onClick={() => controller.resetPerfStats()}
        >
          Resetar
        </GameButton>
      </div>
    </div>
  )
}

function Taxa({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="flex flex-col gap-[.1em] rounded-[.5em] bg-n900/60 py-[.3em]">
      <span className="text-[.8em] text-n500">{rotulo}</span>
      <b className="font-medium tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</b>
    </div>
  )
}

// --- evolucao ----------------------------------------------------------------
// Fora do trilho, como chip proprio: a acao aparece poucas vezes na vida de um
// POKE e some de novo. Dentro do trilho ela roubaria largura permanente de HP e
// carteira pra ficar 99% do tempo invisivel.
function ChipEvolucao() {
  const poke = usePokeAtivo()
  const acao = useAcaoPendente()
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species || !canEvolve(poke, species)) return null
  const stoneReq = evolutionStoneRequirement(species)
  const pending = acao.isPending(`evo:${poke.uid}`)
  return (
    <button
      type="button"
      data-keep-open
      disabled={pending}
      onClick={() => void acao.run(`evo:${poke.uid}`, () => controller.evolvePoke(poke.uid))}
      className="vidro-flutua alvo-toque flex cursor-pointer items-center justify-center gap-[.4em] self-start rounded-full border-gold px-[.9em] py-[.35em] text-[.8em] font-medium text-gold disabled:opacity-50"
    >
      ✨ {stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'}
    </button>
  )
}
