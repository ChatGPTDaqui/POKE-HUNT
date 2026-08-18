// Animacao de arremesso de Pokebola pos-batalha (render/sprites.ts#drawCaptureAnim,
// disparada por engine/simulation.ts#handleEnemyDefeated).
//
// FORMATO: uma tira horizontal por arquivo, quadros de 64x96 lado a lado, ja
// MONTADOS. Quadro N fica em `[N*64, N*64+64)`, altura cheia. Nao ha linha, nao
// ha coluna, nao ha variante de tamanho — so quadros em ordem.
//
// POR QUE ISTO E UMA REESCRITA, E NAO UM AJUSTE
//
// As tiras antigas eram DUMP DE TILE, nao de quadro: 512x736 = 16x23 celulas de
// 32x32, guardando os 360 tiles crus na ordem em que o banco os armazena. O
// quadro de verdade tem 2x3 TILES (64x96 px) e a animacao tem 60 quadros —
// 60 x 6 = 360 tiles, que em 16 por linha dao exatamente as 23 linhas do
// arquivo antigo (e 44 x 6 = 264 tiles dao as 17 da falha). Ou seja: o que o
// codigo chamava de "linha da animacao" era um TERCO de um quadro, e o que ele
// chamava de "coluna/variante de tamanho" eram tiles vizinhos de quadros
// diferentes.
//
// Cada tentativa anterior de consertar isso partia da tira achatada e tentava
// adivinhar a grade pela imagem — foi assim que sairam, em ordem, "as 8 colunas
// sao copias", depois "coluna_ativa = linha % 3", depois "a bola fica centrada
// na costura entre blocos". Cada uma explicava um sintoma e criava o proximo,
// porque a geometria nao esta na imagem: esta no banco .dat de origem, que diz
// `2x3 tiles, 1 camada, 1 pattern, 60 frames`. Com isso, montar o quadro e
// mecanico e nao sobra nada pra deduzir.
//
// Regenerar (as 8 de uma vez):
//   py POKE/PXG_2026/objectbuilder/export_sprites.py export effect \
//      730,731,736,737,739,740,745,746 --projeto pxg --out <pasta> --atlas-only
// e cortar cada `atlas.png` no numero de quadros com conteudo (60 / 44).
export const CAPTURE_ANIM_CELL_WIDTH = 64
export const CAPTURE_ANIM_CELL_HEIGHT = 96

// Contagem medida quadro a quadro nos 8 arquivos (bbox vazio = quadro em
// branco): sucesso preenche os 60, falha para no 44. Identico nos 4 pares —
// a diferenca entre sucesso e falha e a cauda da animacao (confirmacao com
// faisca verde + a bola sumindo), que a falha nao tem.
export const CAPTURE_ANIM_SUCCESS_FRAMES = 60
export const CAPTURE_ANIM_FAIL_FRAMES = 44

// 100ms por quadro, uniforme — lido da tabela de duracao do proprio banco
// (todos os 60 quadros das 8 animacoes tem min=max=100). Da 6,0s no sucesso e
// 4,4s na falha.
//
// O valor antigo (0,07s pra 3 bolas, 0,26s so pra premier_ball) era uma
// tentativa de fazer 23 "linhas" durarem os 6s reais. Some junto com o modelo
// de linha: agora a contagem de quadros e a real, entao a duracao por quadro
// tambem e a real, e vale igual pras 4 bolas.
export const CAPTURE_ANIM_FRAME_DURATION = 0.1

// Onde, dentro do quadro, fica a bola em repouso — e o ponto que deve cair
// sobre o POKE. Centroide dos pixels opacos nos quadros de "chacoalhar"
// (12/20/30/55, todos identicos): (31, 88) de 64x96. Nao e o centro do
// quadro: o terco de cima so e usado pelo arremesso e pelo estouro, e centrar
// deixaria a bola parada meio quadro abaixo do alvo.
export const CAPTURE_ANIM_ANCHOR_X = 31 / CAPTURE_ANIM_CELL_WIDTH
export const CAPTURE_ANIM_ANCHOR_Y = 88 / CAPTURE_ANIM_CELL_HEIGHT

// So os 4 itens de captura reais deste jogo (data/generated/items.generated.ts)
// tem par de arquivo.
const CAPTURE_ANIM_FILES: Record<string, { success: string; fail: string }> = {
  poke_ball: {
    success: 'assets/pokeball-throw/poke_ball-success.png',
    fail: 'assets/pokeball-throw/poke_ball-fail.png',
  },
  great_ball: {
    success: 'assets/pokeball-throw/great_ball-success.png',
    fail: 'assets/pokeball-throw/great_ball-fail.png',
  },
  ultra_ball: {
    success: 'assets/pokeball-throw/ultra_ball-success.png',
    fail: 'assets/pokeball-throw/ultra_ball-fail.png',
  },
  premier_ball: {
    success: 'assets/pokeball-throw/premier_ball-success.png',
    fail: 'assets/pokeball-throw/premier_ball-fail.png',
  },
}

export function captureAnimFrameDuration(): number {
  return CAPTURE_ANIM_FRAME_DURATION
}

export function captureAnimFrameCount(success: boolean): number {
  return success ? CAPTURE_ANIM_SUCCESS_FRAMES : CAPTURE_ANIM_FAIL_FRAMES
}

export interface CaptureAnimFrameRect {
  url: string
  sx: number
  sy: number
  sw: number
  sh: number
}

// Source-rect (+ arquivo certo) de um quadro. `frameIndex` alem do fim congela
// no ultimo em vez de ler lixo depois da borda da tira.
export function captureAnimFrameRect(ballItemId: string, success: boolean, frameIndex: number): CaptureAnimFrameRect | null {
  const files = CAPTURE_ANIM_FILES[ballItemId]
  if (!files) return null
  const total = captureAnimFrameCount(success)
  const frame = Math.min(Math.max(0, frameIndex), total - 1)
  return {
    url: success ? files.success : files.fail,
    sx: frame * CAPTURE_ANIM_CELL_WIDTH,
    sy: 0,
    sw: CAPTURE_ANIM_CELL_WIDTH,
    sh: CAPTURE_ANIM_CELL_HEIGHT,
  }
}
