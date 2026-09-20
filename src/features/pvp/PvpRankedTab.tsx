import { useEffect, useState } from 'react'
import { Shield, Sword, Trophy } from '@phosphor-icons/react'
import { Carregando, ComingSoon, GameButton, SectionLabel } from '@/components/game/controls'
import { SPECIES } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import * as pvpRpc from '@/data/remote/pvpRpc'
import { usePvpRanked } from './usePvpRanked'

const NOME_DIVISAO: Record<string, string> = {
  bronze_1: 'Bronze I', bronze_2: 'Bronze II', bronze_3: 'Bronze III',
  prata_1: 'Prata I', prata_2: 'Prata II', prata_3: 'Prata III',
  ouro_1: 'Ouro I', ouro_2: 'Ouro II', ouro_3: 'Ouro III',
  platina_1: 'Platina I', platina_2: 'Platina II', platina_3: 'Platina III',
  diamante_1: 'Diamante I', diamante_2: 'Diamante II', diamante_3: 'Diamante III',
  mestre: 'Mestre',
}
const LIMITE_DIARIO = 5

function formatarDelta(n: number | null): string {
  if (n == null || n === 0) return '±0 PDL'
  return `${n > 0 ? '+' : ''}${n} PDL`
}

export function PvpRankedTab() {
  const pvp = usePvpRanked()
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const [nomes, setNomes] = useState<Record<string, string>>({})

  const idsDosAtacantes = pvp.defesasRecentes.map((h) => h.anfitriaoId).filter((id) => !(id in nomes))
  useEffect(() => {
    if (idsDosAtacantes.length === 0) return
    let vivo = true
    void Promise.all(idsDosAtacantes.map(async (id) => [id, (await pvpRpc.nomeDoTreinador(id).catch(() => null)) ?? 'treinador'] as const))
      .then((pares) => { if (vivo) setNomes((n) => ({ ...n, ...Object.fromEntries(pares) })) })
    return () => { vivo = false }
  }, [idsDosAtacantes.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pvp.servidorConfigurado) {
    return (
      <ComingSoon icon={<Sword />} title="Ranqueado indisponível neste ambiente">
        Este ambiente não tem o servidor de autoridade configurado — a resolução do
        ranqueado é sempre server-side, sem ele não há como jogar uma partida com valendo.
      </ComingSoon>
    )
  }

  if (pvp.carregando) return <Carregando texto="Carregando seu rank..." />

  const rank = pvp.rank
  const limiteAtingido = rank != null && rank.partidasHoje >= LIMITE_DIARIO
  const meus = new Map([...team, ...bagPokes].map((p) => [p.uid, p]))
  const defesaValida = (pvp.defesa?.slots ?? []).map((s) => meus.get(s.pokemonId)).filter((p) => p != null)

  return (
    <div className="flex flex-col gap-[.75em]">
      <div className="arena-surface">
        <div className="mb-[.45em] flex items-center gap-[.35em]">
          <Trophy weight="duotone" className="text-[2em] text-gold" />
          <SectionLabel>SUA TEMPORADA</SectionLabel>
        </div>
        {rank && (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-heading text-[1.5em]">{NOME_DIVISAO[rank.divisao] ?? rank.divisao}</div>
              <div className="text-[.8em] text-n400">{rank.pdl} PDL · {rank.vitorias}V {rank.derrotas}D</div>
            </div>
            <div className={`text-[.85em] ${limiteAtingido ? 'text-bad' : 'text-n400'}`}>
              {rank.partidasHoje}/{LIMITE_DIARIO} partidas hoje
            </div>
          </div>
        )}
      </div>

      <div className="arena-surface text-center">
        <GameButton variant="primary" block disabled={limiteAtingido || pvp.atacando} carregando={pvp.atacando}
          onClick={() => { void pvp.atacar() }}>
          <Sword /> Atacar
        </GameButton>
        <p className="mt-[.45em] text-[.78em] text-n500">
          Você enfrenta a defesa salva de um treinador da sua faixa, esteja ele online ou não. Sem ninguém na faixa, um treinador bot entra (sem PDL).
        </p>
        {limiteAtingido && (
          <div className="mt-[.4em] text-[.78em] text-n500">Limite diário atingido — volta amanhã.</div>
        )}
      </div>

      <section className="arena-surface" aria-label="Sua defesa">
        <div className="mb-[.45em] flex items-center gap-[.35em]">
          <Shield weight="duotone" className="text-[1.6em] text-n300" />
          <SectionLabel>SUA DEFESA</SectionLabel>
        </div>
        {defesaValida.length === 0 ? (
          <p role="note" className="text-[.82em] text-bad">Sua defesa está vazia: você não aparece como alvo até montar e ativar um time de defesa na aba Equipe PvP.</p>
        ) : (
          <p className="text-[.82em] text-n300">
            {pvp.defesa?.nome.trim() || `Time ${pvp.defesa?.posicao}`} · {defesaValida.map((p) => SPECIES[p.speciesId]?.name ?? p.speciesId).join(' · ')}
          </p>
        )}
        <div className="mt-[.5em] flex flex-col gap-[.3em]">
          {pvp.defesasRecentes.length === 0 ? (
            <span className="text-[.78em] text-n500">Ninguém atacou sua defesa ainda.</span>
          ) : pvp.defesasRecentes.map((h) => {
            const defendeu = h.vencedorId === h.convidadoId
            return (
              <div key={h.id} className="flex items-center gap-[.45em] rounded-[.45em] border border-n800 px-[.45em] py-[.3em] text-[.8em]">
                <span className={defendeu ? 'text-green-400' : h.vencedorId == null ? 'text-n400' : 'text-bad'}>
                  {defendeu ? 'Defendeu' : h.vencedorId == null ? 'Empate' : 'Caiu'}
                </span>
                <span className="min-w-0 flex-1 truncate text-n400">contra {nomes[h.anfitriaoId] ?? '…'}</span>
                <span className="shrink-0 text-n500">{formatarDelta(h.pdlDeltaConvidado)}</span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
