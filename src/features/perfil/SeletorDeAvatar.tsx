// Escolha da foto de perfil (PH-548): os retratos do catalogo mais "sem foto".
//
// Grava pela RPC e reflete no cache (`avatarStore.definirMeu`), entao a HUD,
// o ranking e o resto trocam na hora, sem F5 e sem mexer no GameState. Um
// clique = uma gravacao; enquanto a RPC nao responde a grade fica travada
// (dois cliques rapidos gravariam fora de ordem).
import { useState } from 'react'
import { User } from '@phosphor-icons/react'
import { AVATARES, avatarUrl } from '@/data/avatares'
import { useAvatarStore } from '@/stores/avatarStore'
import { useToastStore } from '@/stores/toastStore'
import { SectionLabel } from '@/components/game/controls'
import { cn } from '@/lib/utils'

interface Props {
  userId: string
  atual: string | null
  aoFechar: () => void
}

export function SeletorDeAvatar({ userId, atual, aoFechar }: Props) {
  const definirMeu = useAvatarStore((s) => s.definirMeu)
  const [gravando, setGravando] = useState(false)

  async function escolher(id: string | null) {
    if (gravando || id === atual) { aoFechar(); return }
    setGravando(true)
    try {
      await definirMeu(userId, id)
      aoFechar()
    } catch (e) {
      useToastStore.getState().pushToast(e instanceof Error ? e.message : 'Não deu pra trocar a foto.', 'error', 'world')
    } finally {
      setGravando(false)
    }
  }

  return (
    <div className="flex flex-col gap-[.4em] rounded-[.7em] border border-n700 bg-n900 p-[.6em]" data-testid="seletor-de-avatar">
      <SectionLabel>Foto de perfil</SectionLabel>
      <div className="grid grid-cols-6 gap-[.4em]">
        <button
          type="button"
          disabled={gravando}
          aria-label="Sem foto"
          aria-pressed={atual == null}
          onClick={() => void escolher(null)}
          className={cn(
            'flex aspect-square items-center justify-center rounded-[.5em] border bg-n800 text-[1.4em] text-n300',
            atual == null ? 'border-gold' : 'border-n700 hover:border-n500',
          )}
        >
          <User weight="fill" />
        </button>
        {AVATARES.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={gravando}
            title={a.nome}
            aria-label={a.nome}
            aria-pressed={atual === a.id}
            onClick={() => void escolher(a.id)}
            className={cn(
              'aspect-square overflow-hidden rounded-[.5em] border bg-n800',
              atual === a.id ? 'border-gold' : 'border-n700 hover:border-n500',
            )}
          >
            <img src={avatarUrl(a.id) ?? undefined} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  )
}
