// Apresentacao dos niveis de conquista: nome, cor e ordem de valor.
// Fica num modulo proprio porque a celebracao e a tela usam os mesmos tres.
import type { ConquistaDaTela, NivelDeConquista } from '@/data/conquistas'

export const NOME_DO_NIVEL_DE_CONQUISTA: Record<NivelDeConquista, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  impossivel: 'Lenda Viva',
  platina: 'Platina',
}

// Cores literais e nao tokens do tema: bronze/prata/ouro/platina precisam
// parecer metal nos dois temas, e o jogo nao tem token pra isso.
export const COR_DO_NIVEL_DE_CONQUISTA: Record<NivelDeConquista, string> = {
  bronze: '#cd7f32',
  prata: '#c0c7d1',
  ouro: '#f5c542',
  impossivel: '#e879f9',
  platina: '#7dd3fc',
}

const VALOR: Record<NivelDeConquista, number> = { platina: 5, impossivel: 4, ouro: 3, prata: 2, bronze: 1 }

/** Da mais valiosa pra menos; empate pela ordem do catalogo. */
export function ordenarPorNivel<T extends Pick<ConquistaDaTela, 'nivel' | 'ordem'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => VALOR[b.nivel] - VALOR[a.nivel] || a.ordem - b.ordem)
}
