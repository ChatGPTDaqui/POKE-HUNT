import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import '../../src/index.css'
import { createRng } from '../../src/core/rng'
import { createPokeInstance, SPECIES } from '../../src/data/pokes'
import { ProfileHero } from '../../src/components/shared/PokeStatDetail'
import { StatusRail } from '../../src/components/hud/StatusRail'
import { useGameStateStore } from '../../src/stores/gameStateStore'

const inicial = createPokeInstance(createRng(7), 'charmander', 1)
useGameStateStore.setState({ team: [inicial], activeIndex: 0 })

function Bancada() {
  const [poke, setPoke] = useState(inicial)
  function escolher(species: string, level: number) {
    const novo = createPokeInstance(createRng(7), species, level)
    setPoke(novo)
    useGameStateStore.setState({ team: [novo], activeIndex: 0 })
  }
  return <main className="min-h-screen bg-n950 p-3 text-n100">
    <StatusRail />
    <div className="mt-6 max-w-[32em] rounded-lg border border-n800">
      <ProfileHero poke={poke} species={SPECIES[poke.speciesId]} />
    </div>
    <div className="mt-6 flex flex-wrap gap-3">
      <button onClick={() => escolher('charmander', 1)}>Inicial</button>
      <button onClick={() => escolher('charmander', 15)}>Nível 15</button>
      <button onClick={() => escolher('charmeleon', 16)}>Evoluído</button>
      <button onClick={() => escolher('charizard', 100)}>Sem próximo golpe</button>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Bancada />)
