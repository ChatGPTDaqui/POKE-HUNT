// Tipos da camada de VFX, num arquivo sem dependencia (PH-190).
//
// Separados de `camadaVfx.ts` porque aquele arquivo guarda estado de modulo (o
// canvas registrado, os pintores, as ancoras). Quem so precisa do TIPO pra
// declarar um pintor — e sao vários, um por efeito — importa daqui e nao puxa o
// estado junto.

export interface PintorInfo {
  /** Largura do canvas em px de desenho. */
  largura: number
  /** Altura do canvas em px de desenho. */
  altura: number
  /** Segundos desde o quadro anterior, como o laco do jogo mede. */
  dt: number
}

/**
 * Uma funcao que pinta um quadro da camada.
 *
 * Recebe o `ctx` ja limpo e dentro de um `save`/`restore` proprio, entao pode
 * sujar estado de contexto sem se preocupar com o vizinho.
 *
 * Coordenada e px de CANVAS, que aqui coincide com px de CSS (ver
 * `ajustarTamanhoDaCamada`) — nao ha transform de camera nesta camada, de
 * proposito: ela existe pra falar com a HUD, que vive em coordenada de tela.
 */
export type Pintor = (ctx: CanvasRenderingContext2D, info: PintorInfo) => void
