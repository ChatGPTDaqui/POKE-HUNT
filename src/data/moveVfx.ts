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

  // =========================================================================
  // LOTE NOMEADO (PH-369)
  // =========================================================================
  // 26 artes que estavam no banco sem consumidor. O dono nomeou 95 efeitos em
  // `POKE/Assets/move sprites/nomeados/`, e o nome do arquivo E a aplicacao
  // pretendida: `heal`, `coin`, `beam`, `gas`, `paralizado`. Cerca de 55 nao
  // tinham entrada em lugar nenhum do projeto.
  //
  // DOIS NOMES DE ARQUIVO, DUAS REGRAS. Arte 1:1 com um golpe usa o id do golpe
  // (`bullet_punch.png`, como o lote de 2026-08-18). Arte COMPARTILHADA por
  // varios golpes usa nome do que ela DESENHA (`mandibula.png`,
  // `feixe_dourado.png`): batizar de `bite.png` a arte que Crunch e Hyper Fang
  // tambem usam faria o proximo leitor achar que os outros dois estao errados.
  //
  // O CRITERIO E O MESMO DO RESTO DO ARQUIVO: conferencia quadro a quadro na
  // geometria real do combate (atacante, alvo, 39px entre os dois) sobre fundo
  // escuro de hunt, nunca em folha de contato. Seis candidatos nomeados
  // reprovaram nessa conferencia e ficaram de fora — ver o rodape do bloco.
  //
  // `aoe` aparece nos golpes cuja `target` e area no catalogo. Sem ele o
  // desenho de area nao acha a arte do golpe e cai na tira de AREA do tipo: a
  // entrada existiria e nao apareceria, que e a falha silenciosa que este
  // arquivo inteiro tenta evitar.

  // --- mordida ------------------------------------------------------------
  // 892: mandibula branca fechando. E o desenho mais literal do lote — dente,
  // e nao "impacto escuro genarico", que e o que Bite e Crunch tinham por
  // serem DARK.
  bite: { single: tira('mandibula', 6), repeticoes: 2 },
  crunch: { single: tira('mandibula', 6), repeticoes: 2 },
  hyper_fang: { single: tira('mandibula', 6), repeticoes: 2 },

  // --- talho --------------------------------------------------------------
  // 890: crescentes vermelhos em sequencia. Slash e Night Slash sao NORMAL e
  // DARK, entao desenhavam meia-lua branca e talho marrom — nenhum dos dois le
  // como corte fundo.
  // 1.83x no eixo 2° +-10°, ancora no p75 da massa (0.79) — os crescentes
  // entram pela esquerda e a ponta fica na direita, entao ele ja nasce
  // apontando pra +x e a base e 0. Sem `recorteX`: o quadro de 160x142 vira
  // 52px de largura e a cauda atras do alvo mede 52 x 0.79 = 41px, contra os
  // 39px que separam os dois POKEs — nao chega a atravessar o atacante.
  slash: {
    single: tira('talho_vermelho', 7, { direcional: { anguloBaseGraus: 0, ancoraX: 0.79 } }),
    repeticoes: 2,
  },
  night_slash: {
    single: tira('talho_vermelho', 7, { direcional: { anguloBaseGraus: 0, ancoraX: 0.79 } }),
    repeticoes: 2,
  },
  // 4423, nomeado `cut`. `cut` NAO EXISTE no catalogo de 526 golpes, e a arte e
  // uma lamina VERDE na diagonal: Leaf Blade e o golpe existente que ela
  // descreve sem esticar a leitura.
  // A arte mais direcional de todo o projeto, medida: 7.71x de alongamento num
  // eixo de -45° que NAO VARIA nada entre os 8 quadros (+-0°). Sem girar, a
  // lamina sairia sempre na mesma diagonal com o inimigo em qualquer lugar.
  // Ancora 0.65 (p75 da massa): a lamina corta em cima do alvo, e com 46px de
  // largura a metade de tras mede 30px contra 39 de alcance — nao alcanca quem
  // lancou, entao nao precisa de recorte.
  //
  // `escala` 1.4 depois de ver em jogo: com 7.71x de alongamento a lamina em
  // 46px vira um traco de poucos pixels de espessura, e sobre grama ela quase
  // nao aparece. 1.25 leva o quadro pra 57px, que e 1.97x o diametro do POKE —
  // 1.4 tambem funcionava mas passava dos 2x. A cauda atras do alvo fica em
  // 57 x 0.65 = 37px contra 39 de alcance, ou seja ela para antes do atacante.
  leaf_blade: {
    single: tira('lamina_verde', 8, { direcional: { anguloBaseGraus: -45, ancoraX: 0.65 } }),
    escala: { single: 1.25 },
    repeticoes: 2,
  },
  // 4425: X vermelho sobre anel dourado. E o irmao do 4422, que ja e o
  // `x_scissor` — 4422 tem o X verde (BUG) e 4425 o vermelho, entao o par cai
  // naturalmente em X-Scissor e Cross Chop.
  cross_chop: { single: tira('x_vermelho', 7), repeticoes: 2 },

  // --- multi-golpe --------------------------------------------------------
  // 4760: a MESMA estrela batendo varias vezes, com poeira entre as batidas —
  // 24 quadros de repeticao. Golpe de multiplos acertos e a unica coisa que
  // essa arte pode ser.
  fury_attack: { single: tira('estrela_repetida', 24) },
  fury_cutter: { single: tira('estrela_repetida', 24) },
  double_slap: { single: tira('estrela_repetida', 24) },
  // 5010: DOIS aneis dourados, com o estouro no segundo. Dois, e nao um.
  double_hit: { single: tira('anel_duplo', 16) },
  double_kick: { single: tira('anel_duplo', 16) },
  double_edge: { single: tira('anel_duplo', 16) },

  // --- feixe --------------------------------------------------------------
  // Os tres feixes sao a arte mais LARGA do lote: quadro 256x96 vira 123px de
  // largura na tela contra 39px de distancia de combate. Sem `recorteX` eles
  // atravessam o atacante e saem pelas costas dele — o mesmo defeito medido no
  // FIRE e no Bullet Punch, pela mesma razao. Os valores entram depois da
  // medicao de `conferir-direcao-vfx.mjs`, nao antes.
  //
  // O `recorteX` de cada um sai da MESMA conta do FIRE, e nao do olho: com a
  // cauda inteira, o rastro atras do alvo mede `L x ancora`, e ele nao pode
  // passar dos 39px que separam os dois POKEs. Recortado, esse rastro fica
  // `L x (recorte - (1 - ancora))`, e o valor escolhido e o que resolve essa
  // conta pra 39.
  //
  //   feixe_dourado/branco  L=123px  ancora 0.76  ->  123 x (0.56 - 0.24) = 39
  //   feixe_roxo            L=114px  ancora 0.70  ->  114 x (0.64 - 0.30) = 39
  //   energia_verde         L=127px  ancora 0.59  ->  127 x (0.72 - 0.41) = 39
  //
  // A tabela de ESCALA de `conferir-direcao-vfx.mjs` acusa os cinco feixes como
  // "fora" (2.3x a 2.5x o POKE) e sugere encolher. E FALSO POSITIVO conhecido, e
  // o mesmo que ela da no FIRE: ela mede a largura do ARQUIVO e nao sabe de
  // `recorteX`. Depois do recorte o feixe dourado chega com 39px, que e
  // exatamente a distancia entre os dois POKEs — por construcao. Encolher em
  // cima disso encolheria o estouro junto, que e a parte que o jogador precisa
  // ver, e e o erro que a nota do FIRE em `vfxTiras.ts` descreve.
  //
  // 4.08x no eixo 0° +-1°: os dois feixes largos sao os mais estaveis do lote.
  hyper_beam: {
    single: tira('feixe_dourado', 10, { direcional: { anguloBaseGraus: 0, ancoraX: 0.76, recorteX: 0.56 } }),
  },
  giga_impact: {
    single: tira('feixe_dourado', 10, { direcional: { anguloBaseGraus: 0, ancoraX: 0.76, recorteX: 0.56 } }),
  },
  flash_cannon: {
    single: tira('feixe_branco', 10, { direcional: { anguloBaseGraus: 0, ancoraX: 0.76, recorteX: 0.56 } }),
  },
  ice_beam: {
    single: tira('feixe_branco', 10, { direcional: { anguloBaseGraus: 0, ancoraX: 0.76, recorteX: 0.56 } }),
  },
  aurora_beam: {
    single: tira('feixe_branco', 10, { direcional: { anguloBaseGraus: 0, ancoraX: 0.76, recorteX: 0.56 } }),
  },
  psybeam: {
    single: tira('feixe_roxo', 7, { direcional: { anguloBaseGraus: 0, ancoraX: 0.70, recorteX: 0.64 } }),
    repeticoes: 2,
  },
  moonblast: {
    single: tira('feixe_roxo', 7, { direcional: { anguloBaseGraus: 0, ancoraX: 0.70, recorteX: 0.64 } }),
    repeticoes: 2,
  },
  // `conferir-direcao-vfx.mjs` chama este de RADIAL (eixo 9° +-15°), e o
  // veredito dele esta sendo CONTRARIADO de proposito: o skew e +0.67, o mais
  // alto do lote inteiro, ou seja a massa esta toda na PONTA pra onde o eixo
  // aponta — assinatura de projetil, nao de estouro. E o desvio de +-15° e o
  // mesmo do Bullet Punch (+-15°) e do Flamethrower (+-18°), que ja giram.
  // Deixar radial teria custo concreto: 127px de largura desenhados
  // centrados no alvo cobrem o atacante inteiro, e sem `direcional` o recorte
  // nao existe (`orientacaoDaTira` devolve recorteX 1 pra arte que nao gira).
  energy_ball: {
    single: tira('energia_verde', 16, { direcional: { anguloBaseGraus: 9, ancoraX: 0.59, recorteX: 0.72 } }),
  },
  solar_beam: {
    single: tira('energia_verde', 16, { direcional: { anguloBaseGraus: 9, ancoraX: 0.59, recorteX: 0.72 } }),
  },
  // 5093: raio VERTICAL, quadro 96x221. Fica fora da rotacao pelo mesmo motivo
  // que PSYCHIC/FLYING/POISON/FAIRY: ele aponta pra BAIXO (raio cai), nao pro
  // alvo, e girar deitaria o raio no chao.
  thunder: { single: tira('raio_vertical', 10) },
  thunderbolt: { single: tira('raio_vertical', 10) },

  // --- grama --------------------------------------------------------------
  // 5107: folhas voando, uma a uma. Razor Leaf e Magical Leaf desenhavam o
  // redemoinho generico do tipo GRASS; aqui da pra contar as folhas.
  // `razor_leaf` NAO entra, apesar de a arte servir: ele e `target: aoe` no
  // catalogo, e area desenha com o diametro do splash. Ver a nota
  // "AREA NAO E IMPACTO GRANDE" no fim do bloco.
  magical_leaf: { single: tira('folhas', 7), repeticoes: 2 },
  // 4870, nomeado `drain punch`. Drain Punch nao existe no catalogo; a arte sao
  // orbes verdes sendo puxados, que e literalmente o que dreno desenha.
  // `escala` 1.25: o quadro e 51x50 e a arte chegava com 36px, 1.2x o POKE —
  // abaixo da faixa de 1.3x a 1.9x em que o resto do lote vive. O numero e o que
  // `conferir-direcao-vfx.mjs` calcula pra igualar a mediana de 44px, e nao um
  // palpite.
  absorb: { single: tira('dreno_verde', 13), escala: { single: 1.25 } },
  mega_drain: { single: tira('dreno_verde', 13), escala: { single: 1.25 } },
  giga_drain: { single: tira('dreno_verde', 13), escala: { single: 1.25 } },
  leech_life: { single: tira('dreno_verde', 13), escala: { single: 1.25 } },
  // 4329, nomeado `petal`. `petal_dance` ja tem arte propria (5479); esta vai
  // pro Petal Blizzard, que e area.
  petal_blizzard: { single: tira('petalas', 14), aoe: tira('petalas', 14) },
  // 4328 (`field`, cupula verde translucida) foi cadastrado aqui pro Leech Seed
  // e pro Spore e SAIU depois de ver em jogo. Os dois sao alvo-unico, entao a
  // cupula — 255x256 de arquivo, feita pra cobrir um campo — e desenhada em
  // 46px: sobre grama ela vira uma mancha esverdeada que nao da pra distinguir
  // do proprio chao. Sem entrada, os dois voltam pro brilho de status do tipo
  // GRASS, que aparece. A regra de `assets/move-vfx/NOTAS.txt` vale nos dois
  // sentidos: efeito invisivel e pior que o que ele substitui.

  // --- veneno -------------------------------------------------------------
  // 4310: gas roxo rasteiro, que e o desenho de Smog e Poison Gas. O tipo
  // POISON desenha um vortice, que le como impacto e nao como nuvem parada.
  //
  // NAO gira, e aqui o veredito de `conferir-direcao-vfx.mjs` (DIRECIONAL,
  // 1.70x no eixo -23° +-21°) tambem esta sendo contrariado — no sentido
  // oposto ao do energy_ball, e pelo motivo que o cabecalho de `vfxTiras.ts`
  // chama de classe VERTICAL: simY 0.62 contra simX 0.32 diz que a assimetria
  // e no eixo Y, ou seja a arte tem "pra cima" (a nuvem sobe do chao) e nao
  // "pro alvo". Girar pro inimigo deitaria a nuvem, exatamente o erro que o
  // teste ingenuo de "e assimetrica? entao gira" produz — e o mesmo motivo
  // pelo qual a tira do TIPO poison nunca girou.
  // `escala` 0.6 medida, nao a olho: o quadro e 78x45 (proporcao 1.73), entao
  // na altura padrao a nuvem sai com 80px de largura — 2.4x o diametro do POKE,
  // e ela engolia o ATACANTE junto com o alvo, o que le como se os dois
  // tivessem sido envenenados. Encolher aqui e legitimo, ao contrario do jato
  // de fogo: numa nuvem o desenho inteiro E o efeito, nao ha "cabeca" que o
  // jogador precise ver em tamanho cheio. 0.6 leva pra 28x48, dentro da faixa
  // do lote. E `recorteX` nao serve de alternativa: ele so existe pra arte que
  // gira, e esta nao gira.
  //
  // `poison_gas` ficou de fora: ele e `target: aoe`, e a nuvem em 402px vira uma
  // mancha roxa OPACA por cima do campo — o caso que a nota do DARK em
  // `vfxTiras.ts` proibe ("arte de area cheia so serve pra efeito
  // translucido"). Ele cai na tira de area do tipo POISON, que e anel.
  smog: { single: tira('gas_roxo', 12), escala: { single: 0.6 } },
  toxic: { single: tira('gas_roxo', 12), escala: { single: 0.6 } },
  // 5425: estouro magenta de particula — bola de lodo acertando.
  sludge_bomb: { single: tira('estouro_magenta', 10) },
  poison_sting: { single: tira('estouro_magenta', 10) },
  cross_poison: { single: tira('estouro_magenta', 10) },

  // --- terra e vento ------------------------------------------------------
  // 4860: poeira de areia levantando. Serve os tres golpes de terra que jogam
  // areia, e nao terra: Mud-Slap, Sand Attack e Bulldoze.
  // `bulldoze` ficou de fora pelo mesmo motivo do `razor_leaf`: e area, e um
  // quadro de 35x36 esticado pra 402px e borrao.
  mud_slap: { single: tira('poeira_areia', 9), repeticoes: 2 },
  sand_attack: { single: tira('poeira_areia', 9), repeticoes: 2 },
  // 4872, o segundo efeito nomeado `earthquake`. `earthquake` ja usa o 4395
  // (nuvem de poeira); este desenha RACHADURA no chao, que e o unico golpe do
  // catalogo em que o chao abre de verdade.
  // 2.69x no eixo 41° +-1° — a rachadura CORRE numa direcao, e o desvio de 1°
  // entre os 20 quadros e o mesmo do talho do DARK. Ancora 0.74 (p75): a fenda
  // abre em cima do alvo. Com 47px de largura a cauda mede 35px contra 39 de
  // alcance, entao nao precisa de recorte.
  fissure: {
    single: tira('rachadura', 20, { direcional: { anguloBaseGraus: 41, ancoraX: 0.74 } }),
  },
  // 4429, nomeado `fly`: fitas brancas de vento girando. Gust e Air Slash sao
  // FLYING e desenhavam o tornado do tipo — arte de coluna, nao de rajada.
  gust: { single: tira('vento_branco', 7), repeticoes: 2 },
  air_slash: { single: tira('vento_branco', 7), repeticoes: 2 },
  // 4576, tambem nomeado `fly`, mas o tornado dele e de AREIA (marrom). Vai
  // pros dois golpes de areia, e nao pros de vento.
  sandstorm: { single: tira('tornado_areia', 20) },
  sand_tomb: { single: tira('tornado_areia', 20) },

  // --- gelo ---------------------------------------------------------------
  // 5473: cristal branco com faisca. Ice Shard e Avalanche sao FISICOS e
  // desenhavam o cristal ciano do tipo, que e o mesmo de Ice Beam.
  // `escala` 1.4: era a arte MAIS PEQUENA de todo o cadastro, 31px contra os
  // 29 de diametro do POKE — 1.1x, quando a faixa do lote e 1.3x a 1.9x. O
  // cristal ocupa pouco do proprio quadro (183x191 de arquivo, conteudo bem
  // menor), que e o caso exato que `escala` existe pra corrigir.
  ice_shard: { single: tira('cristal_branco', 23), escala: { single: 1.4 } },
  avalanche: { single: tira('cristal_branco', 23), escala: { single: 1.4 } },

  // --- cura ---------------------------------------------------------------
  // 4710, nomeado `heal`: CRUZES verdes de cura. Estes oito golpes de cura
  // desenhavam o brilho de status do proprio tipo (NORMAL, PSYCHIC, GRASS,
  // FAIRY) — quatro artes diferentes pro mesmo efeito de jogo, e nenhuma
  // dizendo "isto curou".
  //
  // A cruz verde e a mesma linguagem do `TIRA_CURA_HP`/`TIRA_CURA_STATUS` de
  // `vfxTiras.ts`, que ja e o sinal de cura deste jogo — a diferenca e que
  // aqueles tocam quando a vida ENTRA, e este quando o GOLPE sai.
  //
  // NAO gira, apesar de o medidor dizer DIRECIONAL (1.77x no eixo 26° +-10°).
  // O eixo existe porque as cruzes estao espalhadas na diagonal dentro do
  // quadro, e nao porque a arte viaja: sete destes oito golpes curam QUEM
  // LANCA, e apontar um efeito de cura "pro alvo" nao quer dizer nada quando o
  // alvo e o proprio POKE. Golpe em si mesmo chega aqui sem
  // `anguloDeAtaque`, entao `orientacaoDaTira` ja devolveria giro zero — marcar
  // direcional so mudaria o Heal Pulse, o unico que cura outro, e mudaria pra
  // pior.
  //
  // `escala` 1.25 pelos mesmos 44px de mediana: sem ela as cruzes chegam com
  // 37px, 1.2x o POKE.
  recover: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  rest: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  synthesis: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  milk_drink: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  heal_pulse: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  moonlight: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  morning_sun: { single: tira('cura_verde', 14), escala: { single: 1.25 } },
  wish: { single: tira('cura_verde', 14), escala: { single: 1.25 } },

  // --- buff e status ------------------------------------------------------
  // 5619, nomeado `algum buff`: fitas verdes subindo pelo corpo.
  swords_dance: { single: tira('aura_verde', 18) },
  growth: { single: tira('aura_verde', 18) },
  // A arte de coracoes do Charm (5389) serve os outros dois golpes de atracao
  // do catalogo. Reusar aqui e o oposto de duplicar: e uma linha em vez de um
  // arquivo novo.
  // A `direcional` vem junto e nao por copiar-colar distraido: os tres golpes
  // fazem o mesmo gesto — sai de quem lanca e chega no alvo — e a arte e a
  // MESMA, entao a geometria medida pro Charm (2.44x no eixo 22°, ancora 0.66)
  // vale igual. Deixar os dois novos sem ela faria a mesma arte apontar pro
  // alvo num golpe e pra diagonal fixa nos outros dois.
  attract: {
    single: tira('charm', 13, { direcional: { anguloBaseGraus: 22, ancoraX: 0.66 } }),
    repeticoes: 2,
  },
  sweet_kiss: {
    single: tira('charm', 13, { direcional: { anguloBaseGraus: 22, ancoraX: 0.66 } }),
    repeticoes: 2,
  },
  // Mesma ideia com a cabeca de dragao do Dragon Dance (5393): os tres golpes
  // de dragao que sobram desenhavam a esfera de energia do tipo.
  outrage: { single: tira('dragon_dance', 16) },
  dragon_breath: { single: tira('dragon_dance', 16) },
  dragon_rage: { single: tira('dragon_dance', 16) },

  // --- avulsos ------------------------------------------------------------
  // 5026: moeda de ouro girando. Pay Day e o unico golpe do jogo que solta
  // dinheiro, e desenhava meia-lua branca de NORMAL.
  pay_day: { single: tira('moeda', 21) },
  // 4941 (`rain`, chuva azul) foi cadastrado aqui pro Rain Dance e SAIU depois
  // de ver em jogo: sao fios verticais de 1px de largura na arte, e em 46px de
  // altura eles somem — nao aparece NADA na tela, em nenhuma das cinco fases,
  // sobre grama nem sobre agua. O brilho de status do tipo WATER, que era o
  // que ele desenhava antes, pelo menos aparece.

  // -------------------------------------------------------------------------
  // AREA NAO E IMPACTO GRANDE — a regra que faltava neste arquivo
  // -------------------------------------------------------------------------
  // `drawAoeRing` desenha com o DIAMETRO REAL do splash: AOE_RADIUS (175) x 2 x
  // ESCALA_VFX_AOE (1.15) = 402px de mundo, quase DEZ VEZES os 46px do impacto
  // alvo-unico. Isso muda que arte serve:
  //
  //   FONTE PEQUENA VIRA BORRAO. Um quadro de 35x36 (a poeira do Bulldoze) ou
  //   de 55x49 (as folhas do Razor Leaf) esticado pra 402px nao e a mesma arte
  //   maior — e um bloco de pixel. As quatro entradas de area que funcionam
  //   (earthquake 320x300, whirlpool 224x224, whirlwind 199x199, petal_dance
  //   208x205, petal_blizzard 224x223) todas nascem grandes.
  //
  //   PROPORCAO LONGE DE 1:1 VIRA PILAR OU FAIXA. A coluna de fogo do 5467
  //   (140x268, proporcao 0.52) foi cadastrada aqui pro Eruption na PH-368 e
  //   saiu depois de ver em jogo: em 402px de altura ela e um pilar de tela
  //   inteira que nao diz "isto pegou uma area", e ainda tapa o campo. E o
  //   mesmo defeito que a PH-368 tinha ido consertar, so que no eixo oposto.
  //
  //   OPACO TAPA O CAMPO. A nuvem do Poison Gas em 402px e uma mancha roxa
  //   cheia por cima de tudo. Mesma regra que o DARK de `vfxTiras.ts` ja
  //   escrevia pro impacto: area cheia so serve translucida.
  //
  // Nenhuma das tres aparece na conferencia de folha nem na medicao — as duas
  // trabalham no tamanho do impacto. Quem mostra e
  // `scripts/harness/arte-de-golpe-em-movimento.html`, que desenha na escala de
  // area com o proprio `drawEffect`.
  //
  // -------------------------------------------------------------------------
  // NOMEADOS QUE REPROVARAM, pra ninguem tentar de novo sem argumento novo
  // -------------------------------------------------------------------------
  // 5325 (`aqua jet`)  coluna de 36x214, alongamento 18.4x — o maior do banco
  //                    por uma ordem de grandeza. Na altura padrao vira um fio
  //                    de 6px. Ja estava recusado, e continua.
  // 4948 (`coin`)      pontos laranja de 1px espalhados. O 5026 e a mesma
  //                    ideia com moeda inteira e visivel.
  // 2431 (`cura boa`)  cruzes ESCURAS de 28x30. Sobre fundo de caverna nao
  //                    aparece; o 4710 e a mesma cruz, verde e brilhante.
  // 4547/4548/4936     os tres candidatos escuros, 0% de pixels claros. A
  //     (`dark`)       recusa deles ja esta escrita no DARK de vfxTiras.ts.
  // 4372 (`rock smash  esfera azul virando nuvem branca. `rock_smash` nao
  //       blue`)       existe no catalogo, e a arte nao le como pedra em
  //                    nenhum outro golpe.
  // 4886 (`double`)    dois riscos claros formando um pico, sem ponto de
  //                    impacto. O 5010 resolve os mesmos tres golpes com
  //                    leitura de "bateu duas vezes".
  // 4941 (`rain`)      fios verticais de 1px. Em 46px de altura nao aparece
  //                    nada na tela. Estava cadastrado no Rain Dance e saiu.
  // 4328 (`field`)     cupula translucida de 255x256, feita pra cobrir campo.
  //                    Em 46px vira mancha esverdeada sobre grama. Estava no
  //                    Leech Seed e no Spore e saiu.
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
