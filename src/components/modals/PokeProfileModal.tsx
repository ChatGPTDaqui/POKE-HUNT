// A experiencia unica e canonica de "clicar num POKE pra ver o perfil": Equipe,
// Mochila, Loja, Pokedex, Calculadora e o card do POKE ativo no HUD abrem
// exatamente esta janela. Quem quer abrir so escreve no pokeProfileStore.
//
// O cabecalho (ProfileHero, com a sprite gen5 animada) fica FORA do corpo
// trocado pelas abas: se ele fosse remontado a cada clique de aba, a animacao
// do GIF reiniciaria do zero. Ele tambem e a alca de arraste da janela.
import { useState } from 'react'
import { Painel } from '@/components/game/Painel'
import { ProfileHero, StatDetail, MovesetTable } from '@/components/shared/PokeStatDetail'
import { TypeWeaknessSection } from '@/components/shared/TypeWeaknessSection'
import { usePokeProfileStore, type AbaDoPerfil, type PokeProfileTarget } from '@/stores/pokeProfileStore'
import { cn } from '@/lib/utils'


export function PokeProfileModal() {
  const open = usePokeProfileStore((s) => s.open)
  const close = usePokeProfileStore((s) => s.close)
  if (!open) return null
  // `key` pelo uid: trocar de POKE remonta o corpo inteiro (o vanilla
  // recriava o modal inteiro, entao a aba voltar pra Status vinha de graca) —
  // sem isso um `useEffect` resetando `activeTab` corria DEPOIS do primeiro
  // render com o POKE novo, e a aba antiga piscava na tela por um frame antes
  // de corrigir. Trocar so de ABA (mesmo uid) nao remonta, preserva estado.
  return <PokeProfileModalBody key={open.poke.uid} open={open} close={close} />
}

function PokeProfileModalBody(
  { open, close }: { open: PokeProfileTarget; close: () => void },
) {
  // Quem abriu pode ter pedido uma aba (a Equipe tem botao direto pros
  // golpes); sem pedido, Status, como sempre.
  const [activeTab, setActiveTab] = useState<AbaDoPerfil>(open.aba ?? 'status')
  const { poke, species } = open

  return (
    <Painel
      winKey="profile"
      widthEm={30}
      defaultTop="8vh"
      zIndex={46}
      backdropZIndex={45}
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
    </Painel>
  )
}
