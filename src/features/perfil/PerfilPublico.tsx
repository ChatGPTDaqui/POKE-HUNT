// Perfil de OUTRO jogador — o que se vê ao clicar num anúncio do Mercado
// (PH-119).
//
// ---------------------------------------------------------------------------
// POR QUE UM COMPONENTE SEPARADO DO `PerfilTreinador`
// ---------------------------------------------------------------------------
// Não é a mesma tela com um `if`. `PerfilTreinador` mostra ouro, diamantes, a
// mochila e tem "Sair da conta" — e é montado uma vez em `JogoCarregado.tsx`
// lendo `useGameStateStore`, que É o save do próprio jogador. Reaproveitá-lo
// para terceiro exigiria um `if` em cada bloco, e o dia em que alguém
// esquecesse um seria o dia em que o ouro de outro jogador apareceria na tela.
//
// Separado, a regra fica estrutural: este arquivo NÃO importa
// `useGameStateStore`, então não há nada de privado ao alcance dele. O que ele
// mostra é exatamente o que `perfil_publico` devolve, e essa lista está
// justificada campo a campo na migration.
//
// ---------------------------------------------------------------------------
// O CAMINHO QUE ESTA TELA FECHA
// ---------------------------------------------------------------------------
// Anúncio do Mercado -> perfil do vendedor -> conversa. Antes o anúncio era um
// beco sem saída: o nome do vendedor era texto, e negociar exigia procurá-lo no
// Painel de Amigos — que só lista quem já é amigo, ou seja, exatamente quem não
// é o caso aqui.
import { useQuery } from '@tanstack/react-query'
import { ChatCircle, Clock, Package, Storefront, Trophy, User } from '@phosphor-icons/react'

import { Painel } from '@/components/game/Painel'
import { Carregando, GameButton } from '@/components/game/controls'
import { perfilPublico } from '@/data/remote/rankingRpc'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.floor(segundos)}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas}h ${minutos % 60}min`
  return `${Math.floor(horas / 24)}d ${horas % 24}h`
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function PerfilPublico() {
  const alvo = useUiStore((s) => s.perfilPublicoAlvo)
  const fechar = useUiStore((s) => s.fecharPerfilPublico)
  const abrirCorreioCom = useUiStore((s) => s.abrirCorreioCom)
  const meuId = useAuthStore((s) => s.user?.id ?? null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['perfil-publico', alvo?.userId],
    queryFn: () => perfilPublico(alvo!.userId),
    enabled: !!alvo,
    // O perfil de terceiro muda devagar (nível, tempo de jogo) e a tela abre e
    // fecha muito enquanto se navega o Mercado. Um minuto evita uma chamada por
    // clique sem deixar o dado velho a ponto de enganar.
    staleTime: 60_000,
  })

  if (!alvo) return null

  return (
    <Painel
      winKey="perfil"
      widthEm={26}
      zIndex={46}
      backdropZIndex={45}
      onClose={fechar}
      title="Perfil do Treinador"
      header={
        <div className="flex items-center gap-[.6em] border-b border-n800 px-[.65em] pb-[.6em]">
          <div className="flex h-[3.8em] w-[3.8em] shrink-0 items-center justify-center rounded-[.7em] border border-n700 bg-n900">
            <User className="text-[1.8em] text-n300" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[.25em]">
            {/* O nome vem do anúncio, então o título aparece antes da RPC
                responder — a janela nunca abre sem dizer de quem ela é. */}
            <div className="truncate text-[1.1em] font-semibold">{data?.nome ?? alvo.nome}</div>
            <div className="flex items-center gap-[.5em] text-[.8em] text-n300">
              {data && <span>Nível {data.nivel}</span>}
              {data && data.rank > 0 && (
                <span className="flex items-center gap-[.25em] text-gold">
                  <Trophy className="text-[1em]" /> Rank #{data.rank}
                  <span className="text-n500">de {data.totalJogadores}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      }
    >
      {isLoading && <Carregando />}

      {isError && (
        <div className="px-[.65em] py-[.8em] text-center text-[.85em] text-n400">
          Não deu para carregar este perfil agora.
        </div>
      )}

      {/* Conta apagada. A RPC devolve `existe: false` em vez de estourar —
          chegar aqui a partir de um anúncio de conta removida é um caso real, e
          um toast vermelho seria a resposta errada. */}
      {!isLoading && !isError && !data && (
        <div className="px-[.65em] py-[.8em] text-center text-[.85em] text-n400">
          Este treinador não existe mais.
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-[.5em]">
          <div className="grid grid-cols-2 gap-[.45em]">
            <Estatistica icon={<Clock />} rotulo="Tempo de jogo" valor={formatarDuracao(data.segundosJogados)} />
            <Estatistica icon={<Package />} rotulo="POKE capturados" valor={data.capturas.toLocaleString('pt-BR')} />
            <Estatistica
              icon={<Storefront />}
              rotulo="Anúncios ativos"
              valor={data.anunciosAtivos.toLocaleString('pt-BR')}
              cor={data.anunciosAtivos > 0 ? 'text-gold' : undefined}
            />
            <Estatistica icon={<User />} rotulo="Joga desde" valor={formatarData(data.contaCriadaEm)} />
          </div>

          {data.noHallDaFama && (
            <div className="flex items-center gap-[.5em] rounded-[.45em] border border-gold/40 bg-gold/10 px-[.55em] py-[.45em] text-[.8em]">
              <Trophy className="shrink-0 text-[1.1em] text-gold" />
              <span>No Hall da Fama desde {formatarData(data.noHallDaFama)}</span>
            </div>
          )}

          {/* Conversar consigo mesmo é recusado pelo servidor ("Voce nao pode
              mandar mensagem pra si mesmo"). O anúncio próprio já não vira link
              em `ComprarPokes`, mas a checagem fica aqui também: esta tela é
              alcançável por qualquer caminho que passe um `userId`, e oferecer
              um botão que só produz erro é pior que não oferecer. */}
          {data.userId === meuId ? (
            <p className="mt-[.2em] rounded-[.45em] border border-n800 px-[.55em] py-[.5em] text-center text-[.8em] text-n400">
              Este é o seu perfil, do jeito que os outros jogadores veem.
            </p>
          ) : (
            <>
              <GameButton
                className="mt-[.2em] w-full"
                onClick={() => abrirCorreioCom({ userId: data.userId, nick: data.nome })}
              >
                <ChatCircle className="text-[1.1em]" /> Conversar
              </GameButton>
              <p className="px-[.2em] text-[.7em] leading-snug text-n500">
                Abre o Correio já na conversa com {data.nome}. Não precisa ser amigo.
              </p>
            </>
          )}
        </div>
      )}
    </Painel>
  )
}

function Estatistica({ icon, rotulo, valor, cor }: {
  icon: React.ReactNode; rotulo: string; valor: string; cor?: string
}) {
  return (
    <div className="flex items-center gap-[.5em] rounded-[.45em] border border-n800 px-[.55em] py-[.45em]">
      <span className={cn('shrink-0 text-[1.2em]', cor ?? 'text-n400')}>{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[.7em] tracking-[.04em] text-n500 uppercase">{rotulo}</span>
        <span className={cn('truncate font-mono text-[.95em] font-bold', cor)}>{valor}</span>
      </div>
    </div>
  )
}
