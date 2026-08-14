// Shell do JOGO: canvas + HUD + telas + modais, e os pedacos de js/main.js
// que nao eram nem motor (Fase 4) nem canvas (Fase 5) — boot do Farm Offline,
// catch-up de aba oculta e sync ao sair da pagina.
//
// Era o App.tsx ate a migracao pro Supabase; virou rota autenticada (`/jogo`)
// quando o roteamento entrou. O App.tsx de hoje so cuida de rotas e auth, e
// este componente so monta depois de RequireAuth — entao pode assumir que ha
// sessao.
import { useProgressoRemoto } from './useProgressoRemoto'
import { TelaCarregandoProgresso } from './components/TelaCarregandoProgresso'
import { JogoCarregado } from './components/JogoCarregado'

export { farmOfflineSemServidorEhConfiavel, deveSerPessimista, segundosCatchUpEfetivos } from './utils'

export function GameShell() {
  const progresso = useProgressoRemoto()

  // Gate obrigatorio, nao cosmetico: montar o jogo antes do progresso chegar
  // faria o GameCanvas construir o mundo com o estado default (equipe vazia) e
  // o primeiro autosave gravaria esse vazio por cima do save real.
  if (progresso.fase !== 'pronto') return <TelaCarregandoProgresso estado={progresso} />

  return <JogoCarregado />
}
