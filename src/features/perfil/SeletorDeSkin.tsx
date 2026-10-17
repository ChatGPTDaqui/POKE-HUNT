// Escolha da skin do treinador em campo (08/10), na secao "Outfit" do Perfil.
//
// Cada opcao mostra o boneco parado de frente (quadro 0 da linha "baixo" do
// Idle). A troca vale na hora no campo (cache local); a gravacao no servidor
// (09/10, pro rival ver no duelo) vai por tras — se falhar, avisa.
//
// SKIN TRANCADA (17/10/2026): so as gratis da franquia sao livres; as outras
// pedem uma conquista. A trancada aparece em silhueta, com o requisito escrito
// embaixo, e nao troca. Quem decide de verdade e o servidor
// (`definir_skin_treinador` recusa); a tela so evita o pedido inutil.
import { useEffect } from 'react'
import { SKINS_DO_TREINADOR, folhaDaSkin, quadroDaSkin, skinDesbloqueada } from '@/data/skinsDoTreinador'
import { skinDe, useSkinDoTreinadorStore } from '@/stores/skinDoTreinadorStore'
import { useConquistasStore } from '@/stores/conquistasStore'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
}

export function SeletorDeSkin({ userId }: Props) {
  const atual = useSkinDoTreinadorStore((s) => skinDe(s.porUsuario, userId))
  const definirMeu = useSkinDoTreinadorStore((s) => s.definirMeu)
  const conquistas = useConquistasStore((s) => s.desbloqueadas)
  const carregado = useConquistasStore((s) => s.carregado)
  const carregar = useConquistasStore((s) => s.carregar)

  // Sem as conquistas carregadas toda skin de merito pareceria trancada. A
  // leitura e a mesma da tela de Conquistas (e celebra o que fechar nela).
  useEffect(() => {
    if (!carregado) void carregar()
  }, [carregado, carregar])

  function escolher(id: string) {
    if (id === atual) return
    definirMeu(userId, id).catch(() => {
      useToastStore.getState().pushToast('Skin trocada só neste aparelho: não deu pra salvar no servidor.', 'error', 'world')
    })
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-[.35em]" data-testid="seletor-de-skin">
      {SKINS_DO_TREINADOR.map((s) => {
        const livre = skinDesbloqueada(s, conquistas)
        const dica = s.desbloqueio.t === 'conquista' ? s.desbloqueio.dica : null
        return (
          <button
            key={s.id}
            type="button"
            aria-label={livre ? s.nome : `${s.nome} (trancada: ${dica})`}
            aria-pressed={atual === s.id}
            aria-disabled={!livre}
            disabled={!livre}
            onClick={() => livre && escolher(s.id)}
            className={cn(
              'flex flex-col items-center gap-[.15em] rounded-[.5em] border bg-menu-wash px-[.2em] pb-[.25em] pt-[.35em]',
              atual === s.id ? 'border-gold' : 'border-menu-line hover:border-menu-line',
              !livre && 'cursor-not-allowed',
            )}
          >
            <PreviaDaSkin id={s.id} trancada={!livre} />
            <span className="max-w-full truncate text-[.7em] text-menu-ink">
              {livre ? s.nome : `🔒 ${s.nome}`}
            </span>
            {!livre && dica && (
              <span className="text-center text-[.6em] leading-tight text-menu-muted">{dica}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** O viewport recorta um único quadro; a imagem não é esticada nem mostra o vizinho. */
function PreviaDaSkin({ id, trancada = false }: { id: string; trancada?: boolean }) {
  const { frameWidth, frameHeight } = quadroDaSkin(id)
  return <svg aria-hidden="true" focusable="false" className="block h-[4em] w-full overflow-hidden"
    viewBox={`0 0 ${frameWidth} ${frameHeight}`}
    // Silhueta: o mesmo quadro, so que preto e meio apagado — mostra QUEM e,
    // sem entregar a roupa.
    style={trancada ? { filter: 'brightness(0) opacity(.45)' } : undefined}>
    <image href={folhaDaSkin(id, 'Idle')} width={frameWidth * 2} height={frameHeight * 8} />
  </svg>
}
