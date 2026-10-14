// Contas da tela de Conquistas, puras pra serem testadas sem React.
import type { ConquistaDaTela } from '@/data/conquistas'

export interface ResumoDaPlatina {
  /** Bronze/Prata/Ouro (secretas incluidas): o que a platina pede. */
  total: number
  feitas: number
  secretasFaltando: number
  /** Impossiveis: vitrine "Lenda Viva", fora da platina. */
  lendasTotal: number
  lendasFeitas: number
  /** Soma dos pontos do que o jogador tem (Score de Treinador). */
  pontos: number
}

/** A mesma regra do SQL (`conquista_valor` com `t = 'platina'`). */
export function resumoDaPlatina(
  catalogo: ConquistaDaTela[], desbloqueadas: Record<string, string>,
): ResumoDaPlatina {
  const r: ResumoDaPlatina = { total: 0, feitas: 0, secretasFaltando: 0, lendasTotal: 0, lendasFeitas: 0, pontos: 0 }
  for (const c of catalogo) {
    const tem = Boolean(desbloqueadas[c.id])
    if (tem) r.pontos += c.pontos
    if (c.nivel === 'impossivel') {
      r.lendasTotal++
      if (tem) r.lendasFeitas++
    } else if (c.nivel !== 'platina') {
      r.total++
      if (tem) r.feitas++
      else if (c.secreta) r.secretasFaltando++
    }
  }
  return r
}

const fmt = new Intl.NumberFormat('pt-BR')

function tempo(segundos: number): string {
  const horas = segundos / 3600
  if (horas >= 1) return `${fmt.format(Math.floor(horas * 10) / 10)} h`
  return `${Math.floor(segundos / 60)} min`
}

/** "63 / 100", ou "30 min / 1 h" nas conquistas de tempo. */
export function textoDoProgresso(c: Pick<ConquistaDaTela, 'alvo' | 'unidade'>, valor: number): string {
  const atual = Math.min(valor, c.alvo)
  if (c.unidade === 'tempo') return `${tempo(atual)} / ${tempo(c.alvo)}`
  return `${fmt.format(atual)} / ${fmt.format(c.alvo)}`
}
