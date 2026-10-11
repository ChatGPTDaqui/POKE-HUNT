// Bancada de TODOS os menus reais. Dados fictícios, sem conta e sem rede externa.
import { createRoot } from 'react-dom/client'
import { useState, type CSSProperties } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/index.css'
import { createRng } from '@/core/rng'
import { createPlayerEntity } from '@/engine/entity'
import { MAPS } from '@/data/maps'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/game/ThemeProvider'

const fetchLocal = window.fetch.bind(window)
window.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href)
  if (url.origin !== location.origin) return Promise.reject(new Error('Bancada isolada: rede externa bloqueada.'))
  return fetchLocal(input, init)
}
const [{ useGameStateStore }, { useMochilaStore }, { useUiStore }, { createPokeInstance },
  { HudLayer }, { ScreenOverlay }, { PokeProfileModal }, { useChatStore }, { useToastStore },
  { useDiarioStore }, { PerfilTreinador }, { ConfirmDialog }, { useWorldStore }, { AuthForm },
  { ForgotPasswordPage }, { ResetPasswordPage }, { DeviceTakeoverPage }, { StartScreen }, { HuntAnalyzer }] = await Promise.all([
  import('@/stores/gameStateStore'), import('@/stores/mochilaStore'), import('@/stores/uiStore'), import('@/data/pokes'),
  import('@/features/game/HudLayer'), import('@/features/screens/ScreenOverlay'), import('@/components/modals/PokeProfileModal'),
  import('@/stores/chatStore'), import('@/stores/toastStore'), import('@/stores/diarioStore'),
  import('@/features/perfil/PerfilTreinador'), import('@/components/modals/ConfirmDialog'),
  import('@/stores/worldStore'),
  import('@/features/auth/AuthForm'), import('@/features/auth/ForgotPasswordPage'),
  import('@/features/auth/ResetPasswordPage'), import('@/features/auth/DeviceTakeoverPage'), import('@/features/start/StartScreen'),
  import('@/features/hunt/HuntAnalyzer'),
])
useGameStateStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
const ids = ['charizard', 'blastoise', 'venusaur', 'pikachu', 'gengar', 'dragonite', 'lapras', 'scizor', 'snorlax']
const pokes = ids.map((id, i) => createPokeInstance(createRng(554 + i), id, 80 + i, { uid: `jornada-fixture-${i}` }))
useGameStateStore.setState({ team: pokes.slice(0, 4), bagPokes: pokes.slice(4), activeIndex: 0,
  trainer: { ...useGameStateStore.getState().trainer, name: 'Treinador_Teste' },
  wallet: { gold: 98540, diamonds: 420 },
  pokedexKills: Object.fromEntries(ids.map((id, i) => [id, { normal: 350 * (i + 1), shiny: i }])),
  items: { poke_ball: 12345, great_ball: 82, ultra_ball: 14, potion: 25, super_potion: 16, hyper_potion: 8, revive: 5 },
})
useMochilaStore.setState({ carregada: true })
const map = MAPS.mata_e1 ?? Object.values(MAPS)[0]
useWorldStore.setState({
  player: createPlayerEntity({ entity: 0, effect: 0, pendingHit: 0 }, { poke: pokes[0], x: 100, y: 100 }),
  mapDef: { ...map, collisionGrid: map.collisionGrid ?? null },
  sala: { indice: 2, chave: 'grass', abates: 7, ciclos: 0 },
  clima: { tipo: 'chuva', origem: 'ambiente', turnosRestantes: Infinity },
})
useChatStore.setState({ iniciarAoVivo: () => () => {} })
useToastStore.getState().pushToast('Charizard derrotou Caterpie · +12 moedas', 'gold', 'combat')
useToastStore.getState().pushToast('Equipe pronta para explorar.', 'info', 'world')
useToastStore.getState().pushToast('Potion comprada.', 'success', 'trade')
useDiarioStore.setState({ carregado: true, dia: '2026-10-11', loginsNoMes: 8 })
function viewport() { useUiStore.setState({ viewportWidth: innerWidth, viewportHeight: innerHeight - 44, coarsePointer: innerWidth < 900 }) }
viewport()
window.addEventListener('resize', viewport)
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchOnMount: false } } })
// Respostas somente locais: listas cheias e vazios podem ser vistos sem servidor.
queryClient.setQueryData(['ranking', 'treinadores'], { entradas: Array.from({ length: 16 }, (_, i) => ({
  userId: `fixture-ranking-${i}`, nome: i === 0 ? 'Treinador_com_nome_muito_longo_para_testar' : `Explorador_${i + 1}`,
  nivel: 100 - i, exp: 9876543 - i * 15000,
})) })
queryClient.setQueryData(['mercado', 'itens'], { itens: ['poke_ball', 'great_ball', 'potion', 'revive'].map((itemId, i) => ({
  itemId, melhorVenda: 60 + i * 120, emVenda: 2500 + i * 500, melhorCompra: 50, emCompra: 150,
})) })
queryClient.setQueryData(['mercado', 'meus'], { anuncios: [], ordens: [] })
queryClient.setQueryData(['mercado', 'historico'], { historico: [] })
queryClient.setQueryData(['social'], { conversas: [], avisos: [], amigos: [], bloqueados: [] })

function Bancada() {
  const [scale, setScale] = useState(1)
  const [view, setView] = useState('jogo')
  const vidroFosco = useUiStore(s => s.vidroFosco)
  return <QueryClientProvider client={queryClient}>
    <div style={{ height: 44, display: 'flex', gap: 8, alignItems: 'center', paddingInline: 8, background: '#203c42', color: '#fffefa', fontSize: 12 }}>
      <select aria-label="Superfície da bancada" value={view} onChange={e => setView(e.target.value)} style={{ minWidth: 0, flex: 1 }}>
        {['jogo', 'login', 'cadastro', 'recuperar', 'nova senha', 'dispositivo', 'inicial'].map(v => <option key={v}>{v}</option>)}
      </select>
      <span>Sem servidor</span>
      <label>Escala <select aria-label="Escala da HUD" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
        {[.7, 1, 1.4].map(v => <option key={v}>{v}</option>)}
      </select></label>
    </div>
    {view === 'jogo' ? <div className="hud-root" data-blur={vidroFosco ? 'off' : undefined} data-toque={innerWidth < 900 ? '1' : undefined}
      style={{ position: 'fixed', inset: '44px 0 0', overflow: 'hidden', background: 'radial-gradient(ellipse at center, #496e45, #1c3933)', '--hud-scale': scale } as CSSProperties}>
      <div id="camada-hud" className="hud-safe"><HudLayer /></div>
      <ScreenOverlay /><PokeProfileModal /><PerfilTreinador /><HuntAnalyzer /><ConfirmDialog />
    </div> : <div style={{ position: 'fixed', inset: '44px 0 0', overflow: 'auto' }}><MemoryRouter>
      {view === 'login' || view === 'cadastro' ? <AuthForm
        titulo={view === 'login' ? 'Entrar' : 'Criar conta'} descricao="Bancada isolada — nenhum cadastro ou login é enviado."
        rotuloAcao={view === 'login' ? 'Entrar' : 'Criar conta'} confirmarSenha={view === 'cadastro'} pedirNomeTreinador={view === 'cadastro'}
        mostrarEsqueciSenha={view === 'login'} rodape={{ texto: 'Sua jornada', linkTexto: 'Voltar', para: '/' }}
        onSubmit={async () => ({ error: 'Estado de erro simulado: sem conexão nesta bancada.' })}
      /> : view === 'recuperar' ? <ForgotPasswordPage /> : view === 'nova senha' ? <ResetPasswordPage />
        : view === 'dispositivo' ? <DeviceTakeoverPage /> : <StartScreen />}
    </MemoryRouter></div>}
  </QueryClientProvider>
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><Bancada /></ThemeProvider>)
