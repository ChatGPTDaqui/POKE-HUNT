// Arte de efeito POR GOLPE — camada acima de vfxTiras.ts, que e por TIPO
// ELEMENTAL.
//
// Por que esta camada existe: `Bullet Punch` e STEEL, e todo golpe STEEL desenha
// a mesma arte de aco. Trocar a arte "do Bullet Punch" mexendo nela trocaria
// junto Metal Claw, Iron Head, Iron Defense e qualquer outro golpe de aco. Este
// arquivo e o ponto de encaixe pra dizer "este golpe especifico desenha assim".
//
// Ordem de consulta no desenho (render/sprites.ts#drawImpactBurst e
// #drawAoeRing): golpe -> tira do tipo -> procedural (so enquanto a imagem
// baixa). Golpe sem entrada aqui nao muda de comportamento em nada.
//
// ---------------------------------------------------------------------------
// FORMATO: TIRA, igual ao lote por tipo. Era PNG SOLTO POR QUADRO.
// ---------------------------------------------------------------------------
// A troca aconteceu em 2026-08-18, quando o lote saiu de 1 golpe pra 23. O
// argumento original do PNG solto era que "um golpe tem 8 quadros, entao 8
// requests" — verdade com um golpe, falso com 23: as tiras deste lote tem de 4 a
// 20 quadros cada, o que dava ~300 arquivos. E o catalogo tem 479 golpes, ou
// seja, o formato nao escalava com a propria ideia.
//
// Migrar tambem apagou uma DUPLICACAO que ja era perigosa: `drawVfxDeElemento`
// (PNG solto) e `drawQuadroDeTira` (tira) tinham a MESMA conta de recorte,
// ancora, giro e espelho escrita duas vezes, em funcoes diferentes do mesmo
// arquivo. Qualquer correcao de geometria tinha que ser feita nas duas — e
// esquecer uma nao quebra nada, so desalinha a arte de metade dos golpes.
//
// ---------------------------------------------------------------------------
// SEM PRELOAD, DE PROPOSITO
// ---------------------------------------------------------------------------
// `data/preload.ts` aquece as tiras por TIPO (18 arquivos, todo combate usa) mas
// NAO as de golpe. Um jogador ve os golpes que o time dele sabe — meia duzia — e
// nunca os outros 470. Aquecer 23 (e um dia 100) arquivos que a sessao nao vai
// usar troca boot rapido por nada.
//
// O custo e conhecido e pequeno: o PRIMEIRO uso de cada golpe cai no desenho
// procedural por alguns frames enquanto a tira baixa. E exatamente o que o
// fallback existe pra fazer, e acontece uma vez por golpe por sessao.
import type { TiraDeVfx } from './vfxTiras'

export interface VfxDeGolpe {
  /** Impacto de alvo unico. */
  single: TiraDeVfx
  /** Area de efeito. Opcional: golpe alvo-unico nao tem area. */
  aoe?: TiraDeVfx
  /** Correcao de tamanho por golpe, multiplicando a escala base do desenho. */
  escala?: { single?: number; aoe?: number }
  /**
   * Quantas voltas a tira da dentro da vida do efeito. Serve pra arte CURTA:
   * `IMPACT_EFFECT_DURATION` e 1,0s, e 4 quadros esticados nesse tempo dariam
   * 250ms cada — um soco em camera lenta. Duas voltas devolvem 125ms sem
   * encurtar o tempo de tela.
   */
  repeticoes?: number
}

const RAIZ = 'assets/move-vfx/golpes'
const tira = (arquivo: string, quadros: number, extra?: Partial<TiraDeVfx>): TiraDeVfx => ({
  url: `${RAIZ}/${arquivo}.png`,
  quadros,
  ...extra,
})

// O id de efeito no comentario e a chave pra regerar a arte:
//   py POKE/PXG_2026/objectbuilder/tira_efeito.py <id> --projeto pxg \
//      --recortar --out assets/move-vfx/golpes/<golpe>.png
//   py scripts/quantizar-tiras-vfx.py assets/move-vfx/golpes
//
// NAO fatie folha exportada. Um efeito deste banco nao guarda quadro pronto —
// guarda `width x height` TILES de 32x32 por quadro, e o quadro so existe depois
// de montar os tiles. A primeira versao do Bullet Punch pegou a folha plana e
// fatiou em 48 celulas de 32, tratando cada TILE como QUADRO: o jogo desenhava
// um sexto da arte por vez, 48 vezes seguidas.
export const VFX_POR_GOLPE: Record<string, VfxDeGolpe> = {
  // --- fisico de contato ---------------------------------------------------
  bullet_punch: {
    single: tira('bullet_punch', 8, {
      // Risco horizontal: as garras entram pela esquerda e a faisca de impacto
      // fica na direita. Sem girar, o golpe viajava sempre da esquerda pra
      // direita, qualquer que fosse a posicao do inimigo.
      //
      // 0.8 e o centroide em x dos pixels de faisca somados nos 8 quadros —
      // medido, nao estimado. O rastro inteiro mede 84px de mundo e o combate
      // acontece a 39px: a garra passava DUAS VEZES a distancia do atacante e
      // saia por tras dele. 0.55 deixa o rastro em 37px.
      direcional: { anguloBaseGraus: 0, ancoraX: 0.8, recorteX: 0.55 },
    }),
    repeticoes: 2,
  },
  comet_punch: { single: tira('comet_punch', 12) },
  // A mais direcional do lote inteiro: 5.15x de alongamento num eixo de
  // -46° que so varia 3° entre os 12 quadros. Sem girar, o arranhao sairia
  // sempre na mesma diagonal, com o inimigo onde estivesse.
  // Ancora 0.67 = p75 da massa no quadro de pico; centralizar poe metade do
  // talho passando do alvo.
  scratch: {
    single: tira('scratch', 12, { direcional: { anguloBaseGraus: -46, ancoraX: 0.67 } }),
  },
  // 1.56x no eixo 23°, com desvio de 25° entre os quadros — o feixe de talhos
  // muda de inclinacao durante a propria animacao, e por isso ele ficou fora da
  // primeira rodada de direcionais. Entra agora porque a decisao nao e sobre a
  // arte ser estavel, e sobre o que o jogador le: sem girar, os talhos saiam
  // sempre na mesma diagonal, com o inimigo em qualquer lugar da tela. Ancora
  // centrada: talho corta EM CIMA do alvo, nao antes dele.
  fury_swipes: { single: tira('fury_swipes', 10, { direcional: { anguloBaseGraus: 23 } }) },
  stomp: { single: tira('stomp', 9) },
  x_scissor: { single: tira('x_scissor', 7) },
  // A arte que provou o bug do espelho (ver a nota "DOIS GIROS" em
  // data/vfxTiras.ts). E um punho descendo: eixo de 2.13x medido em -82°, quadro
  // de 64x128 — a unica arte VERTICAL do lote com sentido de movimento claro.
  //
  // 98° e nao -82° porque o campo diz pra onde a arte APONTA, e o medidor
  // devolve o eixo (uma reta, ambigua em 180°). O punho esta no alto e o impacto
  // embaixo, entao ela aponta pra BAIXO: -82 + 180. Com -82 o golpe chegava pelo
  // lado oposto ao do atacante — conferido em scripts/conferir-mira-vfx.mjs.
  //
  // Sem `ancoraX`: a ancora corre na largura do QUADRO, que nesta arte e o eixo
  // curto (23px de mundo contra 46 de comprimento). Pra ancorar no punho faria
  // falta um `ancoraY`, que ninguem precisa ainda — com 23px de rastro contra
  // 39px de alcance, o desenho nao alcanca o atacante de todo jeito.
  shadow_punch: { single: tira('shadow_punch', 16, { direcional: { anguloBaseGraus: 98 } }) },
  // aqua_jet NAO entra. A arte do banco (efeito 5325) e uma coluna de 36x214,
  // proporcao 0.17: desenhada com os 46px de altura padrao ela vira um FIO de 6px
  // de largura. Alongamento medido de 18.4x, o maior de todo o lote por uma ordem
  // de grandeza. Sem entrada aqui, Aqua Jet cai na tira do tipo WATER, que e uma
  // esfera legivel — melhor que arte propria ilegivel.
  dig: { single: tira('dig', 19) },

  // --- presas (o mesmo gesto em tres tipos) --------------------------------
  fire_fang: { single: tira('fire_fang', 12) },
  thunder_fang: { single: tira('thunder_fang', 12) },
  ice_fang: { single: tira('ice_fang', 11) },

  // --- projetil / jato ----------------------------------------------------
  // Jato: 2.09x no eixo -19°. `recorteX` nao entra aqui — com 54px de largura
  // e ancora em 0.56, sobram 30px de rastro atras do alvo contra 39px ate o
  // atacante, entao ele ja termina antes de chegar em quem lancou. (O jato do
  // TIPO fogo precisa de recorte porque tem 85px, nao 54.)
  flamethrower: {
    single: tira('flamethrower', 13, { direcional: { anguloBaseGraus: -19, ancoraX: 0.56 } }),
  },
  fire_spin: { single: tira('fire_spin', 5), repeticoes: 2 },
  // 2.86x no eixo 46°, desvio de 2° — projetil de verdade. Skew +0.41 diz que
  // a massa esta na PONTA pra onde o eixo aponta, e a ancora 0.68 poe essa
  // ponta sobre o alvo.
  mud_shot: {
    single: tira('mud_shot', 15, { direcional: { anguloBaseGraus: 46, ancoraX: 0.68 } }),
  },

  // --- area ---------------------------------------------------------------
  // `aoe` e a MESMA tira do impacto quando o golpe tem area: o desenho de area
  // usa o diametro real do raio, entao a leitura de "isto pegou uma area" vem do
  // tamanho e nao de um desenho diferente. Mesma regra do lote por tipo.
  earthquake: { single: tira('earthquake', 14), aoe: tira('earthquake', 14) },
  // Chegou na PH-368 com a arte que saiu da camada de AREA por tipo: o efeito
  // 5467 e uma coluna vertical de fogo (quadro 140x268, proporcao 0.52), o que
  // como FIRE de area virava um pilar fino esticado ate o diametro do splash.
  // Num vulcao a coluna e o desenho certo, e Eruption e o unico golpe do
  // catalogo em que ela e literal.
  eruption: { single: tira('eruption', 11), aoe: tira('eruption', 11) },
  whirlpool: { single: tira('whirlpool', 16), aoe: tira('whirlpool', 16) },
  whirlwind: { single: tira('whirlwind', 20), aoe: tira('whirlwind', 20) },
  petal_dance: { single: tira('petal_dance', 16), aoe: tira('petal_dance', 16) },

  // --- status (sem dano) --------------------------------------------------
  // Golpe de status ja tem VFX proprio por tipo+direcao (data/statusVfx.ts), mas
  // estes quatro tem arte NOMEADA no banco, o que e mais especifico que "buff de
  // tipo X". A camada de golpe vence a de tipo, entao entram aqui.
  // Status, mas DIRECIONAL: 2.44x no eixo 22°. Charm sai de quem lanca e vai
  // ate o alvo, entao a direcao e do golpe e nao do efeito — diferente do
  // resto do lote de status (data/statusVfx.ts), que e brilho pra cima ou pra
  // baixo no proprio corpo.
  charm: {
    single: tira('charm', 13, { direcional: { anguloBaseGraus: 22, ancoraX: 0.66 } }),
    repeticoes: 2,
  },
  taunt: { single: tira('taunt', 12), repeticoes: 2 },
  dragon_dance: { single: tira('dragon_dance', 16) },
  spider_web: { single: tira('spider_web', 4), repeticoes: 3 },
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

/**
 * A arte de impacto deste golpe e DIRECIONAL, ou seja gira pra apontar do
 * atacante pro alvo?
 *
 * Quem pergunta e o motor (PH-110): so arte direcional precisa reapontar o
 * rastro a cada frame, porque ela e um risco que LIGA as duas entidades. Arte
 * redonda mantem o angulo congelado no instante do hit, que e a decisao
 * registrada no call-site do efeito.
 *
 * Mora aqui, e nao no motor, porque a resposta e uma propriedade do DADO de
 * arte — quem adicionar um direcional novo em `VFX_POR_GOLPE` ganha o
 * reapontamento de graca, sem tocar em `combatSystem`.
 */
export function ehDirecional(abilityId: string | undefined): boolean {
  return !!vfxDoGolpe(abilityId)?.single.direcional
}

/**
 * Toda URL de tira por golpe.
 *
 * NAO e consumido pelo preload (ver o cabecalho): existe pro teste conferir que
 * todo arquivo cadastrado existe em disco, que e a falha silenciosa deste
 * arquivo — caminho errado nao lanca nada, so devolve o efeito do tipo.
 */
export function todasAsTirasDeGolpe(): string[] {
  return Object.values(VFX_POR_GOLPE).flatMap((v) => [v.single.url, ...(v.aoe ? [v.aoe.url] : [])])
}
