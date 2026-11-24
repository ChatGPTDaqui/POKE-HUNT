// O RASTRO DO DANO na barra de HP (23/11/2026, referencia: LoL). Quando o HP
// cai, o pedaco perdido fica um instante em cor clara e depois escoa ate o
// valor novo — o olho le "quanto esse golpe tirou" sem numero. Cura nao deixa
// rastro.
//
// Estado so de DESENHO, por entidade, fora do motor (o servidor nao tem rastro).
// O relogio vem de fora, pra teste.
import { ESCOAMENTO_DO_RASTRO_S, ESPERA_DO_RASTRO_S } from '@/data/hpBar'

interface Rastro {
  /** Topo do rastro quando a queda vigente comecou. */
  de: number
  /** HP (fracao) depois da queda: onde o rastro termina. */
  para: number
  desde: number
  visto: number
}

function valorNoInstante(r: Rastro, agoraS: number): number {
  const passou = agoraS - r.desde
  if (passou <= ESPERA_DO_RASTRO_S) return r.de
  const t = Math.min(1, (passou - ESPERA_DO_RASTRO_S) / ESCOAMENTO_DO_RASTRO_S)
  return r.de + (r.para - r.de) * (1 - (1 - t) ** 2)
}

export class RastrosDoHp {
  private readonly rastros = new Map<string, Rastro>()

  /** Ate onde (0..1) o rastro vai neste quadro; nunca menos que `pct`. */
  atualizar(id: string, pct: number, agoraS: number): number {
    const r = this.rastros.get(id)
    if (!r) {
      this.rastros.set(id, { de: pct, para: pct, desde: agoraS, visto: agoraS })
      this.limpar(agoraS)
      return pct
    }
    r.visto = agoraS
    if (pct !== r.para) {
      // Queda nova (ou outra queda no meio do escoamento): o rastro segura de
      // onde esta AGORA e recomeca a espera. Cura: rastro nenhum acima da barra.
      const topo = Math.max(valorNoInstante(r, agoraS), pct)
      r.de = pct > r.para ? pct : topo
      r.para = pct
      r.desde = agoraS
    }
    return Math.max(pct, valorNoInstante(r, agoraS))
  }

  private limpar(agoraS: number): void {
    if (this.rastros.size < 64) return
    for (const [id, r] of this.rastros) if (agoraS - r.visto > 5) this.rastros.delete(id)
  }
}
