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
// linhas de 64x32px. As 8 colunas NAO sao 8 frames — sao ate 3 copias
// SIMULTANEAS e IDENTICAS da mesma bola por linha (mesma opacidade media
// medida pixel a pixel: sem diferenca de brilho entre elas, entao nao e
// trilha/motion-blur com fade), espacadas 3 colunas uma da outra. Padrao de
// origem (provavel: efeito pensado pra ate 3 alvos simultaneos numa cena de
// batalha RPG Maker) irrelevante aqui — como as copias sao pixel-a-pixel
// iguais, a coluna usada nao importa, so precisa ser uma que EXISTE naquela
// linha (varias ficam vazias). `CAPTURE_ANIM_FRAME_COLUMN[row]` guarda a
// primeira coluna preenchida de cada linha (medido nos 4 pares de arquivo —
// coreografia identica nos 4, so a cor muda), pra nunca cair numa celula em
// branco.
export const CAPTURE_ANIM_CELL_WIDTH = 64
export const CAPTURE_ANIM_CELL_HEIGHT = 32

// "Sucesso" tem mais linhas (a bola completa o giro e desaparece com um
// brilho final); "falha" corta a sequencia mais cedo (a bola quica e solta
// o POKE de volta, sem o brilho). Contagem real medida nos 8 arquivos:
// sucesso preenche ate a linha 22 (23 linhas), falha ate a 16 (17 linhas) —
// identico nos 4 pares de bola.
export const CAPTURE_ANIM_SUCCESS_ROWS = 23
export const CAPTURE_ANIM_FAIL_ROWS = 17

// Primeira coluna nao-vazia de cada linha 0-22 (sucesso usa todas; falha usa
// so as 17 primeiras, que sao byte-a-byte a mesma introducao/ciclo).
const CAPTURE_ANIM_FRAME_COLUMN = [
  0, 1, 0, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1,
] as const

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
  const col = CAPTURE_ANIM_FRAME_COLUMN[row] ?? 0
  return {
    url: success ? files.success : files.fail,
    sx: col * CAPTURE_ANIM_CELL_WIDTH,
    sy: row * CAPTURE_ANIM_CELL_HEIGHT,
    sw: CAPTURE_ANIM_CELL_WIDTH,
    sh: CAPTURE_ANIM_CELL_HEIGHT,
  }
}
