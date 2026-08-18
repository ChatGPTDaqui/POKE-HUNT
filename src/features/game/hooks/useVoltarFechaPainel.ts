import { useEffect, useRef } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'

// Botao "voltar" do Android e gesto de voltar do iOS fecham a camada aberta em
// vez de SAIR DO JOGO — que era o desfecho anterior, e o pior possivel pra um
// gesto que o jogador usa como "fechar".
//
// DONO UNICO de proposito. A versao obvia (cada sheet empilha o proprio
// `pushState` e chama `history.back()` ao desmontar) tem uma corrida real:
// trocar de painel direto pela doca desmonta o A (o `back()` e ASSINCRONO) e
// monta o B; o `popstate` atrasado do A chega depois e fecha o B. Com um dono
// so, o historico ganha UMA entrada enquanto existir qualquer camada aberta,
// nao uma por camada.
//
// Ordem de fechamento = ordem de empilhamento visual: o que esta por cima sai
// primeiro. Sem isso, voltar com o perfil do POKE aberto por cima da Equipe
// fecharia a Equipe e deixaria o perfil orfao na tela.
export function useVoltarFechaPainel(): void {
  const empilhado = useRef(false)
  // Marca que o proximo `popstate` foi provocado por NOS (fechamento por
  // botao/toque, nao pelo gesto de voltar) e nao deve fechar mais nada.
  const ignorarProximoPop = useRef(false)

  useEffect(() => {
    function camadaDoTopo(): (() => void) | null {
      const ui = useUiStore.getState()
      const perfilPoke = usePokeProfileStore.getState()
      if (perfilPoke.open) return () => perfilPoke.close()
      if (ui.autoOpen) return () => ui.setAutoOpen(false)
      if (ui.perfilOpen) return () => ui.setPerfilOpen(false)
      if (ui.analyzerOpen) return () => ui.setAnalyzerOpen(false)
      if (ui.moreOpen) return () => ui.setMoreOpen(false)
      if (ui.currentScreen) return () => ui.closeScreen()
      return null
    }

    function sincronizar() {
      const aberto = camadaDoTopo() != null
      if (aberto && !empilhado.current) {
        history.pushState({ camadaHud: true }, '')
        empilhado.current = true
      } else if (!aberto && empilhado.current) {
        empilhado.current = false
        // Consumir a entrada que empilhamos: sem isso o proximo "voltar" nao
        // faria nada visivel (gastaria a entrada fantasma) e o jogador teria
        // que apertar duas vezes pra sair.
        if (history.state?.camadaHud) {
          ignorarProximoPop.current = true
          history.back()
        }
      }
    }

    function onPop() {
      if (ignorarProximoPop.current) {
        ignorarProximoPop.current = false
        return
      }
      empilhado.current = false
      camadaDoTopo()?.()
    }

    window.addEventListener('popstate', onPop)
    const cancelarUi = useUiStore.subscribe(sincronizar)
    const cancelarPerfil = usePokeProfileStore.subscribe(sincronizar)
    sincronizar()

    return () => {
      window.removeEventListener('popstate', onPop)
      cancelarUi()
      cancelarPerfil()
    }
  }, [])
}
