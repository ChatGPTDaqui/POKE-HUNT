import { useState } from 'react'
import { Clock, Sword, X } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Carregando, ComingSoon, GameButton, GameInput, SectionLabel, SegmentedTabs } from '@/components/game/controls'
import * as rankingRpc from '@/data/remote/rankingRpc'
import { useAuthStore } from '@/stores/authStore'
import { usePvp } from './usePvp'
import { PvpBuildTab } from './PvpBuildTab'
import { PvpRankedTab } from './PvpRankedTab'

type AbaPvp = 'lobby' | 'build' | 'ranked' | 'torneios'

function useNick(userId: string | null): string {
  const { data } = useQuery({
    queryKey: ['perfil-publico', userId],
    queryFn: () => rankingRpc.perfilPublico(userId as string),
    enabled: !!userId,
    staleTime: 300000,
  })
  return data?.nome ?? 'treinador'
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function PvpMenu() {
  const [aba, setAba] = useState<AbaPvp>('lobby')
  const pvp = usePvp()
  const [nick, setNick] = useState('')
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const nickDoOutro = useNick(pvp.outroId)

  const abas = (
    <SegmentedTabs
      value={aba}
      onChange={setAba}
      options={[
        { value: 'lobby', label: 'Lobby' },
        { value: 'build', label: 'Build' },
        { value: 'ranked', label: 'Ranked' },
        { value: 'torneios', label: 'Torneios' },
      ]}
      className="mb-[.65em]"
    />
  )

  if (aba === 'build') return <div className="flex flex-col gap-[.75em]">{abas}<PvpBuildTab /></div>
  if (aba === 'ranked') return <div className="flex flex-col gap-[.75em]">{abas}<PvpRankedTab /></div>
  if (aba === 'torneios') {
    return (
      <div className="flex flex-col gap-[.75em]">
        {abas}
        <ComingSoon icon={<Sword />} title="Torneios em breve">
          Torneio semanal e batalha em dupla ainda estão a caminho.
        </ComingSoon>
      </div>
    )
  }

  if (pvp.carregando) return <div className="flex flex-col gap-[.75em]">{abas}<Carregando texto="Procurando convites PvP..." /></div>

  const souConvidado = pvp.papel === 'convidado'
  const podeEnviar = nick.trim().length >= 2 && !pvp.sessao

  return (
    <div className="flex flex-col gap-[.75em]">
      {abas}
      <div className="rounded-[.7em] border border-n800 bg-n900 p-[.65em]">
        <div className="mb-[.45em] flex items-center gap-[.35em]">
          <Sword className="text-[1.1em] text-n300" />
          <SectionLabel>CONVITE</SectionLabel>
        </div>

        {!pvp.sessao ? (
          <div className="flex gap-[.4em]">
            <GameInput
              className="flex-1"
              placeholder="Nick do treinador"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && podeEnviar) void pvp.convidarPorNick(nick)
              }}
            />
            <GameButton
              variant="primary"
              carregando={pvp.ocupado}
              disabled={!podeEnviar}
              onClick={() => { void pvp.convidarPorNick(nick) }}
            >
              Convidar
            </GameButton>
          </div>
        ) : pvp.sessao.estado === 'convidada' ? (
          <div className="flex flex-col gap-[.45em]">
            <span className="text-[.9em]">
              {souConvidado
                ? <><strong>{nickDoOutro}</strong> te chamou para um duelo.</>
                : <>Convite enviado para <strong>{nickDoOutro}</strong>.</>}
            </span>
            <span className="flex items-center gap-[.25em] text-[.78em] text-n500">
              <Clock /> aguardando aceite
            </span>
            <div className="flex gap-[.4em]">
              {souConvidado ? (
                <GameButton variant="primary" block carregando={pvp.ocupado} onClick={() => { void pvp.aceitar() }}>
                  Aceitar
                </GameButton>
              ) : null}
              <GameButton variant="danger" block carregando={pvp.ocupado} onClick={() => { void pvp.recusarOuCancelar() }}>
                {souConvidado ? 'Recusar' : 'Cancelar'}
              </GameButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[.45em]">
            <span className="text-[.9em]">Duelo aceito contra <strong>{nickDoOutro}</strong>.</span>
            <div className="flex gap-[.4em]">
              <GameButton variant="primary" block onClick={() => pvp.entrarNaArena(nickDoOutro)}>
                Entrar no mapa PvP
              </GameButton>
              <GameButton variant="danger" block carregando={pvp.ocupado} onClick={() => { void pvp.recusarOuCancelar() }}>
                <X /> Cancelar
              </GameButton>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[.7em] border border-n800 bg-n900 p-[.65em]">
        <SectionLabel>HISTÓRICO PVP</SectionLabel>
        <div className="mt-[.45em] flex max-h-[15em] flex-col gap-[.3em] overflow-y-auto">
          {pvp.historico.length === 0 ? (
            <span className="text-[.82em] text-n500">Nenhum duelo registrado ainda.</span>
          ) : pvp.historico.map((h) => {
            const euVenci = h.vencedorId != null && h.vencedorId === meuId
            const empate = h.vencedorId == null
            return (
              <div key={h.id} className="flex items-center gap-[.45em] rounded-[.45em] border border-n800 px-[.45em] py-[.35em]">
                <span className={euVenci ? 'text-green-400' : empate ? 'text-n400' : 'text-bad'}>
                  {empate ? 'Encerrado' : euVenci ? 'Vitória' : 'Derrota'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[.82em] text-n400">
                  sessão {h.sessaoId.slice(0, 8)}
                </span>
                <span className="shrink-0 text-[.75em] text-n500">{formatarData(h.encerradaEm)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
