// Contagem de 3 segundos entre pedir o Hospital e sair da hunt (PH-263).
//
// POR QUE A ESPERA EXISTE
// ---------------------------------------------------------------------------
// `controller.returnToHospital` trocava a cena no mesmo frame do clique, e isso
// fazia do slot Hospital um botao de fuga: POKE a 5% de HP, bando reunido em
// cima, protetor acordado — qualquer situacao ruim em campo se resolvia saindo
// antes do proximo tick, sem custo nenhum. Com a contagem o jogo CONTINUA
// rodando durante os 3 segundos: o dano que estava vindo chega, e a saida deixa
// de ser um botao de invulnerabilidade sem deixar de existir.
//
// O QUE ISTO NAO E
// ---------------------------------------------------------------------------
// Nao e uma trava de servidor. O relogio vive no cliente, entao quem mexer no
// cliente sai na hora — como ja sai hoje. O que a espera fecha e o exploit
// disponivel a QUALQUER jogador com o jogo normal na tela, que era o pedido; um
// gate de verdade precisaria a Edge recusar `/sessao/fechar` antes de N
// segundos, e ai o custo cai tambem em quem fecha a aba.
//
// POR QUE SO O BOTAO DA DOCA
// ---------------------------------------------------------------------------
// Os outros caminhos que chamam `returnToHospital` (derrota, fim de sessao) NAO
// passam por aqui, de proposito: nos dois o jogador ja perdeu a hunt: adiar a
// volta so o prenderia numa tela olhando um POKE caido, e nao ha exploit nenhum
// a fechar — a coisa ruim ja aconteceu.
import { useEffect } from 'react'
import { controller } from '@/engine/controller'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { GameButton } from '@/components/game/controls'
import { CampoOverlay } from './CampoOverlay'

/** De quanto em quanto tempo o relogio anda. Um segundo, que e o que a tela mostra. */
const PASSO_MS = 1000

export function ViagemAoHospitalOverlay() {
  const restante = useUiStore((s) => s.viagemAoHospital)
  const definir = useUiStore((s) => s.definirViagemAoHospital)
  const cancelar = useUiStore((s) => s.cancelarViagemAoHospital)
  const emHunt = useWorldStore((s) => s.mapDef != null)

  // Sair da hunt por outro caminho (derrota, sessao encerrada pelo servidor)
  // durante a contagem cancela a viagem: o destino ja e o Hospital, e deixar o
  // relogio correr chamaria `returnToHospital` de dentro do Hospital,
  // remontando o mundo por nada.
  useEffect(() => {
    if (!emHunt && restante != null) cancelar()
  }, [emHunt, restante, cancelar])

  useEffect(() => {
    if (restante == null) return
    const id = setTimeout(() => {
      const proximo = restante - 1
      if (proximo > 0) {
        definir(proximo)
        return
      }
      // Zera ANTES de trocar a cena. `returnToHospital` remonta o mundo, o que
      // re-renderiza meio HUD; com o estado ainda preenchido este efeito
      // poderia rodar de novo no meio da troca e disparar a viagem duas vezes.
      cancelar()
      controller.returnToHospital({ x: 0, y: 0 })
    }, PASSO_MS)
    return () => clearTimeout(id)
  }, [restante, definir, cancelar])

  if (restante == null || !emHunt) return null

  return (
    // `interativo`: tem botao dentro. Cancelar existe porque a espera nao pode
    // virar uma armadilha — quem clicou sem querer fica 3 segundos preso a uma
    // saida que nao pediu, e cancelar nao abre exploit nenhum (nao sair da hunt
    // e o estado em que ele ja estava).
    <CampoOverlay interativo>
      <div className="text-sm font-medium">Voltando ao Hospital em...</div>
      <div className="font-mono text-5xl font-black text-sky-300">{restante}</div>
      <GameButton variant="secondary" onClick={cancelar}>Cancelar</GameButton>
    </CampoOverlay>
  )
}
