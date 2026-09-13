import { Sword, Trophy } from '@phosphor-icons/react'
import { Carregando, ComingSoon, GameButton, GameCard, SectionLabel } from '@/components/game/controls'
import { usePvpRanked } from './usePvpRanked'

const NOME_DIVISAO: Record<string, string> = {
  bronze_1: 'Bronze I', bronze_2: 'Bronze II', bronze_3: 'Bronze III',
  prata_1: 'Prata I', prata_2: 'Prata II', prata_3: 'Prata III',
  ouro_1: 'Ouro I', ouro_2: 'Ouro II', ouro_3: 'Ouro III',
  platina_1: 'Platina I', platina_2: 'Platina II', platina_3: 'Platina III',
  diamante_1: 'Diamante I', diamante_2: 'Diamante II', diamante_3: 'Diamante III',
  mestre: 'Mestre',
}

export function PvpRankedTab() {
  const pvp = usePvpRanked()

  if (!pvp.servidorConfigurado) {
    return (
      <ComingSoon icon={<Sword />} title="Ranqueado indisponível neste ambiente">
        Este ambiente não tem o servidor de autoridade configurado — a resolução do
        ranqueado é sempre server-side, sem ele não há como jogar uma partida com valendo.
      </ComingSoon>
    )
  }

  if (pvp.carregando) return <Carregando texto="Carregando seu rank..." />

  if (pvp.resultado) {
    const venci = pvp.resultado.vencedorId != null
    return (
      <GameCard className="flex flex-col items-center gap-[.5em] p-[1em] text-center">
        <Trophy className="text-[2em] text-primary" />
        <div className="text-[1.1em] font-medium">
          {pvp.resultado.jaResolvido
            ? 'Esse duelo já tinha sido resolvido.'
            : venci ? 'Vitória!' : 'Derrota'}
        </div>
        {pvp.resultado.pdlDeltaAnfitriao != null && (
          <div className="text-[.85em] text-n400">
            {pvp.resultado.turnos != null && <>Duelo em {pvp.resultado.turnos} turnos. </>}
            PDL: {pvp.resultado.pdlDeltaAnfitriao >= 0 ? '+' : ''}{pvp.resultado.pdlDeltaAnfitriao}
          </div>
        )}
        <GameButton variant="primary" onClick={pvp.limparResultado}>Fechar</GameButton>
      </GameCard>
    )
  }

  const rank = pvp.rank
  return (
    <div className="flex flex-col gap-[.75em]">
      <div className="rounded-[.7em] border border-n800 bg-n900 p-[.65em]">
        <div className="mb-[.45em] flex items-center gap-[.35em]">
          <Trophy className="text-[1.1em] text-primary" />
          <SectionLabel>SUA TEMPORADA</SectionLabel>
        </div>
        {rank && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[1.05em] font-medium">{NOME_DIVISAO[rank.divisao] ?? rank.divisao}</div>
              <div className="text-[.8em] text-n400">{rank.pdl} PDL · {rank.vitorias}V {rank.derrotas}D</div>
            </div>
            <div className={`text-[.85em] ${rank.partidasHoje >= 5 ? 'text-bad' : 'text-n400'}`}>
              {rank.partidasHoje}/5 partidas hoje
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[.7em] border border-n800 bg-n900 p-[.65em] text-center">
        {pvp.procurando ? (
          <div className="flex flex-col items-center gap-[.45em]">
            <span className="text-[.9em] text-n300">Procurando oponente da sua faixa de MMR...</span>
            <GameButton variant="danger" onClick={() => { void pvp.cancelar() }}>Cancelar</GameButton>
          </div>
        ) : (
          <GameButton
            variant="primary"
            block
            disabled={rank != null && rank.partidasHoje >= 5}
            onClick={() => { void pvp.entrarNaFila() }}
          >
            <Sword /> Procurar oponente
          </GameButton>
        )}
        {rank != null && rank.partidasHoje >= 5 && (
          <div className="mt-[.4em] text-[.78em] text-n500">Limite diário atingido — volta amanhã.</div>
        )}
      </div>
    </div>
  )
}
