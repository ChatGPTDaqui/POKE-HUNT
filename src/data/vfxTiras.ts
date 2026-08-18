// Arte de efeito em TIRA — um arquivo por assunto, quadros ja montados lado a
// lado. Substitui os dois lotes anteriores de impacto por tipo elemental —
// PNG solto por quadro e um GIF por tipo —, cujos modulos foram REMOVIDOS.
// A arte deles continua em disco (assets/move-vfx/<tipo>/ e
// assets/move-vfx-gif/) sem nenhum consumidor: e sobra, nao fallback.
//
// POR QUE TIRA E NAO PNG SOLTO POR QUADRO
//
// A arte nova tem 14 a 40 quadros por tipo. Em PNG solto isso seriam ~430
// arquivos no preload (`data/preload.ts` aquece TUDO antes da cena montar) —
// 430 requests contra 18. A tira e o mesmo formato que `captureAnim.ts` ja
// usa pras pokebolas, com a mesma regra: o quadro N ocupa
// `[N*L, N*L+L)` na horizontal, altura cheia, e `L` sai de
// `naturalWidth / quadros` em vez de ser escrito aqui (um numero a menos pra
// errar quando a arte for regerada).
//
// POR QUE OS QUADROS SAO RECORTADOS
//
// O exportador corta a moldura transparente comum a todos os quadros
// (`--recortar`). Sem isso, arte com muito respiro (o quadro de 192x192 cujo
// desenho ocupa 60px no centro) era desenhada na altura do QUADRO e aparecia
// como uma manchinha no meio de nada — foi o motivo de quatro escolhas terem
// sido rejeitadas na conferencia sobre o fundo real da hunt. Recortado, a
// altura pedida no desenho e a altura do DESENHO.
//
// COMO REGERAR (o id e a unica coisa que o banco .dat nao deduz sozinho):
//   py POKE/PXG_2026/objectbuilder/tira_efeito.py <id> --recortar \
//      --out assets/move-vfx/tiras/<tipo>.png
// e depois quantizar pra PNG-8 (255 cores, FASTOCTREE) — corta ~80% do byte
// sem diferenca visivel no tamanho de jogo, conferido lado a lado.
//
// Escolha da arte: varredura dos 5691 efeitos do banco por matiz/tamanho/
// numero de quadros (`perfil_efeitos.py` + `sugerir_por_cor.py`), e a decisao
// final sobre RECORTE DE FUNDO REAL DE HUNT no tamanho de jogo
// (`verificar_vfx.py`) — nunca em folha de contato, que ja aprovou duas artes
// invisiveis em jogo.
import type { ElementType } from './generated/types'

export interface TiraDeVfx {
  url: string
  /** Quantos quadros a tira tem. A largura de cada um sai da imagem. */
  quadros: number
  /**
   * Correcao de tamanho, multiplicando a altura-base do desenho. Existe
   * porque o enquadramento nao e padronizado nem depois do recorte: um
   * relampago longilineo e um estouro redondo com a MESMA altura de arquivo
   * nao tem o mesmo peso na tela.
   */
  escala?: number
  /**
   * Presente = a arte APONTA PRA ALGUM LADO e precisa girar pra acompanhar a
   * direcao do golpe. Ausente = desenhada como esta, sem rotacao.
   *
   * O lote inteiro nasceu (2026-08-17) marcado como "simetrico" em bloco, sem
   * ninguem medir. `node scripts/conferir-direcao-vfx.mjs` mediu as 18 uma a
   * uma e achou tres classes, nao duas:
   *
   *   RADIAL     anel, estouro, emaranhado. Nao tem lado alto — desenha como
   *              esta. E a maioria (12 das 18).
   *   VERTICAL   assimetrica so no eixo Y, com eixo principal DEITADO: a
   *              cupula do PSYCHIC, a coluna do FLYING, a nuvem do POISON, o
   *              brilho do FAIRY. Elas tem "pra cima", nao "pra o alvo" —
   *              girar pro inimigo DEITA a arte no chao. Ficam de fora da
   *              rotacao pelo motivo oposto ao das radiais, e por isso a
   *              distincao importa: o teste ingenuo ("e assimetrica? entao
   *              gira") piora essas quatro.
   *   DIRECIONAL o que este campo cobre.
   *
   * `anguloBaseGraus` e pra onde a arte aponta DENTRO DO ARQUIVO, medido pelo
   * eixo principal (0° = direita, positivo = pra baixo, mesma convencao do
   * `Math.atan2` do mundo). O desenho gira por `anguloDeAtaque - base`, entao
   * arte que ja nasce apontando pra direita usa 0 e nao vira nada quando o
   * alvo esta a direita.
   */
  direcional?: {
    anguloBaseGraus: number
    /**
     * Fracao da largura que continua sendo desenhada, contada do lado do
     * IMPACTO. Encurta rastro comprido demais.
     *
     * Nao da pra resolver isso com `escala`: encolher a tira inteira encolhe
     * o estouro junto, e o estouro e a parte que o jogador precisa ver. E o
     * mesmo campo que `moveVfx.ts` ja usa no Bullet Punch, pelo mesmo motivo
     * medido: o combate acontece a 39px de distancia (raio 14 + raio 15 +
     * padding 10), entao um rastro de 100px nao "chega no alvo" — ele
     * atravessa o proprio atacante e sai por tras dele.
     */
    recorteX?: number
    /**
     * Onde, na largura do quadro, fica o PONTO DE IMPACTO — a fracao que cai
     * em cima do alvo. Sem isso a arte e centralizada e um jato comprido
     * atravessa o inimigo com o meio do desenho. Mesma ideia do `ancoraX` de
     * `moveVfx.ts`, medida da mesma forma (centroide da massa do impacto).
     * Ausente = 0.5, ou seja, centralizado como sempre foi.
     */
    ancoraX?: number
  }
}

const RAIZ = 'assets/move-vfx/tiras'

/**
 * Os 18 tipos elementais do catalogo, todos com arte propria — nao ha mais
 * tipo caindo no desenho procedural de `drawImpactBurst`, que vira so a rede
 * de seguranca de "a imagem ainda esta baixando".
 *
 * O id ao lado de cada linha e o do efeito no banco de origem: e o unico jeito
 * de reencontrar a arte pra regerar, porque o banco nao guarda nome nenhum.
 */
export const TIRA_POR_ELEMENTO: Record<ElementType, TiraDeVfx> = {
  NORMAL: { url: `${RAIZ}/normal.png`, quadros: 30 },            // 2447 — meia-lua branca
  // Jato: cauda fina a esquerda, estouro a direita — ja nasce na convencao
  // "aponta pra direita", dai base 0 (o eixo medido deu -2°, ruido). Ancora no
  // p75 da massa (0.78), que e onde fica o estouro; centralizar enfiava metade
  // do jato pra dentro do inimigo.
  FIRE: {
    url: `${RAIZ}/fire.png`, quadros: 16,                        // 2465 — labareda larga
    // A UNICA tira fora de escala do lote, e nao por pouco: o quadro e 220x119
    // (proporcao 1.85), entao a altura pedida virava 150px de LARGURA na tela —
    // 4,9x o POKE, contra 2,3x da mediana das outras 17. A `escala: 1.15` que
    // estava aqui foi posta a olho e PIOROU o caso.
    //
    // O conserto nao e encolher: e um jato, e encolher o jato encolhe o estouro
    // que o jogador precisa ver. `recorteX` corta a cauda do lado de tras,
    // mesmo tratamento que o Bullet Punch (moveVfx.ts) recebeu pelo mesmo
    // motivo medido.
    //
    // 0.68 sai da conta, nao do olho: com altura 46px a largura fica 85px, a
    // ancora em 0.78 punha 66px de jato ATRAS do alvo, e o atacante esta a
    // 39px — o fogo atravessava quem lancou e saia pelas costas dele. Recortado
    // em 0.68, o rastro atras do alvo mede 85 x (0.68 - 0.22) = 39px, exatamente
    // a distancia do atacante.
    direcional: { anguloBaseGraus: 0, ancoraX: 0.78, recorteX: 0.68 },
  },
  WATER: { url: `${RAIZ}/water.png`, quadros: 25 },              // 641  — estouro azul
  ELECTRIC: { url: `${RAIZ}/electric.png`, quadros: 14 },        // 2572 — arcos amarelos
  GRASS: { url: `${RAIZ}/grass.png`, quadros: 15 },              // 2575 — redemoinho verde
  ICE: { url: `${RAIZ}/ice.png`, quadros: 39 },                  // 4693 — cristal ciano
  FIGHTING: { url: `${RAIZ}/fighting.png`, quadros: 21 },        // 2079 — anel de impacto
  POISON: { url: `${RAIZ}/poison.png`, quadros: 30 },            // 2707 — vortice roxo
  GROUND: { url: `${RAIZ}/ground.png`, quadros: 24 },            // 2495 — redemoinho de terra
  // TROCADA em 2026-08-18. A arte anterior (efeito 1029) tinha um SPRITE DE
  // ITEM embutido — um objeto amarelo com a palavra DROP escrita — visivel em
  // 2 dos 5 quadros amostrados. Texto de outro jogo no meio de um golpe. Nao
  // era ajuste de escala nem de direcao: a arte estava imprestavel, e passou
  // porque a escolha original foi feita por varredura de matiz/tamanho, sem
  // ninguem OLHAR quadro a quadro.
  FLYING: { url: `${RAIZ}/flying.png`, quadros: 20 },            // 4735 — tornado
  PSYCHIC: { url: `${RAIZ}/psychic.png`, quadros: 20 },          // 4468 — arco magenta
  // Respingo com inclinacao ESTAVEL de 49° (+-3° entre os 16 quadros): nao e
  // um projetil, mas tambem nao e redondo — ficava sempre tombado pro mesmo
  // canto, independente de onde estava o inimigo. Ancora centrada: o respingo
  // acerta em cima do alvo, nao a frente dele.
  BUG: {
    url: `${RAIZ}/bug.png`, quadros: 16,                         // 5446 — respingo verde
    direcional: { anguloBaseGraus: 49 },
  },
  ROCK: { url: `${RAIZ}/rock.png`, quadros: 19 },                // 5504 — cratera
  GHOST: { url: `${RAIZ}/ghost.png`, quadros: 28 },              // 2583 — anel roxo
  DRAGON: { url: `${RAIZ}/dragon.png`, quadros: 15 },            // 2432 — esfera de energia
  // Era o 4109 (um vazio preto de borda roxa). Bonito na conferencia, ruim em
  // jogo: e um disco OPACO do tamanho do POKE, e com o impacto durando 1,0s
  // ele escondia o alvo por um segundo inteiro. Trocado por um corte, que le
  // igual e nao tapa nada. Regra que fica: arte de area cheia so serve pra
  // efeito translucido — a que preenche tem que ser anel, corte ou particula.
  // Talho diagonal, 2.69x de alongamento num eixo de -41° que nao varia mais
  // que 1° nos 20 quadros. Era o caso mais visivel do lote: o corte saia sempre
  // na mesma diagonal, mesmo com o inimigo do lado oposto. Ancora centrada — um
  // talho corta EM CIMA do alvo.
  DARK: {
    url: `${RAIZ}/dark.png`, quadros: 20,                        // 4881 — corte escuro
    // MANTIDA depois de medir, e nao por falta de candidato. O talho e
    // marrom e nao le como "escuridao" — a critica e justa. Mas os tres
    // candidatos escuros do banco (efeitos 4547, 4548 e 4936) medem
    // luminancia 21, 1 e 0, com ZERO por cento de pixels claros; esta, que
    // ja e a tira mais escura das 18 (luminancia 50), ainda tem 10%.
    //
    // Preto puro sobre o fundo de uma caverna e um golpe que nao acontece na
    // tela, e esse erro exato ja foi cometido duas vezes neste projeto (ver
    // assets/move-vfx/NOTAS.txt). Trocar semantica por invisibilidade e piorar.
    // Um DARK certo precisa de arte com contorno claro sobre nucleo escuro,
    // que este banco nao tem.
    // `escala: 1.2` saiu daqui: foi posta a olho e nao tinha motivo medido. O
    // quadro e 64x63 e o conteudo ja preenche quase tudo, entao sem escala a
    // tira cai em 70px — a mediana exata do lote. Com 1.2 ela era a segunda
    // maior de todas.
    // ancoraX 0.63 e o p75 da massa medido no quadro de pico (o script imprime
    // esse percentil pra toda tira direcional). Centralizado em 0.5, a PONTA do
    // talho caia 23px adiante do alvo — o corte passava do inimigo em vez de
    // acertar nele. Nao precisa de recorteX: com 47px de largura, a metade de
    // tras mede 17px e o atacante esta a 39px, entao nao chega nele.
    direcional: { anguloBaseGraus: -41, ancoraX: 0.63 },
  },
  STEEL: { url: `${RAIZ}/steel.png`, quadros: 22 },              // 3297 — anel metalico
  // TROCADA em 2026-08-18. A arte anterior (efeito 4073) desenhava CAVEIRAS
  // rosa — leitura de morte/veneno, nao de fada. Passou porque a escolha do
  // lote foi por matiz e tamanho: rosa e o matiz certo pro tipo, e ninguem
  // olhou o que o rosa estava desenhando.
  //
  // 4836 ganha nos dois eixos que importam aqui, medidos: luminancia 112
  // contra 98 e 35% de pixels claros contra 22% (mais visivel sobre fundo
  // escuro de hunt), e sao aneis de particulas, que e o que "fada" desenha.
  // O outro candidato (5345) tem luminancia 195 e 88% claros — viraria um
  // borrao branco no tamanho de jogo.
  FAIRY: { url: `${RAIZ}/fairy.png`, quadros: 14 },              // 4836 — aneis de particulas
}

export function tiraDoElemento(tipo: string | null | undefined): TiraDeVfx | null {
  if (!tipo) return null
  return TIRA_POR_ELEMENTO[tipo as ElementType] ?? null
}

const RAIZ_AOE = 'assets/move-vfx/tiras-aoe'

/**
 * Arte de AREA por tipo elemental — a terceira camada, entre a arte por GOLPE
 * (`moveVfx.ts`) e a tira de impacto acima.
 *
 * POR QUE ELA EXISTE. Ate 2026-08-18 golpe de area desenhava a MESMA tira do
 * impacto alvo-unico, so que esticada pro diametro real do splash. A
 * justificativa de entao ("a leitura de 'isto pegou uma area' vem do tamanho,
 * nao de um desenho diferente") vale pras tiras RADIAIS, mas quebra feio nas
 * quatro DIRECIONAIS: a do FIRE e um jato de 2,30x medido, e Eruption — um
 * vulcao que cobre a tela inteira nos jogos — saia como um lanca-chamas
 * horizontal deitado, esticado ate o diametro da area. Reclamacao explicita do
 * usuario, e o mesmo defeito atingia Lava Plume, Heat Wave, Discharge,
 * Blizzard e as 18 Explosoes Elementais de nivel 50.
 *
 * O CRITERIO DA ESCOLHA e o do resto do arquivo: efeito RADIAL, que cresce do
 * centro pra fora (anel, estouro, cupula), julgado no fundo real da hunt no
 * tamanho de jogo (`node scripts/conferir-vfx-visual.mjs <arquivo>@<quadros>`).
 * Nenhum id se repete entre esta tabela e a de impacto — arte igual nas duas
 * camadas seria o mesmo desenho que esta camada existe pra evitar.
 *
 * PARCIAL DE PROPOSITO. FIGHTING, ROCK, GHOST e STEEL nao entram: nenhum
 * candidato do banco passou no julgamento sobre fundo escuro (o de FIGHTING lia
 * como GRASS, o de ROCK sumia no tamanho de jogo, os dois de STEEL sao feixes
 * horizontais, nao areas). Tipo ausente cai na tira de impacto exatamente como
 * antes — a camada so ADICIONA.
 */
export const TIRA_AOE_POR_ELEMENTO: Partial<Record<ElementType, TiraDeVfx>> = {
  NORMAL: { url: `${RAIZ_AOE}/normal.png`, quadros: 5 },         // 5556 — aneis brancos abrindo
  FIRE: { url: `${RAIZ_AOE}/fire.png`, quadros: 11 },            // 5467 — coluna de fogo subindo
  WATER: { url: `${RAIZ_AOE}/water.png`, quadros: 8 },           // 4286 — respingo azul
  ELECTRIC: { url: `${RAIZ_AOE}/electric.png`, quadros: 14 },    // 5621 — anel de faiscas
  GRASS: { url: `${RAIZ_AOE}/grass.png`, quadros: 12 },          // 5471 — anel de folhas
  ICE: { url: `${RAIZ_AOE}/ice.png`, quadros: 18 },              // 4276 — esfera ciano
  POISON: { url: `${RAIZ_AOE}/poison.png`, quadros: 6 },         // 5489 — anel roxo
  GROUND: { url: `${RAIZ_AOE}/ground.png`, quadros: 8 },         // 5538 — anel de terra
  FLYING: { url: `${RAIZ_AOE}/flying.png`, quadros: 16 },        // 4313 — redemoinho branco
  PSYCHIC: { url: `${RAIZ_AOE}/psychic.png`, quadros: 33 },      // 4382 — estrela rosa
  BUG: { url: `${RAIZ_AOE}/bug.png`, quadros: 17 },              // 4326 — enxame verde
  DRAGON: { url: `${RAIZ_AOE}/dragon.png`, quadros: 18 },        // 4275 — esfera azul
  DARK: { url: `${RAIZ_AOE}/dark.png`, quadros: 10 },            // 5648 — esfera roxa
}

export function tiraDeAreaDoElemento(tipo: string | null | undefined): TiraDeVfx | null {
  if (!tipo) return null
  return TIRA_AOE_POR_ELEMENTO[tipo as ElementType] ?? null
}

/**
 * Como esta tira deve ser desenhada pra apontar na direcao do golpe.
 *
 * Funcao pura, separada do desenho, porque o que erra aqui e SINAL — e sinal
 * trocado num canvas nao lanca erro, so espelha a arte pro lado errado e passa
 * despercebido ate alguem reparar que o fogo sai pelas costas. Testada em
 * `vfxTiras.test.ts`.
 *
 * `girar` ja e a rotacao final (direcao do golpe menos a direcao que a arte
 * tem no arquivo). `espelharY` acompanha: girar mais de 90° deixaria a arte de
 * cabeca pra baixo, e espelhar depois do giro devolve o "em pe" sem mexer na
 * direcao — o padrao de sprite de projetil visto de lado.
 */
export function orientacaoDaTira(
  tira: TiraDeVfx,
  anguloDeAtaque: number | undefined,
): { girar: number; espelharY: boolean; ancoraX: number; recorteX: number } {
  if (!tira.direcional || anguloDeAtaque == null) {
    return { girar: 0, espelharY: false, ancoraX: 0.5, recorteX: 1 }
  }
  const girar = anguloDeAtaque - (tira.direcional.anguloBaseGraus * Math.PI) / 180
  const recorteX = Math.min(1, Math.max(0.05, tira.direcional.recorteX ?? 1))
  const ancoraNoQuadro = tira.direcional.ancoraX ?? 0.5
  // A ancora e medida no quadro INTEIRO, mas o desenho recebe so a fatia da
  // direita. Reposicionar aqui, e nao no canvas, e o ponto de esta funcao ser
  // pura: sem isso o impacto desliza junto com o recorte e ninguem ve — o
  // golpe so passa a acertar um pouco ao lado.
  const inicioDaFatia = 1 - recorteX
  const ancoraNaFatia = recorteX >= 1
    ? ancoraNoQuadro
    : Math.min(1, Math.max(0, (ancoraNoQuadro - inicioDaFatia) / recorteX))
  return {
    girar,
    espelharY: Math.abs(girar) > Math.PI / 2,
    recorteX,
    ancoraX: ancoraNaFatia,
  }
}

// ---------------------------------------------------------------------------
// Tiras que NAO sao de golpe: ficam sobre o corpo do POKE
// ---------------------------------------------------------------------------

const RAIZ_STATUS = 'assets/status-vfx'

/** Faisca de cura de HP — toca uma vez sempre que o POKE ganha vida. */
export const TIRA_CURA_HP: TiraDeVfx = { url: `${RAIZ_STATUS}/cura-hp.png`, quadros: 16 }

/**
 * A MESMA arte da cura de HP, tingida de verde no exportador
 * (`--matiz 0.33 --sat-min 0.55`). Toca quando um status sai por fonte
 * EXTERNA (item, golpe de cura, Centro) — nao quando o sono/congelamento
 * acaba sozinho, que e o proprio status vencendo e nao alguem curando.
 */
export const TIRA_CURA_STATUS: TiraDeVfx = { url: `${RAIZ_STATUS}/cura-status.png`, quadros: 16 }

/** "???" — fica em cima do POKE o tempo todo em que a confusao durar. */
export const TIRA_CONFUSAO: TiraDeVfx = { url: `${RAIZ_STATUS}/confusao.png`, quadros: 21 }

/**
 * "Zzz" — mesma ideia da confusao, pro sono. Unica arte deste lote que NAO
 * vem do banco: varri os 5691 efeitos e o banco tem o "???" mas nao tem
 * nenhum "zzz". Desenhada como pixel art por
 * `scripts/gerar-sprite-sono.mjs`.
 */
export const TIRA_SONO: TiraDeVfx = { url: `${RAIZ_STATUS}/sono.png`, quadros: 16 }

/**
 * Cor com que o corpo do POKE e tingido enquanto o status durar. NAO e pintar
 * por cima: o desenho multiplica so os pixels opacos da sprite e mistura com
 * transparencia, entao o POKE fica "arroxeado"/"alaranjado" e continua
 * reconhecivel.
 *
 * `sleep` e `confusion` ficam de fora de proposito — esses dois usam sprite
 * constante em cima (TIRA_SONO/TIRA_CONFUSAO) em vez de cor, porque sono e
 * confusao nao tem cor obvia e um POKE dormindo precisa ser lido pelo simbolo,
 * nao pelo tom.
 */
export const COR_DE_STATUS_NO_CORPO: Record<string, string> = {
  poison: '#a040c8',
  burn: '#ff8a2b',
  paralysis: '#ffdd33',
  freeze: '#3fe0ff',
}

/** Quanto do tom entra. Acima disso o POKE vira uma silhueta colorida. */
export const FORCA_DA_TINTA_DE_STATUS = 0.45

/** Toda URL deste modulo — usado pelo preload. */
export function todasAsTirasDeVfx(): string[] {
  return [
    ...Object.values(TIRA_POR_ELEMENTO).map((t) => t.url),
    // A camada de AREA entra no preload junto com a de impacto, e nao fica de
    // fora como a de GOLPE: sao 13 arquivos que TODO combate usa (a Explosao
    // Elemental de nivel 50 e area, e toda especie ganha a do proprio tipo), e
    // nao 22 que o jogador talvez nunca veja.
    ...Object.values(TIRA_AOE_POR_ELEMENTO).map((t) => t.url),
    TIRA_CURA_HP.url, TIRA_CURA_STATUS.url, TIRA_CONFUSAO.url, TIRA_SONO.url,
  ]
}
