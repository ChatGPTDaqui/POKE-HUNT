// Recompensas por nível de treinador na HUD, logo abaixo do cartão de passos.
//
// Com marco pendente: o que há para coletar e um "Coletar tudo" (o veterano
// que chega com dezenas de marcos coleta numa chamada só). Sem pendente e com
// os Primeiros Passos concluídos: o próximo marco e a barra até ele — a meta de
// longo prazo que sobra quando a cadeia acaba. Durante a cadeia, sem pendente,
// não aparece: um objetivo por vez.
import { useMemo, useState } from 'react'
import { Gift } from '@phosphor-icons/react'
import { MARCOS_DE_TREINADOR, situacaoDosMarcos, somaDasRecompensas, type MarcoDeTreinador } from '@/data/recompensasDeNivel'
import { PRIMEIROS_PASSOS } from '@/data/primeirosPassos'
import { trainerExpProgress } from '@/engine/systems/progressionSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { useToastStore } from '@/stores/toastStore'
import { pedirAcao, liquidar } from '@/data/remote/autoridade'
import { Meter } from '@/components/game/controls'
import { textoDaRecompensa } from './CartaoDoPasso'

async function coletarTudo(pendentes: MarcoDeTreinador[]): Promise<void> {
  // O nível recém-subido precisa estar gravado: a RPC lê `players.trainer_level`.
  await liquidar().catch(() => {})
  const soma = somaDasRecompensas(pendentes)
  const ok = await pedirAcao({ tipo: 'reivindicarNiveisDeTreinador' }, () => {
    const g = useGameStateStore.getState()
    g.addGold(soma.ouro)
    for (const i of soma.itens) g.addItem(i.itemId, i.quantidade)
  })
  if (!ok) return
  // Recarrega do banco em vez de marcar os pendentes locais: o servidor pode
  // ter pago menos (nível gravado atrás do da tela) ou mais (outra aba).
  await usePassosStore.getState().carregar()
  useToastStore.getState().pushToast(`Recompensa de treinador: ${textoDaRecompensa(soma)}`, 'success', 'world')
}

export function FaixaDoTreinador() {
  const carregado = usePassosStore(s => s.carregado)
  const coletados = usePassosStore(s => s.niveisColetados)
  const passosFeitos = usePassosStore(s => s.reivindicados.size >= PRIMEIROS_PASSOS.length)
  const trainer = useGameStateStore(s => s.trainer)
  const { pendentes, proximo } = useMemo(() => situacaoDosMarcos(trainer.level, coletados), [trainer.level, coletados])
  const [coletando, setColetando] = useState(false)

  if (!carregado) return null

  if (pendentes.length > 0) {
    const soma = somaDasRecompensas(pendentes)
    return (
      <div className="pointer-events-auto flex w-[min(100%,24em)] items-center gap-[.4em] rounded-b border-x border-b border-ok/60 bg-n900/92 px-[.55em] py-[.3em] text-[.78em]">
        <Gift weight="fill" className="shrink-0 text-[1.2em] text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-n100">
            {pendentes.length === 1 ? `Prêmio do Lv ${pendentes[0].nivel} de treinador` : `${pendentes.length} prêmios de treinador`}
          </div>
          <div className="truncate text-[.9em] text-n400">{textoDaRecompensa(soma)}</div>
        </div>
        <button type="button" disabled={coletando}
          onClick={async () => { setColetando(true); try { await coletarTudo(pendentes) } finally { setColetando(false) } }}
          className="jogo-botao shrink-0 rounded-[.5em] bg-ok px-[.7em] py-[.45em] font-bold text-n950 disabled:opacity-60">
          {coletando ? '...' : pendentes.length === 1 ? 'Coletar' : 'Coletar tudo'}
        </button>
      </div>
    )
  }

  if (!passosFeitos || !proximo) return null
  // Barra do marco anterior até o próximo, contando a fração do nível atual.
  const anterior = [...MARCOS_DE_TREINADOR].reverse().find(m => m.nivel <= trainer.level)?.nivel ?? 1
  const { into, needed } = trainerExpProgress(trainer)
  const pct = Math.min(100, ((trainer.level - anterior + into / needed) / (proximo.nivel - anterior)) * 100)
  return (
    <div className="pointer-events-auto w-[min(100%,24em)] rounded-b border-x border-b border-n800 bg-n900/92 px-[.55em] py-[.3em] text-[.78em]">
      <div className="flex items-baseline gap-[.4em]">
        <span className="shrink-0 rounded-[.3em] bg-primary/20 px-[.3em] text-[.8em] font-bold uppercase text-primary">Treinador</span>
        <span className="truncate font-medium text-n100">Próximo prêmio no Lv {proximo.nivel}</span>
        <span className="ml-auto shrink-0 tabular-nums text-n300">Lv {trainer.level}</span>
      </div>
      <Meter pct={pct} height=".28em" color="var(--color-primary)" className="my-[.25em]" />
      <div className="flex items-center gap-[.3em] text-[.9em] text-n400">
        <Gift weight="fill" className="shrink-0 text-warn" aria-hidden />
        <span className="truncate">{textoDaRecompensa(proximo.recompensa)}</span>
      </div>
    </div>
  )
}
