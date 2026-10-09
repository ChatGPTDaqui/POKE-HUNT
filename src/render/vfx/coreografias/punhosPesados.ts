// Dois golpes de punho que ficaram fora dos 11 socos da 7.80 (09/10), cada um
// a partir da descrição do jogo (frase no comentário).
import { getAbility } from '@/data/abilities'
import { PELES } from '../paletas'
import { crescente, entrada, estilhacos, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import { rngSemeado } from '../aleatorio'
import { BRANCO, ESCURO, bola, comAcento, entrePontos, janela, montarFamilia, nuvem, rastro, setasDeStatus } from './formas'
import type { ContextoVfx, Pele, Ponto } from '../tipos'

interface Perfil { contato: number; fim: number }

export const PERFIS_DE_PUNHO_PESADO: Record<string, Perfil> = {
  hammer_arm: { contato: 280, fim: 360 },
  meteor_mash: { contato: 300, fim: 340 },
}

const AZUL = '#58a6f0', VERMELHO = '#e0303a', FOGO = ['#ff9a3a', '#ffd23a'] as const

/** Punho fechado visto de lado, grande e simples (massa + nós dos dedos). */
function punho(ctx: CanvasRenderingContext2D, p: Ponto, angulo: number, s: number, pele: Pele, cor = pele.base): void {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angulo); ctx.scale(s, s)
  ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.ellipse(0, 0, 9.4, 8, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6.6, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.ellipse(-1, -2, 5, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = ESCURO; for (let k = 0; k < 3; k++) ctx.fillRect(3 + k * .2, -4 + k * 3, 4.6, 1)
  ctx.fillStyle = BRANCO; ctx.fillRect(-4, -4, 2, 2)
  ctx.restore()
}

const GOLPES: Record<string, (p: Perfil, c: ContextoVfx, semente: number) => void> = {
  /** "Swings and hits with its strong, heavy fist. It lowers the user's Speed, however." */
  hammer_arm(p, c, semente) {
    const { ctx, ms, origem, alvo } = c
    // MARTELO: o punho sobe bem alto atrás de quem ataca, gira por cima e desce
    // como marreta no alvo; o chão afunda; depois quem bateu fica mais lento
    // (seta de Speed azul pra baixo).
    const giro = janela(ms, 0, p.contato + 40)
    const lado = alvo.x < origem.x ? -1 : 1
    if (giro !== null) {
      const sobe = ms < p.contato - 90 ? saida(ms / (p.contato - 90)) : 1
      const desce = entrada(limitar((ms - p.contato + 90) / 90))
      const a = -Math.PI / 2 - lado * (1 - sobe) * .6 + lado * desce * 2.2
      const pivo = entrePontos(origem, alvo, .35)
      const q = { x: pivo.x + Math.cos(a) * 22 * lado * (lado < 0 ? -1 : 1), y: pivo.y - 6 + Math.sin(a) * 22 }
      if (desce > 0) crescente(ctx, pivo, 22, a - lado * 1.2, a, 3, .55, 0, c.pele, 1)
      punho(ctx, q, a + Math.PI / 2 * lado, 1.05 + c.tier * .04, c.pele)
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    estrelaDeImpacto(ctx, { x: alvo.x, y: alvo.y - 6 }, 15 + c.tier * 1.2, t, c.pele, rngSemeado(semente + 1))
    riscos(ctx, alvo, c.pedir(3 + c.tier), 20 + c.tier * 3, t, c.pele.meio, rngSemeado(semente + 2))
    nuvem(ctx, { x: alvo.x, y: alvo.y + 11 }, t, c.pedir(5), 18, PELES.GROUND, rngSemeado(semente + 3))
    if (t > .35) setasDeStatus(ctx, origem, (t - .35) / .65, AZUL, 1, true)
  },

  /** "The target is hit with a hard punch fired like a meteor. May raise the user's Attack." */
  meteor_mash(p, c, semente) {
    const { ctx, ms, origem, alvo } = c
    // METEORO: o punho de aço some no alto e volta caindo em diagonal do céu
    // com cauda de fogo de meteoro; cratera de estilhaços; seta de Ataque sobe.
    const sobe = janela(ms, 0, 120)
    if (sobe !== null) punho(ctx, { x: origem.x, y: origem.y - 10 - 40 * entrada(sobe) }, -Math.PI / 2, .9, c.pele)
    const cai = janela(ms, 150, p.contato - 150)
    if (cai !== null) {
      const de = { x: alvo.x - (alvo.x - origem.x) * .5 - 20, y: alvo.y - 56 }
      const q = entrePontos(de, { x: alvo.x, y: alvo.y - 4 }, entrada(cai))
      const a = Math.atan2(alvo.y - 4 - de.y, alvo.x - de.x)
      for (let k = 5; k >= 1; k--) bola(ctx, { x: q.x - Math.cos(a) * k * 5, y: q.y - Math.sin(a) * k * 5 }, 6 - k * .8, c.pele, k > 2 ? FOGO[0] : FOGO[1], BRANCO)
      rastro(ctx, de, q, c.pedir(3), 4, c.pele, rngSemeado(semente + 1))
      punho(ctx, q, a, 1.05 + c.tier * .04, c.pele, c.pele.meio)
    }
    const t = janela(ms, p.contato, p.fim)
    if (t === null) return
    estrelaDeImpacto(ctx, { x: alvo.x, y: alvo.y - 4 }, 15 + c.tier * 1.2, t, { ...c.pele, estrela: FOGO[1] }, rngSemeado(semente + 2))
    estilhacos(ctx, { x: alvo.x, y: alvo.y + 4 }, c.pedir(5 + c.tier), 24, t, c.pele, rngSemeado(semente + 3))
    if (t > .35) setasDeStatus(ctx, origem, (t - .35) / .65, VERMELHO, 1)
  },
}

export const PUNHOS_PESADOS_POR_GOLPE = montarFamilia(PERFIS_DE_PUNHO_PESADO, {
  desenhar: (p, c, id) => GOLPES[id](p, c, Math.floor(c.rng() * 0xffffffff)),
  duracao: p => p.contato + p.fim, contato: p => p.contato, alcance: 58,
  margem: () => ({ cima: 94, baixo: 58, lados: 58 }),
  pele: id => comAcento(PELES[getAbility(id)?.type ?? 'FIGHTING'], AZUL, VERMELHO, ...FOGO,
    PELES.GROUND.base, PELES.GROUND.meio, PELES.GROUND.contorno),
})
