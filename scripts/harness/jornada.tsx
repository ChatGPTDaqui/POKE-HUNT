import { createRoot } from 'react-dom/client'
import '../../src/index.css'
import { JornadaDoTreinador, ProximoObjetivo } from '../../src/features/hunt/JornadaDoTreinador'
import { useGameStateStore } from '../../src/stores/gameStateStore'
import { BIOMAS } from '../../src/data/biomas'

function fixture(posLance: boolean) {
  useGameStateStore.setState({ biomaProgress: Object.fromEntries(BIOMAS.map(b => [b.chave, posLance ? 5 : 0])), unlockedContinents: posLance ? ['biomas', 'nightmare'] : ['biomas'] })
}
fixture(false)
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-n900 p-3 text-n100">
  <ProximoObjetivo />
  <div className="my-3 flex gap-3"><button onClick={() => fixture(false)}>Conta nova</button><button onClick={() => fixture(true)}>Pós-Lance</button></div>
  <JornadaDoTreinador onBioma={(chave, pesadelo) => { document.getElementById('resultado')!.textContent = `${chave} / ${pesadelo ? 'Pesadelo' : 'Mundo'}` }} onLance={() => { document.getElementById('resultado')!.textContent = 'Lance' }} />
  <output id="resultado" />
</main>)
