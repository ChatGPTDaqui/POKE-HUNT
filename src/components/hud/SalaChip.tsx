// Onde o jogador esta DENTRO da hunt: qual sala, qual sub-bioma, e quanto
// falta pra limpar.
//
// Some no Hospital e nas hunts sem salas (a inicial, as 11 BOSS e a do Campeao
// Lance) — nelas nao ha sala, e um chip vazio pendurado no HUD leria como bug.
//
// DOIS LUGARES, UM COMPONENTE (PH-272)
// -----------------------------------------------------------------------------
// A pedido do usuario, em tela com largura ele mora DENTRO do trilho de status,
// no vao central que ja existia vazio ali (`StatusRail`). No compacto ele
// continua na linha de chips abaixo do trilho, com o clima e o lure.
//
// Nao ha layout novo pro compacto porque nao cabe, e isso foi medido antes: o
// trilho de 390px ja empurrou o avatar do treinador pra fora da tela uma vez
// (ver o cabecalho de StatusRail.tsx), e este chip sozinho pede ~15em. Enfiar
// ele la significaria tirar outra coisa do trilho — e o que sobra la e HP,
// carteira e treinador, os tres mais urgentes que "qual sala".
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { SALAS_POR_HUNT, ABATES_POR_SALA } from '@/data/biomas'
import { janelaDaSala, nomeDaSala } from '@/engine/systems/salaSystem'
import { avancarSalaManualmente } from '@/data/remote/autoridade'
import { GameButton } from '@/components/game/controls'
import type { DeviceMode } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

/**
 * O chip de sala mora no trilho neste regime? (PH-272)
 *
 * Uma funcao exportada, e nao a condicao repetida nos dois lados: `StatusRail` e
 * `HudLayer` precisam concordar, e discordar aqui significa o chip aparecendo
 * DUAS vezes na tela ou nenhuma. Nenhum dos dois casos daria erro.
 */
export function salaNoTrilho(mode: DeviceMode): boolean {
  return mode !== 'compacto'
}

/**
 * `embutido`: versao pro trilho — sem a moldura de vidro (ele ja esta dentro de
 * uma) e sem o arredondamento proprio. O conteudo e o mesmo nos dois lugares de
 * proposito: o jogador que troca de aparelho le a mesma coisa.
 */
export function SalaChip({ embutido = false }: { embutido?: boolean } = {}) {
  const sala = useWorldStore((s) => s.sala)
  const faixa = useWorldStore((s) => s.mapDef?.levelRange)
  const countdown = useWorldStore((s) => s.salaCountdownRemaining)
  const avancoManualLigado = useGameStateStore((s) => s.autoToggles.avancoManualDeSala)
  if (!sala) return null

  const nome = nomeDaSala(sala)
  // A janela sobe com a sala: a hunt afunda conforme voce limpa. Mostrar so o
  // intervalo da HUNT (Lv1-30) esconderia justamente isso.
  const janela = faixa ? janelaDaSala(faixa, sala.indice) : null
  const restantes = Math.max(0, ABATES_POR_SALA - sala.abates)
  const progresso = Math.min(1, sala.abates / ABATES_POR_SALA)
  // PH-180: so aparece com a quota FECHADA, o toggle ligado (senao a sala ja
  // trocou sozinha) e sem transicao em andamento (o clique nao tem o que
  // fazer enquanto o overlay de "Entrando em nova area" ja esta na tela).
  const podeAvancarManual = avancoManualLigado && sala.abates >= ABATES_POR_SALA && countdown == null

  // O TITULO CARREGA O QUE NAO CABE (PH-272). No trilho, `Lv X-Y` e o numero do
  // ciclo saem de cena pra o NOME do sub-bioma caber inteiro — o nome e a
  // resposta pra "onde estou", e um chip que mostra a faixa de nivel e corta
  // "Vilarej…" respondeu a pergunta errada. Os dois continuam a um passar de
  // mouse, e na versao de baixo (compacto) continuam escritos.
  const titulo = [
    `Sala ${sala.indice + 1}/${SALAS_POR_HUNT}`,
    nome,
    janela ? `Lv ${janela[0]}-${janela[1]}` : null,
    `${restantes} de ${ABATES_POR_SALA} para limpar`,
    sala.ciclos > 0 ? `ciclo ${sala.ciclos + 1}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      title={embutido ? titulo : undefined}
      className={cn(
        'flex items-center gap-[.6em] overflow-hidden',
        // `min-w-0` no embutido: ele vive dentro de um `flex-1` do trilho, e sem
        // isso o nome do sub-bioma nao trunca — ele empurra a carteira e o
        // avatar do treinador pra fora, que e o defeito que o trilho inteiro
        // existe pra nao ter (ver StatusRail.tsx).
        embutido ? 'min-w-0' : 'vidro rounded-full px-[.9em] py-[.35em]',
      )}
    >
      <span className="shrink-0 text-[.72em] tabular-nums text-n400">
        Sala <b className="font-medium text-n100">{sala.indice + 1}</b>/{SALAS_POR_HUNT}
      </span>
      <span className="min-w-0 truncate text-[.78em] font-medium text-n100">{nome}</span>
      {janela && !embutido && (
        <span className="shrink-0 text-[.7em] tabular-nums text-n500">Lv {janela[0]}-{janela[1]}</span>
      )}
      {/* Barra em vez de so o numero: e a informacao que o jogador olha de
          relance pra saber se vale esperar a proxima sala.
          `shrink-0`: no trilho ela e o primeiro item que o flex tentaria
          espremer, e barra de progresso encolhida nao diz mais nada — quem cede
          largura e o nome do sub-bioma, que trunca com reticencia legivel. */}
      <span className="relative h-[.4em] w-[4.5em] shrink-0 overflow-hidden rounded-full bg-n800">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ok transition-[width] duration-300"
          style={{ width: `${progresso * 100}%` }}
        />
      </span>
      <span className="shrink-0 text-[.7em] tabular-nums text-n500">
        {restantes} {embutido ? 'restam' : 'p/ limpar'}
      </span>
      {sala.ciclos > 0 && !embutido && (
        <span className="shrink-0 text-[.7em] tabular-nums text-n500">· ciclo {sala.ciclos + 1}</span>
      )}
      {podeAvancarManual && (
        <GameButton
          variant="ghost"
          className="shrink-0 px-[.5em] py-[.15em] text-[.68em]"
          onClick={() => void avancarSalaManualmente()}
        >
          Próximo Nível
        </GameButton>
      )}
    </div>
  )
}
