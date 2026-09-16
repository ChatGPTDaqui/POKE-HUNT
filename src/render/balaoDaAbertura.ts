// PH-552: o balao "Vai <nome>!!" da abertura do duelo.
//
// Desenhado no ponto da bola (onde o POKE vai aparecer) enquanto a etapa
// `bola` de um lado corre, e SO quando ha treinador desse lado: no covil de
// lendario o selvagem sai da bola mas ninguem grita. Quem tem treinador e
// decidido aqui por forma do mundo, nao por flag nova no motor — o jogador
// sempre; o inimigo na arena (`world.arena`) e na sequencia do Lance
// (`mapDef.sequence`).
//
// So apresentacao: le `world.aberturaDoDuelo` e desenha. Nada de estado.
import { SPECIES } from '@/data/pokes'
import type { WorldEntity, WorldState } from '@/engine/types'
import { FONTE } from './textoDeCombate'

const ALTURA_DO_BALAO = 18
const FOLGA_HORIZONTAL = 10
/**
 * Quanto acima do ponto da bola o balao flutua. Acima da bola inteira (a tira
 * de captura tem ~44 px de altura ancorada no ponto) e na faixa em que a
 * placa de nome fica — no celular a bola amarela cai atras do placar da HUD,
 * e um balao mais baixo sumia atras dele.
 */
const ALTURA_SOBRE_O_PONTO = 74

export function textoDoBalao(entidade: WorldEntity): string {
  return `Vai ${SPECIES[entidade.poke.speciesId]?.name ?? entidade.poke.speciesId}!!`
}

/** Quem esta gritando "Vai X!!" agora, se a etapa em curso e uma bola com treinador. */
export function entidadeDoBalao(world: WorldState): WorldEntity | null {
  const abertura = world.aberturaDoDuelo
  if (!abertura) return null
  const etapa = abertura.fila[abertura.indice]
  if (!etapa || etapa.tipo !== 'bola') return null
  const entidade = world.player?.id === etapa.entidadeId
    ? world.player
    : world.enemies.find((e) => e.id === etapa.entidadeId) ?? null
  if (!entidade) return null
  const temTreinador = entidade.kind === 'player' || world.arena != null || Boolean(world.mapDef?.sequence)
  return temTreinador ? entidade : null
}

export function drawBalaoDaAbertura(ctx: CanvasRenderingContext2D, world: WorldState): void {
  const entidade = entidadeDoBalao(world)
  if (!entidade) return
  const texto = textoDoBalao(entidade)
  const x = entidade.x
  const y = entidade.y - ALTURA_SOBRE_O_PONTO

  ctx.save()
  ctx.font = FONTE.selo
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const largura = ctx.measureText(texto).width + FOLGA_HORIZONTAL * 2
  const esquerda = x - largura / 2
  const topo = y - ALTURA_DO_BALAO / 2
  const raio = ALTURA_DO_BALAO / 2

  ctx.beginPath()
  ctx.moveTo(esquerda + raio, topo)
  ctx.lineTo(esquerda + largura - raio, topo)
  ctx.arcTo(esquerda + largura, topo, esquerda + largura, topo + raio, raio)
  ctx.lineTo(esquerda + largura, topo + ALTURA_DO_BALAO - raio)
  ctx.arcTo(esquerda + largura, topo + ALTURA_DO_BALAO, esquerda + largura - raio, topo + ALTURA_DO_BALAO, raio)
  // Rabinho do balao apontando pro ponto da bola.
  ctx.lineTo(x + 5, topo + ALTURA_DO_BALAO)
  ctx.lineTo(x, topo + ALTURA_DO_BALAO + 6)
  ctx.lineTo(x - 5, topo + ALTURA_DO_BALAO)
  ctx.lineTo(esquerda + raio, topo + ALTURA_DO_BALAO)
  ctx.arcTo(esquerda, topo + ALTURA_DO_BALAO, esquerda, topo + ALTURA_DO_BALAO - raio, raio)
  ctx.lineTo(esquerda, topo + raio)
  ctx.arcTo(esquerda, topo, esquerda + raio, topo, raio)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#1b1b22'
  ctx.stroke()

  ctx.fillStyle = '#1b1b22'
  ctx.fillText(texto, x, y + 0.5)
  ctx.restore()
}
