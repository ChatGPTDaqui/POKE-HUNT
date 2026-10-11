// Molduras e acessos de produção; fixtures sem conta, combate ou backend.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { CalendarCheck, ChatsCircle, Gear, Scales, Sword, Trophy, Books, GraduationCap, Calculator } from '@phosphor-icons/react'
import '@/index.css'
import { Painel } from '@/components/game/Painel'
import { JourneyDestination } from '@/components/game/JourneyDestination'
import { GameButton } from '@/components/game/controls'
import { useUiStore } from '@/stores/uiStore'

function viewport() {
  useUiStore.setState({ viewportWidth: innerWidth, viewportHeight: innerHeight, coarsePointer: innerWidth < 900,
    footerHeight: 64, navHeight: 64 })
}
viewport()
window.addEventListener('resize', viewport)
const destinos = [
  ['Diário', CalendarCheck], ['Social', ChatsCircle], ['Troca', Scales], ['PvP', Sword],
  ['Calculadora', Calculator], ['Ranking', Trophy], ['Wiki', Books], ['Tutoriais', GraduationCap], ['Configurações', Gear],
] as const

function Bancada() {
  const [aberto, setAberto] = useState(true)
  const [claro, setClaro] = useState(true)
  const [escala, setEscala] = useState(1)
  const [aviso, setAviso] = useState('Dados fictícios · componentes reais')
  return <>
    <header data-keep-open style={{ position: 'fixed', inset: '0 0 auto', display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, fontSize: 12 }}>
      <button onClick={() => setAberto(true)}>Abrir</button>
      <button onClick={() => setClaro(!claro)}>{claro ? 'Comparar legado' : 'Ver Jornada'}</button>
      <label>Escala <select value={escala} onChange={e => setEscala(Number(e.target.value))}>
        <option value={.7}>Mínima</option><option value={1}>Padrão</option><option value={1.4}>Máxima</option>
      </select></label>
      <span role="status">{aviso}</span>
    </header>
    <div id="camada-hud" className="hud-root" data-blur="off" data-toque=""
      style={{ position: 'fixed', inset: '70px 0 0', fontSize: 16 * escala, pointerEvents: 'auto', background: 'url(/assets/hunt-backgrounds/forest.jpg) center / cover' }}>
      {aberto && <Painel appearance={claro ? 'journey' : undefined} winKey="panel" title="Mais" snap="conteudo"
        widthEm={28} zIndex={31} onClose={() => setAberto(false)}>
        {claro ? <div className="journey-destinations">
          {destinos.map(([label, Icon]) => <JourneyDestination key={label} label={label} Icon={Icon}
            badge={label === 'Social' ? 3 : 0} detalhe={label === 'Social' ? '2 mensagens · 1 anexo' : null}
            onClick={() => setAviso(`${label}: ação local de demonstração`)} />)}
        </div> : <p>Moldura legada preservada. A lista de acessos foi migrada apenas no menu Mais.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4em', marginTop: '.5em' }}>
          <GameButton variant="primary" onClick={() => setAviso('Ação primária testada')}>Ação primária</GameButton>
          <GameButton onClick={() => setAviso('Ação secundária testada')}>Secundária</GameButton>
        </div>
      </Painel>}
      <footer style={{ position: 'absolute', bottom: 0, height: 64, width: '100%', display: 'grid', placeItems: 'center', background: '#183638' }}>
        Reserva medida da navegação · 64px
      </footer>
    </div>
  </>
}
createRoot(document.getElementById('root')!).render(<Bancada />)
