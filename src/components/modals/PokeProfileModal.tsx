// Port de js/ui/panels/PokeProfileModal.js — a experiencia unica e canonica
// de "clicar num POKE pra ver o perfil". No vanilla ele era anexado direto no
// <body> por qualquer painel que importasse `showPokeProfileModal`; aqui e um
// componente montado uma vez, e quem quer abrir escreve no pokeProfileStore.
//
// O cabecalho (ProfileHero, com a sprite gen5 animada) fica FORA do corpo
// trocado pelas abas — igual no original: se ele fosse re-montado a cada
// clique de aba, a animacao do GIF reiniciaria do zero.
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ProfileHero, StatDetail, MovesetTable } from '@/components/shared/PokeStatDetail'
import { TypeWeaknessSection } from '@/components/shared/TypeWeaknessSection'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useDraggable } from '@/hooks/useDraggable'
import { cn } from '@/lib/utils'

type ProfileTab = 'status' | 'golpes'

export function PokeProfileModal() {
  const open = usePokeProfileStore((s) => s.open)
  const close = usePokeProfileStore((s) => s.close)
  const [activeTab, setActiveTab] = useState<ProfileTab>('status')
  const { elementRef, handleRef } = useDraggable<HTMLDivElement, HTMLDivElement>()

  // Toda vez que um POKE diferente e aberto, volta pra aba Status (o vanilla
  // recriava o modal inteiro, entao isso vinha de graca).
  useEffect(() => {
    if (open) setActiveTab('status')
  }, [open?.poke.uid])

  if (!open) return null
  const { poke, species } = open

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent ref={elementRef} className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogTitle className="sr-only">{species.name}</DialogTitle>

        <div ref={handleRef} className="cursor-move">
          <ProfileHero poke={poke} species={species} />
        </div>

        <div className="flex gap-1 border-b">
          {(['status', 'golpes'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1.5 text-xs capitalize',
                activeTab === tab
                  ? 'border-b-2 border-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'status' ? 'Status' : 'Golpes'}
            </button>
          ))}
        </div>

        {activeTab === 'status' ? (
          <StatDetail poke={poke} weaknessSection={<TypeWeaknessSection species={species} />} />
        ) : (
          <MovesetTable poke={poke} species={species} />
        )}
      </DialogContent>
    </Dialog>
  )
}
