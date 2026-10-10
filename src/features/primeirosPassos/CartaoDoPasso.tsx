// O objetivo da HUD: o Primeiro Passo atual, com barra ao vivo e recompensa.
//
// Substitui o texto fixo "Próximo objetivo: Campo Aberto · estágio 1", que não
// andava enquanto o jogador cumpria e não dizia o que ele ganhava. Depois que a
// cadeia acaba, a HUD volta a mostrar o marco da Jornada (`ProximoObjetivo`).
//
// Tocar no cartão abre a tela em que o passo se cumpre; quando o passo está
// cumprido, o botão Coletar pede a recompensa ao servidor.
import { useEffect, useMemo, useState } from 'react'
import { Gift } from '@phosphor-icons/react'
import { PRIMEIROS_PASSOS, situacaoDosPassos, type PassoDef, type RecompensaDoPasso } from '@/data/primeirosPassos'
import { getItem } from '@/data/items'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { useToastStore } from '@/stores/toastStore'
import { pedirAcao, liquidar } from '@/data/remote/autoridade'
import { ErroServidor, servidorAtivo } from '@/data/remote/servidor'
import { Meter } from '@/components/game/controls'
import { ProximoObjetivo } from '@/features/hunt/JornadaDoTreinador'
import { cn } from '@/lib/utils'

export function textoDaRecompensa(r: RecompensaDoPasso): string {
  const partes = r.ouro > 0 ? [`${r.ouro.toLocaleString('pt-BR')} ouro`] : []
  for (const i of r.itens) partes.push(`${i.quantidade} ${getItem(i.itemId)?.name ?? i.itemId}`)
  return partes.join(' + ')
}

function useSituacao() {
  const pokedexKills = useGameStateStore(s => s.pokedexKills)
  const team = useGameStateStore(s => s.team)
  const bagPokes = useGameStateStore(s => s.bagPokes)
  const biomaProgress = useGameStateStore(s => s.biomaProgress)
  const missoesReivindicadas = useGameStateStore(s => s.missoesReivindicadas)
  const especialidades = useGameStateStore(s => s.especialidades)
  const trainer = useGameStateStore(s => s.trainer)
  const reivindicados = usePassosStore(s => s.reivindicados)
  return useMemo(
    () => situacaoDosPassos({ pokedexKills, team, bagPokes, biomaProgress, missoesReivindicadas, especialidades, trainer }, reivindicados),
    [pokedexKills, team, bagPokes, biomaProgress, missoesReivindicadas, especialidades, trainer, reivindicados],
  )
}

function abrirDestino(p: PassoDef): void {
  const ui = useUiStore.getState()
  if (p.destino === 'auto') ui.setAutoOpen(true)
  else ui.openScreen(p.destino ?? 'hunts')
}

async function coletar(p: PassoDef): Promise<void> {
  // A RPC lê o save GRAVADO. Liquidar a caçada antes põe no banco os abates
  // que a tela já mostra; sem sessão aberta isso não faz nada.
  await liquidar().catch(() => {})
  const ok = await pedirAcao({ tipo: 'reivindicarPasso', passoId: p.id }, () => {
    const g = useGameStateStore.getState()
    if (p.recompensa.ouro > 0) g.addGold(p.recompensa.ouro)
    for (const i of p.recompensa.itens) g.addItem(i.itemId, i.quantidade)
  }, {
    tratarErroLocalmente: (erro) => {
      // Outra aba já coletou: só alinha o estado, sem toast vermelho.
      if (!(erro instanceof ErroServidor) || erro.message !== 'Passo ja reivindicado.') return false
      usePassosStore.getState().marcar(p.id)
      return true
    },
  })
  if (!ok) return
  usePassosStore.getState().marcar(p.id)
  useToastStore.getState().pushToast(`Recompensa: ${textoDaRecompensa(p.recompensa)}`, 'success', 'world')
}

export function CartaoDoPasso() {
  const carregado = usePassosStore(s => s.carregado)
  const { atual, indice, progresso, pronto } = useSituacao()
  const [coletando, setColetando] = useState(false)
  const emCampo = useWorldStore(s => s.mapDef != null)

  useEffect(() => {
    if (carregado) return
    if (servidorAtivo()) void usePassosStore.getState().carregar()
    else usePassosStore.setState({ carregado: true })
  }, [carregado])

  // Sem saber o que já foi pago, não oferece nada: mostrar "Coletar" de um
  // passo já reivindicado só renderia uma recusa do servidor.
  if (!carregado || !atual) return <ProximoObjetivo />

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-[min(100%,24em)] items-stretch gap-[.4em] rounded-b border-x border-b bg-n900/92 px-[.55em] py-[.3em] text-[.78em]',
        pronto ? 'border-ok/60' : 'border-n800',
      )}
    >
      <button type="button" onClick={() => abrirDestino(atual)} className="min-w-0 flex-1 text-left"
        aria-label={`Primeiros Passos ${indice + 1} de ${PRIMEIROS_PASSOS.length}: ${atual.titulo}. ${atual.dica}`}>
        <div className="flex items-baseline gap-[.4em]">
          <span className="shrink-0 rounded-[.3em] bg-primary/20 px-[.3em] text-[.8em] font-bold uppercase text-primary">Passo {indice + 1}</span>
          <span className="truncate font-medium text-n100">{atual.titulo}</span>
          <span className="ml-auto shrink-0 tabular-nums text-n300">{progresso}/{atual.alvo}</span>
        </div>
        <Meter pct={progresso / atual.alvo * 100} height=".28em" color={pronto ? 'var(--color-ok)' : 'var(--color-primary)'} className="my-[.25em]" />
        <div className="flex items-center gap-[.3em] text-[.9em] text-n400">
          <Gift weight="fill" className="shrink-0 text-warn" aria-hidden />
          <span className="truncate">{pronto ? 'Pronto! Colete a recompensa' : textoDaRecompensa(atual.recompensa)}</span>
        </div>
        {!pronto && <p className="mt-[.15em] line-clamp-2 text-[.9em] text-n500">{(emCampo && atual.dicaEmCampo) || atual.dica}</p>}
      </button>
      {pronto && (
        <button type="button" disabled={coletando}
          onClick={async () => { setColetando(true); try { await coletar(atual) } finally { setColetando(false) } }}
          className="jogo-botao shrink-0 self-center rounded-[.5em] bg-ok px-[.7em] py-[.45em] font-bold text-n950 disabled:opacity-60 animate-pulse">
          {coletando ? '...' : 'Coletar'}
        </button>
      )}
    </div>
  )
}
