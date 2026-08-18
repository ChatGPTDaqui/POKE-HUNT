// Arte de efeito POR GOLPE — camada acima de vfxTiras.ts, que e por TIPO
// ELEMENTAL.
//
// Por que esta camada existe: `Bullet Punch` e STEEL, e todo golpe STEEL
// desenha a mesma arte de aco. Trocar a arte "do Bullet Punch" mexendo nela
// trocaria junto Metal Claw, Iron Head, Iron Defense e qualquer outro golpe de
// aco. Este arquivo e o ponto de encaixe pra dizer "este golpe especifico
// desenha assim".
//
// Ordem de consulta no desenho (render/sprites.ts#drawImpactBurst e
// #drawAoeRing): golpe -> tira do tipo -> procedural (so enquanto a imagem
// baixa). Golpe sem entrada aqui nao muda de comportamento em nada.
//
// Formato dos quadros: um PNG solto por quadro, ja montado — e NAO a tira de
// `vfxTiras.ts`. A diferenca e de escala e nao de gosto: um golpe tem 8
// quadros, entao 8 requests, e cada arte nova entra sem passar pelo
// exportador de tira. Um TIPO tem 14 a 40 quadros e 18 tipos, entao ali a
// tira e obrigatoria.
export interface VfxDeGolpe {
  /** Impacto de alvo unico. */
  single: string[]
  /** Area de efeito. Opcional: golpe alvo-unico nao tem area. */
  aoe?: string[]
  /** Correcao de tamanho por golpe, multiplicando a escala base do desenho. */
  escala?: { single?: number; aoe?: number }
  /**
   * Presente = a arte tem UMA direcao propria e precisa ser girada pra apontar
   * do atacante pro alvo. Ausente = burst radial, desenhado sem rotacao (e o
   * caso de todo o lote por tipo elemental, que e simetrico).
   *
   * Convencao da arte: ela aponta pra DIREITA (+x) no arquivo. O desenho gira
   * pelo `anguloDeAtaque` gravado no efeito e, quando o alvo esta a esquerda,
   * espelha na vertical pra a arte nao aparecer de cabeca pra baixo.
   */
  direcional?: {
    /**
     * Onde, na largura do quadro, fica o PONTO DE IMPACTO — a fracao que deve
     * cair em cima do alvo. Sem isso o quadro e centralizado no alvo e a
     * chegada do golpe passa reto por ele. Medido no quadro INTEIRO, mesmo
     * quando `recorteX` corta parte dele.
     */
    ancoraX: number
    /**
     * Fracao da largura que continua sendo desenhada, contada do lado do
     * IMPACTO (direita). Encurta rastro comprido demais. Corrigir isso por
     * `escala` nao serve: encolheria o impacto junto.
     */
    recorteX?: number
  }
  /**
   * Quantas voltas a lista de quadros da dentro da vida do efeito. Serve pra
   * arte CURTA: `IMPACT_EFFECT_DURATION` e 1,0s, e 8 quadros esticados nesse
   * tempo dariam 125ms cada — um soco em camera lenta. Duas voltas devolvem
   * 62ms por quadro sem encurtar o tempo de tela.
   *
   * (Ate a leva das tiras por tipo isto ESTICAVA a duracao, porque o impacto
   * durava 0,35s e a arte nao cabia. Com 1,0s de base o problema virou o
   * oposto — sobra tempo — e o campo passou a significar "toca de novo".)
   */
  repeticoes?: number
}

const RAIZ = 'assets/move-vfx'
const quadros = (pasta: string, prefixo: string, de: number, ate: number): string[] => {
  const lista: string[] = []
  for (let i = de; i <= ate; i++) lista.push(`${RAIZ}/${pasta}/${prefixo}${String(i).padStart(2, '0')}.png`)
  return lista
}

export const VFX_POR_GOLPE: Record<string, VfxDeGolpe> = {
  // 8 quadros de 96x64 (3x2 tiles de 32), garra do Scizor entrando com rastro
  // e faisca de impacto. Saiu de `effect 887` do banco .dat/.spr local, montado
  // pelo exportador em POKE/PXG_2026/objectbuilder/export_sprites.py.
  //
  // POR QUE 8 E NAO 48: um efeito de cliente Tibia nao guarda quadro pronto —
  // guarda `width x height` TILES de 32x32 por quadro, e o quadro so existe
  // depois de montar os tiles. Este e 3x2 tiles x 8 quadros = 48 sprites. A
  // primeira versao pegou uma folha exportada plana e fatiou em 48 celulas de
  // 32x32, tratando cada TILE como se fosse um QUADRO: o jogo desenhava um
  // sexto da arte por vez, na diagonal errada, 48 vezes seguidas. O Object
  // Builder mostrava a animacao certa porque ele le o .dat e monta os tiles.
  //
  // Quem for adicionar outro golpe: NAO fatie folha exportada. Rode
  // `py export_sprites.py export effect <id> --projeto pxg --out <pasta>` e
  // copie os `x0_y0_z0_f*.png`, que ja saem montados. Pra descobrir o id a
  // partir de PNGs que voce ja tem, `py achar_efeito.py <pasta>` casa por hash
  // de pixel e imprime a geometria real.
  bullet_punch: {
    single: quadros('bullet-punch', 'bp', 0, 7),
    // A arte e um risco horizontal: as garras entram pela esquerda e a faisca
    // de impacto fica na direita. Sem girar, o golpe sempre viajava da
    // esquerda pra direita, qualquer que fosse a posicao do inimigo.
    //
    // 0.797 e o centroide em x dos pixels de faisca (branco com alpha alto)
    // somados nos 8 quadros — medido, nao estimado. Centralizar (0.5) botava
    // o impacto meio quadro adiante do alvo.
    // O rastro inteiro mede 84px de mundo atras do alvo, e o combate acontece
    // a `engageRangeFor` = raio 14 + raio 15 + padding 10 = 39px: a garra
    // passava DUAS VEZES a distancia do proprio atacante e saia por tras dele.
    // 0.55 deixa o rastro em 37px, terminando junto do atacante. Comparado a
    // 0.70 (52px, ainda passa) e 0.45 (26px, nem alcanca).
    direcional: { ancoraX: 0.8, recorteX: 0.55 },
    // 8 quadros sozinhos em 1,0s dariam 125ms cada, lento demais pra um soco.
    // Duas voltas deixam em 62ms e mantem o 1,0s de tela.
    repeticoes: 2,
  },
}

export function vfxDoGolpe(abilityId: string | undefined): VfxDeGolpe | null {
  if (!abilityId) return null
  return VFX_POR_GOLPE[abilityId] ?? null
}

/**
 * Multiplicador de duracao do impacto deste golpe. 1 pra golpe sem arte propria
 * ou sem repeticao — ou seja, o comportamento de todo o resto do jogo.
 */
export function repeticoesDoGolpe(abilityId: string | undefined): number {
  return vfxDoGolpe(abilityId)?.repeticoes ?? 1
}

/** Toda URL de quadro por golpe — usado pelo preload. */
export function todosOsQuadrosDeGolpe(): string[] {
  return Object.values(VFX_POR_GOLPE).flatMap((v) => [...v.single, ...(v.aoe ?? [])])
}
