import { useState } from 'react'
import { MapPin, Binoculars, ArrowRight, Leaf, Waves, Mountains } from '@phosphor-icons/react'
import { Portrait } from './Artwork'
import { PrimaryButton } from './primitives'

const DESTINATIONS = [
  { name: 'Mata', image: 'mata', Icon: Leaf, description: 'Entre folhas, trilhas e novas descobertas.', pokes: ['caterpie', 'weedle', 'pidgey'] },
  { name: 'Águas interiores', image: 'aguas_interiores', Icon: Waves, description: 'Siga o curso da água e observe os encontros.', pokes: ['poliwag', 'psyduck', 'magikarp'] },
  { name: 'Campo aberto', image: 'campo_aberto', Icon: Mountains, description: 'Um horizonte de possibilidades para explorar.', pokes: ['rattata', 'pidgey', 'sentret'] },
] as const

export function ExplorePanel({ notify }: { notify: (message: string) => void }) {
  const [selected, setSelected] = useState<typeof DESTINATIONS[number]>(DESTINATIONS[0])
  return <div className="explore-workspace">
    <section className="expedition-cover"><img src={`/assets/biome-selector/${selected.image}.jpg`} alt={`Ilustração do ambiente ${selected.name}`} /><span className="expedition-tag"><MapPin size={15} aria-hidden="true" />GUIA DE EXPEDIÇÃO</span><div><span className="eyebrow">SEU PRÓXIMO DESTINO</span><h2>{selected.name}</h2><p>{selected.description}</p></div></section>
    <section className="destination-picker" aria-label="Ambientes para explorar"><div className="section-line"><h2>Para onde vamos?</h2><Binoculars size={22} aria-hidden="true" /></div>
      {DESTINATIONS.map(destination => <button key={destination.name} aria-pressed={selected.name === destination.name} className="biome-card" onClick={() => setSelected(destination)}><img src={`/assets/biome-selector/${destination.image}.jpg`} alt="" /><span><strong>{destination.name}</strong><small>Consultar ambiente</small></span><ArrowRight size={18} aria-hidden="true" /></button>)}
      <div className="encounter-preview"><span className="eyebrow">EXEMPLOS VISUAIS DE ENCONTROS</span><div>{selected.pokes.map(id => <Portrait key={id} id={id} />)}</div><p>Esta seleção ilustra a interface. Não representa disponibilidade, dificuldade ou chance real.</p></div>
      <PrimaryButton onClick={() => notify(`Prévia de ${selected.name}: nenhuma hunt foi iniciada.`)}>Prévia da expedição</PrimaryButton>
    </section>
  </div>
}
