// Arte de efeito POR GOLPE — camada acima de elementVfx.ts/elementVfxGif.ts,
// que sao por TIPO ELEMENTAL.
//
// Por que esta camada existe: `Bullet Punch` e STEEL, e todo golpe STEEL desenha
// hoje o mesmo `assets/move-vfx-gif/steel.gif`. Trocar a arte "do Bullet Punch"
// mexendo naquele GIF trocaria junto Metal Claw, Iron Head, Iron Defense e
// qualquer outro golpe de aco. O jogo nunca teve como dizer "este golpe
// especifico desenha assim" — este arquivo e esse ponto de encaixe.
//
// Ordem de consulta no desenho (render/sprites.ts#drawImpactBurst e
// #drawAoeRing): golpe -> tipo (PNG-sequence) -> tipo (GIF) -> procedural.
// Golpe sem entrada aqui nao muda de comportamento em nada.
//
// Formato dos quadros: PNG solto de 32x32, um por quadro, igual ao lote do
// Dungeon Crawl em elementVfx.ts — nao spritesheet. `drawVfxDeElemento` recebe
// uma LISTA de URLs e escolhe o quadro por progresso do efeito. Sheet de cliente
// Tibia entra por `scripts/fatiar-sheet-vfx.mjs`, que tambem mede se as celulas
// sao quadros independentes ou tiles de uma imagem maior.
import type { VfxDeElemento } from './elementVfx'

/** Mesmo contrato de `VfxDeElemento`, mas `aoe` e opcional: golpe alvo-unico nao tem area. */
export interface VfxDeGolpe extends Omit<VfxDeElemento, 'aoe'> {
  aoe?: string[]
}

const RAIZ = 'assets/move-vfx'
const quadros = (pasta: string, prefixo: string, de: number, ate: number): string[] => {
  const lista: string[] = []
  for (let i = de; i <= ate; i++) lista.push(`${RAIZ}/${pasta}/${prefixo}${String(i).padStart(2, '0')}.png`)
  return lista
}

export const VFX_POR_GOLPE: Record<string, VfxDeGolpe> = {
  // 48 quadros, fatiados de um dump de sprite de cliente Tibia (garra do Scizor
  // + rastro + faisca de impacto). Sao 48 quadros INDEPENDENTES, nao tiles de
  // uma imagem maior: a costura entre celulas vizinhas mede 294 de diferenca de
  // cor contra 58 dentro da propria celula (razao 5,1x). Se fossem pedacos de um
  // quadro maior, os dois numeros seriam parecidos.
  //
  // A lista esta na ordem crua do sheet porque nao ha metadado de animacao junto
  // (sem AnimData.xml, sem duracao por quadro) — qualquer curadoria seria
  // chute. Consequencia pratica de usar as 48: o impacto alvo-unico dura 0,35s
  // (IMPACT_EFFECT_DURATION), ou 21 quadros de tela a 60fps, e
  // `drawVfxDeElemento` escolhe o quadro por `floor(progresso * total)` — ou
  // seja, a animacao roda ~2,3x e menos da metade dos quadros chega a aparecer.
  // Pra desacelerar, corte a lista (ex.: `quadros('bullet-punch','bp',0,15)`),
  // nao mexa na duracao: ela e global e afeta o impacto de TODO golpe.
  bullet_punch: {
    single: quadros('bullet-punch', 'bp', 0, 47),
  },
}

export function vfxDoGolpe(abilityId: string | undefined): VfxDeGolpe | null {
  if (!abilityId) return null
  return VFX_POR_GOLPE[abilityId] ?? null
}

/** Toda URL de quadro por golpe — usado pelo preload. */
export function todosOsQuadrosDeGolpe(): string[] {
  return Object.values(VFX_POR_GOLPE).flatMap((v) => [...v.single, ...(v.aoe ?? [])])
}
