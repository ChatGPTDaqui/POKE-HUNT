import { useMemo } from 'react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { marcosDaJornada, proximoBioma, MARCOS_BESTIARIO, type MarcoDaJornada } from '@/data/jornada'
import { maiorEstagioLimpo } from '@/data/progressoDeBioma'
import { cadeiaDoTipo, chaveDaMissao, MISSAO_TYPES } from '@/data/missoes'
import { ESPECIALIDADE_TYPES, ESPECIALIDADE_NIVEL_MAX } from '@/data/especialidades'
import { SPECIES } from '@/data/pokes'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { GameButton, Meter } from '@/components/game/controls'
import { avisarTrancado, useTrancas } from '@/features/primeirosPassos/useDesbloqueio'

export function useJornada() {
  const progresso = useGameStateStore(s => s.biomaProgress)
  const continentes = useGameStateStore(s => s.unlockedContinents)
  return useMemo(() => marcosDaJornada(progresso, continentes.includes('nightmare')), [progresso, continentes])
}

export function ProximoObjetivo() {
  const marcos = useJornada()
  const progresso = useGameStateStore(s => s.biomaProgress)
  const atual = marcos.find(m => m.atual < m.alvo)
  const bioma = atual?.estagio ? proximoBioma(progresso, atual.estagio, atual.pesadelo) : null
  const detalhe = bioma ? `${bioma.nome} · estágio ${maiorEstagioLimpo(progresso, bioma.chave, atual?.pesadelo) + 1}` : atual?.nome
  return <button type="button" onClick={() => useUiStore.getState().openScreen('hunts')}
    className="jogo-botao pointer-events-auto max-w-full truncate rounded-b bg-n900/90 px-[.6em] py-[.3em] text-[.72em] text-n300"
    aria-label="Abrir jornada e próximo objetivo">
    {atual ? `Próximo objetivo: ${detalhe}` : 'Jornada concluída · explore suas trilhas paralelas'}
  </button>
}

export function JornadaDoTreinador({ onBioma, onLance }: {
  onBioma: (chave: string, pesadelo: boolean) => void
  onLance: () => void
}) {
  const marcos = useJornada()
  const progresso = useGameStateStore(s => s.biomaProgress)
  const kills = useGameStateStore(s => s.pokedexKills)
  const missoes = useGameStateStore(s => s.missoesReivindicadas)
  const especialidades = useGameStateStore(s => s.especialidades)
  const ativo = useGameStateStore(s => s.team[s.activeIndex]?.speciesId)
  const especieAtiva = ativo ? SPECIES[ativo] : null
  const lanceVencido = marcos.find(m => m.id === 'lance')!.atual > 0
  const atual = marcos.find(m => m.atual < m.alvo)
  const tranca = useTrancas()
  // Mesmo cadeado da doca: atalho daqui não pode furar o que a barra tranca.
  const abrir = (screen: 'tasks' | 'bestiario' | 'especialidades') => {
    const passo = tranca(screen)
    if (passo) avisarTrancado(passo)
    else useUiStore.getState().openScreen(screen)
  }
  const missao = MISSAO_TYPES.flatMap(tipo => {
    const m = cadeiaDoTipo(tipo).find(m => !missoes[chaveDaMissao(tipo, m.speciesId)])
    if (!m) return []
    const k = kills[m.speciesId]
    return [{ ...m, tipo, total: (k?.normal ?? 0) + (k?.shiny ?? 0) }]
  }).sort((a, b) => Math.min(1, b.total / b.alvo) - Math.min(1, a.total / a.alvo))[0]
  const pesquisa = Object.keys(SPECIES).flatMap(id => {
    if (LEGENDARY_SPECIES_IDS.includes(id)) return []
    const k = kills[id]
    const total = (k?.normal ?? 0) + (k?.shiny ?? 0)
    const alvo = MARCOS_BESTIARIO.find(a => total < a)
    return total > 0 && alvo ? [{ id, total, alvo }] : []
  }).sort((a, b) => b.total / b.alvo - a.total / a.alvo)[0]
  const tipo = ESPECIALIDADE_TYPES.filter(t => (especialidades[t]?.dano ?? 0) + (especialidades[t]?.defesa ?? 0) < ESPECIALIDADE_NIVEL_MAX * 2)
    .sort((a, b) => Number(b === especieAtiva?.type || b === especieAtiva?.type2) - Number(a === especieAtiva?.type || a === especieAtiva?.type2)
      || ((especialidades[b]?.dano ?? 0) + (especialidades[b]?.defesa ?? 0)) - ((especialidades[a]?.dano ?? 0) + (especialidades[a]?.defesa ?? 0)))[0]
  const acao = (m: MarcoDaJornada) => {
    if (m.id === 'lance') return <GameButton onClick={onLance} disabled={marcos.find(m => m.id === 'preparacao')!.atual < marcos.find(m => m.id === 'preparacao')!.alvo}>Ver Lance</GameButton>
    const bioma = proximoBioma(progresso, m.estagio!, m.pesadelo)
    if (!bioma) return null
    return <GameButton disabled={m.pesadelo && !lanceVencido} onClick={() => onBioma(bioma.chave, !!m.pesadelo)}>
      {bioma.nome} · estágio {maiorEstagioLimpo(progresso, bioma.chave, m.pesadelo) + 1}
    </GameButton>
  }
  // Pesadelo só aparece depois de Lance: antes disso são dois marcos em 0/12
  // sobre um modo que o jogador nem sabe que existe. Recolhida por padrão — o
  // "o que fazer agora" é o cartão de Primeiros Passos da HUD.
  const visiveis = marcos.filter(m => !m.pesadelo || lanceVencido)
  return <details className="rounded-[.6em] border border-primary/40 bg-n900 p-[.65em]">
    <summary className="cursor-pointer font-medium">Jornada do Treinador · {visiveis.filter(m => m.atual >= m.alvo).length}/{visiveis.length} marcos</summary>
    <p className="my-[.5em] text-[.8em] text-n400">{atual ? `Seu próximo marco: ${atual.nome}.` : 'Todos os marcos da jornada foram concluídos!'} As trilhas são metas sugeridas, não novas travas.</p>
    <div className="grid gap-[.5em] [grid-template-columns:repeat(auto-fit,minmax(min(100%,15em),1fr))]">
      {visiveis.map(m => <section key={m.id} aria-label={m.nome} className="rounded border border-n800 p-[.5em]">
        <div className="text-[.85em] font-medium">{m.atual >= m.alvo ? '✓ ' : ''}{m.nome} · {m.atual}/{m.alvo}</div>
        <Meter pct={m.atual / m.alvo * 100} height=".3em" color="var(--color-primary)" className="my-[.4em]" />
        <p className="mb-[.5em] text-[.75em] text-n400">{m.retorno}</p>
        {m.atual < m.alvo && acao(m)}
      </section>)}
    </div>
    <div className="mt-[.6em] grid gap-[.5em] text-[.8em] [grid-template-columns:repeat(auto-fit,minmax(min(100%,14em),1fr))]">
      <section><h3 className="font-medium">Missões · ouro para sua equipe</h3><p className="my-[.4em] text-n400">{missao ? `${SPECIES[missao.speciesId]?.name ?? missao.speciesId}: ${Math.min(missao.total, missao.alvo)}/${missao.alvo} abates · ${missao.recompensa.toLocaleString('pt-BR')} ouro. ${missao.total >= missao.alvo ? 'Recompensa pronta para reivindicar.' : 'Conclua e reivindique para liberar a próxima missão do tipo.'}` : 'Todas as cadeias foram reivindicadas.'}</p><GameButton onClick={() => abrir('tasks')}>Ver missões</GameButton></section>
      <section><h3 className="font-medium">Bestiário · pesquisa de espécies</h3><p className="my-[.4em] text-n400">{pesquisa ? `${SPECIES[pesquisa.id]?.name}: ${pesquisa.total.toLocaleString('pt-BR')}/${pesquisa.alvo.toLocaleString('pt-BR')} abates para o próximo estágio.` : 'Consulte as espécies pesquisadas ou escolha uma nova espécie para estudar.'}</p><GameButton onClick={() => abrir('bestiario')}>Ver Bestiário</GameButton></section>
      <section><h3 className="font-medium">Especialidades · fortaleça seus tipos</h3><p className="my-[.4em] text-n400">{tipo ? `${tipo}: dano ${especialidades[tipo]?.dano ?? 0}/${ESPECIALIDADE_NIVEL_MAX}, defesa ${especialidades[tipo]?.defesa ?? 0}/${ESPECIALIDADE_NIVEL_MAX}. Invista ouro e Stones em um tipo usado pela sua equipe.` : 'Todas as especialidades estão no máximo.'}</p><GameButton onClick={() => abrir('especialidades')}>Ver especialidades</GameButton></section>
    </div>
  </details>
}
