// Escolha da skin do treinador em campo (08/10), na secao "Outfit" do Perfil.
//
// Cada opcao mostra o boneco parado de frente (quadro 0 da linha "baixo" do
// Idle). A troca vale na hora no campo (cache local); a gravacao no servidor
// (09/10, pro rival ver no duelo) vai por tras — se falhar, avisa.
import { SKINS_DO_TREINADOR, folhaDaSkin, quadroDaSkin } from '@/data/skinsDoTreinador'
import { skinDe, useSkinDoTreinadorStore } from '@/stores/skinDoTreinadorStore'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
}

export function SeletorDeSkin({ userId }: Props) {
  const atual = useSkinDoTreinadorStore((s) => skinDe(s.porUsuario, userId))
  const definirMeu = useSkinDoTreinadorStore((s) => s.definirMeu)

  function escolher(id: string) {
    if (id === atual) return
    definirMeu(userId, id).catch(() => {
      useToastStore.getState().pushToast('Skin trocada só neste aparelho: não deu pra salvar no servidor.', 'error', 'world')
    })
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(64px,1fr))] gap-[.35em]" data-testid="seletor-de-skin">
      {SKINS_DO_TREINADOR.map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.nome}
          aria-label={s.nome}
          aria-pressed={atual === s.id}
          onClick={() => escolher(s.id)}
          className={cn(
            'flex flex-col items-center gap-[.15em] rounded-[.5em] border bg-menu-wash px-[.2em] pb-[.25em] pt-[.35em]',
            atual === s.id ? 'border-gold' : 'border-menu-line hover:border-menu-line',
          )}
        >
          <PreviaDaSkin id={s.id} />
          <span className="max-w-full truncate text-[.7em] text-menu-ink">{s.nome}</span>
        </button>
      ))}
    </div>
  )
}

/** O viewport recorta um único quadro; a imagem não é esticada nem mostra o vizinho. */
function PreviaDaSkin({ id }: { id: string }) {
  const { frameWidth, frameHeight } = quadroDaSkin(id)
  return <svg aria-hidden="true" focusable="false" className="block h-[4em] w-full overflow-hidden"
    viewBox={`0 0 ${frameWidth} ${frameHeight}`}>
    <image href={folhaDaSkin(id, 'Idle')} width={frameWidth * 2} height={frameHeight * 8} />
  </svg>
}
