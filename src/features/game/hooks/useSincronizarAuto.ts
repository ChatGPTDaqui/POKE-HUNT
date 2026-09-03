// A config de auto vai pro servidor quando muda — de qualquer tela (PH-490).
//
// POR QUE ESTE HOOK SAIU DE DENTRO DO PAINEL
// -----------------------------------------------------------------------------
// Ate a PH-490 este efeito vivia dentro de `AbaDeAutomacoes` (o painel de
// Automações), e isso funcionava enquanto TODO controle de auto morava la
// dentro. A PH-490 tirou um deles — "Avançar de estágio ao concluir" foi pra
// trilha do bioma — e com o efeito preso ao painel isso vira falha SILENCIOSA:
//
//   o jogador liga o avanço na trilha, com Automações fechado
//   -> o `useEffect` do painel nao esta montado
//   -> `sincronizarAuto` nunca roda
//   -> a tela mostra ligado e o servidor continua com o valor velho
//
// E o servidor LE essa config na simulacao (ele decide usar pocao e bola por
// ela), entao o efeito pratico e o estagio repetindo pra sempre com o jogador
// achando que mandou avancar. Sem erro, sem log, sem teste vermelho.
//
// MONTAR UMA VEZ SO, E ALTO. Dois pontos de montagem dobram a sincronizacao a
// cada mudanca — e `sincronizarAuto` manda o BATCH COMPLETO, entao seriam dois
// requests iguais por clique. O lugar e `JogoCarregado`, junto dos outros hooks
// de sessao.
import { useEffect, useRef } from 'react'

import { sincronizarAuto } from '@/data/remote/autoridade'
import { useGameStateStore } from '@/stores/gameStateStore'

export function useSincronizarAuto(): void {
  const autoToggles = useGameStateStore((s) => s.autoToggles)
  const autoPotRules = useGameStateStore((s) => s.autoPotRules)
  const autoCatchConfig = useGameStateStore((s) => s.autoCatchConfig)
  const autoCatchRules = useGameStateStore((s) => s.autoCatchRules)
  const autoStatusConfig = useGameStateStore((s) => s.autoStatusConfig)

  // A config e sincronizada em BLOCO quando muda, em vez de rotear os 14 pontos
  // de mutacao um a um — ver `sincronizarAuto()`. Nao e cosmetico: o servidor le
  // estas regras ao decidir usar pocao/bola durante a simulacao.
  //
  // O PRIMEIRO DISPARO E IGNORADO de proposito: ele acontece logo apos o estado
  // chegar DO servidor, e mandaria os mesmos valores de volta a cada boot.
  const primeiraSync = useRef(true)
  useEffect(() => {
    if (primeiraSync.current) {
      primeiraSync.current = false
      return
    }
    sincronizarAuto()
  }, [autoToggles, autoPotRules, autoCatchConfig, autoCatchRules, autoStatusConfig])
}
