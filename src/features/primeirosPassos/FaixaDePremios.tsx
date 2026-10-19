// Uma faixa só de prêmios abaixo do cartão de Primeiros Passos (10/10).
//
// POR QUE EXISTE: prêmio de treinador e Diário tinham uma faixa cada. Numa
// conta nova as duas apareciam com o cartão do passo — três faixas empilhadas
// no topo de uma tela de 390px, cobrindo o campo. A regra do topo é "um
// objetivo por vez", então:
//  - 2 ou mais prêmios prontos: UMA linha "N prêmios para coletar" com
//    "Coletar tudo" (treinador + login + metas, em sequência);
//  - 1 pronto: a faixa daquele prêmio, como antes;
//  - nenhum pronto (depois dos Primeiros Passos): só UMA meta em andamento —
//    a do Diário, que é do dia; o próximo marco de treinador fica para quando
//    não houver meta do dia.
import { useState } from 'react'
import { Gift } from '@phosphor-icons/react'
import { somaDasRecompensas } from '@/data/recompensasDeNivel'
import { useDiarioStore } from '@/stores/diarioStore'
import { coletarTudo, FaixaDoTreinador, usePendentesDeTreinador } from './FaixaDoTreinador'
import { coletar, FaixaDoDiario, useProntosDoDiario } from './Diario'
import { textoDaRecompensa } from './CartaoDoPasso'

export function FaixaDePremios() {
  const pendentesDeTreinador = usePendentesDeTreinador()
  const prontosDoDiario = useProntosDoDiario()
  const metaDoDiaAndando = useDiarioStore(s => s.carregado && ['meta_100', 'meta_300', 'meta_1000'].some(m => !s.coletados.has(m)))
  const [coletando, setColetando] = useState(false)

  const quantos = (pendentesDeTreinador.length > 0 ? 1 : 0) + prontosDoDiario.length
  if (quantos >= 2) {
    // Cada coleta já mostra o próprio aviso; aqui a soma é só o que a linha promete.
    const soma = somaDasRecompensas(pendentesDeTreinador)
    for (const p of prontosDoDiario) {
      soma.ouro += p.recompensa.ouro
      for (const i of p.recompensa.itens) {
        const ja = soma.itens.find(x => x.itemId === i.itemId)
        if (ja) ja.quantidade += i.quantidade
        else soma.itens.push({ ...i })
      }
    }
    const total = pendentesDeTreinador.length + prontosDoDiario.length
    return (
      <>
        {/* Montada e escondida: o efeito do dia (abrir, virar à meia-noite) vive nela. */}
        <FaixaDoDiario esconder />
        <div className="pointer-events-auto flex w-full items-center gap-[.4em] rounded-[.5em] border border-ok/60 bg-menu-card/92 px-[.55em] py-[.3em] text-[.78em]">
          <button type="button" onClick={() => useDiarioStore.getState().abrirPainel()} className="flex min-w-0 flex-1 items-center gap-[.4em] text-left"
            aria-label={`${total} prêmios para coletar. Abrir o Diário`}>
            <Gift weight="fill" className="shrink-0 text-[1.2em] text-warn" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-menu-ink">{total} prêmios para coletar</div>
              <div className="truncate text-[.9em] text-menu-muted">{textoDaRecompensa(soma)}</div>
            </div>
          </button>
          <button type="button" disabled={coletando}
            onClick={async () => {
              setColetando(true)
              try {
                // Em sequência, não em paralelo: as RPCs disputam o mesmo lock
                // por jogador, e o flush da caçada liquidado por uma serve às outras.
                if (pendentesDeTreinador.length > 0) await coletarTudo(pendentesDeTreinador)
                for (const p of prontosDoDiario) await coletar(p.item, p.recompensa)
              } finally {
                setColetando(false)
              }
            }}
            className="jogo-botao shrink-0 rounded-[.5em] bg-ok px-[.7em] py-[.45em] font-bold text-n950 disabled:opacity-60">
            {coletando ? '...' : 'Coletar tudo'}
          </button>
        </div>
      </>
    )
  }

  const treinadorPronto = pendentesDeTreinador.length > 0
  const diarioPronto = prontosDoDiario.length > 0
  return (
    <>
      <FaixaDoTreinador modo={treinadorPronto ? 'tudo' : diarioPronto || metaDoDiaAndando ? 'nada' : 'tudo'} />
      <FaixaDoDiario esconder={treinadorPronto} />
    </>
  )
}
