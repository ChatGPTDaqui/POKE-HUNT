// Tempo que falta num leilao (PH-101) — o RELOGIO.
//
// Separado do componente que o desenha porque um arquivo que exporta hook E
// componente derruba o fast refresh do Vite (o oxlint avisa: `react(only-export-components)`).
//
// ---------------------------------------------------------------------------
// UM RELOGIO SO PRA TODA A LISTA
// ---------------------------------------------------------------------------
// O reflexo seria um `setInterval` dentro deste componente. Numa vitrine com 40
// leiloes isso vira 40 timers e 40 re-renders por segundo, cada um redesenhando
// um cartao inteiro — e o jogo ja desenha o canvas a 60fps ao lado.
//
// Aqui o intervalo e UM, no modulo, e ele empurra um contador que todos os
// componentes assinam. 40 leiloes na tela = um timer, um re-render por segundo.
//
// ---------------------------------------------------------------------------
// O TEMPO PODE FICAR NEGATIVO, E ISSO NAO E ERRO
// ---------------------------------------------------------------------------
// `expira_em` passou mas o cron roda de 5 em 5 minutos (PH-126, era de minuto
// em minuto), entao existe uma janela de ate ~5min em que o leilao esta vencido
// e ainda nao foi liquidado — no ambiente `dev` o cron e de 15 em 15. A
// tela diz "encerrando..." nessa janela em vez de mostrar tempo negativo ou
// fingir que ainda da pra dar lance — e o servidor recusa lance depois de
// `expira_em` de qualquer forma, entao os dois concordam.
//
// ---------------------------------------------------------------------------
// O RELOGIO E O DO APARELHO, E ISSO E ACEITAVEL AQUI
// ---------------------------------------------------------------------------
// Um aparelho com a hora adiantada mostra menos tempo do que resta. Isso NAO e
// explorável: quem decide se o lance entrou e o `expira_em <= now()` do
// Postgres, dentro da transacao. O relogio local so pinta o numero — e o jogo
// ja trata relogio de aparelho como nao-confiavel em toda decisao que vale ouro
// (ver `farmOfflineSemServidorEhConfiavel`).
import { useEffect, useState } from 'react'

let assinantes = new Set<(t: number) => void>()
let timer: ReturnType<typeof setInterval> | null = null

function agora(): number {
  return Date.now()
}

function assinar(fn: (t: number) => void): () => void {
  assinantes.add(fn)
  if (!timer) {
    timer = setInterval(() => {
      const t = agora()
      for (const a of assinantes) a(t)
    }, 1000)
  }
  return () => {
    assinantes.delete(fn)
    // Ultimo componente saiu: o timer vai junto. Sem isto ele ficaria batendo
    // pra sempre depois de o jogador fechar o Mercado.
    if (assinantes.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Segundos que faltam; negativo quando ja passou. */
export function useSegundosRestantes(expiraEm: string | null | undefined): number | null {
  const [instante, setInstante] = useState(() => agora())
  useEffect(() => assinar(setInstante), [])
  if (!expiraEm) return null
  return Math.round((new Date(expiraEm).getTime() - instante) / 1000)
}

export function formatarRestante(segundos: number): string {
  if (segundos <= 0) return 'encerrando...'
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`
  return `${s}s`
}


/**
 * Quanto tem que valer o PROXIMO lance.
 *
 * A mesma regra que `dar_lance` aplica no servidor: sem lance ainda e o piso do
 * leilao; com lance e o maior mais o incremento. Funcao pura e nao expressao
 * inline no cartao porque este numero e o que o jogador le antes de
 * comprometer ouro — se ele divergir do servidor, o lance e recusado depois do
 * clique e o jogador nao entende por que.
 *
 * Os `?? 1` cobrem anuncio vindo de servidor mais antigo (sem as colunas de
 * leilao): 1 e o menor lance possivel, entao a tela nao trava o campo — e o
 * servidor recusa com frase se o valor nao servir. Errar pra permitir e depois
 * ser recusado com frase e melhor que errar pra bloquear e o jogador nao ter
 * como dar lance nenhum.
 */
export function proximoLanceMinimo(
  melhorOferta: number | null | undefined,
  lanceMinimo: number | null | undefined,
  incrementoMinimo: number | null | undefined,
): number {
  if (melhorOferta == null) return lanceMinimo ?? 1
  return melhorOferta + (incrementoMinimo ?? 1)
}
