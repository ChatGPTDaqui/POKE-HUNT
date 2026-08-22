// Lista de amigos e de bloqueados (PH-74).
//
// Cada linha e um alvo de acao, nao so texto: conversar, escrever no correio,
// remover e bloquear. Remover e bloquear passam pelo ConfirmDialog — as duas
// sao destrutivas e bloquear ainda desfaz a amizade junto, o que nao e obvio
// pelo rotulo do botao.
import { ChatCircle, Envelope, Prohibit, UserMinus } from '@phosphor-icons/react'
import { GameButton, GameCard, SectionLabel } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { SPECIES } from '@/data/pokes'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import type { AmigoDetalhado, BloqueadoRemoto } from '@/data/remote/servidor'
import { cn } from '@/lib/utils'

interface Props {
  amigos: AmigoDetalhado[]
  bloqueados: BloqueadoRemoto[]
  selecionado: string | null
  ocupado: boolean
  onSelecionar: (amigo: AmigoDetalhado) => void
  onEscrever: (nick: string) => void
  onRemover: (amigo: AmigoDetalhado) => void
  onBloquear: (amigo: AmigoDetalhado) => void
  onDesbloquear: (bloqueado: BloqueadoRemoto) => void
}

export function PainelAmigos({
  amigos, bloqueados, selecionado, ocupado,
  onSelecionar, onEscrever, onRemover, onBloquear, onDesbloquear,
}: Props) {
  const confirmar = useConfirmDialogStore((s) => s.confirm)

  // Online primeiro, depois quem tem mensagem esperando, depois alfabetico. A
  // ordem alfabetica pura enterraria justamente quem esta falando com voce.
  const ordenados = [...amigos].sort((a, b) =>
    Number(b.online) - Number(a.online)
    || b.naoLidas - a.naoLidas
    || a.nome.localeCompare(b.nome))

  return (
    <div className="flex flex-col gap-[.55em]">
      <div>
        <SectionLabel>
          AMIGOS ({amigos.length}){amigos.some((a) => a.online) && ` · ${amigos.filter((a) => a.online).length} online`}
        </SectionLabel>

        {amigos.length === 0 && (
          <p className="mt-[.3em] text-n400">
            Voce ainda nao tem amigos. Mande um pedido pelo nick acima.
          </p>
        )}

        <div className="mt-[.4em] flex flex-col gap-[.35em]">
          {ordenados.map((a) => {
            const especie = a.pokeAtivo ? SPECIES[a.pokeAtivo.speciesId] : undefined
            const ativo = selecionado === a.userId
            return (
              <GameCard
                key={a.userId}
                className={cn(
                  'flex flex-wrap items-center gap-[.5em] p-[.45em]',
                  ativo && 'border-primary',
                )}
                onClick={() => onSelecionar(a)}
              >
                <span
                  aria-hidden
                  title={a.online ? 'Online' : 'Offline'}
                  className={cn('h-[.55em] w-[.55em] shrink-0 rounded-full', a.online ? 'bg-ok' : 'bg-n600')}
                />

                {especie && a.pokeAtivo && (
                  <PokeSwatch species={especie} isShiny={a.pokeAtivo.shiny} size={2} />
                )}

                <div className="min-w-[7em] flex-1">
                  <div className="flex flex-wrap items-center gap-[.35em]">
                    <b className="font-medium">{a.nome}</b>
                    {a.naoLidas > 0 && (
                      <span className="rounded-full bg-primary px-[.4em] text-[.7em] text-background">
                        {a.naoLidas}
                      </span>
                    )}
                  </div>
                  <div className="text-[.75em] text-n400">
                    Treinador Nv {a.nivel}
                    {especie && a.pokeAtivo && ` · ${especie.name} Nv ${a.pokeAtivo.nivel}`}
                  </div>
                </div>

                <div className="flex shrink-0 gap-[.25em]">
                  <GameButton
                    variant={ativo ? 'primary' : 'secondary'}
                    title="Conversar"
                    aria-label={`Conversar com ${a.nome}`}
                    onClick={(e) => { e.stopPropagation(); onSelecionar(a) }}
                  >
                    <ChatCircle />
                  </GameButton>
                  <GameButton
                    variant="ghost"
                    title="Mandar mensagem no correio"
                    aria-label={`Escrever para ${a.nome}`}
                    onClick={(e) => { e.stopPropagation(); onEscrever(a.nome) }}
                  >
                    <Envelope />
                  </GameButton>
                  <GameButton
                    variant="ghost"
                    title="Remover amigo"
                    aria-label={`Remover ${a.nome}`}
                    disabled={ocupado}
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmar({
                        title: 'Remover amigo',
                        message: `${a.nome} sai da sua lista e voce sai da lista dele. A conversa entre voces some do alcance dos dois.`,
                        confirmLabel: 'Remover',
                        onConfirm: () => onRemover(a),
                      })
                    }}
                  >
                    <UserMinus />
                  </GameButton>
                  <GameButton
                    variant="ghost"
                    title="Bloquear"
                    aria-label={`Bloquear ${a.nome}`}
                    disabled={ocupado}
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmar({
                        title: `Bloquear ${a.nome}`,
                        // Diz o efeito colateral: bloquear tambem DESFAZ a
                        // amizade, e ninguem espera isso lendo so "Bloquear".
                        message: `${a.nome} deixa de ser seu amigo e nao consegue mais mandar pedido, mensagem nem conversa. Voce tambem nao consegue mandar nada pra ele.`,
                        confirmLabel: 'Bloquear',
                        onConfirm: () => onBloquear(a),
                      })
                    }}
                  >
                    <Prohibit />
                  </GameButton>
                </div>
              </GameCard>
            )
          })}
        </div>
      </div>

      {bloqueados.length > 0 && (
        <div>
          <SectionLabel>BLOQUEADOS ({bloqueados.length})</SectionLabel>
          <div className="mt-[.3em] flex flex-col gap-[.25em]">
            {bloqueados.map((b) => (
              <div
                key={b.userId}
                className="flex items-center justify-between rounded-[.45em] border border-n800 px-[.6em] py-[.3em] text-[.85em]"
              >
                <span className="text-n300">{b.nome}</span>
                <GameButton variant="ghost" disabled={ocupado} onClick={() => onDesbloquear(b)}>
                  Desbloquear
                </GameButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
