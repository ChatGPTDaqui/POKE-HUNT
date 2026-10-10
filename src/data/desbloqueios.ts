// Que menu abre com qual Primeiro Passo (10/10/2026).
//
// O jogador novo via 19 destinos no minuto 1 (PvP, Mercado, Troca, Ranking,
// Treinamento Lv 60...). Decisão do dono: os avançados aparecem COM CADEADO e
// o requisito escrito — o jogador vê o que vem pela frente, e isso vira meta.
//
// É REVELAÇÃO, NÃO SEGURANÇA: o cadeado vive só no cliente. O que precisa de
// trava de verdade (gate de estágio, Lance, Pesadelo) continua no servidor.
//
// "Liberado" = o passo foi cumprido, reivindicado ou não. Conta antiga que já
// passou daquele ponto nunca acorda com menu trancado.
//
// A ordem respeita a cadeia: todo passo que pede um menu tem esse menu aberto
// ANTES dele (Tasks antes de "reivindique uma missão", Especialidades antes de
// "invista numa Especialidade").
import { PRIMEIROS_PASSOS } from './primeirosPassos'

export type TelaComCadeado =
  | 'tasks' | 'especialidades' | 'calc' | 'mercado' | 'troca' | 'bestiario' | 'pvp' | 'ranking' | 'treinamento'

/** Tela → id do passo que a libera. */
export const DESBLOQUEIO_POR_TELA: Record<TelaComCadeado, string> = {
  tasks: 'equipe_de_dois',
  especialidades: 'primeiro_lord',
  calc: 'primeira_especialidade',
  mercado: 'estagio_2',
  troca: 'estagio_2',
  bestiario: 'primeira_evolucao',
  pvp: 'treinador_10',
  ranking: 'treinador_10',
  // A hunt de Treinamento (Lv 60): não é tela, mas entra na mesma regra.
  treinamento: 'tres_biomas',
}

export function passoQueLibera(tela: string): string | null {
  return (DESBLOQUEIO_POR_TELA as Record<string, string>)[tela] ?? null
}

/** "Abre ao concluir o Passo 4" — o número que o jogador vê no cartão da HUD. */
export function textoDoRequisito(passoId: string, curto = false): string {
  const i = PRIMEIROS_PASSOS.findIndex(p => p.id === passoId)
  if (i === -1) return ''
  return curto ? `Passo ${i + 1}` : `Abre ao concluir o Passo ${i + 1}: ${PRIMEIROS_PASSOS[i].titulo}.`
}
