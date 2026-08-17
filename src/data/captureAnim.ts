// Post-battle Pokeball-throw animation (render/sprites.ts#drawCaptureAnim,
// triggered from engine/simulation.ts#handleEnemyDefeated).
//
// Trocado (leva 2026-08-16) para o pacote novo do usuario
// (assets/pokeball-throw/*.png, copiado de
// "POKE/Assets/pokebolas/oficiais/effect-{730,731,736,737,739,740,745,746}-sprites.png").
// Diferente do sheet antigo (pokeball-bounce.png, 1 arquivo unico com a bola
// selecionada por COLUNA): aqui cada arquivo ja e de UMA bola so, e
// sucesso/falha sao DOIS ARQUIVOS separados, nao duas faixas de linha no
// mesmo arquivo.
//
// Geometria medida direto no PNG (zlib-inflate + unfilter,
// scripts/lib/png.js), nao suposta: 512x736px, grade de 8 colunas x 23
// linhas de 64x32px.
//
// CORRIGIDO (leva seguinte): a 1a medicao ("8 colunas sao ate 3 copias
// IDENTICAS por linha, a coluna nao importa") estava ERRADA — so parecia
// certa porque a amostra comparou MEDIA de opacidade, nao pixel a pixel, e
// so pras linhas do meio (o "wobble" parado, onde as copias realmente sao
// quase identicas). Reexaminado com dump visual (scripts/scratch_dump_*,
// descartaveis) linha por linha: nas linhas 0-3 (arremesso + estouro de
// impacto) as "copias" tem tamanho/silhueta DIFERENTES — nao sao copias, sao
// VARIANTES DE TAMANHO da mesma pose, uma por "banda" de coluna. A escolha
// antiga (`CAPTURE_ANIM_FRAME_COLUMN`, primeira coluna nao-vazia de cada
// linha) pulava de banda em banda sem padrao (0,1,0,0,1,2,0,1,2,...) —
// a bola "teleportava" de tamanho/posicao entre frames, o "impacto visual
// negativo" relatado.
//
// O padrao real: `coluna_ativa ≡ linha (mod 3)` em TODA linha das 8
// planilhas (2 resultados x 4 bolas) — confirmado por varredura (nenhuma das
// 23+17 linhas fica em branco na coluna `linha % 3`). E o desenho classico de
// folha de animacao RPG Maker com ate 3 variantes de tamanho pre-renderizadas
// por frame (fraca/media/forte); usar sempre a MESMA banda (`linha % 3`, a
// mais a esquerda) da uma trajetoria unica e coerente, sem pulo — verificado
// visualmente com filmstrip da banda escolhida: arremesso, estouro de
// impacto, bola assentando, e SO no sucesso um brilho verde de captura antes
// de sumir (a falha termina com a bola "estourando" branco/azul, sem o
// brilho verde) — as duas sequencias fazem sentido narrativo frame a frame.
export const CAPTURE_ANIM_CELL_WIDTH = 64
export const CAPTURE_ANIM_CELL_HEIGHT = 32

// "Sucesso" tem mais linhas (a bola completa o giro e desaparece com um
// brilho final); "falha" corta a sequencia mais cedo (a bola quica e solta
// o POKE de volta, sem o brilho). Contagem real medida nos 8 arquivos:
// sucesso preenche ate a linha 22 (23 linhas), falha ate a 16 (17 linhas) —
// identico nos 4 pares de bola.
export const CAPTURE_ANIM_SUCCESS_ROWS = 23
export const CAPTURE_ANIM_FAIL_ROWS = 17

// So os 4 itens de captura reais deste jogo (js/data/items.generated.js)
// tem par de arquivo — sem equivalente de Master/Cherish/etc, como no sheet
// antigo.
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

export const CAPTURE_ANIM_FRAME_DURATION = 0.07 // seconds per frame

export function captureAnimRowCount(success: boolean): number {
  return success ? CAPTURE_ANIM_SUCCESS_ROWS : CAPTURE_ANIM_FAIL_ROWS
}

export interface CaptureAnimFrameRect {
  url: string
  sx: number
  sy: number
  sw: number
  sh: number
}

// Source-rect (+ arquivo certo) pra um frame, clamped so holding on
// `frameIndex` past the end just freezes on the sequence's last frame
// instead of reading garbage rows.
export function captureAnimFrameRect(ballItemId: string, success: boolean, frameIndex: number): CaptureAnimFrameRect | null {
  const files = CAPTURE_ANIM_FILES[ballItemId]
  if (!files) return null
  const rowCount = captureAnimRowCount(success)
  const row = Math.min(Math.max(0, frameIndex), rowCount - 1)
  const col = row % 3
  return {
    url: success ? files.success : files.fail,
    sx: col * CAPTURE_ANIM_CELL_WIDTH,
    sy: row * CAPTURE_ANIM_CELL_HEIGHT,
    sw: CAPTURE_ANIM_CELL_WIDTH,
    sh: CAPTURE_ANIM_CELL_HEIGHT,
  }
}
