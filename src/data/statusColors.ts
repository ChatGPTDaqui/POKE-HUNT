// Cor de cada status, para o texto flutuante do combate e para o selo no HUD.
//
// Escolhidas para bater com a leitura do jogo original em vez de com o tipo
// elemental que causa o status: queimadura e laranja de fogo, veneno e roxo,
// paralisia e amarelo, sono e azul acinzentado, congelamento e ciano, confusao
// e rosa. Sao seis cores distinguiveis entre si sobre o fundo escuro das hunts,
// que e onde elas aparecem.
import type { StatusCondition } from './generated/types'

const CORES: Record<StatusCondition, string> = {
  poison: '#a855f7',
  burn: '#f97316',
  paralysis: '#facc15',
  sleep: '#94a3b8',
  freeze: '#38bdf8',
  confusion: '#f472b6',
}

export function corDoStatus(tipo: StatusCondition): string {
  return CORES[tipo] ?? '#e5e5e5'
}

// Sigla de 3 letras pro selo compacto do HUD, onde nao cabe o nome inteiro.
const SIGLAS: Record<StatusCondition, string> = {
  poison: 'VEN',
  burn: 'QUE',
  paralysis: 'PAR',
  sleep: 'SON',
  freeze: 'CON',
  confusion: 'CNF',
}

export function siglaDoStatus(tipo: StatusCondition): string {
  return SIGLAS[tipo] ?? '???'
}
