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
import type { ElementType, StatusCondition } from './generated/types'

/**
 * A velocidade em que a arte de efeito FOI AUTORADA, e nao um numero escolhido.
 *
 * O `.dat` de origem guarda duracao por quadro, e o exportador PULAVA esse
 * bloco (`self.p += frames * 8`). Lido na PH-373, o banco inteiro responde uma
 * coisa so: 5.394 efeitos, 69.282 quadros, TODOS a 100 ms — zero variacao,
 * zero `min != max`. Dai 10 fps, exato.
 *
 * ANTES A VELOCIDADE ERA ACIDENTE. `faseDaTira` amarrava a fase ao progresso
 * do efeito, entao a tira era esticada ou comprimida pra caber num tempo fixo
 * e o NUMERO DE QUADROS decidia o ritmo: 39 fps no ICE contra 4,2 fps na area
 * NORMAL, 9,3x de espalhamento. A queixa que abriu a leva foi exatamente essa
 * — "parece que o POKE acelera a animacao pra caber no tempo".
 */
export const FPS_DA_ARTE_DE_EFEITO = 10

export interface TiraDeVfx {
  url: string
  /** Quantos quadros a tira tem. A largura de cada um sai da imagem. */
  quadros: number
  /**
   * Sobrescreve `FPS_DA_ARTE_DE_EFEITO` para esta tira.
   *
   * Nao ha nenhum caso hoje: o banco pxg e 100% uniforme a 100 ms. O campo
   * existe porque arte de OUTRO banco pode nascer com outra cadencia (sao 8
   * bancos em `projetos.json`, ~9.400 efeitos nunca varridos), e sem ele o
   * primeiro caso desses obrigaria a mexer no motor.
   */
  fps?: number
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
  WATER: { url: `${RAIZ}/water.png`, quadros: 22 },              // 641  — estouro azul
  ELECTRIC: { url: `${RAIZ}/electric.png`, quadros: 14 },        // 2572 — arcos amarelos
  GRASS: { url: `${RAIZ}/grass.png`, quadros: 15 },              // 2575 — redemoinho verde
  ICE: { url: `${RAIZ}/ice.png`, quadros: 30 },                  // 4693 — cristal ciano
  FIGHTING: { url: `${RAIZ}/fighting.png`, quadros: 19 },        // 2079 — anel de impacto
  POISON: { url: `${RAIZ}/poison.png`, quadros: 29 },            // 2707 — vortice roxo
  GROUND: { url: `${RAIZ}/ground.png`, quadros: 24 },            // 2495 — redemoinho de terra
  // TROCADA em 2026-08-18. A arte anterior (efeito 1029) tinha um SPRITE DE
  // ITEM embutido — um objeto amarelo com a palavra DROP escrita — visivel em
  // 2 dos 5 quadros amostrados. Texto de outro jogo no meio de um golpe. Nao
  // era ajuste de escala nem de direcao: a arte estava imprestavel, e passou
  // porque a escolha original foi feita por varredura de matiz/tamanho, sem
  // ninguem OLHAR quadro a quadro.
  FLYING: { url: `${RAIZ}/flying.png`, quadros: 20 },            // 4735 — tornado
  PSYCHIC: { url: `${RAIZ}/psychic.png`, quadros: 19 },          // 4468 — arco magenta
  // TROCADA em 2026-08-31 (PH-368), e o motivo nao e escala nem direcao: a arte
  // anterior era o efeito 5446, que o dono do banco nomeou `grass`. E um
  // respingo de folhagem verde — todo golpe BUG do jogo desenhava grama. Passou
  // porque a escolha foi por matiz (verde serve pros dois tipos) sem ninguem
  // cruzar com a lista nomeada.
  //
  // O 4675 (`bug`) sao aneis concentricos subindo, leitura de Bug Buzz — som, e
  // nao folha. Ele SAI da rotacao: o eixo principal e vertical (quadro 96x157) e
  // os aneis apontam pra CIMA, nao pro alvo; girar deitaria a pilha no chao,
  // mesmo motivo pelo qual PSYCHIC/FLYING/POISON/FAIRY nunca giraram.
  //
  // Sem `escala`, e isso foi MEDIDO e nao suposto. A primeira versao poe 1.5,
  // raciocinando pela LARGURA (28px contra 29 de diametro do POKE);
  // `conferir-direcao-vfx.mjs` mostrou que a conta e pela maior dimensao, e a
  // maior aqui e a altura: 46px sem escala, contra a mediana de 44px do lote.
  // Com 1.5 a tira ia pra 69px e virava a MAIOR das 18, abrindo o espalhamento
  // do lote pra 1.9x. Escala a olho neste arquivo ja errou duas vezes (o 1.15
  // do FIRE e o 1.2 do DARK); esta e a terceira, pega antes de entrar.
  BUG: { url: `${RAIZ}/bug.png`, quadros: 7 },                   // 4675 — aneis de som
  // TROCADA em 2026-08-31 (PH-368). A arte anterior era o efeito 5504, que o
  // dono do banco nomeou `dig sair`: um buraco marrom no chao com centro
  // escuro. Nao e uma cratera de pedra — e a SAIDA DA ESCAVACAO, e todo golpe
  // ROCK do jogo aparecia como um POKE saindo do chao. O 5504 continua em uso,
  // como arte do golpe `dig` (moveVfx.ts), que e o uso que o nome dele
  // descreve.
  //
  // O 4798 (`rock`) desenha pedra estourando em cascalho, que e o que um golpe
  // de pedra faz. Quadro 68x72, proporcao 0.94 — cai em 44px de largura contra
  // 46 de altura, dentro da faixa do lote e sem precisar de escala.
  ROCK: { url: `${RAIZ}/rock.png`, quadros: 11 },                // 4798 — pedra estourando
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
  // Duas trocas, e a segunda desfaz metade da primeira.
  //
  // 2026-08-18: a arte era o efeito 4073, que desenhava CAVEIRAS rosa — leitura
  // de morte, nao de fada. Trocada pelo 4836, escolhido por luminancia (112
  // contra 98) e por serem aneis de particula.
  //
  // 2026-08-31 (PH-368): o 4836 e nomeado `fairy aoe` pelo dono do banco, e o
  // desenho confirma o nome — aneis que CRESCEM DO CENTRO PRA FORA, que e forma
  // de area e nao de impacto. Ele mudou de camada: virou a entrada FAIRY de
  // `TIRA_AOE_POR_ELEMENTO`, que era o unico dos 18 tipos sem area E sem
  // justificativa escrita (o cabecalho daquela tabela nomeia quatro ausentes e
  // esquecia o FAIRY).
  //
  // O impacto passa pro 5345 (`psiquic or fairy`): floracao pastel que fecha num
  // estouro roxo com anel. Ele estava descartado aqui como "luminancia 195 e 88%
  // claros — viraria um borrao branco", numero medido no arquivo INTEIRO; visto
  // quadro a quadro na geometria do combate, o branco e o miolo de dois quadros
  // e o resto tem contorno roxo definido. Quadro 143x142, proporcao 1.01, sem
  // escala.
  FAIRY: { url: `${RAIZ}/fairy.png`, quadros: 12 },              // 5345 — floracao pastel
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
 *
 * FAIRY tambem estava fora, mas por descuido e nao por decisao: este paragrafo
 * dizia "quatro" e nomeava quatro, e os ausentes eram CINCO. Corrigido na
 * PH-368, que trouxe o 4836 da camada de impacto pra ca.
 */
export const TIRA_AOE_POR_ELEMENTO: Partial<Record<ElementType, TiraDeVfx>> = {
  NORMAL: { url: `${RAIZ_AOE}/normal.png`, quadros: 5 },         // 5556 — aneis brancos abrindo
  // TROCADA em 2026-08-31 (PH-368). O 5467 e nomeado `fire` (tipo), nao
  // `aoe fogo`, e o desenho e uma COLUNA VERTICAL de 140x268 — proporcao 0.52.
  // Como arte de area ela era um pilar fino esticado ate o diametro do splash.
  // O 5487 (`aoe fogo`) e anel de chamas abrindo do centro, que e a forma que
  // esta camada existe pra ter. O 5467 nao se perde: virou a arte do golpe
  // `eruption` (moveVfx.ts), onde coluna vertical e exatamente o desenho certo.
  FIRE: { url: `${RAIZ_AOE}/fire.png`, quadros: 27 },            // 5487 — anel de chamas abrindo
  WATER: { url: `${RAIZ_AOE}/water.png`, quadros: 8 },           // 4286 — respingo azul
  ELECTRIC: { url: `${RAIZ_AOE}/electric.png`, quadros: 13 },    // 5621 — anel de faiscas
  GRASS: { url: `${RAIZ_AOE}/grass.png`, quadros: 11 },          // 5471 — anel de folhas
  ICE: { url: `${RAIZ_AOE}/ice.png`, quadros: 18 },              // 4276 — esfera ciano
  POISON: { url: `${RAIZ_AOE}/poison.png`, quadros: 6 },         // 5489 — anel roxo
  GROUND: { url: `${RAIZ_AOE}/ground.png`, quadros: 6 },         // 5538 — anel de terra
  FLYING: { url: `${RAIZ_AOE}/flying.png`, quadros: 13 },        // 4313 — redemoinho branco
  PSYCHIC: { url: `${RAIZ_AOE}/psychic.png`, quadros: 28 },      // 4382 — estrela rosa
  BUG: { url: `${RAIZ_AOE}/bug.png`, quadros: 16 },              // 4326 — enxame verde
  // TROCADA em 2026-08-31 (PH-368). O 4275 e a MESMA arte do ICE (4276) noutro
  // matiz — esfera de pas, dois ids vizinhos do mesmo lote. Nao ha nada na tela
  // que separe uma Explosao Elemental de gelo de uma de dragao, e a camada de
  // area existe justamente pra dar desenho proprio por tipo. O 5490 (`aoe drag`)
  // e estrela de cristal abrindo em esfera: le como area e nao repete o ICE.
  DRAGON: { url: `${RAIZ_AOE}/dragon.png`, quadros: 6 },         // 5490 — estrela de cristal
  DARK: { url: `${RAIZ_AOE}/dark.png`, quadros: 10 },            // 5648 — esfera roxa
  // Entrou em 2026-08-31 (PH-368) com a arte que estava na camada de IMPACTO:
  // 4836 e nomeado `fairy aoe` e desenha aneis crescendo do centro. Ver a nota
  // do FAIRY em TIRA_POR_ELEMENTO.
  FAIRY: { url: `${RAIZ_AOE}/fairy.png`, quadros: 14 },          // 4836 — aneis de particulas
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
 * DOIS GIROS, E A ORDEM IMPORTA. `giroDaBase` desconta o angulo que a arte tem
 * DENTRO do arquivo (deixa ela apontando pra +x, a direita); `giroParaOAlvo` e a
 * direcao do golpe. Quem desenha aplica, nesta ordem de chamada:
 *
 *   rotate(giroParaOAlvo) -> [scale(1,-1) se espelharY] -> rotate(giroDaBase)
 *
 * POR QUE NAO UM GIRO SO. Ate 2026-08-19 esta funcao devolvia `girar =
 * angulo - base` e o desenho espelhava ANTES de girar, o que espelha em volta da
 * horizontal DO ARQUIVO. Isso funciona enquanto toda arte direcional tem o eixo
 * quase horizontal no arquivo (era o caso: 0°, -19°, 22°, -41°, -46°, 49°) e
 * QUEBRA A MIRA quando o eixo e vertical: espelhar em volta da horizontal
 * inverte o proprio sentido do movimento, e o golpe passa a chegar pelo lado
 * oposto ao do atacante. Foi o que aconteceu com o punho do Shadow Punch, que e
 * desenhado de cima pra baixo (98°) — ele mirava exatamente ao contrario.
 *
 * Espelhando DEPOIS do giro do alvo, o espelho acontece em volta da linha do
 * golpe: a arte volta a ficar "em pe" sem que o sentido mude, qualquer que seja
 * o eixo dela no arquivo.
 *
 * `espelharY` olha o ANGULO DO GOLPE e nao o giro resultante, pelo mesmo motivo:
 * o que deixa a arte de ponta-cabeca e mirar pra esquerda, e isso e uma
 * propriedade do golpe. Com a regra antiga (giro resultante) uma arte de base
 * 49° ficava de ponta-cabeca na faixa de 90° a 139°, sem nada apontar o erro.
 */
export function orientacaoDaTira(
  tira: TiraDeVfx,
  anguloDeAtaque: number | undefined,
): { giroParaOAlvo: number; giroDaBase: number; espelharY: boolean; ancoraX: number; recorteX: number } {
  if (!tira.direcional || anguloDeAtaque == null) {
    return { giroParaOAlvo: 0, giroDaBase: 0, espelharY: false, ancoraX: 0.5, recorteX: 1 }
  }
  const giroDaBase = -(tira.direcional.anguloBaseGraus * Math.PI) / 180
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
    giroParaOAlvo: anguloDeAtaque,
    giroDaBase,
    espelharY: Math.abs(anguloDeAtaque) > Math.PI / 2,
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
 * Simbolo CONSTANTE das duas condicoes que a tinta sozinha nao comunica.
 *
 * Ate a PH-370, sono e confusao eram os unicos status com desenho proprio, e os
 * outros quatro eram lidos SO por `COR_DE_STATUS_NO_CORPO`. A tinta entra a 45%
 * e multiplica os pixels da sprite, entao ela depende da cor do POKE ser
 * diferente da cor do status — e em dois casos ela nao e:
 *
 *   paralisia (amarelo) em Pikachu, Raichu, Jolteon, Ampharos, Elekid,
 *   Electabuzz — e paralisia e o status que mais muda o combate, porque o POKE
 *   perde turno.
 *   queimadura (laranja) em Charizard, Charmander, Magmar, Flareon, Growlithe.
 *
 * A tinta CONTINUA nos quatro: isto e um canal a mais, nao um substituto. Veneno
 * e congelamento ficam de fora porque roxo e ciano quase nao colidem com o
 * elenco, e porque simbolo em todo status transformaria a hunt cheia num
 * mostruario de icones.
 *
 * As duas sao desenhadas SOBRE O CORPO e nao como badge de canto (o slot do
 * "Zzz"/"???"): as artes vem do banco em 214x181 e 51x59, feitas pra cobrir um
 * corpo. Reduzidas aos 26px do badge viravam um risco amarelo e uma mancha
 * laranja.
 */
export const TIRA_POR_CONDICAO_NO_CORPO: Partial<Record<StatusCondition, TiraDeVfx>> = {
  // 2436 — faiscas amarelas em arco
  paralysis: { url: `${RAIZ_STATUS}/paralisia.png`, quadros: 20 },
  // 2438 — brasas laranja subindo
  burn: { url: `${RAIZ_STATUS}/queimadura.png`, quadros: 6 },
}

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
 *
 * Paralisia e queimadura estao nas DUAS tabelas desde a PH-370, e isso e
 * proposito: a tinta diz "esta com status" a distancia e o simbolo diz QUAL,
 * inclusive quando o POKE tem a cor do proprio status. Ver
 * TIRA_POR_CONDICAO_NO_CORPO acima.
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
    // Condicao persistente aparece em todo combate, entao ela entra no
    // preload junto com sono e confusao — e nao fica de fora como a arte por
    // GOLPE, que o jogador talvez nunca veja.
    ...Object.values(TIRA_POR_CONDICAO_NO_CORPO).map((t) => t!.url),
  ]
}
