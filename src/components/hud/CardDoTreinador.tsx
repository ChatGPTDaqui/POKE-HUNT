// O card do jogador: avatar, nome, nivel, carteira e o anel de EXP.
//
// MORAVA DENTRO DO TRILHO, E POR ISSO NAO FICAVA NO CANTO (PH-282)
// ---------------------------------------------------------------------------
// Ele era o ultimo item do trilho de status. O trilho tem teto de largura
// (`max-w-[64em]`) e e alinhado a esquerda — decisao de PH-83, pra o cabecalho
// do POKE nao fugir pro meio da tela em monitor grande. A consequencia so
// aparece acima de 64em: o trilho acaba antes da borda da janela, e o card
// acabava junto. Medido em 1920px, ele terminava por volta de x=1440, com
// ~480px de tela vazia a direita — e desalinhado da coluna de atalhos, que ja
// estava colada na borda.
//
// Agora ele e o primeiro item da coluna do canto superior direito
// (`ColunaDeAtalhos`), que ancora em `right`. Card e atalhos passam a dividir a
// mesma borda, e a coluna continua logo abaixo dele sem medir nada.
//
// NAO APARECE NO COMPACTO, e isso e antigo: em 390px o avatar virava um icone
// generico ocupando ~46px permanentes da faixa mais disputada da tela, sem
// largura pro nome nem pro nivel. Ali ele desce pra gaveta de detalhes, onde
// cabe COM nome e nivel escritos — e a carteira fica no trilho (PH-279).
import { User } from '@phosphor-icons/react'
import { trainerExpProgress } from '@/engine/systems/progressionSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { Carteira } from '@/components/hud/Carteira'

export function CardDoTreinador() {
  const trainer = useGameStateStore((s) => s.trainer)
  const setPerfilOpen = useUiStore((s) => s.setPerfilOpen)
  const progress = trainerExpProgress(trainer)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <button
      type="button"
      data-keep-open
      aria-label="Perfil do treinador"
      onClick={() => setPerfilOpen(true)}
      className={
        'vidro pointer-events-auto relative flex shrink-0 cursor-pointer items-center gap-[.4em] '
        + 'rounded-[.7em] border border-n700 p-[.25em] pr-[.35em]'
      }
    >
      <span className="flex h-[2em] w-[2em] items-center justify-center rounded-[.5em] text-[1.1em] text-n300">
        <User weight="fill" />
      </span>
      <span className="flex flex-col items-start gap-[.2em] pr-[.2em]">
        <span className="max-w-[7em] truncate text-[.78em] leading-none">{trainer.name}</span>
        <span className="text-[.7em] leading-none text-n400">Lv {trainer.level}</span>
      </span>
      {/* Carteira sempre abreviada (PH-279): dentro do card nao ha largura pro
          valor cheio sem empurrar o nome do treinador, e o cheio ja esta no
          `title` dela e no perfil.

          Largura MINIMA reservada: sem ela, `1B` e `9` ocupam tamanhos
          diferentes e o card mudava de largura a cada abate — a mesma tremida
          que o PH-157 tirou da barra de HP, reintroduzida pela porta do card. */}
      <span className="ml-[.15em] h-[1.6em] w-px shrink-0 self-center bg-n700" aria-hidden />
      <span className="flex min-w-[3.4em] shrink-0 justify-end">
        <Carteira abreviada />
      </span>
      {/* Anel de EXP do treinador em vez de barra: o progresso e um dado de
          fundo — a borda inferior preenchendo ja diz "esta subindo". */}
      <span
        className="absolute inset-x-[.25em] bottom-[.15em] h-[.15em] overflow-hidden rounded-full bg-n800"
        aria-hidden
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${expPct}%` }} />
      </span>
    </button>
  )
}
