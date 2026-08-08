// A experiencia unica e canonica de "clicar num POKE pra ver o perfil": Equipe,
// Mochila, Loja, Pokedex, Calculadora e o card do POKE ativo no HUD abrem
// exatamente esta janela. Quem quer abrir so escreve no pokeProfileStore.
//
// O cabecalho (ProfileHero, com a sprite gen5 animada) fica FORA do corpo
// trocado pelas abas: se ele fosse remontado a cada clique de aba, a animacao
// do GIF reiniciaria do zero. Ele tambem e a alca de arraste da janela.
import { useEffect, useState } from 'react'
import { GameWindow } from '@/components/game/GameWindow'
import { ProfileHero, StatDetail, MovesetTable } from '@/components/shared/PokeStatDetail'
import { TypeWeaknessSection } from '@/components/shared/TypeWeaknessSection'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { cn } from '@/lib/utils'

type ProfileTab = 'status' | 'golpes'

export function PokeProfileModal() {
  const open = usePokeProfileStore((s) => s.open)
  const close = usePokeProfileStore((s) => s.close)
  const [activeTab, setActiveTab] = useState<ProfileTab>('status')

  // Trocar de POKE volta pra aba Status (o vanilla recriava o modal inteiro,
  // entao isso vinha de graca).
  useEffect(() => {
    if (open) setActiveTab('status')
  }, [open?.poke.uid])

  if (!open) return null
  const { poke, species } = open

  return (
    <GameWindow
      winKey="profile"
      widthEm={30}
      defaultTop="8vh"
      zIndex={46}
      backdrop={{ zIndex: 45 }}
      onClose={close}
      header={<ProfileHero poke={poke} species={species} />}
      subheader={
        <div className="flex gap-[.65em] border-b border-n800 px-[.7em]">
          {(['status', 'golpes'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'cursor-pointer border-b-2 bg-transparent px-[.2em] py-[.4em] font-[inherit] text-[.9em]',
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-n500 hover:text-foreground',
              )}
            >
              {tab === 'status' ? 'Status' : 'Golpes'}
            </button>
          ))}
        </div>
      }
    >
      {activeTab === 'status' ? (
        <StatDetail poke={poke} weaknessSection={<TypeWeaknessSection species={species} />} />
      ) : (
        <MovesetTable poke={poke} species={species} />
      )}
    </GameWindow>
  )
}
