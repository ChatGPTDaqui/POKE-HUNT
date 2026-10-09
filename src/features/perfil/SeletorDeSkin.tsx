// Escolha da skin do treinador em campo (08/10), na secao "Outfit" do Perfil.
//
// Cada opcao mostra o boneco parado de frente (quadro 0 da linha "baixo" do
// Idle). A troca vale na hora: o desenho do campo le a escolha a cada quadro.
import { SKINS_DO_TREINADOR, folhaDaSkin } from '@/data/skinsDoTreinador'
import { skinDe, useSkinDoTreinadorStore } from '@/stores/skinDoTreinadorStore'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
}

export function SeletorDeSkin({ userId }: Props) {
  const atual = useSkinDoTreinadorStore((s) => skinDe(s.porUsuario, userId))
  const definir = useSkinDoTreinadorStore((s) => s.definir)

  return (
    <div className="grid grid-cols-5 gap-[.35em]" data-testid="seletor-de-skin">
      {SKINS_DO_TREINADOR.map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.nome}
          aria-label={s.nome}
          aria-pressed={atual === s.id}
          onClick={() => definir(userId, s.id)}
          className={cn(
            'flex flex-col items-center gap-[.15em] rounded-[.5em] border bg-n800 px-[.2em] pb-[.25em] pt-[.35em]',
            atual === s.id ? 'border-gold' : 'border-n700 hover:border-n500',
          )}
        >
          {/* Folha Idle: 2 quadros x 8 linhas de 32x40 px, mostrada a 2x. */}
          <span
            aria-hidden
            className="block h-[4em] w-[3.2em] [image-rendering:pixelated]"
            style={{
              backgroundImage: `url(${folhaDaSkin(s.id, 'Idle')})`,
              backgroundSize: '6.4em 32em',
              backgroundPosition: '0 0',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <span className="max-w-full truncate text-[.7em] text-n300">{s.nome}</span>
        </button>
      ))}
    </div>
  )
}
