// Hunt Analyzer — o card de taxas do HUD, aberto por inteiro.
//
// O card do canto mostra quatro numeros porque e o que cabe num canto. Esta
// janela responde as perguntas que aqueles quatro numeros levantam: quanto
// tempo falta pro proximo nivel nesse ritmo, quanto rende por abate, quanto isso
// da em 8 horas, e o que exatamente esta nascendo nesta hunt.
//
// TUDO AQUI E DERIVADO DE `perfStats` E DO CATALOGO. Nao ha metrica nova sendo
// coletada nem contador novo no save: `perfStats` (ouro, xp, mobs, shinys,
// `since`) ja existia e ja e reiniciado a cada entrada em hunt. Inventar um
// grafico de "ouro por minuto nos ultimos 10 minutos" exigiria uma serie
// temporal que ninguem grava — seria uma linha bonita feita de nada.
import { ChartLineUp, Clock, Coin, Lightning, Sparkle, Target } from '@phosphor-icons/react'
import { getPerfStats } from '@/engine/systems/farmRates'
import { expProgressForInstance, trainerExpProgress } from '@/engine/systems/progressionSystem'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { useGameStateStore, useActivePoke } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore } from '@/stores/uiStore'
import { GameWindow } from '@/components/game/GameWindow'
import { SectionLabel } from '@/components/game/controls'
import { TypeChip } from '@/components/shared/TypeChip'
import { huntOdds } from './HuntMenu'
import { useEffect, useState } from 'react'

const fmt = new Intl.NumberFormat('pt-BR')

function duracao(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return '—'
  if (segundos > 86400 * 30) return 'mais de um mes'
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = Math.floor(segundos % 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

function Metrica({
  icone, rotulo, valor, detalhe, cor,
}: {
  icone: React.ReactNode
  rotulo: string
  valor: string
  detalhe?: string
  cor?: string
}) {
  return (
    <div className="flex flex-col gap-[.15em] rounded-[.55em] border border-n800 bg-n900 px-[.55em] py-[.55em]">
      <span className="flex items-center gap-[.35em] text-[.75em] text-n500">
        {icone} {rotulo}
      </span>
      <b className="text-[1.15em] font-medium tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</b>
      {detalhe && <span className="text-[.72em] text-n500">{detalhe}</span>}
    </div>
  )
}

export function HuntAnalyzer() {
  const aberto = useUiStore((s) => s.analyzerOpen)
  const fechar = () => useUiStore.getState().setAnalyzerOpen(false)
  const perfStats = useGameStateStore((s) => s.perfStats)
  const trainer = useGameStateStore((s) => s.trainer)
  const activePoke = useActivePoke()
  const mapDef = useWorldStore((s) => s.mapDef)

  // Mesmo motivo do RatesCard: o denominador e tempo decorrido, que anda
  // sozinho mesmo sem nenhum abate novo.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!aberto) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [aberto])

  if (!aberto) return null

  const taxas = getPerfStats({ perfStats } as Parameters<typeof getPerfStats>[0])
  // `since` sai como 0 numa conta nova (o default da coluna `perf_stats` no
  // banco), e so vira um timestamp de verdade na primeira entrada em hunt.
  // Sem esta guarda o painel anunciava "amostra desta sessao: mais de um mes"
  // pra quem acabou de criar a conta — a conta estava certa (epoch ate agora),
  // a premissa e que estava errada.
  const amostraIniciada = perfStats.since > 0
  const segundos = amostraIniciada ? Math.max(1, (Date.now() - perfStats.since) / 1000) : 0
  const ouroPorAbate = perfStats.mobs > 0 ? perfStats.gold / perfStats.mobs : 0
  const xpPorAbate = perfStats.mobs > 0 ? perfStats.xp / perfStats.mobs : 0
  const segundosPorAbate = perfStats.mobs > 0 ? segundos / perfStats.mobs : 0

  // ETA de nivel: usa a taxa MEDIDA da sessao. Sem abate nenhum ainda a taxa e
  // zero e o resultado seria infinito — mostrado como "—" em vez de "Infinityh".
  const xpPorSegundo = taxas.xpPerHour / 3600
  const species = activePoke ? SPECIES[activePoke.speciesId] : null
  const progressoPoke = activePoke && species ? expProgressForInstance(activePoke, species) : null
  const faltaPoke = progressoPoke ? Math.max(0, progressoPoke.needed - progressoPoke.into) : 0
  const progressoTreinador = trainerExpProgress(trainer)
  const faltaTreinador = Math.max(0, progressoTreinador.needed - progressoTreinador.into)

  const odds = mapDef ? huntOdds(mapDef) : null

  return (
    <GameWindow
      winKey="analyzer"
      widthEm={40}
      zIndex={31}
      backdrop={{ zIndex: 30 }}
      onClose={fechar}
      title="Hunt Analyzer"
    >
      <div className="flex flex-col gap-[.55em]">
        <div className="flex flex-wrap items-center gap-[.5em]">
          <b className="font-medium">{mapDef?.name ?? 'Hospital'}</b>
          {mapDef && (
            <span className="text-[.8em] text-n500">
              Lv {mapDef.levelRange[0]}–{mapDef.levelRange[1]}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-[.8em] text-n500">
            {amostraIniciada ? `Amostra desta sessao: ${duracao(segundos)}` : 'Amostra ainda nao iniciada — entre numa hunt'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-[.5em] sm:grid-cols-4">
          <Metrica
            icone={<Coin weight="fill" />} rotulo="Ouro / hora"
            valor={fmt.format(taxas.goldPerHour)} cor="var(--color-gold)"
            detalhe={`${fmt.format(Math.round(perfStats.gold))} no total`}
          />
          <Metrica
            icone={<Lightning weight="fill" />} rotulo="XP / hora"
            valor={fmt.format(taxas.xpPerHour)}
            detalhe={`${fmt.format(Math.round(perfStats.xp))} no total`}
          />
          <Metrica
            icone={<Target weight="fill" />} rotulo="Abates / hora"
            valor={fmt.format(taxas.mobsPerHour)}
            detalhe={`${fmt.format(perfStats.mobs)} no total`}
          />
          <Metrica
            icone={<Sparkle weight="fill" />} rotulo="Shinys"
            valor={String(perfStats.shinys)} cor="var(--color-shiny)"
            detalhe={perfStats.mobs > 0 ? `1 a cada ${fmt.format(Math.round(perfStats.mobs / Math.max(1, perfStats.shinys)))} abates` : undefined}
          />
        </div>

        <div>
          <SectionLabel>POR ABATE</SectionLabel>
          <div className="mt-[.35em] grid grid-cols-3 gap-[.5em]">
            <Metrica icone={<Coin />} rotulo="Ouro medio" valor={ouroPorAbate.toFixed(1)} cor="var(--color-gold)" />
            <Metrica icone={<Lightning />} rotulo="XP medio" valor={xpPorAbate.toFixed(1)} />
            <Metrica icone={<Clock />} rotulo="Tempo medio" valor={duracao(segundosPorAbate)} />
          </div>
        </div>

        <div>
          <SectionLabel>NESTE RITMO</SectionLabel>
          <div className="mt-[.35em] grid grid-cols-2 gap-[.5em] sm:grid-cols-4">
            <Metrica
              icone={<ChartLineUp />} rotulo="Ouro em 1h"
              valor={fmt.format(taxas.goldPerHour)} cor="var(--color-gold)"
            />
            <Metrica
              icone={<ChartLineUp />} rotulo="Ouro em 8h"
              valor={fmt.format(taxas.goldPerHour * 8)} cor="var(--color-gold)"
            />
            <Metrica
              icone={<Clock />} rotulo="Proximo nivel do POKE"
              valor={xpPorSegundo > 0 && progressoPoke ? duracao(faltaPoke / xpPorSegundo) : '—'}
              detalhe={progressoPoke ? `faltam ${fmt.format(faltaPoke)} XP` : 'sem POKE ativo'}
            />
            <Metrica
              icone={<Clock />} rotulo="Proximo nivel do Treinador"
              valor={xpPorSegundo > 0 ? duracao(faltaTreinador / xpPorSegundo) : '—'}
              detalhe={`faltam ${fmt.format(faltaTreinador)} XP`}
            />
          </div>
          {perfStats.mobs === 0 && (
            <p className="mt-[.3em] text-[.75em] text-warn">
              Nenhum abate registrado nesta amostra ainda — as projeções aparecem depois do primeiro.
            </p>
          )}
        </div>

        {odds && (
          <div>
            <SectionLabel>O QUE NASCE AQUI</SectionLabel>
            <div className="mt-[.35em] max-h-[14em] overflow-y-auto rounded-[.5em] border border-n800">
              {odds.species.map(({ id, species: sp, pct }) => (
                <div key={id} className="flex items-center gap-[.5em] border-b border-n800 px-[.6em] py-[.3em] text-[.82em] last:border-b-0">
                  {faceIconUrl(sp.id) && (
                    <img src={faceIconUrl(sp.id) ?? undefined} alt="" className="h-[1.6em] w-[1.6em] shrink-0 object-contain" />
                  )}
                  <span className="min-w-[6em] flex-1 truncate">{sp.name}</span>
                  <TypeChip type={sp.type} />
                  {sp.type2 && <TypeChip type={sp.type2} />}
                  <span className="w-[4em] text-right tabular-nums text-n400">{pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[.72em] text-n500">
          A amostra zera toda vez que você entra numa hunt (é ela que o servidor usa como referência do
          piso do farm offline). Trocar de hunt recomeça a medição.
        </p>
      </div>
    </GameWindow>
  )
}
