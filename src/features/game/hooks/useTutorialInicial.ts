import { useEffect, useRef } from 'react'
import {
  useTutorialStore, TUTORIAL_BOAS_VINDAS, TUTORIAL_CAPTURA,
} from '@/stores/tutorialStore'
import { useGameStateStore } from '@/stores/gameStateStore'

// Os disparos automaticos de tutorial que dependem do ESTADO DO JOGO.
//
// Os outros dois (`bot` e `estagios`) disparam no GESTO de abrir um painel, e
// por isso moram no proprio painel — `components/auto/AutoPanel.tsx` e
// `features/hunt/TrilhaDeEstagios.tsx`. Aqui ficam so os que nao tem um clique
// obvio pra pendurar.
//
// Uma vez so por aparelho: o controle de "ja viu" mora no localStorage (ver
// tutorialStore), nao no save, porque o save e sobrescrito pelo servidor a cada
// flush.
export function useTutorialInicial(hasStarter: boolean): void {
  // Boas-vindas: depois de o jogador ter um inicial. Antes disso a tela de
  // escolha ocupa tudo e um modal por cima dela so atrapalha.
  const jaDisparouBoasVindas = useRef(false)
  useEffect(() => {
    if (!hasStarter || jaDisparouBoasVindas.current) return
    jaDisparouBoasVindas.current = true
    useTutorialStore.getState().abrirSeInedito(TUTORIAL_BOAS_VINDAS)
  }, [hasStarter])

  // Primeiro POKE capturado.
  //
  // O GATILHO E `bagPokes.length > 0`, E NAO UM EVENTO DE CAPTURA, de proposito:
  // a captura acontece dentro do motor (`engine/systems/captureSystem.ts`), que
  // roda headless no servidor tambem e nao pode conhecer store de UI. A mochila
  // deixar de estar vazia e o mesmo fato observado do lado do React.
  //
  // ELE NAO E EXCLUSIVO DA CAPTURA, e isso e aceito: um POKE que chegue por
  // troca ou por compra no Mercado tambem enche a mochila pela primeira vez, e
  // nesse caso o tutorial abre com o titulo errado. E raro (as duas telas sao de
  // meio de jogo) e o conteudo — pra onde o POKE vai, por que ele esta no Nivel
  // 1, o que a raridade faz — continua verdadeiro nos tres caminhos. Distinguir
  // exigiria um contador de capturas no save, que e migration, e o ganho nao
  // paga.
  const temPokeNaMochila = useGameStateStore((s) => s.bagPokes.length > 0)
  const jaDisparouCaptura = useRef(false)
  useEffect(() => {
    if (!hasStarter || !temPokeNaMochila || jaDisparouCaptura.current) return
    jaDisparouCaptura.current = true
    useTutorialStore.getState().abrirSeInedito(TUTORIAL_CAPTURA)
  }, [hasStarter, temPokeNaMochila])
}
