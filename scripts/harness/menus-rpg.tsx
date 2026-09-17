// Componentes REAIS com fixtures locais. Não inicializa o jogo, não lê jogadores
// e bloqueia fetch externo antes de carregar os módulos de apresentação.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/index.css'
import { createRng } from '@/core/rng'
import { Painel } from '@/components/game/Painel'

const fetchLocal = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href)
  if (url.origin !== location.origin) return Promise.reject(new Error('Bancada visual: rede externa bloqueada.'))
  return fetchLocal(input, init)
}

const [{ useGameStateStore }, { useMochilaStore }, { useUiStore }, { createPokeInstance }, { BagMenu }, { ShopMenu }, { TeamMenu }, { PvpMenu }] = await Promise.all([
  import('@/stores/gameStateStore'), import('@/stores/mochilaStore'), import('@/stores/uiStore'), import('@/data/pokes'),
  import('@/features/bag/BagMenu'), import('@/features/shop/ShopMenu'), import('@/features/team/TeamMenu'), import('@/features/pvp/PvpMenu'),
])
useGameStateStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const nomes = ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar', 'dragonite', 'alakazam', 'eevee', 'snorlax', 'lapras', 'gardevoir', 'scizor']
const pokes = nomes.map((id, i) => createPokeInstance(createRng(554 + i), id, 80 + i, { uid: `preview-${i}` }))
useGameStateStore.setState({ team: pokes.slice(0, 3), bagPokes: pokes.slice(3), activeIndex: 0,
  wallet: { gold: 98540, diamonds: 420 }, items: { poke_ball: 12345, great_ball: 82, ultra_ball: 14, potion: 25, super_potion: 16, hyper_potion: 8, revive: 5 }, lockedItems: { revive: true } })
useMochilaStore.setState({ carregada: true })
function viewport() { useUiStore.setState({ viewportWidth: innerWidth, viewportHeight: innerHeight, coarsePointer: innerWidth < 900, footerHeight: 0 }) }
viewport()
window.addEventListener('resize', viewport)
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function Bancada() {
  const [tela, setTela] = useState('Mochila')
  const menus = { Mochila: BagMenu, Loja: ShopMenu, Equipe: TeamMenu, PvP: PvpMenu }
  const Tela = menus[tela as keyof typeof menus]
  return <QueryClientProvider client={queryClient}>
    <div style={{ padding: '.65em', display: 'flex', flexWrap: 'wrap', gap: '.5em', fontFamily: 'sans-serif', fontSize: 14 }}>
      <span>Bancada local · dados fictícios</span>
      {Object.keys(menus).map((nome) => <button key={nome} onClick={() => setTela(nome)} style={{ padding: '.25em .65em', border: '1px solid #666', borderRadius: 5 }}>{nome}</button>)}
    </div>
    <div id="camada-hud" className="hud-root" data-toque={innerWidth < 900 ? '' : undefined} style={{ position: 'fixed', inset: '50px 0 0', fontSize: 16, pointerEvents: 'auto' }}>
      <Painel key={tela} winKey="panel" title={tela} widthEm={tela === 'Loja' ? 52 : tela === 'Equipe' ? 42 : 48} zIndex={31} onClose={() => setTela('Mochila')}><Tela /></Painel>
    </div>
  </QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<Bancada />)
