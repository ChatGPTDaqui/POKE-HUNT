import { EquipmentArt } from './Artwork'
import { GROUPS } from './data'
import type { View } from './data'
import { PrimaryButton } from './primitives'

export function ServicePanel({ view, notify }: { view: View; notify: (message: string) => void }) {
  const destination = GROUPS.flatMap(group => [...group.destinations]).find(item => item.name === view)
  return <section className="service-preview">
    {view === 'Hospital' ? <img className="hospital-cover" src="/assets/hospital/centro-pokemon.jpg" alt="Centro Pokémon" /> : <EquipmentArt kind={view === 'Treinador' ? 'guide' : 'map'} />}
    <span className="eyebrow">DESTINO DO GUIA</span><h2>{view}</h2><p>{destination?.description ?? 'Sua identificação e as ferramentas do treinador.'}</p>
    <div className="service-notice"><strong>Acesso preservado no desenho</strong><p>Esta etapa demonstra a organização dos menus. As funções completas deste destino ainda não foram integradas à nova identidade.</p></div>
    {view === 'Hospital' && <p>A viagem, o cancelamento e a recuperação continuam seguindo as regras do jogo atual. Aqui nenhum deles é executado.</p>}
    <PrimaryButton onClick={() => notify('Protótipo isolado: não há alteração de conta, viagem, compra ou progresso.')}>Entender esta prévia</PrimaryButton>
  </section>
}
