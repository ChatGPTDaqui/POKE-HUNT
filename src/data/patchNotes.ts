// Hand-authored changelog — NOT spreadsheet-driven (see CLAUDE.md's "fonte
// de dados" note; this has no equivalent in dados_do_jogo.xlsx). Rendered by
// js/ui/panels/SettingsScreen.js's "Patch-notes" tab, newest first (the
// array is already kept in that order — see sortByDateDesc below, which
// re-sorts defensively so a future out-of-order entry can't silently render
// wrong instead of just looking odd in the source file).
export interface PatchNoteEntry {
  version: string
  date: string
  title: string
  highlights: string[]
}

export const PATCH_NOTES: PatchNoteEntry[] = [
  // PH-337. QUARTA promocao de 31/08. A regua e uma entrada por PROMOCAO, e esta
  // promocao tem UM assunto: a Geracao III.
  //
  // A 7.20 dizia, por escrito, que a Geracao III NAO entrava — "coisa nao
  // promovida nao se anuncia" — porque a PR #327 estava aberta naquele momento.
  // Ela fechou, e o intervalo `main..dev` desta vez tem CINCO commits: a PH-332
  // (a geracao) e as tres correcoes de deploy da PH-336, mais o back-merge da
  // 7.20. E a entrada propria e grande que a 7.20 prometeu.
  //
  // Fica de FORA, e nenhum dos itens abaixo e esquecimento:
  //  - As TRES falhas de deploy da PH-336 (`22P02` no enum de categoria, `23514`
  //    nas duas CHECK de `species`, `42804` no schema do cast). O jogador nao viu
  //    nenhuma: o banco de producao ficou alguns minutos com 386 especies e o de
  //    staging com 251, e o cliente que le as duas coisas so chegou depois. Erro
  //    de encanamento corrigido antes de existir pra quem joga.
  //  - `gerar-migration-especies.mjs`, o par de migrations, as CHECK afrouxadas,
  //    `enumsDaMigrationDeEspecies.test.ts`, e os dois testes que liam a PRIMEIRA
  //    migration em vez da ultima.
  //  - A correcao do Azurill em `huntSpawnOverrides.ts` (a faixa `[31,17]` vazia
  //    tirava Marill do jogo). E bug real, mas so existia COM a Geracao III
  //    ligada — nunca chegou a producao, entao nao ha o que anunciar como
  //    "corrigido".
  //  - `faceEmocoes.generated.ts` (1.671 arquivos novos). O efeito visivel dele e
  //    a cara dos POKE novos aparecer, e isso ja esta dentro do primeiro item.
  //  - `height_m` NULL nas 135. Nada no jogo le altura hoje.
  {
    version: '7.21',
    date: '2026-08-31',
    title: 'A Geracao III chegou: 135 POKE de Hoenn, 10 hunts BOSS novas e o preco das Stone mudou',
    highlights: [
      'CENTO E TRINTA E CINCO POKE NOVOS ENTRARAM NO MATO E NA POKEDEX. Hoenn inteira, de Treecko a Deoxys: o elenco do jogo saiu de 245 para 380 especies. Elas nao foram jogadas num canto — cada uma tem bioma, sub-bioma e faixa de nivel proprios, medidos nos encontros de verdade do jogo original. Se voce ja conhecia uma hunt de cor, ela tem bicho novo agora: 38 especies novas no Campo Aberto, 24 na Mata, 18 no Subterraneo, 18 no Sombrio, 18 nos Aridos, e vai por ai. Tudo com arte, retrato, shiny e cara de emocao — nenhuma delas aparece como quadrado vazio.',
      'AS HUNTS BOSS PASSARAM DE 11 PARA 21. Os dez lendarios de Hoenn ganharam hunt dedicada, uma pra cada: Regirock, Regice, Registeel, Latias, Latios, Kyogre, Groudon, Rayquaza, Jirachi e Deoxys. Eles NAO aparecem em hunt comum — chegaram a nascer no mato durante o desenvolvimento e isso foi corrigido antes de ir ao ar, porque Rayquaza como encontro de rotina nao e hunt BOSS, e sim hunt quebrada.',
      'OS TRES INICIAIS DE HOENN SAO SELVAGENS, E ISSO E DE PROPOSITO. Treecko, Torchic e Mudkip aparecem no mato. A regra do jogo nunca foi "inicial nao e selvagem" — e "o que voce pode ESCOLHER na tela inicial nao aparece no mato", e a tela oferece Charmander, Squirtle e Bulbasaur. Chikorita, Cyndaquil e Totodile ja eram selvagens desde a Geracao II, pelo mesmo motivo.',
      'CINCO HABILIDADES QUE NAO EXISTIAM AGORA FUNCIONAM, E DUAS DELAS SEGURAM POKE QUEBRADO. Slaking tem o maior conjunto de atributos do jogo inteiro, e agora tem TRUANT: ele descansa um turno a cada dois, e sem isso seria entregar o POKE mais forte do jogo como encontro de rotina. Shedinja tem 1 de HP maximo e agora tem WONDER GUARD: so golpe super efetivo o acerta, e sem isso a especie era piada. Entraram tambem TOXIC BOOST (envenenado bate mais forte), SIMPLE (mudanca de atributo conta dobrada) e HEAVY METAL. E de brinde: LIGHT METAL, que estava no jogo desde sempre com seis donos e NUNCA fez nada — o motivo escrito dizia que nenhum golpe usava peso, e Low Kick, Heavy Slam e Heat Crash usam desde o primeiro dia. As duas agora pesam de verdade.',
      'O PRECO DE TROCAR A ESPECIALIDADE MUDOU MUITO EM ALGUNS TIPOS, PRA CIMA E PRA BAIXO. O custo em Stone sempre acompanhou quanto daquela Stone o jogo oferece, e 135 POKE novos mudaram a oferta de quase todo tipo. ACO, PEDRA, GELO e TERRA ficaram bem mais caros (Aco saiu de 2 pra 16 Stone no primeiro nivel — Aron, Lairon, Aggron, Beldum, Metang, Metagross, Mawile e Registeel entraram todos de uma vez). VENENO, FADA, SOMBRIO e FANTASMA ficaram mais baratos. Nao e reajuste solto: e a mesma conta de antes, rodada sobre o elenco novo.',
      'QUARENTA GOLPES NOVOS GANHARAM DESCRICAO EM PORTUGUES. Os golpes que chegaram com Hoenn nao aparecem mais sem texto na tela de golpes.',
    ],
  },
  // PH-335. TERCEIRA promocao de 31/08 — a regua e uma entrada por PROMOCAO,
  // nao por dia, e a 7.18 e a 7.19 sairam de madrugada.
  //
  // O intervalo `main..dev` tem treze commits e TRES sao de jogador: PH-329
  // (clima), PH-331 (guardiao e troca de sala) e PH-330 (o Eevee do Lance).
  //
  // A GERACAO III NAO ENTRA, e isto e a regua funcionando e nao esquecimento. A
  // PH-332 esta em PR ABERTA, esperando aprovacao pra ir ao ar — nao esta na
  // `main`, e coisa nao promovida nao se anuncia. Ela vale entrada propria, e
  // grande: 135 especies, 10 hunts BOSS novas, 5 habilidades.
  //
  // Fica de fora tambem:
  //  - PH-333 (bancada de egress, `npm run edge:jwks`, doc de operacao). Harness
  //    e medicao. O segredo `JOGO_JWKS` que ela achou NAO foi gravado, entao nao
  //    ha efeito nenhum a anunciar — so o comando pronto pra quem opera.
  //  - PH-326 (regenerar `database.types.ts`). Encanamento, e a segunda vez no
  //    dia — ver PH-317 pra por que isso ainda e manual.
  //  - PH-328 (correcao no CLAUDE.md) e PH-317 (aviso de tipos no CI). Nem
  //    chegam ao jogo.
  //  - O COMO dos tres itens abaixo: `tickClimaDeGolpe` saindo de `updateCombat`,
  //    `encurtarTransicaoDeSala` no regime silencioso, `substituiPokeUid` na
  //    receita do correio, e o resgate do worker de timer. O jogador sente "a
  //    chuva dura", "meu POKE vai atras do guardiao" e "o Eevee e meu, unico";
  //    o resto e encanamento, mesma regua da 7.11 pra ca.
  {
    version: '7.20',
    date: '2026-08-31',
    title: 'O clima dura de verdade, o guardiao virou prioridade e o Eevee do Lance e unico',
    highlights: [
      'CHUVA, SOL, AREIA E GRANIZO DE GOLPE DURAVAM UM PISCAR DE OLHOS. O jogo dizia dez turnos e entregava menos de um segundo: o clima caia no instante em que o ultimo inimigo do grupo morria, e o cronometro dele so andava enquanto havia luta acontecendo. Agora ele dura o tempo que promete, contado em tempo corrido — atravessa a espera pelo proximo inimigo, atravessa o seu POKE desmaiado, atravessa a tela de "entrando em nova area". Na pratica: Dança da Chuva, Dia Ensolarado, Granizo e Tempestade de Areia ficaram bem mais fortes do que eram.',
      'E HABILIDADE DE CLIMA (Drizzle, Drought, Sand Stream, Snow Warning) ERA O OPOSTO: NAO ACABAVA NUNCA. Um POKE com Drizzle entrava em campo e a chuva dele apagava o clima do lugar pelo resto da sala inteira. Agora ela dura os mesmos dez turnos do golpe, e depois o clima da area volta a aparecer.',
      'SEU POKE IGNORAVA O GUARDIAO DA SALA E IA BATER NO BICHO MAIS PERTO. O guardiao e o unico inimigo que destrava a sala, e ele nasce longe — entao o POKE saia atras de qualquer outro e a hunt ficava parada em 30/30 esperando. Agora o guardiao tem a mesma prioridade que um shiny: seu POKE vai direto nele, de qualquer distancia, e bate NELE quando os dois estao em cima de voce.',
      'E MATAR O GUARDIAO AS VEZES DAVA... OUTRO GUARDIAO. Quando o abate acontecia nos ultimos segundos antes do jogo gravar, a troca de sala se perdia no meio do caminho: o servidor guardava a sala velha ainda em 30/30, e um guardiao novo, de HP cheio, nascia no lugar do que voce acabou de derrubar. Corrigido — a sala troca no mesmo instante em que ele cai.',
      'O EEVEE DO CAMPEAO LANCE ERA IGUAL PRA TODO MUNDO, E AGORA E SORTEADO. Ele vinha sempre com a mesma raridade, os mesmos seis atributos e nenhuma habilidade — dois jogadores que vencessem o Lance ganhavam POKEs identicos, e shiny era impossivel. Agora ele e sorteado como qualquer POKE do jogo: raridade, atributos, natureza, habilidade (com chance da oculta) e shiny. Ele vem no NIVEL 1, pra voce criar do comeco. QUEM JA RECEBEU O ANTIGO TEM UM NOVO NO CORREIO — ao coletar, o antigo da lugar ao sorteado, e nada e perdido no meio.',
    ],
  },
  // PH-325. SEGUNDA promocao da madrugada de 31/08 — a 7.18 saiu poucas horas
  // antes, e a regua e uma entrada por PROMOCAO, nao por dia.
  //
  // O intervalo `main..dev` tem UM commit fora os merges, e ele e de jogador:
  // PH-324, achado varrendo o jogo com a Mochila aberta.
  //
  // Fica de FORA o COMO: leitura do `poke_uid` antes da RPC, a ordem por causa
  // da policy de `status = 'ativo'`, e o corte de mochila nao carregada. O
  // jogador sente "o POKE aparece agora"; o resto e encanamento, mesma regua da
  // 7.11 pra ca.
  {
    version: '7.19',
    date: '2026-08-31',
    title: 'O POKE que volta do Mercado aparece na hora',
    highlights: [
      'CANCELAR UM ANUNCIO DIZIA QUE O POKE TINHA VOLTADO, E ELE NAO APARECIA. A mensagem era essa mesma — "o POKE voltou pra sua mochila" — e a Mochila continuava sem ele. Ele estava la, seu, inteiro: era a tela que so descobria depois de voce fechar e abrir de novo. Agora ele volta na hora.',
      'E COMPRAR UM POKE NO MERCADO TAMBEM NAO MOSTRAVA NADA. Voce pagava, o ouro saia, e a Mochila seguia igual — o POKE comprado so aparecia na proxima vez que voce abrisse a tela. Era o pior dos tres casos, porque nele voce ja tinha pago. Corrigido junto: aceitar uma oferta tambem para de deixar na sua lista um POKE que voce acabou de vender.',
    ],
  },
  // PH-320. Promocao da madrugada de 31/08. O intervalo `main..dev` tem dez
  // commits e SO DOIS sao de jogador.
  //
  // A TROCA ENTRA AGORA, E NAO ANTES, e isso e a regua funcionando. A fatia 1
  // (a mesa, PH-120) ja estava na `main` desde 30/08 e ficou de fora da 7.17 de
  // proposito: sem tela, era meia-feature. Agora ela esta inteira — mesa,
  // oferta com reserva, confirmacao dupla e a tela em tempo real — e a versao
  // completa ganha entrada propria.
  //
  // Fica de FORA:
  //  - PH-313, PH-316 e PH-318 (regenerar `database.types.ts`). Encanamento, e
  //    tres vezes o mesmo — ver PH-317 pra por que isso ainda e manual.
  //  - PH-315 e PH-319 (a bancada de fumaca da troca). Harness.
  //  - PH-309 (permissao da sessao de agente). Nem chega ao jogo.
  //  - O COMO dos dois itens abaixo: versao de oferta, trigger, `location =
  //    'troca'`, caixa de entregas, denormalizacao do retrato do POKE. O
  //    jogador sente "da pra trocar" e "meu POKE nao some mais"; o resto e
  //    encanamento, mesma regua da 7.11 pra ca.
  {
    version: '7.18',
    date: '2026-08-31',
    title: 'Troca direta entre jogadores, com confirmacao dos dois lados',
    highlights: [
      'AGORA DA PRA TROCAR POKE COM OUTRO JOGADOR, DE VERDADE. Ate aqui o unico jeito de um POKE mudar de dono era o Mercado, que troca POKE por OURO — POKE por POKE nao existia. A tela nova fica no menu, em "Troca": voce convida alguem pelo Ranking ou pelo Correio (o icone de duas setas ao lado do nome), o outro aceita, e os dois montam a oferta na mesma mesa. POKE e item entram; os dois lados veem o que o outro pos, na hora, sem recarregar nada.',
      'E ELA E A PROVA DE GOLPE, NAO SO UM COMBINADO. O golpe classico e trocar a oferta no instante em que o outro clica em confirmar — voce ve tres POKEs, confirma, e o que sai e um. Aqui isso nao funciona: qualquer mudanca na mesa DERRUBA as duas confirmacoes na hora, e o servidor recusa qualquer confirmacao que nao seja da mesa que voce esta vendo agora. So com os dois lados confirmados sobre a MESMA mesa a troca acontece — e ela acontece inteira ou nao acontece, nunca pela metade.',
      'O QUE VOCE POE NA MESA SAI DA SUA MOCHILA ENQUANTO ESTIVER LA. Nao e uma promessa: o POKE ofertado nao pode ser vendido, anunciado, evoluido nem posto na equipe enquanto a mesa estiver aberta, e o item vai reservado tambem. Desistir devolve tudo. Qualquer um dos dois cancela a qualquer momento, e a mesa fecha sozinha depois de 15 minutos parada — o que estava nela volta pra quem era.',
      'ANUNCIAR UM POKE NO MERCADO PODIA FAZER ELE SUMIR PARA SEMPRE. Com a Mochila aberta, anunciar um POKE (ou coloca-lo em leilao) fazia a gravacao seguinte APAGAR o POKE do banco. O anuncio continuava na vitrine, mas apontando pra nada — quem comprasse pagava por um POKE que nao existia mais, e o dono nao tinha como recuperar. Corrigido.',
    ],
  },
  // PH-308. Segunda promocao de 30/08 — a 7.16 saiu poucas horas antes, e a
  // regua e uma entrada por PROMOCAO, nao por dia.
  //
  // O intervalo `main..dev` tem tres coisas, e duas sao de jogador: PH-307 (o
  // Lance) e PH-305 (o guardiao que fugia com o POKE congelado). PH-306 e
  // asseracao orfa num teste de patch notes — interno, fica de fora.
  //
  // Fica de fora tambem o COMO do PH-307: coluna nova, sobrecarga de RPC,
  // janela de flush. O jogador sente "derrotar o Lance passou a valer"; o resto
  // e encanamento, mesma regua da 7.11 pra ca.
  {
    version: '7.17',
    date: '2026-08-30',
    title: 'Derrotar o Campeao Lance finalmente conta',
    highlights: [
      'DERROTAR O CAMPEAO LANCE NAO ESTAVA VALENDO NADA. Voce vencia os seis POKEs dele, o jogo anunciava a vitoria — e a Faixa III continuava trancada, o Hall da Fama continuava vazio e o Eevee da primeira vitoria nunca chegava pelo correio. As tres coisas dependem do mesmo registro, e ele nunca era gravado. Agora vale.',
      'PORQUE A LUTA CONTRA ELE RECOMECAVA SOZINHA, E VOCE NAO VIA. Quem guarda o placar da luta e o servidor, e a cada rodada de gravacao o POKE do Lance voltava com a vida CHEIA por la. Quem nao derrubasse um deles inteiro entre duas gravacoes nunca o derrubava; e quem derrubava terminava a luta antes de o servidor concordar, entao a vitoria que aparecia na sua tela nao existia pra ele. Agora a vida do POKE do Lance continua de onde parou.',
      'E O GUARDIAO PAROU DE FUGIR QUANDO O SEU POKE ESTA CONGELADO. Ele sai de campo quando a luta empaca de verdade — mas estava contando junto o tempo em que o seu POKE nao CONSEGUIA atacar. Resultado: ele ia embora no meio de uma luta que estava indo bem, e a vida que ele ja tinha perdido voltava inteira com o substituto.',
    ],
  },
  // PH-303. Entrada da promocao de 30/08 a noite. A 7.15 ja estava na `main`
  // (o arquivo era identico dos dois lados), entao a leva seguinte pede entrada
  // NOVA — a regua e uma entrada por PROMOCAO, nao por dia de trabalho.
  //
  // O intervalo `main..dev` desta vez tem quatro commits, e so dois sao de
  // jogador: PH-301 e PH-302, os dois abaixo.
  //
  // Fica de FORA:
  //  - PH-300 (bancada `fumaca-de-producao.mjs`, a verificacao que a promocao
  //    automatica passou a exigir) e PH-299 (back-merge da `main` na `dev`).
  //    Processo e encanamento, mesma regua da 7.11 pra ca.
  //  - O COMO das duas correcoes: o Web Worker que segura o ritmo de liquidacao
  //    com a aba oculta, o filtro do sorteio do protetor e o cao de guarda do
  //    impasse. O que o jogador sente ja esta nas linhas abaixo.
  {
    version: '7.16',
    date: '2026-08-30',
    title: 'A hunt que travava para sempre, e o jogo que parava quando voce minimizava',
    highlights: [
      'A HUNT PODIA TRAVAR PARA SEMPRE NUMA SALA, E NAO HAVIA SAIDA. Voce fechava os 30 abates, o guardiao nascia, seu POKE atravessava o mapa, encostava nele e batia — e a vida dele nao mexia um ponto. Nao era lentidao: quando o guardiao era IMUNE ao tipo do seu POKE (um Ponyta com Flash Fire contra um POKE so de Fogo, por exemplo), o dano era zero, para sempre, sem erro na tela e sem nada que voce pudesse fazer. Quem lutava com um POKE de um tipo so era quem mais sofria: quase uma em cada quatro salas de Campina travava assim. Agora o guardiao que aparece e sempre um que o seu POKE consegue machucar.',
      'E SE A LUTA EMPACAR MESMO ASSIM, O GUARDIAO SAI DE CAMPO. Trocar de POKE no meio da briga, ou ele se defender bem demais, ainda podia parar a sala. Passou um tempo apanhando sem perder vida nenhuma, ele foge e outro toma o lugar dele — a sala continua exigindo que voce derrube um guardiao, so parou de poder ficar presa num que nao da pra derrubar.',
      'E SEU POKE PAROU DE INSISTIR NUM GOLPE QUE NAO FAZ NADA. Ele seguia a ordem dos quatro golpes sem olhar quem estava na frente, entao contra um alvo imune gastava turno atras de turno num golpe de zero. Agora ele pula o que nao pode dar resultado nenhum e vai pro proximo da fila que funciona — a ordem que voce escolheu continua valendo em todo o resto.',
      'O JOGO PAROU DE DESACELERAR COM A ABA MINIMIZADA. Deixar a aba em segundo plano fazia o navegador estrangular o relogio do jogo, e o seu progresso passava a ser creditado em intervalos cada vez maiores. Agora o ritmo se mantem com a aba escondida, e voltar pra ela fecha a conta na hora em vez de esperar o proximo ciclo.',
      'E VOLTAR PRA ABA NAO CONGELA MAIS O JOGO NO AVISO DE AREA NOVA. Aquele "Entrando em nova area" dura tres segundos DE JOGO — e com a aba escondida o jogo anda devagar, entao os tres segundos viravam minutos de tela parada depois que voce voltava. Agora a troca acontece no ato do retorno.',
    ],
  },
  // PH-234 + PH-235. Entrada da promocao de 28/08, escrita ANTES de promover — o
  // gate da regra e conferir o INTERVALO desde a nota anterior, e nao a issue
  // que motivou a promocao.
  //
  // REVARRIDA em 28/08 (PH-235): a PR de promocao (#201) tem `head: dev`, entao
  // o diff dela CRESCE a cada merge na `dev` depois de aberta — de 28 pra 34
  // commits neste caso. O lure entrou na `dev` DEPOIS de a #201 estar aberta e
  // virou parte da promocao sem passar por nenhum gate novo. E o mesmo buraco
  // que a 7.13 e a 7.14 existiram pra tapar, chegando por outra porta: nao e
  // "esqueceram de escrever a nota", e "a nota foi escrita e o intervalo mudou
  // embaixo dela".
  //
  // Licao pra proxima: conferir o intervalo `main..dev` DE NOVO na hora de
  // aprovar a promocao, nao so na hora de abrir.
  //
  // Duas das tres coisas aqui foram EXCLUIDAS DE PROPOSITO da 7.14, e o
  // comentario dela diz por que:
  //  - o sistema de boss estava meia-feature ("na `main` ele existe so no bioma
  //    igneo, sem apresentacao visual e sem selo no menu"). A regra manda
  //    esperar a versao completa e dar entrada propria. E esta.
  //  - o PH-222 tinha mergeado na `dev` DEPOIS da promocao #186, entao ainda
  //    nao estava em producao. Agora esta.
  //
  // O que fica de FORA, e por que:
  //  - PH-233 (vento compartilhado da cena). Esta em PR ABERTA e nao entra
  //    nesta promocao. E o caso mais facil de errar aqui: foi escrito no mesmo
  //    dia que o PH-232 e parece parte dele — nao e. O PH-232 promoveu, o
  //    PH-233 nao.
  //  - Internals de flush e de boss (PH-217 a PH-220), enforcement do gate no
  //    servidor (PH-227, que o jogador so percebe pela mensagem do menu, ja
  //    coberta abaixo), ordem canonica como constante (PH-223) e wiring de
  //    `bioma_progress` (PH-224). Encanamento: o que o jogador ve deles ja esta
  //    nas linhas do boss.
  //  - Refactor, CI e as bancadas de `scripts/harness/` (efeitos do mapa e a de
  //    custo do lure, PH-235). Mesma regua da 7.11 a 7.14.
  //  - Do PH-235, tudo o que nao e a mecanica em si: a coluna
  //    `auto_lure_config`, a RPC que a valida, o `db:types` e a bancada de
  //    medicao. O que o jogador ve e a aba, o chip e o comportamento.
  //
  // SEGUNDA REVARRIDA, tambem em 28/08 (PH-250) — e a licao acima acontecendo
  // DE NOVO, no mesmo dia em que foi escrita. Depois da primeira revarrida,
  // mais quatro PRs entraram na `dev` (#206 a #209) e o intervalo foi de 34 pra
  // 49 commits. Duas delas sao player-facing e ganharam linha aqui: PH-245
  // (missoes) e PH-246 (especialidades). Nao viraram 7.16 porque a 7.15 nao foi
  // promovida — nenhum jogador leu — e a regra e uma entrada por PROMOCAO, nao
  // por leva de trabalho.
  //
  // Delas fica de fora, pela mesma regua de sempre:
  //  - PH-248 (`database.types.ts` regenerado depois da tabela nova) e PH-249
  //    (par de migrations com carimbo duplicado travando o `db push`).
  //    Encanamento puro: o jogador nao ve nem sente nenhum dos dois.
  //  - De PH-245 e PH-246, o gerador, a tabela `missao_cadeia`, o custo em
  //    tabela e os testes de contrato. O que o jogador ve e a cadeia que
  //    funciona e o preco que ele consegue pagar.
  //
  // TERCEIRA REVARRIDA, em 29/08 (PH-268) — a mesma licao, pela terceira vez na
  // mesma entrada: a PR de promocao tem `head: dev`, entao o intervalo cresce
  // embaixo da nota enquanto ela esta aberta. Desde a segunda revarrida a `dev`
  // recebeu mais 13 commits nao-merge (PH-254 e a leva PH-256 a PH-267).
  //
  // Continuam na 7.15 em vez de virar 7.16 pela regra de sempre: UMA entrada
  // por promocao. A 7.15 ainda nao subiu, entao nenhum jogador leu o que ja
  // estava escrito aqui.
  //
  // Do que entrou agora, fica de FORA:
  //  - As bancadas de medicao de `scripts/harness/` (spawn da hunt inicial,
  //    divergencia de quota). Mesma regua das anteriores.
  //  - A heranca de sala no `/sessao/abrir` e a copia do protetor pendente
  //    (PH-266) COMO MECANISMO — o que o jogador ve e "o F5 nao me joga mais
  //    pra sala 1", e essa linha existe.
  //  - O `trilhoHeight` medido, a uniao de `missoesReivindicadas` no flush e o
  //    `limiteDeInimigos` (PH-257/265/259). Encanamento das linhas que estao
  //    logo abaixo.
  //  - Testes e a resolucao do conflito de HudLayer entre PH-257 e PH-261.
  //
  // QUARTA REVARRIDA, no mesmo dia (PH-270 e PH-271). Estas duas nao vieram de
  // pedido nem de leitura de codigo: sairam de TESTAR O JOGO no `jogo-dev`
  // depois da leva pronta — o campo do Auto-pot cortando o segundo digito e o
  // sub-bioma trocando dentro da mesma sala. As duas entraram em linhas que ja
  // existiam (painel de automacoes e troca de sala), porque sao a mesma coisa
  // que aquelas linhas contam.
  //
  // O que fica de fora delas: o `jogo-campo-sem-spinner` e o valor novo de
  // `ESPERA_MAXIMA_PELA_AUTORIDADE`. Encanamento — o jogador ve o numero
  // inteiro e a area parada, nao a constante.
  //
  // QUINTA REVARRIDA, ainda em 29/08 (PH-276). Mesma causa das quatro
  // anteriores: a PR de promocao tem `head: dev`, entao o intervalo cresce
  // embaixo da nota enquanto ela espera revisao. Entraram a terceira correcao
  // de PH-271 e a PH-273 — as duas achadas TESTANDO no `jogo-dev` depois da
  // leva pronta, nenhuma vinda de pedido ou de leitura de codigo.
  //
  //  - PH-271 nao ganha linha nova: "a area parou de trocar sem voce sair da
  //    sala", que ja esta escrita aqui, e exatamente o que a correcao entrega.
  //    Foram tres tentativas ate acertar, e o jogador ve uma coisa so.
  //  - PH-273 ganha linha propria, logo depois daquela. As duas linhas de sala
  //    que ja existiam falam de sala nascendo VAZIA e de troca com a barra pela
  //    METADE; hunt parada com a barra CHEIA e um terceiro jeito de a hunt
  //    morrer, e o jogador nao tem como saber que sao o mesmo assunto.
  //
  // Fica de fora: a bancada `scripts/harness/janela-do-protetor.mjs` (mesma
  // regua das outras bancadas) e o valor novo de `REPETIR_PEDIDO_DE_SALA_MS`. O
  // jogador ve a hunt andando, nao a constante.
  //
  // SEXTA REVARRIDA, na noite de 29/08 (PH-286). Entrou uma leva inteira de HUD,
  // toda pedida pelo usuario TESTANDO o jogo: PH-272, 275, 279, 280, 281, 282 e
  // 283.
  //
  // As quatro de LAYOUT (sala dentro do cabecalho, taxas no canto de baixo,
  // carteira dentro do card, card colado na borda) viraram UMA linha. O jogador
  // nao percebe quatro mudancas — ele percebe que a tela ficou arrumada, e
  // quatro linhas descrevendo cada peca leriam como changelog de dev.
  //
  // Ganham linha propria, porque nao sao "arrumar a tela":
  //  - o nome do golpe aparecendo na placa do POKE (PH-275 + PH-283);
  //  - o POKE que parou de andar-e-parar com o Lure (PH-280). Essa linha tambem
  //    CONSERTA uma promessa que a 7.15 ja fazia: a linha do Lure dizia que um
  //    chip no topo mostrava a reuniao "pra nao parecer que o bot travou", e o
  //    chip saiu na PH-279. Anunciar um chip que nao existe mais seria mentira
  //    na primeira versao em que o jogador leria a nota.
  //
  // Fica de fora: as bancadas de `scripts/harness/`, a extracao de `Carteira` e
  // `CardDoTreinador` pra arquivos proprios (codigo movido, nao escrito) e as
  // fracoes da coleira do Lure. O jogador ve o POKE andando direito, nao o
  // limiar.
  //
  // SETIMA REVARRIDA, em 30/08 (PH-295). Mesma causa das seis anteriores, e ela
  // nao vai embora sozinha: a PR de promocao tem `head: dev`, entao o intervalo
  // cresce embaixo da nota enquanto ela espera revisao humana.
  //
  // Esta leva e diferente das outras seis: foi a primeira vez que alguem foi
  // CONFERIR se o sistema de boss/andares que esta nota anuncia funcionava de
  // fato. Nao funcionava, por dois caminhos independentes, e os dois ganham
  // linha propria:
  //
  //  - PH-284: o progresso de bioma era calculado certo e DESCARTADO na
  //    gravacao — a RPC que grava a linha do jogador tem lista fixa de colunas e
  //    a coluna do progresso nunca entrou nela. E isto que fazia a promessa
  //    "vencer o boss abre o proximo bioma", ja escrita nesta mesma entrada, ser
  //    falsa na pratica. Promover a 7.15 sem esta linha seria anunciar uma
  //    coisa que nao acontece.
  //  - PH-291: o botao "Proximo Nivel" pulava o protetor vivo, entao quem usava
  //    o avanco manual fechava o ciclo sem NUNCA vencer o Lord. Linha propria
  //    porque o jogador ve outra coisa: o botao que some e o aviso de que falta
  //    derrotar o guardiao.
  //
  // As outras tres se explicam sozinhas: PH-247 (Clefairy), PH-205 (captura do
  // protetor) e PH-255 (efeito de ambiente em cinco artes). PH-294 (dois
  // rotulos cortados) entra na linha de tela que ja existe, do mesmo jeito que
  // as quatro de layout viraram uma.
  //
  // Fica de fora: PH-277 (sessao abandonada fecha sozinha), PH-278 (piso da
  // janela de simulacao), PH-106/187/288/289/290 (CI, deploy, tipos do banco) e
  // PH-293 (CORS do cliente de staging, que nem alcanca producao). Nenhum muda o
  // que o jogador ve — mesma regua da 7.11 pra ca.
  //
  // OITAVA REVARRIDA, na tarde do MESMO 30/08 (PH-295 reaberta). A setima foi
  // escrita de manha; a tarde rendeu outra leva, e a nota continua sendo a 7.15
  // pela razao de sempre — ela ainda nao subiu, entao nenhum jogador leu nada
  // disto.
  //
  // Esta leva veio quase toda de EXPLICACAO: coisas que o jogo mostrava e nao
  // dizia. Elas viram DUAS linhas, e nao cinco, porque pro jogador sao uma coisa
  // so ("agora da pra entender o que esta na tela"):
  //
  //  - PH-165 e PH-285: sala, carteira e clima passaram a explicar o que sao, e
  //    o clima saiu do meio do campo de jogo. A linha do clima que ja existia
  //    aqui foi REESCRITA em vez de duplicada — ela dizia so que o clima lista
  //    os efeitos, e agora ele tambem diz onde mora e quanto dura.
  //  - PH-296: a bolha de explicacao abria no CANTO DA TELA em vez de junto do
  //    que ela explica, e no celular vazava pra fora. Entra junto porque sem ela
  //    a explicacao nova apareceria no lugar errado; anunciar as duas separadas
  //    seria contar o conserto de um defeito que so existiu entre uma e outra.
  //
  // Ganham linha propria:
  //  - PH-287: o sino do Correio dizendo O QUE falta. E a resposta a um relato
  //    ("o badge nao limpa") que a PH-213 fechou como nao reproduzido — o estado
  //    sempre esteve certo, faltava a tela dizer que o que sobrou era um item
  //    por coletar, e nao uma mensagem por ler.
  //  - PH-292: o avanco manual de sala voltou a funcionar. Ele estava inerte
  //    desde que todas as salas ganharam protetor, e quem ligava o toggle nao
  //    via diferenca nenhuma.
  //
  // Fica de fora desta leva: PH-290 (versao do CLI no CI), PH-297 (fim do review
  // manual — processo, nao jogo) e a fatia 1 da PH-120 (a mesa da troca direta
  // existe no banco, e nada na tela ainda). Meia-feature nao entra: mesma regra
  // do boss, que esperou os doze biomas pra ser anunciado.
  {
    version: '7.15',
    // A data e a da leva mais RECENTE que a nota cobre, e nao a da primeira
    // escrita: e uma entrada por PROMOCAO, e a promocao ainda nao saiu.
    date: '2026-08-30',
    title: 'Farm em area, o boss guardando os doze biomas — e as Missoes finalmente dando pra terminar',
    highlights: [
      'AGORA VOCE PODE JUNTAR ATE QUATRO SELVAGENS ANTES DE BATER. Seu POKE sempre andava ate o mais proximo e lutava um por vez, entao golpe de area nunca acertava mais de um alvo — ele existia e nao servia pra nada. Com o Lure ligado (aba nova no painel de Automacoes) ele passa pelo raio de varios, puxa o grupo atras de si e so entao para pra lutar: um golpe de area acerta todos de uma vez. Voce escolhe juntar 1, 2, 3 ou 4 no painel.',
      'O PRECO DO LURE E LEVAR PANCADA DE TODOS AO MESMO TEMPO. Nao e farm de graca: juntar quatro multiplica o dano que entra no seu POKE, e o ganho depende de ter golpe de AREA na rotacao — sem um, o grupo so bate mais em voce. Shiny em campo cancela a reuniao na hora (ele continua tendo prioridade), e hunt de um inimigo so, como as de boss, ignora o Lure.',
      'E O LURE PAROU DE COMECAR A BRIGA NO MEIO DA REUNIAO. Ele juntava o grupo e batia ao mesmo tempo: bastava um selvagem encostar pra o seu POKE parar pra lutar com ele, e a conta que voce pediu nunca fechava. Agora o golpe fica segurado ate a reuniao terminar — primeiro junta os quatro, depois luta. Enquanto junta, seu POKE apanha sem revidar, entao o Lure ficou mais forte e mais arriscado ao mesmo tempo.',
      'O BOSS AGORA EXISTE NOS DOZE BIOMAS, NAO SO NO IGNEO. Ele tinha nascido em um bioma so, como piloto, e ficou la. Agora cada um dos doze tem o seu, na ordem canonica do mapa.',
      'E VENCER O BOSS E O QUE ABRE O PROXIMO BIOMA. O jogo passou a ter uma linha pra seguir: a area seguinte fica trancada ate voce derrubar o dono da atual. O menu de hunt diz quem esta trancado e o que falta — antes o botao simplesmente nao levava a lugar nenhum, sem explicar.',
      'E ELE ABRE DE VERDADE — ANTES O PROGRESSO ERA CONTADO E JOGADO FORA. Voce fechava as dez salas, derrubava o Lord, e o bioma seguinte continuava trancado; fechava de novo, e de novo, e nada. O jogo contava certo e a gravacao descartava o numero em silencio, sem erro nenhum na tela. Agora ele e guardado — e quem ja tinha fechado ciclo antes desta correcao recebeu o credito retroativo, sem precisar refazer nada.',
      'O ATALHO DE TROCAR DE SALA PAROU DE PULAR O GUARDIAO. Com o avanco manual ligado, dava pra passar pra sala seguinte com o guardiao (ou o Lord) ainda de pe — e quem fazia isso fechava o ciclo inteiro sem nunca vencer o dono do bioma, entao nunca destravava a area seguinte. Agora, enquanto ele estiver vivo, a sala diz "Derrote o Guardiao" (ou o Lorde) e nao passa.',
      'CAPTURAR O GUARDIAO E O LORD FICOU MAIS DIFICIL. Eles caiam com a mesma chance de um selvagem qualquer, sendo que aparecem uma vez por sala, nascem no teto de nivel da area e vem com atributos que selvagem nenhum tem. A chance foi pela metade — continua sempre possivel, so deixou de ser o POKE mais barato da hunt.',
      'O BOSS TAMBEM PASSOU A SE APRESENTAR. Ele entrava em cena como qualquer outro encontro, e o unico jeito de saber que aquilo era o boss era a barra de HP nao acabar nunca. Agora a entrada dele tem apresentacao propria, e no menu ele tem selo.',
      'OS EFEITOS DO CENARIO GANHARAM ESCALA. Folha, poeira, faisca, neve e areia estavam grandes demais pro tamanho de um POKE — a poeira de caverna chegava a um quarto da altura de um Pokemon — e quase todo bioma mostrava a mesma bolinha em outra cor. Agora cada um tem tamanho e formato proprios: a folha tomba, a faisca risca, a cinza urbana e uma fibra dobrada, o reflexo da agua e uma cruz de luz.',
      'E A CHUVA MOLHA O CHAO. As gotas caem, batem e respingam, com microgotas que quicam em volta. Selva e caverna ganharam gotejo proprio, pingando sempre do mesmo ponto, do jeito que agua parada na copa e em teto de gruta pinga.',
      'O NIVEL PAROU DE SUMIR NO F5. Subir de nivel e recarregar a pagina logo em seguida podia devolver o POKE no nivel anterior: a ultima gravacao nao chegava a sair. Agora ela sai.',
      'UM SHINY NA TELA PODIA DESPENCAR O ATAQUE DO INIMIGO E ENCHER O CHAT. Com um shiny em campo e outro selvagem colado em voce, a habilidade de entrada em combate do seu POKE — Intimidate, por exemplo — disparava a cada quadro em vez de uma vez por luta: o Ataque do oponente caia ate o fundo em menos de um segundo e o chat levava uma linha por quadro. Agora ela dispara uma vez, como deveria.',
      'AS MISSOES DE TIPO AGORA DAO PRA TERMINAR — QUATRO DELAS TRAVAVAM LOGO NA PRIMEIRA. Fogo, Agua, Planta e Veneno pediam, de cara, abates de Charmander, Squirtle e Bulbasaur — e nenhum dos tres aparece como selvagem em lugar nenhum do jogo. Como a cadeia so libera a seguinte quando voce fecha a anterior, essas quatro nunca saiam do lugar, e ao todo 148 das 359 missoes eram impossiveis. Agora nenhuma missao pede POKE que voce nao encontra.',
      'E A ORDEM DAS MISSOES PASSOU A SEGUIR A DIFICULDADE, NAO O NUMERO DA POKEDEX. A primeira missao de Voador era Charizard; a de Gelo pedia 150 Articunos no quinto degrau. Cada cadeia agora comeca pelo POKE mais facil de achar daquele tipo e vai subindo, e lendario saiu de todas elas — ele aparece 20 vezes menos que um comum e travava tudo o que vinha depois. A recompensa acompanhou: antes o ouro por abate mudava ate 7,6 vezes so dependendo do tipo que voce escolhesse, e agora e praticamente o mesmo em todos os 18, com o bonus de conclusao crescendo junto com o tamanho da cadeia.',
      'A ESPECIALIDADE DE VOADOR ERA IMPOSSIVEL DE COMPRAR, E A TELA COBRAVA POR ELA MESMO ASSIM. A Pedra VOADOR nao caia de lugar nenhum: o drop olhava so o tipo primario do POKE abatido, e nenhuma especie do jogo tem Voador como primario. Agora POKE de dois tipos solta a pedra de um dos dois, entao Voador tem fonte — e o progresso de 100% deixou de ser inalcancavel.',
      'E O PRECO DAS ESPECIALIDADES PASSOU A LEVAR EM CONTA A RARIDADE DA PEDRA. Como cada pedra so cai do POKE do tipo dela, fechar as duas trilhas custava 18.800 abates em Fogo e 162.933 em Aco — nove vezes mais caro, sem nada que justificasse. Os tipos comuns seguem no mesmo preco de antes; os raros ficaram proporcionais ao que realmente aparece. A trilha de defesa tambem teve o texto corrigido: ela reduz o dano que voce RECEBE daquele tipo, e nao aumenta sua defesa.',
      'A SALA NOVA AS VEZES NASCIA VAZIA, E A HUNT MORRIA ALI. Depois de trocar de sala podia acontecer de nao nascer inimigo nenhum: campo limpo, nada pra matar, a contagem parada — e como a sala so avanca com 30 abates, a hunt ficava presa pra sempre naquele mapa. Recarregar a pagina era a unica saida. Corrigido: o guardiao da sala anterior ficava pendurado no lugar e desligava o nascimento dos selvagens.',
      'E A TROCA DE SALA PAROU DE ACONTECER COM A BARRA PELA METADE. Quem manda na contagem e o servidor, e o numero da sua tela e uma previsao — quando os dois discordavam, a area trocava mostrando 12/30 e parecia que o jogo tinha pulado a sala. Agora a barra fecha em 30/30 antes do aviso de area nova, que e o que de fato aconteceu.',
      'E A AREA PAROU DE TROCAR SEM VOCE SAIR DA SALA. Acontecia de o sub-bioma mudar sozinho — de Relvado pra Planicie, por exemplo — com o contador continuando em "Sala 2/10": quando o servidor demorava a responder, o jogo chutava a sala seguinte e depois se corrigia na sua frente. Ele agora espera de verdade antes de chutar qualquer coisa.',
      'E O SEU POKE PAROU DE ANDAR TRAVANDO ENQUANTO REUNE. Com o Lure ligado ele dava uns passos, parava, andava de novo — varias vezes por segundo, e parecia que o jogo estava engasgando. Ele parava de proposito (pra nao arrastar o grupo pra longe de quem ainda estava vindo atras), so que decidia isso a cada instante e ficava trocando de ideia. Agora, quando para pra esperar, ele espera de verdade: sao 40 vezes menos paradas no caminho.',
      'A TELA DE JOGO FOI ARRUMADA. A sala em que voce esta subiu pro cabecalho, no centro; as taxas de Gold/h, XP/h e Mobs/h desceram pro canto de baixo a direita; o seu ouro e o diamante entraram no cartao do treinador, ali no canto de cima (abreviados: 1B, 1M); e o proprio cartao agora fica colado no canto em qualquer tamanho de janela — antes, em tela larga, ele parava no meio do caminho. O que sobrou no meio da tela foi embora.',
      'O NOME DO GOLPE APARECE NO SEU POKE, LOGO ABAIXO DA VIDA. Antes ele subia junto com os numeros de dano, misturado com o que os OUTROS estavam levando — agora ele fica colado na barra de quem usou o golpe, com fundo proprio pra dar pra ler mesmo no meio da explosao. E a porcentagem de vida saiu de cima do seu POKE: ela ja esta no cabecalho, e no campo so atrapalhava. A do alvo continua, que e a unica que voce nao tem em outro lugar.',
      'E A HUNT PAROU DE EMPACAR COM A BARRA CHEIA. Acontecia de a sala fechar os 30 abates e simplesmente nao passar: barra cheia, o guardiao em pe, e voce matando sem que nada andasse — em alguns casos por mais de dez minutos, ate voce desistir e sair. O jogo cobrava a area seguinte de tanto em tanto segundo, e essa pressa era justamente o que impedia o servidor de terminar a luta com o guardiao. Ele agora pergunta no ritmo certo, e a sala vira.',
      'O F5 PAROU DE TE MANDAR DE VOLTA PRA SALA 1. Recarregar a pagina no meio da hunt jogava voce na primeira sala do primeiro ciclo, perdendo o caminho inteiro. Agora voce volta na MESMA sala, com os mesmos abates e o mesmo ciclo — e se havia um guardiao em pe, ele continua la, com a vida que tinha.',
      'REIVINDICAR MISSAO RESPONDIA "MISSAO JA REIVINDICADA" E NAO PAGAVA. A tela voltava a oferecer, a cada 30 segundos, uma missao que voce ja tinha reivindicado; ao clicar de novo, o jogo recusava. O ouro da primeira vez sempre foi pago — o que sumia era a marca na tela.',
      'A HUNT INICIAL PAROU DE SER UMA CAMINHADA. So havia um selvagem no mapa inteiro, e o POKE passava metade do tempo atravessando o cenario ate o proximo. Agora eles nascem mais perto e o campo enche conforme seu inicial cresce: um ate o Nivel 2, dois a partir do 3, tres a partir do 5. Eles continuam nascendo longe uns dos outros, entao voce enfrenta um por vez — a primeira meia hora de conta nova era o unico lugar do jogo onde dava pra morrer sem entender por que.',
      'IR PRO HOSPITAL AGORA LEVA 3 SEGUNDOS. Era instantaneo, e virou botao de fuga: qualquer aperto em campo se resolvia saindo antes do proximo golpe. Agora ha uma contagem na tela — e da pra cancelar, se voce clicou sem querer.',
      'O CLIMA EXPLICA O QUE ELE FAZ, E SAIU DA FRENTE DO JOGO. Ele boiava no meio do campo; agora fica no cabecalho, ao lado da sala. Passe o ponteiro (ou toque) e ele lista os efeitos reais daquele tempo: quanto Agua ganha na chuva, quanto Fogo perde, quanto de vida o granizo e a areia tiram por turno, o que a neve muda pro tipo Gelo e quais golpes nunca erram — e, quando o clima veio de um golpe, quantos turnos ainda faltam pra ele passar. Antes so o nome aparecia, e o resto era adivinhacao.',
      'A SALA E A CARTEIRA TAMBEM PASSARAM A SE EXPLICAR. Toque no chip de sala e ele conta quantas salas a hunt tem, quantos abates cada uma pede e o que acontece ao limpar a ultima; com o Guardiao segurando a passagem, ele diz isso tambem. Na carteira aparece o valor EXATO do ouro e do diamante — no celular o numero vinha abreviado ("1B") e nao havia jeito nenhum de ver quanto era de verdade.',
      'E AS EXPLICACOES PARARAM DE ABRIR NO CANTO DA TELA. A bolha de qualquer card — golpe, item, POKE do chat, clima, sala — nascia grudada no alto a esquerda em vez de junto do que ela explica, e no celular ainda vazava pra fora da tela. Agora ela abre encostada no que voce tocou.',
      'O SINO DO CORREIO DIZ O QUE FALTA, E NAO SO QUANTOS. Uma carta com item dentro conta duas vezes: uma como mensagem por ler, outra como presente por pegar. Voce lia a mensagem, o numero caia de 2 pra 1 e o sino continuava aceso sem explicar — parecia travado. Agora ele diz "1 mensagem por ler e 1 item por coletar", e a conversa que tem presente preso mostra "por coletar" na lista.',
      'O AVANCO MANUAL DE SALA VOLTOU A FUNCIONAR. Ligar a opcao no painel de Automacoes nao fazia mais nada desde que todas as salas ganharam Guardiao: a sala trocava sozinha assim que ele caia. Agora ela espera o seu clique, e os selvagens continuam nascendo enquanto voce fica — que e o motivo de ligar a opcao.',
      'ESPECIALIDADES, TASKS E BESTIARIO SAIRAM DE DENTRO DO "MAIS". Os tres estavam a dois toques de distancia, no mesmo lugar que a Wiki e os Ajustes. Agora tem coluna fixa no canto superior direito, logo abaixo do seu card de treinador.',
      'A COLUNA DO TOPO FICOU MAIS FACIL DE LER. As reservas encostaram no POKE em campo (elas sao a fila dele, e havia um chip no meio separando os dois), e a sala/clima passou pro centro. A faixa preta do chat parou de atravessar a tela inteira pra escrever "Item encontrado: Potion" — ela agora tem o tamanho do texto.',
      'E O PAINEL DE AUTOMACOES PAROU DE ESCONDER NUMERO. Numa janela estreita, o nome do item empurrava a contagem pra fora e o aviso de "suprimentos acabando" cortava justamente as horas restantes. As regras por especie tambem espremiam o nome do POKE em cinco letras. E o campo de "Vida ≤ __ %" do Auto-pot mostrava so o primeiro digito: a regra padrao de 70% aparecia como 7%, que e a diferenca entre curar cedo e curar quase morto.',
      'A BARRA DE VIDA DO LENDARIO VOLTOU AO TAMANHO NORMAL. Ela era cinco vezes mais larga e duas vezes mais alta que a de qualquer selvagem. A escala maior, a aura e o nome continuam distinguindo ele em campo; a barra gigante ficou so pro guardiao de sala.',
      'O CENARIO GANHOU FONTES DE VIDA ANCORADAS NO MAPA. Tocha com chama, chamine com fumaca, cristal brilhando, espuma quebrando na pedra, faisca de forja e enxame de vaga-lume: cada arte tem os seus, sempre no mesmo ponto, em vez de particula solta atravessando a tela.',
      'E CINCO MAPAS PARARAM DE MOSTRAR O EFEITO DE OUTRO LUGAR. A mata noturna tinha fiapo de cidade voando no meio da floresta, o jardim do dojo levava poeira seca por cima das cerejeiras e do rio de carpas, o covil do dragao tinha poeira em vez de faisca com um rio de lava atravessando a tela, e o vale verde da montanha nevava sobre as flores. Cada um deles foi conferido olhando o desenho, e nao o nome do arquivo.',
      'CLEFAIRY VOLTOU A EVOLUIR. A ficha mandava juntar 40 Pedras de Fada e o servidor exigia 40 Pedras Normais — quem farmasse o que a tela pediu (uns 800 abates do tipo certo) tomava recusa no fim, sem nada explicando. Os dois lados agora falam do mesmo tipo.',
      'E DOIS TEXTOS QUE APARECIAM CORTADOS. A sigla do golpe de area mostrava um parenteses no lugar da terceira letra, e o botao de comprar da Loja perdia o "C" — virava "omprar 1 · 60", com o preco em risco de sumir junto no item mais caro.',
    ],
  },
  // PH-231. Varredura do INTERVALO desde a 7.13 (a licao que aquela entrada
  // deixou escrita): a 7.13 cobriu ate a promocao #149, e desde entao a `main`
  // recebeu as promocoes #156, #159, #167 e #186 — a ultima (27/08 13:50) com
  // `Supabase deploy` verde, migrations e Edge publicadas. Treze mudancas
  // player-facing entraram sem nota.
  //
  // O que fica de FORA, e por que:
  //  - SISTEMA DE BOSS/ANDARES (PH-200 a PH-229). Na `main` ele existe so no
  //    bioma igneo, sem apresentacao visual (PH-228) e sem selo no menu
  //    (PH-229) — o Otavio esta fechando o resto na `dev`. Meia-feature nao
  //    entra em nota; ela ganha entrada propria quando a versao completa
  //    promover.
  //  - PH-222 (trailing edge do commitAgora) mergeou na `dev` DEPOIS da
  //    promocao #186 — ainda nao esta em producao.
  //  - Egress de PostgREST (PH-185/186), camada de VFX acima da HUD (PH-190, e
  //    o encanamento do voo de ouro do PH-191), internals de flush e boss
  //    (PH-217 a PH-220), fixes de CI. Nenhum muda o que o jogador ve. Mesma
  //    regua da 7.11 a 7.13.
  {
    version: '7.14',
    date: '2026-08-27',
    title: 'Comemoracao nos tres marcos do jogo, o ouro voando ate a carteira, e dois menus novos',
    highlights: [
      'SUBIR DE NIVEL, EVOLUIR E ACHAR UM SHINY GANHARAM COMEMORACAO. Os tres marcos do jogo avisavam com a mesma linha de toast que rolava e sumia. Agora nivel comum mostra um chip rapido com os atributos ganhos; nivel com golpe novo, multiplo de 5 ou o 100 mostra um cartao central; evolucao e shiny mostram um cartao grande com antes -> depois. Abates seguidos que sobem varios niveis de uma vez juntam tudo num cartao so (Lv 33 -> 36) em vez de travar a tela repetindo, e a preferencia de menos movimento do sistema e respeitada.',
      'O OURO E O XP DO ABATE VOAM ATE A CARTEIRA. Cada abate soltava dois textos, verde e dourado, sobre a grama — na mesma faixa estreita onde o numero de dano precisa aparecer. Agora as moedas nascem no POKE derrotado, sobem em leque e voam em arco ate a carteira do trilho, que pulsa na chegada com o valor exato logo abaixo. A informacao passou a chegar no numero que ela muda.',
      'NOVO MENU: ESPECIALIDADES — MAESTRIA DE ELEMENTOS. Dezoito tipos elementais, cada um com dez niveis: cinco de bonus de dano (+1% por nivel, ate +5%) e cinco de bonus de defesa, trilhas independentes. Cada nivel custa um item do tipo mais ouro, com o preco subindo a cada degrau. O bonus vale no combate, e o progresso somado dos 180 niveis possiveis da um titulo global.',
      'NOVO MENU: TASKS & MISSOES. Uma cadeia de missoes de abate por tipo elemental — derrotar a especie da posicao N libera a N+1. O progresso vem dos abates que voce ja fez (o mesmo contador do Bestiario, nao ha meta nova pra encher), cada missao reivindicada paga ouro, e fechar a cadeia inteira de um tipo da um bonus.',
      'VOCE PODE SEGURAR A HUNT NUMA SALA SO. Fechar os 30 abates de uma sala sempre levou pra proxima sozinho. Agora ha um interruptor por hunt: com ele ligado a sala trava em 30/30 e um botao de proximo nivel faz o avanco quando voce quiser. Farm offline de horas de verdade continua avancando sozinho de qualquer jeito.',
      'A HUD DE BATALHA FICOU LEGIVEL EM CINCO PONTOS. O nome do alvo saia quase apagado sobre a grama e ganhou fundo. As duas porcentagens do trilho agora dizem HP e XP em vez de dois numeros soltos. O nome do POKE parou de truncar quando ha espaco sobrando na linha. As reservas mostram a especie, nao so o nivel, e a reserva desmaiada tem selo KO em vez de depender so da foto acinzentada. Golpes do mesmo tipo elemental ganham uma sigla no canto pra voce distinguir sem abrir a ficha.',
      'O CABECALHO E O TRILHO DE RESERVAS ENCOSTARAM NO CANTO. Ficavam meio dedo pra dentro da borda, e cada reserva era um card solto com borda propria — seis mini-janelas empilhadas. Agora a coluna cola na borda superior esquerda e as reservas leem como um bloco unico.',
      'O JOGO AVISA QUANDO SEU POKE PASSOU DO TETO DA HUNT. Um Noctowl de Nivel 33 rodou 4h39min numa hunt de teto Nivel 30 sem mudar de nivel, e nada na tela dizia por que. Agora, ao entrar numa hunt facil demais pro nivel do POKE ativo, um aviso diz que o XP dali pra frente rende pouco.',
      'O AVISO DE CAPTURA PAROU DE ENTREGAR O RESULTADO ANTES DA POKEBOLA. Capturado! e a captura falhou! apareciam no instante do arremesso, antes de a bola terminar de balancar na tela. Agora a narracao espera a animacao terminar.',
      'A BARRA DE XP PAROU DE VOLTAR SOZINHA DURANTE A HUNT. O servidor reconfere cada janela de 30 segundos pelo relogio dele, e o corte as vezes fechava um pouco antes do ponto que voce ja tinha visto na tela — a barra parecia regredir sem voce ter perdido nada. Agora a queda so passa quando houve perda real por desmaio.',
      'SUMIU AQUELE TOAST VERMELHO COM [diag-sala] E UM MONTE DE NUMERO. Era instrumentacao interna que vazou pra producao pela promocao de 26/08 — pro jogador, uma mensagem de erro incompreensivel no meio do jogo.',
      'O VENTO PASSOU A APARECER NA VEGETACAO. A folha caia numa deriva constante; agora ha rajadas periodicas em que ela acelera e balanca de lado por alguns segundos, como vento passando pela copa.',
      'O VULCAO GANHOU BRILHO DE LAVA RENTE AO CHAO. Antes so a brasa subia da fonte; agora uma faixa de luz pulsa perto da base da tela nas artes de vulcao e de caverna vulcanica.',
    ],
  },
  // PH-166. ENTRADA RETROATIVA — e a unica do arquivo que descreve codigo que JA
  // ESTAVA NO AR quando ela foi escrita. Os cinco itens abaixo subiram na
  // promocao #141 (25/08) e o jogador vinha usando todos sem aviso nenhum.
  //
  // Como o buraco aconteceu: a 7.10 saiu na PR #108 e o clima entrou nas #110,
  // #111 e #112 — mesmo dia, logo depois. A 7.11 e a 7.12 vieram no dia seguinte
  // tratando de OUTRO assunto (evolucao, golpes de Nivel 1) e ninguem voltou pra
  // cobrir a janela. Nao houve decisao de excluir: os comentarios de exclusao da
  // 7.11 e da 7.12 listam so item interno, e nenhum deles cita clima, Mercado ou
  // spawn. A licao pro proximo: a nota tem que ser conferida contra o INTERVALO
  // desde a anterior, nao contra a issue que a motivou.
  //
  // O que fica de FORA, e por que: o gate de migration do CI (PH-76), o peso
  // versionado de scripts/ (PH-163) e o inventario de explicacao flutuante
  // (PH-165). Os tres estao pendentes de promocao e nenhum muda o que o jogador
  // ve. Mesma regua da 7.12.
  {
    version: '7.13',
    date: '2026-08-25',
    title: 'O ceu deixou de ser sempre limpo — e mais quatro coisas que ja estavam no ar sem aviso',
    highlights: [
      'AGORA CADA SALA TEM CLIMA PROPRIO. Ate agora o clima so existia se um POKE gastasse o turno lancando Rain Dance e companhia — numa hunt normal o ceu estava sempre limpo. O clima e sorteado ao entrar na sala e vale enquanto ela durar, com a tabela de chance vindo do sub-bioma.',
      'DOIS CLIMAS NOVOS: Neve e Neblina. Com eles sao seis ao todo, junto de Chuva, Sol forte, Granizo e Tempestade de areia.',
      'UM SUBSISTEMA INTEIRO SAIU DA GAVETA. Chlorophyll, Swift Swim, Sand Rush, Rain Dish e Ice Body ja existiam no jogo e quase nunca disparavam, porque dependiam de um clima que nunca acontecia. Agora valem.',
      'E VOCE PASSA A VER O CLIMA. Cada um dos seis tem efeito desenhado na tela, e um chip no HUD diz qual esta valendo e o que ele faz. Antes disto um POKE podia perder 1/16 do HP por turno numa sala de deserto sem NADA na tela explicando por que.',
      'AS TELAS DE VENDA DO MERCADO GANHARAM BUSCA, FILTRO E ORDENACAO. Anunciar exigia cacar o item ou o POKE percorrendo a lista inteira na mao, e mochila e reserva so crescem com o tempo de jogo. POKE tem busca por nome, tipo, raridade e shiny, e ordenacao por nivel, IV, raridade e nome; item tem busca por nome e categoria. A busca ignora acento e maiuscula.',
      'POKE NAO NASCE MAIS EM BANDO. Cada inimigo era sorteado sem olhar onde os outros ja estavam, entao os seis podiam cair colados na mesma fatia da tela. Nao era so feio: era um pico de dificuldade que nao vinha da faixa de nivel da hunt, e nada denunciava que aquilo tinha sido sorteio. Medida em 60 sementes, a menor distancia entre dois inimigos subiu de 3 para 81.',
      'O BOT PASSA A USAR MAX REVIVE. Ele so procurava Revive: quem tinha apenas Max Revive ficava com a automacao morta — o POKE desmaiava, nada levantava ele, e nada na tela explicava. O seletor sempre ofereceu os dois.',
      'E O AVISO DE SUPRIMENTO PAROU DE GRITAR A TOA. Ele contava item que voce tinha DESLIGADO na lista do bot, e ignorava substituto em estoque — cinquenta Max Revive nao calavam o aviso por Revive. Agora a conta e por familia de item.',
      'A EDICAO DOS 4 GOLPES DESTRAVOU NO HOSPITAL. Voltando pro Hospital, escolher golpe ficava indisponivel e so voltava com F5.',
    ],
  },
  // PH-159. Continuacao direta da 7.11: a mesma classe de mudanca, em mais 14
  // especies — e desta vez ela alcanca as Eeveelutions, que quase todo jogador
  // tem. Por isso ganha entrada propria em vez de virar rodape da anterior.
  //
  // A segunda linha CORRIGE o que a 7.11 prometeu errado (PH-158), e e por isso
  // que as duas entram juntas: elas ficam lado a lado no arquivo, e publicar a
  // nova sem consertar a antiga deixaria o painel se contradizendo na cara do
  // jogador.
  //
  // O que fica de FORA, e por que: o guarda de bundle da Edge (PH-133), o React
  // fora do servidor (PH-148), o parser unificado (PH-147), a guarda de
  // geometria de sprite (PH-149) e os dois `db:types` (PH-154). Todos internos.
  // Mesma regua da 7.11 e da 7.10.
  {
    version: '7.12',
    date: '2026-08-25',
    title: 'Mais quatorze POKE com menos golpes de Nivel 1, e as Eeveelutions entre eles',
    highlights: [
      'QUATORZE ESPECIES PERDERAM GOLPES DE NIVEL 1, E QUATRO DELAS SAO EEVEELUTIONS. Jolteon, Flareon, Espeon e Umbreon vinham com Tackle, Tail Whip e Helping Hand no Nivel 1 sem nunca terem aprendido nenhum dos tres. Entram na mesma lista Mr. Mime, Mantine, Bellossom, Slowking, Chansey, Sudowoodo, Marill, Snorlax, Hitmonchan e Hitmontop. Sao 47 golpes ao todo.',
      'O POKE QUE VOCE JA TEM MUDA TAMBEM — e a nota anterior disse o contrario. A lista de golpes de cada POKE e recalculada pela especie e pelo nivel toda vez que o jogo abre, entao golpe que sai da especie sai do seu junto. Nenhum slot fica vazio: o lugar e preenchido por outro golpe que ele conhece. A 7.11 prometia que nada mudava pra quem ja tinha, e a promessa estava errada.',
      'AQUELE BLOCO NUNCA FOI O KIT INICIAL DELAS. Era a lista do Recordador de Golpes do jogo original, que este jogo nao tem desde a 6.8, e ela entrava por engano em especie que o jogo nao reconhecia como forma evoluida — ou porque a pre-evolucao esta fora do elenco (Sudowoodo vem de Bonsly, que nao existe aqui), ou porque a especie e o SEGUNDO destino de uma evolucao com ramo, como as quatro Eeveelutions.',
      'O CASO MAIS VISIVEL ERA UM SUDOWOODO SELVAGEM DE NIVEL 1 BATENDO COM WOOD HAMMER. Sao 120 de poder, quase tres vezes o golpe de qualquer POKE da mesma faixa de nivel.',
      'QUATRO DELAS AGORA COMECAM SEM GOLPE NENHUM NO NIVEL 1: Marill aprende o primeiro no Nivel 2, Mantine no 3, Snorlax no 4 e Slowking no 5. Abaixo disso o POKE luta so com o Ataque Basico.',
      'AS BARRAS DE HP E XP DO TOPO PARARAM DE MUDAR DE TAMANHO, E AGORA MOSTRAM A PORCENTAGEM. Elas encolhiam e esticavam conforme o resto do cabecalho — um selo de status aparecendo ja bastava pra empurrar. O numero nunca arredonda pra 0% num POKE vivo, nem pra 100% num que ja levou dano.',
      'O NIVEL NA FICHA DO POKE ATUALIZA SOZINHO. Com o perfil aberto, subir de nivel deixava o Lv antigo na tela ate voce fechar e reabrir a janela.',
    ],
  },
  // PH-152. A maior mudanca de CONTEUDO desde que o elenco existe: 19 especies
  // novas e 36 caminhos de evolucao que estavam mortos.
  //
  // O que fica de FORA, e por que: o A* com heap (PH-102), o React fora do
  // bundle do servidor (PH-148), o parser unificado (PH-147) e a guarda de
  // geometria de sprite (PH-149). Todos internos — nenhum muda o que o jogador
  // ve. Mesma regua que a 7.10 usou pra deixar o teste de cobertura de face de
  // fora.
  {
    version: '7.11',
    date: '2026-08-25',
    title: 'Dezenove POKE novos, e as evolucoes que nunca aconteciam',
    highlights: [
      'EVOLUCAO POR PEDRA, TROCA E AMIZADE PASSOU A EXISTIR. Se voce tem um Growlithe guardado esperando virar Arcanine, ele nunca ia virar — o caminho simplesmente nao existia no jogo, e nada na tela dizia isso. Eram 36 evolucoes nessa situacao. Agora todas funcionam, no mesmo criterio das outras especiais: Nivel 80 e 40 pedras.',
      'DEZENOVE POKE NOVOS entraram no elenco, que foi de 226 pra 245. Eles nao existiam porque eram destino das evolucoes que nao aconteciam — sem o caminho, ninguem nunca chegava neles. Entram Raichu, Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Exeggutor, Poliwrath, Slowking, Vileplume, Bellossom, Crobat, Togetic, Starmie, Cloyster, Clefairy, Clefable, Wigglytuff e Hitmontop. Todos aparecem no mato e todos podem ser capturados.',
      'O EEVEE ESCOLHE PRA QUE EVOLUIR, E A PEDRA DIZ QUAL. Sao cinco caminhos e cada um cobra a pedra do tipo de destino: Flareon pede 40 Pedras de FOGO, Vaporeon de AGUA, Jolteon de ELETRICO, Espeon de PSIQUICO e Umbreon de SOMBRIO. Voce ve os cinco na ficha e escolhe qual perseguir.',
      'TYROGUE AGORA TEM TRES CAMINHOS — Hitmonlee, Hitmonchan e Hitmontop —, todos no Nivel 20 e sem pedra nenhuma. Antes eram dois.',
      'GLOOM, POLIWHIRL E SLOWPOKE tambem passaram a ter mais de um destino. Slowpoke e o caso curioso: Slowbro continua no Nivel 37 de graca, e Slowking cobra as 40 pedras — dois caminhos com precos diferentes.',
      'A CARA DO POKE MUDA EM MAIS OITO ESPECIES. O retrato no trilho de status reage a dor, tontura, sono e comemoracao; oito POKE tinham cara fixa por falta de desenho e agora usam uma expressao equivalente do mesmo acervo.',
      // PH-158 — esta linha prometia que nada mudava pra quem ja tinha o POKE,
      // e a promessa era FALSA. `playerMapper.ts` deriva `unlockedAbilities` de
      // (especie, nivel) em toda carga e ignora a coluna gravada, entao golpe
      // que sai do learnset sai do POKE salvo junto. Medido: `jolteon@80` nao
      // conhece mais tackle, tail_whip nem helping_hand.
      //
      // A frase existia pra tranquilizar, e foi o pior lugar possivel pra
      // errar: quem leu "nao perde nada" e viu a build trocada nao conclui que
      // a nota estava errada — conclui que o jogo bugou o POKE dele.
      'VINTE E UMA ESPECIES VEM COM MENOS GOLPES DE NIVEL 1. Steelix, Machamp, Nidoqueen e outras 18 tinham uma lista de golpes de Nivel 1 que so existia porque o jogo nao sabia que elas eram formas evoluidas. O POKE que voce JA TEM muda tambem: a lista de golpes de cada um e recalculada pela especie e pelo nivel toda vez que o jogo abre. Nenhum slot fica vazio — o lugar e preenchido por outro golpe que ele conhece.',
    ],
  },
  // PH-138. Curta de proposito: sao duas linhas, e a primeira e um aumento
  // RETROATIVO de requisito. Quem tinha 25 pedras guardadas parou de poder
  // evoluir, e a unica coisa que explica isso pro jogador e esta nota — a ficha
  // da pedra e a Pokedex dizem 40, mas quem nao abrir nenhuma das duas descobre
  // tentando e falhando.
  {
    version: '7.10',
    date: '2026-08-24',
    title: 'Evolucao especial passou a pedir 40 pedras',
    highlights: [
      'EVOLUCAO ESPECIAL AGORA CUSTA 40 PEDRAS do tipo primario do POKE, o dobro das 20 de antes. O Nivel 80 continua igual, e a pedra continua sendo a do PRIMEIRO tipo (Kadabra pede Pedra PSYCHIC, Onix pede Pedra ROCK). Vale pra quem ja tinha pedra guardada: se voce tinha 25 separadas pra evoluir, agora faltam 15.',
      'A MENSAGEM DE PEDRA FALTANDO parou de sair com letra sobrando — dizia "faltam 40sx Pedra BUGs". Era um erro de formatacao que estava ali desde que a evolucao especial existe.',
    ],
  },
  // PH-135. Primeira entrada que sai JUNTO com o codigo que ela descreve: a
  // 7.7 e a 7.8 existiam na `dev` desde 22 e 23/08, mas a `main` estava 174
  // commits atras, entao o jogador pulou da 7.6 pra ca de uma vez.
  {
    version: '7.9',
    date: '2026-08-24',
    title: 'O combate passou a explicar o que faz, e o POKE dos outros deixou de ser publico',
    highlights: [
      'PRIVACIDADE, E ESTA E A MAIS IMPORTANTE: qualquer jogador conseguia ler a ficha inteira do SEU POKE — os seis IVs, a natureza, a caracteristica, o que estava travado e quem foi o treinador original. Nao era so do POKE anunciado no Mercado: era de todos, inclusive os que voce nunca mostrou pra ninguem. Fechado. Agora so voce le os seus, e o que continua publico e o que sempre foi de propria vontade: o POKE anunciado, o ranking e o perfil.',
      'CRITICO APARECE NA TELA. O golpe critico existia e multiplicava o dano desde sempre, mas nada dizia isso — o mesmo golpe no mesmo inimigo as vezes tirava um numero muito maior e voce nao tinha como saber por que. Agora o numero cresce e vem marcado com CRIT.',
      'O DANO QUE VOCE LEVA ficou diferente do dano que voce causa: ele sai numa placa vermelha. Numa luta com varios inimigos em volta era impossivel distinguir um do outro.',
      'GOLPE QUE O INIMIGO RESISTE ficou legivel. O numero saia cinza escuro em cima de cena escura, justamente no caso em que voce mais precisa perceber que seu golpe nao esta funcionando naquele inimigo.',
      'O SELO DE ATRIBUTO DIZ QUAL ATRIBUTO E DE ONDE VEIO. Antes Ataque caindo e Velocidade caindo desenhavam exatamente o mesmo icone, e nada dizia quem tinha feito aquilo. Agora cada atributo tem simbolo proprio, e o selo mostra o golpe e de quem partiu — "Rosnado (Rattata)" e diferente de voce ter usado Danca das Espadas em si mesmo.',
      'VOCE PASSA A VER OS EFEITOS DO INIMIGO QUE ESTA ENFRENTANDO, numa fileira propria com o nome dele. Buff e debuff do adversario nao apareciam em lugar nenhum: se ele dobrava o Ataque ou subia a Evasao, o seu dano caia ou seus golpes erravam sem nenhuma causa visivel na tela.',
      'LEILAO: A CONTAGEM DE LANCES ESTAVA ERRADA pra quem nao era o vendedor. Cada um via so os proprios lances, entao um leilao com dez lances aparecia como "0 ofertas" — e quem tinha sido coberto nem conseguia ver que perdeu a lideranca. Pior: voce montava um lance a partir do minimo e o jogo recusava, porque o piso de verdade era outro.',
      'A HUNT CARREGA MUITO MAIS RAPIDO em quatro cenarios. O Dojo baixava 15 MB de imagem, a Arena do Dragao 13 MB — agora sao 2,6 e 2,0 MB, com a mesma arte. Em conexao de celular eram uns 24 segundos de espera antes da cena aparecer, e o jogo desistia de esperar antes disso e entrava sem o fundo.',
      'A AGUA ONDULA DE VERDADE em cinco artes, a folha tomba, a brasa pisca e a neve ganhou profundidade.',
      'O ESFUMADO DA BORDA DA TELA caiu de 12% para 5,5% — sobrou mais mapa visivel.',
      'MOCHILA E LOJA GANHARAM GRADE QUADRICULADA, e o item sem arte mostra a sigla dele em vez de um quadrado vazio. A ficha do item na Loja passou a abrir acima da grade, sem tapar o que voce estava olhando.',
      'A ARTE DO GOLPE POUSA EM 0,3 SEGUNDO, ainda durante a pose de ataque — antes ela chegava depois de o POKE ja ter voltado ao normal.',
    ],
  },
  // Continuacao do mesmo dia da 7.7: aquela entrada foi escrita no meio do
  // lote de merges e ficou pra tras do que entrou depois (PH-91).
  {
    version: '7.8',
    date: '2026-08-23',
    title: 'O correio virou conversa de verdade, e o ouro anexado parou de sumir',
    highlights: [
      'CORREIO E CHAT AGORA: uma conversa por contato, com todo o historico salvo, do jeito que voce espera de um aplicativo de mensagem. Antes a mesma pessoa tinha tres listas — a carta numa aba, o recado em outra, a resposta numa terceira.',
      'MENSAGEM NOVA APARECE NA HORA no fio que voce esta lendo, sem recarregar. Abrir a conversa zera as nao lidas so daquele contato.',
      'BUG SERIO: OURO ANEXADO NUMA MENSAGEM ERA DESTRUIDO. Saia de quem mandou, nunca chegava em quem recebeu, e a mensagem ficava travada com o anexo por coletar pra sempre. Anexo de item nunca foi afetado. O ouro que estava preso voltou pro destinatario.',
      'VINTE E TRES ARTES DE GOLPE NAO APARECIAM NA TELA — entre elas o Bullet Punch. O desenho existia e estava certo; o jogo so nunca chegava a pedir o arquivo pra desenhar.',
      'HOSPITAL: o POKE estava serrilhado e fora de proporcao com a sala. Em vez de esticar o POKE, a cena inteira encolheu — mesma proporcao entre ele e a enfermeira, com bem menos esticamento no sprite.',
      'A JANELA DE CHAT RECOLHIDA agora e so "Chat" e um "+". Antes ela continuava ocupando espaco com as abas e o campo de escrever mesmo fechada.',
      'CADA SUB-BIOMA TEM O TAMANHO QUE PRECISA. O mundo jogavel deixou de ser um retangulo fixo igual pra todos: agora ele e do tamanho do que foi desenhado naquele mapa, entao ha mapas maiores e menores.',
    ],
  },
  // Entrada curta de proposito, ao contrario das anteriores: pedido explicito
  // do usuario ("um resumo bem sucinto sobre todas as melhorias").
  {
    version: '7.7',
    date: '2026-08-22',
    title: 'Correio e amigos, time no canto da tela, e as arenas ganharam parede',
    highlights: [
      'CORREIO COMPLETO: mande carta com ouro ou item anexado, responda, e apague o que ja leu — cada lado apaga a sua copia.',
      'LISTA DE AMIGOS: convide, aceite, remova e bloqueie. Bloquear corta os dois lados e desfaz a amizade.',
      'CONVERSA PRIVADA com amigo, em tempo real, com contador de nao lidas no sino.',
      'SEU TIME NO CANTO SUPERIOR ESQUERDO: foto e nivel das reservas em coluna. Arraste pra mudar a ordem, passe o mouse pro resumo, clique pra abrir o perfil ou botar em campo.',
      'A FILA DOS 4 GOLPES virou arrastavel, e da pra chegar nos golpes direto pela tela de Equipe.',
      'POKE SEM GOLPE UTILIZAVEL agora diz isso na tela em vez de ficar parado sem explicacao.',
      'A ESCOLHA DE GOLPES DESTRAVOU: um golpe orfao na lista impedia qualquer edicao.',
      'NO CELULAR: a carinha do POKE muda conforme o estado dele, e tocar num termo abre a explicacao (com glossario).',
      'BUG: A ARTE DO GOLPE FICAVA PRA TRAS. O efeito nascia parado no lugar onde o POKE estava, e ele andava mais de 100 pixels durante o segundo que a animacao dura. Agora ela acompanha.',
      'DOJO E ARENA DO DRAGAO GANHARAM PAREDE DE VERDADE. Eram as duas ultimas telas do jogo em que dava pra atravessar predio, agua e lava.',
      'DUELO DO CAMPEAO LANCE COREOGRAFADO: cada lado entra por um ponto fixo da arena, e ha 2 segundos entre um POKE cair e o proximo entrar — dos dois lados. Antes o seu substituto aparecia no mesmo instante, dentro do buraco onde o anterior morreu.',
      'SEU PROGRESSO PAROU DE CORRER RISCO: duas gravacoes ao mesmo tempo se atropelavam e uma podia sobrescrever a outra.',
    ],
  },
  {
    version: '7.6',
    date: '2026-08-18',
    title: 'Habilidade, Natureza e Caracteristica — e o inimigo que nao morria',
    highlights: [
      'HABILIDADE: cada POKE sorteia a dele entre as da especie, com chance pequena de sair a OCULTA. 133 no total, 102 com efeito de verdade (Intimidate, Technician, Sniper, Thick Fat, Huge Power, Speed Boost, Moxie, Trace...). As 31 que dependem de coisa que este jogo nao tem (troca de POKE, item equipado, aliado em campo) ficam marcadas em amarelo na ficha, com o motivo — em vez de fingir. A lista antiga era escrita a mao, deixava 76 especies sem nada e errava algumas (Gengar tinha Levitate, que ele perdeu na setima geracao).',
      'NATUREZA: 25 possibilidades, +10% num atributo e -10% em outro, sorteada no nascimento. HP nunca e afetado. Todo POKE que voce JA tinha recebeu uma natureza NEUTRA de proposito — ninguem acorda com o time pior.',
      'CARACTERISTICA: a frase nova na ficha aponta qual dos seis IVs do seu POKE e o mais alto.',
      'BUG: O INIMIGO QUE FICAVA COM A VIDA VAZIA E NAO MORRIA. Era o Endure. Agora vale a regra dos jogos — repetir Protect/Detect/Endure tem metade da chance a cada vez, e usar outro golpe zera a conta. Medido: de minutos para 25 segundos.',
      'BUG: DOZE GOLPES OCUPAVAM SLOT E NUNCA DISPARAVAM (Flail, Reversal, Seismic Toss, Night Shade, Dragon Rage, Super Fang, Psywave, Magnitude, Present, Hidden Power, Counter, Mirror Coat). Quem mais sofria era o Magikarp, cujo unico golpe forte e o Flail.',
      'O KIT AUTOMATICO PAROU DE ESCOLHER GOLPE RUIM: agora conta precisao e recuo, nao so o poder. Typhlosion Nv70 contra Kangaskhan de mesmo nivel terminava com 51 de vida; agora termina com 129.',
      'PRECISAO DO GOLPE APARECE na tabela de golpes e no tooltip, em amarelo abaixo de 100%.',
      'O ICONE DE CADA GOLPE MOSTRA A RECARGA DELE, e nao o mesmo numero em todos os quatro slots.',
      'POKEDEX COMPLETA: linha evolutiva com o nivel de cada passo (inclusive a regra de Nivel 80 + pedras, que nao aparecia em lugar nenhum), ficha com dex/EXP/curva/captura/regiao, habilidades possiveis, e setas Anterior/Proximo pra navegar sem fechar.',
      'IV DE LENDARIO segue o Ultra Sun: pelo menos tres IVs perfeitos garantidos.',
      'GOLPE DE AREA GANHOU ARTE PROPRIA em 13 tipos — Eruption saia como um lanca-chamas deitado.',
    ],
  },
  {
    version: '7.5',
    date: '2026-08-18',
    title: '22 golpes ganharam efeito visual PROPRIO, em vez de dividir o mesmo desenho do tipo elemental',
    highlights: [
      'ATE AGORA TODO GOLPE DE UM TIPO DESENHAVA A MESMA COISA. Metal Claw, Iron Head e Bullet Punch mostravam o mesmo efeito de aco; Scratch e Fury Swipes, o mesmo estouro de normal. Agora 22 golpes tem animacao propria: Scratch e Fury Swipes (garras), Comet Punch e Shadow Punch (socos), X-Scissor, Stomp, Dig, Earthquake, Whirlpool, Whirlwind, Petal Dance, Fire Fang, Thunder Fang, Ice Fang, Flamethrower, Fire Spin, Mud Shot, Charm, Taunt, Dragon Dance, Spider Web e Bullet Punch.',
      'CINCO DELES APONTAM PRA ONDE VOCE ESTA MIRANDO. Scratch, Mud Shot, Flamethrower, Charm e Bullet Punch tem uma direcao propria no desenho e giram pra sair na linha do golpe. Os outros 17 nao giram de proposito — sao anel, coluna ou estouro, e girar so os deitaria de lado.',
      'O JOGO NAO FICOU MAIS PESADO PRA CARREGAR. A arte nova NAO entra no carregamento inicial: ela chega quando o golpe e usado pela primeira vez. Voce ve os golpes que o SEU time sabe, meia duzia, e nao faria sentido baixar os outros 470 antes de entrar no jogo. Na primeira vez que cada golpe aparece, o efeito antigo cobre a fracao de segundo ate a arte chegar.',
      'UM GOLPE FOI DESCARTADO DEPOIS DE PRONTO: Aqua Jet. A arte disponivel e uma coluna estreitissima que, no tamanho de jogo, virava um fio de 6 pixels de largura — invisivel na pratica. Ele continua usando o efeito de agua padrao, que da pra ver.',
      'QUATRO GOLPES PEDIDOS NAO EXISTEM NESTE JOGO: Rock Smash, Cut, Drain Punch e Energy Ball. Sao golpes de MT/MO, e o catalogo daqui so tem o que se aprende SUBINDO DE NIVEL desde que o Recordador de Golpes saiu (v6.8).',
    ],
  },
  {
    version: '7.4',
    date: '2026-08-18',
    title: 'Efeito de golpe no tamanho certo, apontando pro inimigo, e duas artes que estavam simplesmente erradas',
    highlights: [
      'O EFEITO DO GOLPE PAROU DE ESCONDER QUEM LEVOU. Todo impacto era desenhado de duas a cinco vezes maior que o POKE — a arte cobria o alvo inteiro e voce via o golpe, nao a luta. Agora fica em uma vez e meia o tamanho do POKE: da pra ler que acertou E continuar vendo quem apanhou.',
      'OS EFEITOS AGORA APONTAM PRA DIREÇAO DO GOLPE. Antes o impacto nascia no centro exato do inimigo, identico viesse o ataque da esquerda, de cima ou por tras. Agora ele encosta no lado do alvo que levou a pancada. Os golpes que TEM uma direcao propria — o jato de fogo, o respingo de inseto, o talho sombrio — ja giravam; o resto ganhou a leitura pelo posicionamento, porque girar um anel ou uma cupula so os deitaria no chao.',
      'BUG REAL CORRIGIDO: O JATO DE FOGO ATRAVESSAVA QUEM LANÇAVA. A arte tem 150 pixels de comprimento e a luta acontece a 39 de distancia, entao a labareda passava pelo inimigo, voltava por cima do seu POKE e saia pelas costas dele. O rastro foi cortado pra terminar exatamente onde o atacante esta.',
      'BUG REAL CORRIGIDO E ESTRANHO: O GOLPE DE VOADOR TINHA UM ITEM DE OUTRO JOGO DESENHADO DENTRO. Um objeto amarelo com a palavra DROP escrita, aparecendo no meio da animacao. A arte foi trocada por um tornado.',
      'GOLPE DE FADA NAO DESENHA MAIS CAVEIRAS. A arte antiga era rosa — o matiz certo pro tipo — mas o que ela desenhava eram cranios, que e leitura de veneno e morte, nao de fada. Trocada por aneis de particulas, que de brinde aparecem melhor sobre fundo escuro.',
      'INVESTIGADO, MANTIDO COMO ESTAVA: o golpe de SOMBRIO continua com o talho marrom, que reconhecidamente nao le como escuridao. As tres alternativas escuras disponiveis medem praticamente preto puro e sumiriam contra o fundo de uma caverna — um golpe invisivel e pior que um golpe de cor discutivel.',
    ],
  },
  {
    version: '7.3',
    date: '2026-08-18',
    title: 'Voce nasce onde o mapa manda, e a tela para de fingir que nao tem nada quando so esta carregando',
    highlights: [
      'O PONTO DE NASCIMENTO DE CADA MAPA AGORA E ESCOLHIDO A MAO. Onze cenarios ganharam um ponto de entrada marcado de proposito — voce entra na hunt e comeca na rua, na trilha ou na clareira que faz sentido pra aquele lugar, e nao mais no meio geometrico da area andavel. Ate agora o jogo calculava a media da regiao onde da pra andar e largava voce ali, o que num mapa em L ou numa cidade de ruas estreitas caia num canto arbitrario.',
      'BUG REAL CORRIGIDO NA PROPRIA FERRAMENTA QUE LE ESSAS MARCACOES: os onze pontos ja estavam marcados e TODOS estavam sendo ignorados em silencio. A arte de fundo e maior que a area jogavel — o desenho cobre o mapa com sobra e so a faixa central dele aparece na tela —, e a marcacao caia nessa sobra. O jogo agora traz o ponto pra dentro mantendo a direcao marcada, em vez de descartar.',
      'BUG REAL CORRIGIDO: O PERFIL DIZIA QUE VOCE NAO TINHA CAPTURA NENHUMA enquanto a lista ainda estava chegando. A aba Capturas mostrava \'Nenhuma captura registrada ainda. Ligue o Auto-Catch no painel do Bot\' para quem tem a mochila cheia — e ainda mandava ligar um bot que ja podia estar ligado. Agora aparece \'Carregando suas capturas...\' ate o dado chegar.',
      'BUG REAL CORRIGIDO E MAIS GRAVE: A TELA DE ITEM DO MERCADO MOSTRAVA PRECO ZERO enquanto carregava. Alem de dizer \'Ninguem vendendo\' e \'Ninguem procurando\' sobre um item com ofertas, o campo de preco nascia em 0 — um numero em que da pra clicar e comprar. A tela agora espera o livro de ofertas chegar antes de desenhar qualquer coisa.',
      'TODO BOTAO QUE FALA COM O SERVIDOR AGORA MOSTRA QUE ESTA TRABALHANDO. Comprar, vender, trancar item, aceitar pedido de amizade, cancelar anuncio: antes o botao so apagava por um ou dois segundos, sem dizer nada, o que e igualzinho a um botao quebrado. Agora ele gira. O rotulo continua no lugar de proposito, pra lista nao pular embaixo do seu dedo.',
    ],
  },
  {
    version: '7.2',
    date: '2026-08-18',
    title: 'Parede virou parede em TODA hunt, os 4 golpes sao seus pra escolher, e o Lance nao desfaz mais o que liberou',
    highlights: [
      'BUG GRAVE CORRIGIDO: METADE DAS HUNTS NAO TINHA PAREDE. Modo Pesadelo, as 11 hunts de CHEFE, a luta do Campeao Lance, a hunt de Treinamento e a Rota 46 nao carregavam a area andavel do mapa — o POKE atravessava rocha, agua e precipicio e andava por cima do cenario inteiro. As hunts comuns tinham a delimitacao certa; essas nunca tiveram. A regra mudou de raiz: a area andavel agora vem grudada na ARTE do mapa, entao qualquer conteudo novo que reaproveite um fundo ja pintado ja nasce com a delimitacao certa, sem depender de ninguem lembrar de configurar.',
      '10 MAPAS GANHARAM AREA ANDAVEL PINTADA A MAO: caverna de gelo, gruta feerica, ilha, lago, metropole, cortico, terra devastada, vilarejo, vilarejo noturno e vulcao. As ruas estreitas da metropole obrigaram a afinar o criterio — no ajuste anterior uma rua de uma celula de largura era "arredondada" pra parede, e o mapa inteiro alem dela virava area proibida.',
      'METROPOLE E CORTICO GANHARAM ARTE PROPRIA. Ate agora as duas herdavam o fundo do bioma, que e uma clareira de floresta noturna — nada a ver com o nome.',
      'OS 4 GOLPES AGORA SAO INTEIRAMENTE SEUS. Ataque Basico e Explosao Elemental viraram golpes comuns: ocupam um dos 4 slots como qualquer outro, e cabe a voce decidir se valem a vaga. Ataque Basico continua entrando sozinho como ultimo recurso quando os 4 escolhidos estao em recarga, mas so e usado em combate se estiver num slot.',
      'BUG REAL CORRIGIDO: A CONTAGEM DE RECARGA NA TELA MENTIA. Existem dois relogios — o do golpe e um intervalo minimo de 2 segundos entre acoes quaisquer — e a barra so mostrava o primeiro. Um golpe de 1 segundo de recarga aparecia como "pronto" e nao disparava. Agora a contagem mostra o tempo que o jogo de fato exige.',
      'BUG REAL CORRIGIDO: O LANCE LIBERAVA O MODO PESADELO E DESFAZIA NO RELOAD. Derrotar o Campeao abria as hunts, o servidor gravava certo, e ao recarregar a pagina as 11 hunts voltavam a "Bloqueado — Derrote o Campeao Lance", com a conquista registrada no Hall da Fama. Uma limpeza de dado antigo estava jogando fora justamente o grupo que o Lance concede. O bug enganava porque quando havia resumo de tempo offline logo depois de abrir o jogo, a resposta do servidor corrigia sozinha e o Pesadelo "voltava".',
      'DORMIR E CONGELAR AGORA PRENDEM O POKE NO LUGAR. Quem esta sob sono ou congelamento para de se deslocar ate acordar ou descongelar. Paralisia continua sem prender de proposito: ela nao passa sozinha neste jogo, e um POKE que nao anda nunca mais encontra inimigo — a caçada travaria ate alguem curar.',
      'ARTE DE GOLPE NOVA NOS 18 TIPOS, E ELA APONTA PRO ALVO. O efeito de impacto foi refeito com animacao de verdade (de 14 a 40 quadros por tipo, contra os poucos de antes) e o jogo carrega 18 arquivos no lugar de mais de 400. Alem disso, os efeitos que TEM um lado — o jato de fogo, o respingo de inseto, o corte sombrio — agora giram na direcao do inimigo em vez de sair sempre pro mesmo lado. Os que nao tem lado (aneis, estouros) e os que apontam pra cima (a cupula psiquica, a coluna de vento) ficam de fora de proposito: girar esses ultimos os deitaria no chao.',
      'BUG REAL CORRIGIDO: O EFEITO DO SOCO-BALA APARECIA PELA SEXTA PARTE. A arte estava fatiada errado e o jogo animava um pedaco do desenho por vez em vez do golpe inteiro.',
      'BUG REAL CORRIGIDO: "ENTRAR" NA HUNT PODIA NAO FAZER NADA, SEM DIZER POR QUE. Quando o slot ativo estava vazio, quando o POKE em campo estava desmaiado ou quando o servidor recusava, o botao simplesmente nao respondia — nenhum aviso na tela. Agora todos esses casos falam, e dizem o que fazer.',
    ],
  },
  {
    version: '7.1',
    date: '2026-08-18',
    title: 'Bot de auto-venda, mochila que carrega ao abrir a tela, e o jogo trafegando ~50x menos dado',
    highlights: [
      'NOVO BOT: AUTO-VENDA, na tela da Mochila. Ligue e marque as raridades que voce quer vender: a captura e vendida NA HORA, antes de entrar na mochila, e o ouro cai direto na carteira. SHINY NUNCA E VENDIDO, mesmo com a raridade dele marcada — a regra vive no motor do jogo, nao na tela, entao nao ha jeito de contornar por engano. POKE que ja esta guardado na mochila nao e tocado; o bot decide so sobre a captura nova.',
      'POR QUE VENDER NA CAPTURA, E NAO VARRENDO A MOCHILA: porque assim a mochila nunca chega a encher. Era o problema de fundo — o auto-catch despeja tudo nela e nada sai sozinho. Uma conta real chegou a 5035 POKEs guardados.',
      'A CAUSA RAIZ DE UM CUSTO QUE QUASE DERRUBOU O JOGO: a cada 30 segundos (e a cada 5, quando voce subia de nivel) o servidor lia e devolvia a SUA MOCHILA INTEIRA pra simular a caçada — 3,23 MB por leitura numa conta de 5 mil POKEs. Um unico jogador ativo queimava ~2 GB por hora de trafego; tres jogadores fecharam o dia 17/08 em 49,59 GB contra uma cota mensal de 5 GB. A caçada nunca precisou da mochila (a simulacao so ADICIONA captura nela), entao ela saiu do caminho.',
      'MEDIDO DEPOIS DA CORRECAO, na mesma conta: o pacote de cada liquidacao de caçada caiu de 225.711 para 5.077 bytes, e o do carregamento da pagina de 226.184 para 4.575. Numa conta de 5 mil POKEs a diferenca e maior ainda — o pacote novo nao cresce com o tamanho da mochila.',
      'A MOCHILA AGORA CARREGA QUANDO VOCE ABRE A TELA, e nao mais junto do jogo. Entrar no jogo ficou mais leve; em troca, na primeira vez que voce abre Mochila, Loja (aba Pokemons) ou "Anunciar POKE" no Mercado, aparece "Carregando a mochila..." por um instante. Quem nunca abre essas telas nao paga esse custo em sessao nenhuma.',
      'A LISTA NOVA E PAGINADA E CONFERE O TOTAL COM O BANCO. O limite de 1000 linhas por consulta ja e menor que duas mochilas reais do jogo (1328 e 813 POKEs), e ele corta a lista SEM dar erro — como as telas que leem essa lista oferecem venda em lote, uma mochila cortada pela metade seria indistinguivel de "vendi tudo". Se o total nao bater, a tela avisa em vez de mostrar lista curta.',
      'INVESTIGADO, NENHUM DEFEITO ENCONTRADO: vender POKE no meio de uma caçada nao perde ouro. A suspeita era concreta (a venda soma ao ouro enquanto a caçada regrava o total, e as duas podem acontecer no mesmo segundo), e foi medida no jogo publicado — 26 rodadas disparando venda dentro da janela de liquidacao, com quatro atrasos diferentes: zero divergencia de ouro e zero caçada descartada. A protecao que segura isso ganhou testes permanentes pra continuar assim.',
    ],
  },
  {
    version: '7.0',
    date: '2026-08-15',
    title: 'Hunt de Treinamento pra medir a forca do time, trava de golpes de volta em hunt, e o icone que sumia ao desligar',
    highlights: [
      'NOVA HUNT: TREINAMENTO. Um boneco de treino (Wobbuffet, nunca revida) sempre liberado, pra testar a forca do seu time sem risco e sem afetar a economia — abater ele nao rende ouro, XP, item nem captura, de proposito. Acompanhe "Mobs/h" no Hunt Analyzer como o placar de comparacao entre builds.',
      'BUG REAL CORRIGIDO NA PROPRIA CONSTRUCAO DA HUNT ACIMA: a primeira versao so zerava os atributos ofensivos do boneco, e mesmo assim ele desmaiou um POKE Lv1 de 11 HP com o proprio Ataque Basico — o termo de NIVEL da formula de dano pesa mais que o ATK quase zerado. Corrigido travando o ataque no motor: o boneco literalmente nunca ataca, seguro pra qualquer nivel.',
      'ESCOLHER OS 4 GOLPES ATIVOS VOLTOU A EXIGIR SAIR DA HUNT. Pedido explicito do usuario, revertendo a leva anterior (que tinha removido a pedido dele tambem) — build fixo durante o combate, editavel so fora dele. Agora cobre tambem o liga/desliga do Ataque Basico e do golpe de Nivel 50, que antes escapavam da trava.',
      'BUG REAL CORRIGIDO: o icone do golpe na barra de combate ficava praticamente invisivel ao desligar Ataque Basico ou o golpe de Nivel 50 (overlay preto quase solido por cima). Agora o golpe desligado so fica dessaturado e escurecido — continua reconhecivel qual e.',
      'LUTA DO CAMPEAO LANCE: investigada a fundo (simulacao isolada e ao vivo contra o jogo publicado) — os 6 POKEs dele ja entram um a um corretamente ate a equipe se esgotar, e o time do jogador ja troca de POKE a cada desmaio do mesmo jeito. Nenhum defeito encontrado; a mecanica ganhou testes automatizados permanentes pra continuar assim.',
    ],
  },
  {
    version: '6.9',
    date: '2026-08-15',
    title: 'Personalize os 4 golpes a qualquer momento, um dispositivo por vez, e golpe de status ganhou sprite',
    highlights: [
      'ESCOLHER OS 4 GOLPES ATIVOS NAO EXIGE MAIS SAIR DA HUNT. A trava "saia da hunt para trocar de golpe" nao protegia nada tecnico — o servidor reconstroi o combate do zero a cada ~30 segundos, e a troca so valia a partir da proxima janela de qualquer jeito. Removida: personalize os golpes do seu POKE na hora, inclusive no meio de uma caçada, escolhendo livremente entre os que ele ja aprendeu (ate 4, e pode ser so 1 se preferir).',
      'GOLPE DE STATUS GANHOU ICONE E VFX DE VERDADE. A barra de combate escondia qualquer golpe sem dano (Growl, Supersonic, Danca das Espadas, ...) — se voce escolhia um deles como um dos 4 ativos, ele "sumia" da barra sem explicacao. Agora aparece com o icone do tipo normal e "—" no lugar do dano. De brinde, golpe de status ganhou uma animacao propria (eleva atributo = brilho pra cima, baixa atributo ou aplica uma condicao = pra baixo) em vez de reusar o mesmo impacto de golpe de dano, em 16 dos 18 tipos elementais.',
      'LOGIN NOVO NAO DERRUBA MAIS EM SILENCIO. So um dispositivo pode estar logado por vez, mas agora o aparelho NOVO pergunta antes: "Jogar por aqui?" — so ao confirmar e que o outro aparelho perde a sessao (na proxima vez que ele tentar renovar o login, em ate 1 hora). Cancelar desfaz o login sem mexer no outro aparelho.',
      'BUG REAL CORRIGIDO: "Iniciar novo jogo" zerava a mochila e NUNCA devolvia as bolas/pocoes/revives iniciais — toda conta resetada ficava com zero itens, e o bot (auto-pocao, ligado por padrao) nao tinha nada pra usar. Corrigido na fonte: reset volta a dar o kit inicial completo.',
      'BUG REAL CORRIGIDO: o chat do Correio as vezes gerava um erro no console e parava de atualizar sozinho (precisava recarregar a pagina) se voce abrisse a tela rapido demais — duas tentativas de conexao ao mesmo canal em sequencia, a segunda batendo numa ja aberta. Corrigido.',
    ],
  },
  {
    version: '6.8',
    date: '2026-08-15',
    title: 'Golpe de Recordador nao entra mais no aprendizado por nivel',
    highlights: [
      'MUDANCA DE REGRA: SEU POKE SO APRENDE GOLPE COM NIVEL DE VERDADE. A versao 6.6 tinha corrigido o SINTOMA (Typhlosion nao usava mais Eruption no Nivel 1) sem mexer no catalogo, porque aquele bloco de golpes era dado real do Recordador de Golpes do Ultra Sun. Decisao nova: o Recordador sai do jogo. Um POKE so aprende golpe que ele mesmo conquista subindo de nivel — quem quer um golpe que so a linha evolutiva anterior aprendia (Tackle do Cyndaquil, por exemplo) precisa manter o POKE nessa forma, ou aceitar que o golpe nao vem mais de graca ao evoluir.',
      'GOLPE SEM NIVEL NENHUM NA LINHA TAMBEM SAIU, mesmo quando era forte: Charizard perde Air Slash, Dragon Claw, Shadow Claw e Wing Attack do aprendizado por nivel (so existiam via Recordador, sem equivalente em nivel nenhum da linha Charmander-Charmeleon-Charizard). Ao todo, 462 linhas de golpe saem do catalogo, afetando 108 das 251 especies.',
      'GOLPE GANHO NA HORA DE EVOLUIR CONTINUA VALENDO — isso NAO e Recordador. Metapod e Kakuna, por exemplo, nascem sabendo Harden no instante em que evoluem (Nivel 7); a marca que a PokeAPI usa pra isso (Nivel 0 cru, distinto do bloco de Recordador que tambem aparecia como Nivel 1) foi preservada na importacao pra nao confundir os dois e deixar essas duas especies sem NENHUM golpe.',
      'CONFERIDO PONTA A PONTA CONTRA A BULBAPEDIA DE NOVO apos o corte: as 251 especies continuam batendo (agora comparando so golpe com nivel real dos dois lados).',
      'POKES QUE JA EXISTIAM FORAM AJUSTADOS: quem tinha um desses golpes escolhido ou aprendido antes desta mudanca teve a lista corrigida — 670 POKEs no total. Se um dos seus tinha Air Slash, Dragon Claw ou outro golpe de Recordador escolhido, ele pode ter perdido esse golpe agora; abra o perfil dele e escolha outro no lugar.',
    ],
  },
  {
    version: '6.7',
    date: '2026-08-15',
    title: 'Escolher os 4 golpes voltou a funcionar de verdade, e mais 7 ajustes',
    highlights: [
      'A CAUSA RAIZ DE "NAO DA PRA ESCOLHER OS 4 GOLPES" ERA NO BANCO, NAO NA TELA. O catalogo que o servidor usa pra validar sua escolha ainda tinha os golpes antigos (Cleffa e Togepi la ainda apareciam como tipo Normal, nao Fada); todo POKE recem-nascido ou recem-evoluido saia com golpes que o servidor nao reconhecia. Resincronizado — starter novo e evolucao voltam a deixar escolher os 4 normalmente.',
      'ATAQUE BASICO E EXPLOSAO ELEMENTAL SEMPRE FORAM OPCIONAIS — so nao dava pra ver isso. Os dois ja podiam ser desligados (duplo clique na barra de combate), mas a aba Golpes do perfil nem mostrava o Ataque Basico e escondia o botao da Explosao atras de um texto fixo. Agora os dois tem checkbox visivel ali, do jeito que sempre deveriam ter tido.',
      '58 GOLPES DUPLICADOS NO CATALOGO, CORRIGIDOS NA FONTE. Bug da importacao do Ultra Sun: 58 especies (Venusaur, Charizard, Gengar, Dragonite, entre outras) tinham o mesmo golpe listado duas vezes no Nivel 1. Nao mudava combate, so inflava a lista "Golpes" do perfil — agora aparece uma vez so.',
      'AUTO-STATUS GANHOU CONTROLE POR ITEM. Alem do interruptor geral, agora da pra desmarcar um item especifico (por exemplo, guardar suas Full Heal e deixar o bot so usar as curas baratas). De brinde, achamos que o interruptor GERAL do Auto-status nunca tinha persistido no servidor — ficava ligado so até você trocar de pagina.',
      '6 ICONES NOVOS: Antidoto, Anti-Sono, Anti-Queimadura, Anti-Congelante, Anti-Paralisia e Cura Total agora tem sprite propria na mochila e na loja, em vez de ficarem sem icone nenhum.',
      'BUG CORRIGIDO: POKE parado numa caçada, entre um alvo e outro, continuava com a animação de andar — agora fica parado (Idle) de verdade.',
      'A LISTA DE HUNTS MOSTRA A EFETIVIDADE DO SEU POKE ATIVO contra cada especie que pode aparecer ali (2x, ½x, imune) — ajuda a escolher pra onde ir sem sair caçando às cegas.',
      'BUG VISUAL CORRIGIDO: as colunas da aba Golpes desalinhavam quando a lista tinha barra de rolagem. E de brinde, o perfil do POKE agora atualiza o checkbox de golpe na hora — antes, marcar ou desmarcar funcionava por baixo dos panos mas a tela só mostrava a mudança depois de fechar e reabrir.',
    ],
  },
  {
    version: '6.6',
    date: '2026-08-15',
    title: 'Golpe de fim de lista nao chega mais no Nivel 1, e o bot passa a curar status sozinho',
    highlights: [
      'SEU POKE PODE TER MUDADO DE GOLPES — E ISSO E O CONSERTO. Um Typhlosion capturado vinha pro Nivel 1 sabendo Eruption, de 150 de poder. Nao era um numero errado no jogo: no Ultra Sun o Typhlosion TEM Eruption listado no Nivel 1 mesmo, porque essa lista e a dos golpes que o Recordador de Golpes pode devolver, e nao o que um POKE daquele nivel sabe. O jogo estava lendo a lista errada. Agora o Eruption exige Nivel 82, que e quando o jogo original ensina.',
      'ISSO VALE PRA 108 DAS 251 ESPECIES, e 38 delas entregavam golpe de 100 de poder ou mais ja no Nivel 1 — o Forretress chegava a Explosion, com 200. Como capturar reseta o POKE pro Nivel 1, bastava capturar qualquer especie evoluida pra sair com um golpe de fim de jogo na mao.',
      'NENHUM POKE FICOU SEM GOLPE POR CAUSA DISSO. Onde a correcao tirou um golpe que voce tinha escolhido, o slot foi recomposto com o melhor golpe disponivel pro nivel — a escolha muda, o POKE nao fica pelado. O Typhlosion de Nivel 1 agora comeca com Tackle e Leer, que e o kit inicial do jogo original.',
      'O ELENCO INTEIRO FOI CONFERIDO CONTRA A BULBAPEDIA: os learnsets das 251 especies, e o poder e a precisao dos 501 golpes. Tudo bateu. A unica diferenca encontrada era de NOME — a fonte automatica chamava o golpe de "Vise Grip", que e o nome da Geracao VIII; no Ultra Sun ele se chama "Vice Grip". Corrigido.',
      'AUTO-STATUS: o bot agora cura veneno, queimadura, paralisia, sono, congelamento e confusao sozinho, escolhendo sempre o item MAIS BARATO que resolve — um Despertar de 30 de ouro no lugar de um Full Heal de 120. Ele ja fazia isso escondido dentro do Auto-pocao; agora tem interruptor proprio no painel Auto, com o estoque de cada cura a vista. Nasce ligado.',
      'A precisao dos golpes foi conferida ponta a ponta: Inferno com 50% erra metade das vezes de verdade, e a escolha automatica ja desconta a precisao — o POKE prefere um golpe de 90 que sempre acerta a um de 100 que erra metade.',
      'O XP por abate foi conferido contra a formula real da Geracao VII em 144 combinacoes de nivel, e o valor de EXP base de todas as 251 especies foi conferido um a um. Nada mudou: ja estava certo.',
    ],
  },
  {
    version: '6.5',
    date: '2026-08-15',
    title: 'O Centro Pokemon virou um lugar de verdade',
    highlights: [
      'O HOSPITAL GANHOU CENARIO. O saguao do Centro Pokemon — balcao, maquina de cura, poltronas, o tapete redondo no meio — substituiu o fundo quadriculado que estava la desde o comeco.',
      'SEU POKE FICA EM CIMA DO TAPETE, no centro do saguao, e num tamanho coerente com a moca do balcao. Pokemon grande aparece grande: o tamanho vem do sprite de cada especie, entao um Gyarados domina a sala e um Pichu chega na altura do balcao.',
      'A MOCA DO BALCAO VIROU O BOTAO DE CURAR. Em cima da cabeca dela tem um "Curar" que acende quando o mouse passa; clicar nela cura a equipe inteira, de graca, como sempre foi. O quadradinho branco com a cruz vermelha que fazia esse papel saiu.',
      'O CONTROLE DE ZOOM SO APARECE DENTRO DA CAÇADA. No Hospital ele nao tinha o que fazer — a sala e desenhada pra caber na tela — e ainda dava pra usar o zoom pra esconder a enfermeira, ou seja, esconder o proprio botao de curar.',
    ],
  },
  {
    version: '6.4',
    date: '2026-08-14',
    title: 'Hunts em salas: 12 biomas, 33 sub-biomas e o Campeao Lance como portao',
    highlights: [
      'CADA HUNT VIROU 10 SALAS. Voce limpa uma sala (12 abates), avanca pra proxima, e cada sala e um SUB-BIOMA sorteado — com lista de Pokemon e loot proprios. Fechar as 10 reinicia o ciclo, entao a caçada nunca "acaba": ela continua rendendo enquanto voce estiver fora.',
      'AS HUNTS FORAM REFEITAS. Eram 69 separadas por regiao (Johto/Kanto); agora sao 12 biomas x 3 faixas de nivel (Lv1-30, 31-60, 61-90). Os 33 sub-biomas — Planicie, Mar Aberto, Leito Oceanico, Vulcao, Cemiterio, Ruinas, Usina, Gruta Feerica... — vieram das listas do PokeRogue cruzadas com o nosso elenco. Nenhuma das 209 especies selvagens ficou sem lugar.',
      'A SEPARACAO POR REGIAO ACABOU. As listas por bioma misturam Johto e Kanto, e recortar por regiao esvaziaria 12 dos 33 sub-biomas (Praia e Dojo nao tem NENHUM Pokemon de Johto; Floresta Nevada, nenhum de Kanto). O filtro por regiao continua existindo na Pokedex, onde ele fala da especie e nao do lugar.',
      'O CAMPEAO LANCE VIROU PORTAO DE VERDADE. Derrota-lo libera a Faixa III (Lv61-90) e o Modo Pesadelo inteiro, com as 11 caçadas de lendario dentro. O Modo Pesadelo nascia aberto desde sempre; agora e conteudo de fim de jogo.',
      'BUG CRITICO CORRIGIDO: a luta contra o Lance era INGANHAVEL. O servidor recomecava a sequencia no primeiro Pokemon dele a cada ~30 segundos, entao so daria pra vencer matando os 6 em menos de meio minuto. Ninguem tinha notado porque ele nao trancava nada — e ele acabou de virar o portao de metade do jogo.',
      'NIVEL COERENTE COM O ESTAGIO. Uma linha evolutiva agora aparece no estagio certo pro nivel da faixa: Caterpie ate Lv6, Metapod ate Lv9, Butterfree dali pra frente. Antes dava pra encontrar Caterpie de nivel 60.',
      'A ROUTE 46 VOLTOU A SER UM LUGAR SEGURO PRA COMECAR. Ela continua com os mesmos tres Pokemon basicos de nivel 1 e 2 (Sentret, Hoothoot e Rattata), mas agora e UM inimigo por vez em vez de seis: seu inicial tem 12 pontos de vida, e desde que precisao e status entraram no combate ele nao aguentava varias fontes de dano ao mesmo tempo — morria no primeiro minuto sem chegar ao nivel 2. Testado com 10 contas novas de verdade, 20 minutos cada: nenhuma morreu, e todas terminaram no nivel 3 ou 4 com mais de cem abates.',
      'CADA HUNT DE BIOMA COMECA NO NIVEL DELA. A primeira sala da Faixa I sai em Lv1-4 e a decima em Lv27-30 — a caçada vai ficando mais dura conforme voce avanca as salas, em vez de jogar um Pokemon de nivel 30 em cima de quem acabou de entrar.',
      'O cartao da hunt mostra os sub-biomas dela e a chance de cada um cair, e a porcentagem de cada Pokemon ja considera esse sorteio. O HUD mostra em que sala voce esta e quanto falta pra limpar.',
    ],
  },
  {
    version: '6.3',
    date: '2026-08-14',
    title: 'Farm offline pausado temporariamente',
    highlights: [
      'O FARM OFFLINE ESTA PAUSADO. Enquanto isso durar, o tempo que voce passa com o jogo FECHADO nao rende nada — voce nao vai receber o relatorio de "Bem-vindo de volta" nem ouro, XP ou capturas por esse periodo. Nao e bug: foi desligado de proposito, e volta a ligar em breve.',
      'JOGAR COM O JOGO ABERTO CONTINUA NORMAL. A caçada ao vivo credita tudo como sempre, do mesmo jeito e no mesmo ritmo. A pausa atinge SO o periodo em que voce esta fora.',
      'O TEMPO PARADO NAO FICA GUARDADO. Quando o farm offline voltar, ele volta contando do zero — nao ha recompensa represada esperando por voce. Isso e proposital: caso contrario, todo mundo receberia varias horas de recompensa de uma vez no instante em que fosse religado.',
    ],
  },
  {
    version: '6.2',
    date: '2026-08-14',
    title: 'Status de combate: veneno, queimadura, paralisia, sono, congelamento e confusao',
    highlights: [
      'OS STATUS EXISTEM DE VERDADE AGORA. Ate hoje, todo golpe de status do jogo (eram 184) nao fazia absolutamente nada — Toxico, Onda de Choque, Esporo, Raio Confuso e companhia eram usados e nada acontecia. Passaram a funcionar, com as regras da Geracao VII.',
      'VENENO tira 1/8 da vida maxima por turno. QUEIMADURA tira 1/16 e ainda corta pela metade o dano dos seus golpes fisicos. PARALISIA faz perder 1 turno em cada 4 e corta a Velocidade pela metade. SONO trava de 1 a 3 turnos. CONGELAMENTO trava ate descongelar (20% de chance por turno, ou na hora se levar um golpe de Fogo). CONFUSAO da 33% de chance de se atacar sozinho.',
      'IMUNIDADES REAIS. Pokemon de Fogo nao queima, de Eletrico nao paralisa, de Gelo nao congela, de Veneno e de Aco nao envenena. E os de Planta ignoram golpes de po (Esporo, Po do Sono, Esporo Paralisante) — como nos jogos a partir da Gen VI.',
      'ITENS DE CURA NA LOJA: Antidoto (60), Despertar (30), Antigelo (30), Antiqueimadura (90), Antiparalisia (90) e Cura Total (120, cura todos). O bot de itens usa sozinho o mais BARATO que resolve o seu status — nao gasta Cura Total onde um Despertar bastava. O Centro Pokemon tambem limpa status junto com a vida.',
      'O BOT DE ITENS PASSOU A TER UMA MAO SO. Antes ele usava pocao e revive no MESMO instante, porque cada um tinha seu proprio cronometro. Agora existe um cooldown unico, do Treinador: um item de cura a cada 1,5 segundo, na ordem revive > pocao com vida critica > cura de status > pocao normal. Pokebola nao entra nessa conta — capturar nao e curar.',
      'PRECISAO PASSOU A VALER. Cada golpe tem a precisao real do jogo, e agora ele pode errar. Sem isso nao havia como os status serem fieis: Hipnose (60%) e Canto (55%) virariam sono garantido. Seu Pokemon tambem passou a escolher golpes contando a chance de errar — ele prefere um golpe de 100% de precisao a um mais forte que erra 3 de cada 10 vezes.',
      'AUMENTOS E REDUCOES DE ATRIBUTO (os "power ups"). Danca das Espadas, Rosnado, Aro de Ferro e outros 86 golpes passaram a funcionar, com a tabela de estagios dos jogos. Eles zeram quando a luta acaba, como no original.',
      'TAMBEM ENTRARAM: dreno de vida (Absorver e companhia curam quem usa), recuo (Investida Dupla machuca voce), cura direta (Recuperar), tontura e a taxa de critico aumentada de golpes como Corte e Folha Navalha.',
      'O COMBATE FICOU MAIS DIFICIL, e isso e esperado: golpes erram, status atrapalham e o inimigo tambem usa tudo isso contra voce. Em caçadas onde voce esta muito acima do nivel, a queda no ritmo de abates e sensivel. O balanceamento vai ser reavaliado.',
    ],
  },
  {
    version: '6.1',
    date: '2026-08-14',
    title: 'Cada Pokemon leva 4 golpes — e os precos viraram os do Ultra Sun',
    highlights: [
      'NO MAXIMO 4 GOLPES POR VEZ, como nos jogos. Seu Pokemon continua APRENDENDO tudo do moveset dele, mas leva pra luta so 4. Escolha quais no menu Equipes, clicando no Pokemon e abrindo a aba Golpes — a coluna "Usar" marca os ativos.',
      'NAO DA PRA TROCAR DENTRO DE UMA CAÇADA. Saia da caçada para mexer nos golpes. Fora isso, troque quando quiser, quantas vezes quiser.',
      'SEU TIME JA VEM CONFIGURADO com os 4 golpes de maior dano de cada Pokemon (contando o bonus de tipo). Nao ha nada que voce precise fazer — so mexa se quiser outra combinacao.',
      'O GOLPE DE AREA DO NIVEL 50 continua sempre disponivel e NAO ocupa slot. O Ataque Basico tambem nao: ele entra sozinho quando nenhum dos seus 4 esta pronto.',
      'POKEMON SELVAGEM tambem passou a usar so 4 golpes — os 4 ultimos que a especie dele aprenderia naquele nivel, e sem o golpe de area do Nivel 50.',
      'PRECOS DA LOJA ATUALIZADOS pro Ultra Sun: Ultra Ball ficou mais barata (de 1200 para 800 antes do desconto), Potion tambem (300 para 200), enquanto Hyper Potion (1200 para 1500) e Revive (1500 para 2000) subiram. O desconto de 70% em bolas e pocoes continua igual.',
      'CORRECAO IMPORTANTE: derrotar um Pokemon do tipo Fada podia travar sua conta permanentemente. A Pedra Fada nao existia no catalogo do servidor, entao o drop entrava no inventario como item inexistente e TODA gravacao seguinte falhava a partir dali. Corrigido antes de qualquer conta ser afetada.',
      'O ritmo do combate passou a ser um numero so (2 segundos por acao). Antes havia dois valores concorrentes e o menor nunca tinha efeito — os cooldowns mostrados na barra de golpes mentiam.',
    ],
  },
  {
    version: '6.0',
    date: '2026-08-14',
    title: 'Tudo passou a ser Pokemon Ultra Sun — e o tipo Fada chegou',
    highlights: [
      'BASE DE DADOS NOVA. Atributos, tipos, taxas de captura, curvas de experiencia e movesets de todos os 251 Pokemon passaram a ser os de Pokemon Ultra Sun (Geracao VII), no lugar dos de Ouro/Prata. Os dados vem da PokeAPI e foram CONFERIDOS um a um contra a Bulbapedia: 251 fichas de atributo, 250 de tipagem, 251 de taxa de captura, 251 de curva de experiencia e as 324 celulas da tabela de tipos — zero divergencia.',
      'TIPO FADA. O 18o tipo entrou por inteiro: tabela de efetividade da Gen VI (Fada bate 2x em Dragao, Sombrio e Lutador; Dragao nao causa NADA em Fada; Veneno e Aco batem 2x nela), cor propria, icone de golpe, efeito de impacto proprio, Pedra Fada e uma hunt nova — a Clareira Encantada, onde Cleffa, Togepi, Snubbull e Granbull passam a aparecer. Jigglypuff, Igglybuff, Marill e Azumarill viraram tipo duplo com Fada.',
      'MUDANCA QUE ATINGE QUEM NAO E FADA: na Gen VI o tipo Aco DEIXOU de resistir a Fantasma e a Sombrio. Steelix, Scizor, Magneton e companhia ficaram mais vulneraveis a esses dois.',
      'GOLPES: de 223 para 486. Os movesets da Gen VII trazem tudo que as geracoes III a VII adicionaram — Lâmina de Folha, Combate Fechado, Pulso Sombrio, Danca do Dragao, Terreno Eletrico, Luar Explosivo e centenas de outros. Todos com descricao em portugues.',
      'GOLPES EM AREA CORRIGIDOS E MULTIPLICADOS. Antes so 6 golpes acertavam varios inimigos, por uma lista escrita a mao. Agora isso vem do alvo real do golpe: sao 26 golpes de area com dano, incluindo Terremoto, Nevasca, Deslizamento de Rochas, Onda de Calor, Descarga e Voz Encantadora.',
      'FORMULAS DA GERACAO VII. Critico caiu de 1/16 para 1/24 e passou a multiplicar por 1.5 em vez de 2. A captura passou a usar a formula real de tres sacudidas (que leva o HP do alvo em conta). A experiencia por abate passou a usar a formula ESCALADA: derrotar alvo do proprio nivel rende o maximo, e farmar muito abaixo do seu nivel rende cada vez menos — vale a pena subir de zona.',
      'BALANCEAMENTO PRESERVADO ONDE DAVA. O XP por abate contra alvo do proprio nivel e a chance MEDIA de captura do elenco continuam nos mesmos patamares de antes: os dois multiplicadores globais foram recalculados para isso. O que mudou de verdade e a forma das curvas, que agora e a dos jogos.',
      'AJUSTES DE ATRIBUTO DA GEN VI: 23 especies ficaram mais fortes (Farfetch’d, Dugtrio, Pidgeot, Alakazam, Beedrill, Butterfree, Electrode, entre outras). Seus Pokemon ja salvos recebem os novos numeros na proxima vez que o jogo carregar — nao e preciso capturar de novo.',
      'A ZONA "PROFUNDEZAS" deu lugar a Clareira Encantada. Os Pokemon de Agua fortes que moravam la (Gyarados, Lapras, Kingdra) continuam aparecendo em zonas de nivel alto da Costa.',
      'Tyrogue passou a evoluir de verdade (nivel 20). As nove evolucoes especiais continuam iguais: nivel 80 mais 20 Pedras do tipo primario.',
    ],
  },
  {
    version: '5.8',
    date: '2026-08-09',
    title: 'Progresso voltando atras e "falha ao falar com o banco" ao recarregar',
    highlights: [
      'PROGRESSO REGREDINDO — CORRIGIDO (critico). Ao recarregar a pagina, ou ao clicar em qualquer coisa (Loja, mochila, equipe) no momento em que o jogo estava salvando a caçada, o pedido novo gravava um retrato ANTERIOR ao salvamento por cima dele. O tempo caçado ja tinha sido descontado do relogio, entao aquele ouro, XP e capturas nao voltavam em salvamento nenhum. Medido: com 10 minutos de caçada pendente, 3 de cada 6 recarregamentos e 5 de cada 6 cliques apagavam o periodo inteiro — mais de 10.000 de ouro perdidos por lote de teste. Agora o pedido novo espera o salvamento terminar antes de ler seu progresso.',
      'AVISO "FALHA AO FALAR COM O BANCO" NO CTRL+SHIFT+R — CORRIGIDO. Quem tinha regras de captura automatica configuradas via esse erro ao recarregar: as regras eram apagadas e reinseridas a cada gravacao, e dois pedidos ao mesmo tempo colidiam. Medido: 33 de 48 carregamentos simultaneos falhavam. Agora elas sao atualizadas em vez de recriadas, e o erro sumiu (48 de 48 sem falha).',
      'Abrir o jogo deixou de regravar seu progresso a toa: a gravacao no carregamento agora so acontece quando ha algo novo pra registrar (uma entrega do Mercado ou um anexo do Correio). Era essa gravacao inutil que desfazia o salvamento da caçada.',
      'O relatorio "Bem-vindo de volta" e a entrega de itens do Mercado/Correio continuam funcionando igual — foram verificados junto.',
    ],
  },
  {
    version: '5.7',
    date: '2026-08-09',
    title: 'Bloqueador de anuncios fazia o jogo apresentar sua conta como nova',
    highlights: [
      'PROGRESSO "SUMINDO" COM BLOQUEADOR DE ANUNCIOS — CORRIGIDO. Se uma extensao (uBlock, AdBlock, Brave Shields) ou um filtro de DNS barrasse a conversa com o servidor, o jogo NAO avisava: ele entrava com a ficha em branco e pedia nome de treinador e Pokemon inicial pra quem ja tinha equipe, ouro e Pokedex. O progresso nunca foi apagado (o servidor guarda tudo), mas na tela parecia perdido — e criar de novo tambem nao funcionava, porque o mesmo bloqueio derrubava a criacao. Agora o jogo para e explica em vez de fingir que voce e novo.',
      'MENSAGEM DE ERRO QUE DIZ A VERDADE. Qualquer falha de rede virava "verifique sua internet", e quem estava com internet perfeita ia reiniciar o roteador a toa. Quando o aparelho esta online e mesmo assim nao ha resposta, a mensagem passa a citar bloqueador de anuncios, extensao de privacidade e filtro de DNS como causa mais provavel.',
      'TELA DE LOGIN mostrava "Failed to fetch" em ingles quando o acesso era bloqueado. Agora explica o que houve em portugues.',
      'Nada aqui exige desligar seu bloqueador para jogar, e o jogo nao verifica se voce usa um: a mensagem so aparece quando alguma coisa ja falhou, para voce saber onde olhar.',
    ],
  },
  {
    version: '5.6',
    date: '2026-08-09',
    title: 'Caça a bugs: ouro do Mercado sumindo e duplicacao por clique duplo',
    highlights: [
      'PERDA DE OURO E ITENS CORRIGIDA (critico). O que voce recebia no Mercado (venda, lance aceito, anexo do Correio) e entregue no seu proximo pedido ao servidor. So que qualquer pedido RECUSADO — "Ouro insuficiente", item trancado, POKE indisponivel — marcava a entrega como recebida e jogava fora no meio do caminho. Medido: 500 de ouro de uma venda sumiram porque o jogador, logo depois, tentou comprar algo que nao podia pagar. Como recusa e o erro mais comum do jogo, isso acontecia direto. Agora a entrega volta pra fila e chega no pedido seguinte.',
      'DUPLICACAO POR CLIQUE DUPLO CORRIGIDA (critico). Dois cliques rapidos em "Entrar" abriam DUAS caçadas ao mesmo tempo. So uma era contabilizada; a outra ficava parada e, quando a primeira terminava, pagava de novo TODO o periodo. Medido: 30 minutos creditados duas vezes = +8.105 de ouro e +60 Pokemon do nada. Agora o banco so aceita uma caçada aberta por jogador, e o clique duplo simplesmente entra na mesma.',
      'BUSCA DE AMIGO PELO NICK CONSERTADA. Digitar "%" ou "___" mandava pedido de amizade pra um jogador qualquer, sem saber o nome dele — e dava pra descobrir nicks alheios por tentativa. A busca agora compara o nome inteiro.',
      'LIMITE DE 6 NA EQUIPE PASSOU A VALER DE VERDADE. Ele so existia na tela; o 7º Pokemon era recusado la no banco e voltava como "erro no servidor".',
      'POCAO NAO E MAIS GASTA A TOA. Usar Potion com a vida cheia consumia o item e nao curava nada. Agora o botao "Usar" some quando nao ha o que curar, igual ja acontecia com o Revive.',
      'LANCE DUPLICADO NO MERCADO: enviar um segundo lance no mesmo anuncio dizia "erro no servidor"; agora explica que ja existe um lance pendente. E quando dois lances eram aceitos ao mesmo tempo, os DOIS ficavam marcados como aceitos no historico (o dinheiro voltava certo, o registro e que mentia).',
      'CONFIGURACAO DO BOT VALIDADA: dava pra gravar milhares de regras de pocao de uma vez (o que travava a simulacao da caçada) e regras com valores sem sentido. Agora ha limite e checagem.',
      'O ranking do Perfil parava de contar a partir do jogador 1.000 e mostrava uma posicao errada sem avisar.',
      'Mensagens de limite no Mercado dizem qual e o teto em vez de so "valor invalido".',
    ],
  },
  {
    version: '5.5',
    date: '2026-08-09',
    title: 'O farm offline parava de render pra sempre depois que o Pokemon desmaiava',
    highlights: [
      'BUG CRITICO DO FARM OFFLINE CORRIGIDO. Quando o Pokemon desmaiava durante uma caçada, a caçada continuava "aberta" pra sempre com ele caido: cada vez que o jogo acertava as contas com o servidor, o periodo inteiro era consumido do relogio e a simulacao parava no primeiro instante, porque o Pokemon ja estava no chao. Medido antes do conserto: tres periodos seguidos de 6 horas foram consumidos e renderam ZERO de ouro, zero abates e nenhum aviso. Quem passasse uma noite fora voltava sem nada e sem explicacao.',
      'Agora a caçada TERMINA quando o Pokemon cai sem como levantar. O jogador volta pro Hospital, o relogio para de ser consumido, e o proximo periodo so comeca quando ele curar e entrar numa hunt de novo.',
      'O RELATORIO "BEM-VINDO DE VOLTA" APARECE MESMO QUANDO NAO RENDEU NADA, dizendo que o Pokemon desmaiou e a farm parou antes do tempo acabar. Antes ele so aparecia se tivesse havido pelo menos um abate — ou seja, justamente no caso do problema ele ficava calado.',
      'AVISO NA TELA quando o Pokemon cai numa hunt sem auto-revive (ou sem Revive na mochila): antes esse aviso so existia nas hunts BOSS, e nas outras o jogador ficava olhando um Pokemon deitado sem saber que nao estava mais ganhando nada.',
      'Nao da mais pra entrar numa hunt com o Pokemon desmaiado (o servidor tambem recusa).',
      'Hunts BOSS nao reanimam de proposito — mas a simulacao nao sabia disso e, com Revive na mochila, rodava as 6 horas inteiras com o Pokemon caido, sem explicar o zero no relatorio.',
      'O "tempo de jogo" do Perfil parou de contar tempo que nao foi jogado: contava o periodo inteiro mesmo quando a simulacao parava nos primeiros segundos (tres periodos de 6h viravam 30 horas de tempo jogado para 6 horas reais).',
      'LEMBRETE: o auto-revive vem DESLIGADO por padrao. Com ele ligado e Revive na mochila, o Pokemon levanta sozinho e a caçada continua enquanto voce estiver fora.',
    ],
  },
  {
    version: '5.4',
    date: '2026-08-09',
    title: 'Duplicacao de Pokemon corrigida, leilao no Mercado e compra em um clique',
    highlights: [
      'BUG CRITICO DE DUPLICACAO CORRIGIDO. O jogo grava o progresso de tempos em tempos, e varias acoes disparam essa gravacao — quando duas caiam no mesmo instante, as duas simulavam O MESMO periodo de caçada e cada uma gravava as capturas com identidade propria. Resultado: o mesmo Pokemon aparecia varias vezes na mochila. Medido antes do conserto: seis gravacoes simultaneas de 20 minutos de caçada geraram 396 Pokemon para 66 capturas reais. Agora o periodo e reservado por quem chega primeiro e as demais nao creditam nada — 61 capturas, 61 Pokemon.',
      'Junto disso, uma gravacao atrasada nao consegue mais desfazer o que outra fez: ela nao apaga Pokemon que chegou depois dela (compra no Mercado) nem devolve pra mochila um Pokemon que ja foi anunciado ou vendido.',
      'MERCADO — MODO SOMENTE LANCE: ao anunciar um Pokemon da pra publicar SEM preco de compra direta. Outros jogadores enviam ofertas e voce aceita ou recusa em "Anuncios Ativos". O valor de quem oferta fica retido na hora e volta inteiro se a oferta for recusada, cancelada ou se o anuncio sair do ar.',
      'MERCADO — FILTROS RAPIDOS: botoes de Gold, Diamante e Somente Oferta na aba Comprar, cada um liga e desliga sozinho.',
      'MERCADO — A lista de itens da aba Comprar so mostra o que realmente tem proposta ativa (antes listava os ~30 itens do jogo com "sem oferta" na maioria). Sem nenhuma proposta, a tela diz isso em vez de ficar vazia.',
      'LOJA — COMPRA EM UM CLIQUE: os botoes viraram +10, +100 e +1000 e executam a transacao na hora, sem confirmar. Vale pra comprar e pra vender. O campo de quantidade e o botao Comprar/Vender continuam la pra qualquer outro numero.',
      'ATALHO DA LOJA NO PAINEL AUTO: um botao no topo do painel leva direto pra Loja — a decisao "estou sem Poke Ball" nasce olhando as contagens desse painel.',
      'BOLINHA VERMELHA DE AVISO no Correio (mensagem nova ou item por coletar) e no Mercado (lance esperando resposta).',
      'CABECALHOS FIXOS: abas, busca e filtros de Mochila, Loja, Hunts, Mercado e Pokedex ficam travados no topo enquanto a lista rola.',
      'POKEDEX COM FILTROS RAPIDOS: "Hunt Atual" mostra so quem aparece na hunt em que voce esta, "Continente" so a regiao, "Pokedex" a lista inteira.',
      'HUNTS EM ORDEM DE NIVEL. A lista vinha agrupada por bioma e pulava de Lv1-10 pra Lv71-80 e voltava.',
      'RELATORIO DE FARM OFFLINE mostra QUANTOS niveis o Pokemon e o Treinador ganharam, com o antes e o depois ("+3 (Lv 12 → 15)") no lugar de um "Subiu de nivel!" que valia igual pra 1 ou pra 9 niveis.',
      'O Pokemon no Hospital ficou centralizado na tela.',
    ],
  },
  {
    version: '5.3',
    date: '2026-08-09',
    title: 'Pokemon forte fora do inicio, 500 itens pra todo mundo e o duplo clique de volta',
    highlights: [
      'BUG DE BALANCEAMENTO (grave): Pokemon forte aparecia na PRIMEIRA hunt do jogo. Scizor, Heracross, Scyther e Pinsir (500 de status total) nasciam na Zona 0, de nivel 1 a 10; Meganium e Venusaur tambem; Kingdra, Gyarados, Lapras e Blastoise apareciam na Zona 1; e Tyranitar (600) na Zona 2. Agora cada especie tem um NIVEL MINIMO derivado da forca e do estagio de evolucao, e nenhuma passa dele.',
      'ZONAS AVANCADAS: quem foi tirado do inicio nao sumiu do jogo — cada bioma ganhou versoes de nivel mais alto conforme precisou. "Johto Zona 5 · Bosque" (Lv 51-60) existe porque Scizor e Heracross precisavam de casa; "Johto Zona 7 · Caverna" (Lv 71-80) e onde o Tyranitar foi parar. Sao 69 hunts normais no lugar de 36.',
      'Formas finais continuam em 0,2% nas hunts comuns, mas a regra deixou de valer nas zonas que sao MAJORITARIAMENTE de formas finais — nelas, forcar 0,2% dava mais de 99% da hunt pro unico POKE que nao era forma final.',
      'CHANCE DE SHINY CORTADA PELA METADE. A formula nao mudou (especie mais facil de capturar continua tendo mais chance de shiny) — so o multiplicador global caiu de 200x para 100x sobre a taxa original do Gen2.',
      'TODO JOGADOR NOVO COMECA COM 500 Poke Ball, 500 Potion e 50 Revive (era 200/200/10).',
      'QUEM JA JOGAVA RECEBEU A MESMA QUANTIDADE PELO CORREIO: abra o Correio e clique em "Coletar" na mensagem "Reposicao de suprimentos". O Correio ganhou anexo de itens de verdade — com botao de coletar, e a coleta so acontece uma vez.',
      'BUG CORRIGIDO: o duplo clique que desliga um golpe tinha parado de funcionar. O evento sempre disparou; o problema e que a escolha nunca chegava ao servidor (que e quem decide o golpe em combate) e nem sequer tinha onde ser salva no banco. Agora vale na hora, vale no combate e sobrevive ao logout.',
      'Icones das skills preenchem o slot inteiro: o fundo preto que vinha dentro da propria arte foi removido no desenho, e o icone aparece sobre a cor do elemento.',
      'A janela do Correio deixou de parecer desabilitada — texto com contraste normal, no mesmo peso visual das outras janelas.',
      'CORES DE RARIDADE NO LOG: a cor agora pinta so a PALAVRA da raridade, e nao o nome do Pokemon. O abate passou a mostrar a raridade tambem: "Rattata [RARO] derrotado!" com apenas RARO em azul.',
    ],
  },
  {
    version: '5.2',
    date: '2026-08-09',
    title: 'Arte de golpe em 8 elementos, icones de skill, ataque do Charmander e menus mais densos',
    highlights: [
      'ARTE DE GOLPE EM MAIS 7 ELEMENTOS: Agua, Raio, Normal, Grama, Inseto, Lutador e Pedra ganharam animacao real em vez do efeito colorido generico — cada um com uma animacao pra alvo unico e outra pra area, esta ultima desenhada no tamanho exato da area atingida. Com o Fogo (versao 5.1), sao 8 dos 17 tipos com arte propria; os outros 9 seguem no efeito por cor.',
      'ICONES DE SKILL: cada slot da barra de golpes passou a mostrar um icone do elemento (chama, raio, redemoinho, pedra, garra...) no lugar das tres letras do nome do golpe. O nome completo continua no tooltip e o dano base continua na faixa de baixo do slot.',
      'BUG CORRIGIDO: o Charmander (e outras 14 especies) nao tinha animacao de ataque — ele atacava com a pose de PARADO. Essas especies nao tem a animacao "Shoot" no pacote de arte, e o jogo caia direto em "Idle" sem tentar a pose de investida, que elas TEM. Agora tenta a investida primeiro.',
      'Toda sprite de ataque passou a ser desenhada com 90% de opacidade. O efeito procedural ja era assim; a arte real saia opaca, entao os dois tinham peso visual diferente na tela.',
      'NOMES DE POKE COLORIDOS NO LOG: no chat (abas Sistema e Log) e nos avisos flutuantes, o nome do POKE sai na cor da raridade dele — abate, captura, subida de nivel, desmaio, evolucao e troca de equipe. Da pra ver que apareceu algo raro sem abrir a mochila.',
      'MENUS MAIS COMPACTOS: revisao geral de espacamento em janelas, cards e botoes. Menos espaco vazio, mais informacao visivel por tela, sem mudar tamanho de fonte.',
      'AUTO-POT AGORA VEM CONFIGURADO EM 70% DE VIDA (era 50%). Quem ja tinha mexido na porcentagem mantem a escolha; quem nunca mexeu foi movido pro novo padrao.',
      'HUNT INICIAL SO COM POKEMON NORMAL: Route 46 (Inicial) passou a ter apenas Sentret, Hoothoot e Rattata. Ledyba e Spinarak sairam de la e continuam aparecendo nas zonas de Inseto.',
    ],
  },
  {
    version: '5.1',
    date: '2026-08-08',
    title: 'Novo jogo consertado, level up destravado, economia mais barata e fogo com arte',
    highlights: [
      'BUG CORRIGIDO (grave): "Iniciar novo jogo" NAO funcionava. O reset tentava devolver seu nome de treinador pro padrao "Treinador", batia na regra de nome unico e a operacao inteira falhava com erro de servidor — nada era apagado. Agora o nome sobrevive ao reset (ele e sua identidade publica, nao progresso) e o resto e apagado de verdade.',
      'O reset tambem passou a limpar o que ficava pra tras: anuncios e ordens suas no Mercado, POKE que estava a venda, entregas pendentes e o historico de tempo de jogo. Antes dava pra zerar a conta e continuar com um POKE anunciado, compravel por outra pessoa.',
      'BUG CORRIGIDO (grave): a barra de EXP do POKE chegava a 100% e o nivel nao subia. A barra media por uma curva e o level up por outra (a que ficou 30% mais cara na versao 5.0), entao faltava sempre um pedaco invisivel. As duas passaram a ser a mesma conta.',
      'BUG CORRIGIDO: "dou F5 e perco niveis". O que a tela mostra entre uma gravacao e outra e previsao; quem credita e o servidor. Agora todo level-up (do POKE ou do Treinador) forca a gravacao na hora, e ocultar/minimizar a aba tambem grava. A janela em que a tela podia estar adiantada caiu de 30 segundos pra 5.',
      'CRIACAO DE PERSONAGEM EM DUAS TELAS: o nome do treinador virou a PRIMEIRA tela, e so depois de confirmar vem a escolha do POKE inicial. Vale tambem depois de "Iniciar novo jogo" — antes, recomecar nao dava nenhuma chance de trocar o nome.',
      'Jogador novo (e conta resetada) comeca com 200 Poke Ball e 200 Potion — era 100 de cada. O Revive segue em 10.',
      'POCOES E POKEBOLAS 70% MAIS BARATAS: Poke Ball 200 -> 60, Great Ball 600 -> 180, Ultra Ball 1.200 -> 360, Premier Ball 3.000 -> 900, Potion 300 -> 90, e o mesmo corte nas demais pocoes. O preco de VENDA acompanha o desconto de proposito: comprar e revender continua dando prejuizo, como sempre foi.',
      'VENDA DE POKE VIROU 1.000 + BONUS, em vez de "no minimo 1.000". Antes o piso engolia os bonus ate a formula passar de 1.000 sozinha, e um POKE comum de nivel 40 valia o mesmo que um de nivel 1. Agora nivel, raridade e status somam por cima da base desde o primeiro ponto.',
      'CHANCE DE APARICAO DAS TERCEIRAS EVOLUCOES FIXADA EM 0,2% em toda hunt (o Dragonite, que tinha 1% por regra propria, entrou nesta). As demais especies dividem o restante mantendo a raridade relativa que ja tinham; a soma de cada hunt continua fechando 100%. Hunts BOSS ficam de fora — la o elenco e a luta.',
      'FOGO GANHOU ARTE DE VERDADE: golpes do tipo Fogo deixaram de usar o efeito generico e passaram a mostrar uma animacao real — chama em quadros no alvo unico, e explosao seguida de nuvem queimando nos golpes em area, desenhada no tamanho exato da area atingida. Os outros 16 tipos continuam com o efeito colorido por elemento.',
    ],
  },
  {
    version: '5.0',
    date: '2026-08-08',
    title: 'Mercado entre jogadores, Chat Mundo, Correio, Hunt Analyzer e zonas honestas',
    highlights: [
      'WIPE GERAL. Todo jogador recomeca do zero: POKEs, mochila, ouro, Pokedex, nivel de treinador e hunts liberadas foram reiniciados. O NOME do treinador foi preservado — ele virou identidade publica e nao pode mudar sozinho.',
      'NOVO — MERCADO ENTRE JOGADORES (menu do rodape). Itens funcionam como livro de ofertas: voce define preco e quantidade, e sua ordem casa sozinha com a melhor do outro lado, pagando o preco de quem ja estava la (o troco volta na hora). O que nao casar fica esperando no livro. Pokemon vai por anuncio de preco fixo, em Ouro ou Diamante, com busca por especie, nivel minimo, IV minimo, raridade e shiny.',
      'No Mercado, o que voce anuncia sai do inventario na hora e volta se voce cancelar — nao da pra vender duas vezes o mesmo estoque. Quem vende recebe assim que abre o jogo, mesmo que estivesse offline na hora da venda. Abas "Anuncios Ativos" e "Historico" mostram o que esta de pe e o que ja foi negociado.',
      'NOVO — CHAT MUNDO de verdade: a aba "Mundo" agora e so mensagem ao vivo de outros jogadores, com campo pra escrever. Os avisos do jogo que ficavam la mudaram pra uma aba nova, "Sistema".',
      'NOVO — Shift + clique esquerdo num item ou POKE (Mochila, Equipe ou Loja) injeta um link dele no chat. Quem le passa o mouse em cima e ve os status resumidos — no caso de POKE, nivel, raridade e IV medio do momento em que foi linkado.',
      'NOVO — CORREIO E AMIZADES: adicione alguem pelo nick e o pedido chega na caixa de entrada da pessoa com botao de aceitar. Amizade aceita aparece nas duas listas.',
      'NOVO — NOME DO TREINADOR NO CADASTRO: quem cria conta escolhe o proprio nick (3 a 16 caracteres, unico no servidor). Ele aparece no chat, no ranking, no Mercado e e por ele que amigos te encontram.',
      'NOVO — HUNT ANALYZER: clique no card de taxas (canto superior esquerdo). Abre uma janela com ouro/XP/abates por hora, media por abate, tempo medio por abate, projecao de ouro em 1h e 8h, quanto falta pro proximo nivel do POKE e do Treinador nesse ritmo, e a lista completa do que nasce na hunt com a chance real de cada especie.',
      'BUG CORRIGIDO (grave): o nome da zona nao batia com o nivel que ela spawnava. "Zona Nivel 31-40" entregava POKE de nivel 15 e de nivel 51; "Zona Nivel 1-10" entregava ate nivel 12. Agora a faixa e a fonte unica: as zonas se chamam "Zona 0" (Lv 1-10), "Zona 1" (Lv 11-20), "Zona 2" (Lv 21-30) e assim por diante, e nenhum POKE nasce fora da faixa anunciada.',
      'Consequencia do item acima: o topo das hunts normais passou de Lv105 pra Lv90 (nove zonas de dez niveis, sem buraco entre elas). O conteudo acima disso continua sendo o Modo Pesadelo e as hunts BOSS.',
      'BUG CORRIGIDO: no Modo Pesadelo da hunt inicial, os POKE nasciam nivel 1 e 2 num mapa anunciado como Lv150 — a hunt mais dificil do inicio era a mais facil.',
      'EVOLUIR FICOU 30% MAIS CARO: o EXP necessario pra cada nivel de POKE subiu 30%. Como toda evolucao aqui depende de nivel, isso e o custo de evoluir. O nivel de TREINADOR nao mudou.',
      'Painel Auto reorganizado: auto-catch, auto-pot e auto-revive viraram tres blocos separados, cada um com o proprio interruptor e as proprias regras. Os seletores de bola e pocao passaram a mostrar o icone do item e quanto voce tem de cada um.',
      'NOVO no painel Auto: previsao de quanto tempo os suprimentos ainda duram, medida pelo consumo real da sessao. So aparece quando falta menos de 2 horas.',
      'O aviso de "sem bola/pocao/revive" tambem passou a ficar registrado no chat (aba Sistema) — antes ele so existia enquanto voce estava olhando pra tela.',
      'Tooltips: passar o mouse num item mostra o que ele faz em numeros (quanto cura, quanto multiplica a captura, quanto custa). Passar o mouse num golpe mostra tipo, categoria, dano base, PP, recarga, area e a descricao dele. Golpe sem dano avisa explicitamente que o efeito original nao e simulado neste jogo.',
      'Loja: botoes de quantidade x10/x100/x1000 e "Max", total da operacao mostrado antes de confirmar, "Vender tudo" por item (separado do "Vender Tudo" geral) e rolagem horizontal nas colunas pra nada ficar cortado em tela estreita.',
      'Item trancado agora vai pro fim da lista, na Mochila e na Loja.',
      'Bestiario passou a listar na ordem oficial da Pokedex.',
      'Ouro e Diamantes ficam ancorados ao lado dos dados do treinador, no canto superior direito, em qualquer largura de tela.',
      'Fonte da interface inteira 3px maior. Em celular isso aperta o encaixe, entao a escala minima da HUD (Configuracoes) desceu pra 0,7 pra quem preferir o tamanho anterior.',
      'Auras de IV maximo agora se somam em vez de uma cobrir a outra: um POKE com dois ou mais atributos perfeitos ganha um halo com as cores misturadas.',
    ],
  },
  {
    version: '4.2',
    date: '2026-08-08',
    title: 'Treinador original, venda de POKE a partir de 1.000G e ranking clicavel',
    highlights: [
      'VENDA DE POKE VALE NO MINIMO 1.000 DE OURO. Vale pra qualquer POKE, de qualquer nivel e raridade; quem ja valia mais que isso continua valendo o mesmo (raridade e nivel seguem multiplicando por cima).',
      'O ouro por ABATE nao mudou. Ele sai da mesma formula da venda, mas o piso e regra de venda: sem essa separacao, o ouro por kill na hunt inicial teria pulado de ~5 pra ~330 sem ninguem pedir. Na pratica, capturar e vender agora rende MUITO mais que so matar — 40 minutos de cacada renderam ~1.000 de ouro em abates contra ~21.000 vendendo as capturas do mesmo periodo.',
      'NOVO — Treinador original: todo POKE guarda para sempre o nome de quem o capturou, gravado no instante da captura. O card do POKE mostra esse nome. Os POKE que ja existiam receberam o nome do dono atual (nao ha troca entre jogadores no jogo, entao dono e capturador sao a mesma pessoa).',
      'Ranking de Pokemon ficou clicavel: clicar numa linha abre o card completo daquele POKE — os atributos, IVs e HP reais dele, e o treinador dono — e nao uma reconstrucao aproximada.',
      'Calculadora de Forca: os seis atributos viraram campos editaveis. Da pra digitar um valor por atributo pra simular "e se", com o valor calculado mostrado embaixo e um botao pra voltar atras. Trocar nivel ou raridade recalcula so os atributos que voce NAO editou.',
      'O bot avisa quando um consumivel esta acabando: com menos de 10 unidades de um item que uma automacao LIGADA usa, a contagem dele e o botao "auto" piscam em vermelho. Item de automacao desligada nao alerta.',
      'Bug corrigido: no combate, o POKE atacava virado pra onde estava andando quando parou — muitas vezes de costas pro alvo. Agora ele se vira de frente pro alvo no instante do golpe.',
      'O painel Auto passou a mostrar tambem a quantidade de Revive, que era o unico consumivel do bot sem contagem visivel.',
    ],
  },
  {
    version: '4.1',
    date: '2026-08-08',
    title: 'Johto e Kanto separados, Ranking, Perfil do Treinador e economia reiniciada',
    highlights: [
      'INVENTARIO E ECONOMIA REINICIADOS pra todos os jogadores. POKEs, nivel, Pokedex e hunts liberadas continuam intactos — o que zerou foi o estoque e a carteira.',
      'Novos valores de inicio (e o que todo mundo recebeu no reinicio): 1.000 de ouro, 0 diamantes, 100 Poke Ball, 100 Potion e 10 Revive. Great/Ultra/Premier Ball, Super/Hyper/Max Potion e Max Revive deixaram de ser dados de graca — agora sao comprados ou dropados.',
      'HUNTS SEPARADAS POR REGIAO: hunt de Johto so tem POKE de Johto, hunt de Kanto so tem POKE de Kanto. Como quase toda hunt era mista, cada bioma passou a existir NAS DUAS regioes — sao 35 hunts agora (eram 19), cada regiao com uma escada completa de nivel. Nenhuma especie ficou sem lugar pra aparecer.',
      'Porygon, Porygon2 e Eevee sairam de todas as tabelas de spawn selvagem (sao POKE de cassino/presente). Eles continuam no Bestiario e na Pokedex, mas hoje nao ha outra forma de obte-los no jogo.',
      'Hunt inicial (Johto Route 46): agora sai exatamente 80% de POKE nivel 1 e 20% nivel 2, e o elenco dela passou a ser so de Johto (Sentret, Hoothoot, Ledyba, Spinarak).',
      'Shiny ficou bem mais forte: os atributos base de um shiny passaram a ser multiplicados por 1,5 (era 1,2). A chance de encontrar shiny NAO mudou — continua a formula de sempre.',
      'Os atributos de todo POKE passaram a ser recalculados ao carregar o jogo, entao mudancas de balanceamento como essa valem pra equipe inteira, e nao so pros POKE capturados depois.',
      'NOVO — Ranking (menu "Mais"): Treinadores por nivel, Pokemon por nivel/Dano Fisico/Dano Especial/HP/Defesa/Defesa Especial/Velocidade, e um Hall da Fama com os primeiros a derrotar o Campeao Lance.',
      'NOVO — Perfil do Treinador: clique na sua foto, no canto superior direito. Mostra nick, nivel, sua posicao no ranking geral, % da Pokedex, ouro, diamantes, batalhas vencidas, shinys derrotados, tempo de jogo e um log das ultimas capturas.',
      'NOVO — Tutorial do Bot na primeira vez que voce joga, e um menu "Repetir Tutoriais" (dentro de "Mais") pra rever quando quiser.',
      'Bot muda de configuracao inicial: pocao a 50% de vida (era 40%), e auto-catch e auto-revive agora comecam DESLIGADOS — os dois gastam item a cada uso, e o estoque inicial ficou bem menor.',
      'Sprites de batalha voltaram ao tamanho original do arquivo. Todo redimensionamento por altura da especie foi removido (inclusive o dos lendarios).',
      'O aviso de contagem do Auto-Revive (e os avisos de BOSS/Lance) deixaram de cobrir a tela inteira — agora ficam restritos ao campo de batalha e nao passam por cima do menu de baixo.',
      'Subir de nivel passou a mostrar quanto cada atributo ganhou, e o relatorio de captura no chat passou a dizer a raridade do POKE capturado.',
      'Calculadora de Forca: os POKE da sua equipe aparecem primeiro na lista de selecao.',
      'Icone do menu Equipe trocado. Cabecalho do treinador ficou mais compacto (a foto continua do mesmo tamanho).',
      'Conexao mais estavel: as chamadas ao servidor ganharam tempo limite e nova tentativa automatica em falha de rede, e as mensagens de erro passaram a dizer o que houve ("sem conexao", "o servidor demorou demais") em vez do generico "nao foi possivel falar com o servidor" repetido a cada 30 segundos.',
      'Bug corrigido: recarregar a pagina em /jogo, /login ou /registro devolvia erro 404 no site publicado.',
      'Bug corrigido: os icones de POKE do relatorio de farm offline usavam o recorte errado e varios apareciam cortados ou em branco.',
      'Bug corrigido: o Modo Pesadelo espelhava a composicao ANTIGA das hunts — agora ele reflete o elenco separado por regiao, e as hunts novas tambem ganharam espelho.',
    ],
  },
  {
    version: '4.0',
    date: '2026-08-08',
    title: 'Reinicio geral, interfaces mais leves e correcoes de sprite',
    highlights: [
      'REINICIO GERAL DO SERVIDOR: o progresso de todos os jogadores foi apagado e todo mundo comeca do zero. As contas e os logins continuam os mesmos — voltam com 500.000 de ouro, 10.000 de cada consumivel e todas as hunts sem custo liberadas.',
      'Ganho de XP reduzido em 50% (por POKE e por Treinador).',
      'Golpes de nivel 50 (Explosao Elemental): PP passou de 15 pra 7, ou seja, o cooldown mais que dobrou (de ~1,9s pra 4s).',
      'Golpes de nivel 50 tambem mudaram de regra: se eles contam como Fisico ou Especial passa a ser decidido pelos atributos que o POKE tem EXATAMENTE no nivel 50, e nao pelos atuais. Antes a categoria podia mudar sozinha ao subir de nivel ou evoluir, trocando a formula de dano no meio do jogo.',
      'Mochila e Loja ficaram leves: as listas agora vem paginadas em 30 por pagina, em vez de desenhar centenas de cartoes de uma vez. Busca, filtros, ordenacao, "Selecionar tudo" e "Vender Tudo" continuam valendo pra colecao inteira, nao so pra pagina visivel.',
      'Bug visual corrigido: no primeiro encontro com cada especie aparecia uma forma geometrica colorida por alguns instantes no lugar do POKE. Agora a arte da hunt inteira (todas as especies do local, versao normal e shiny, mais o cenario) e carregada antes da cena aparecer.',
      'Bug corrigido: trocar de POKE em campo ou evoluir nao mudava a sprite na hora — ela so trocava depois do POKE usar um golpe. Agora a troca e imediata.',
      'Bug corrigido: "Iniciar novo jogo" apagava o progresso mas deixava a conta travada — nem escolher um novo inicial funcionava. O reinicio agora tambem encerra a caçada em andamento, e limpa a Pokedex e as regras de auto-captura, que antes sobreviviam ao reinicio.',
      'Bug corrigido: as regras de auto-captura por especie nunca eram salvas — desapareciam ao recarregar o jogo.',
      'Bug corrigido: curar na enfermeira do Hospital repunha o HP mas deixava o POKE marcado como desmaiado, e ele continuava sem lutar na hunt seguinte.',
      'Interface: o retrato do POKE ativo agora preenche a moldura do cabecalho; os icones de golpe ficaram menores e encolhem sozinhos em tela estreita; o bloco de contagem de bolas abaixo do botao "auto" foi removido (a mesma contagem continua dentro do painel Auto); setas e emojis usados como icone na Mochila, na Loja e na Wiki foram trocados pelos icones de verdade do jogo.',
    ],
  },
  {
    version: '3.8',
    date: '2026-08-06',
    title: 'Farm offline corrigido: tempo em segundo plano deixa de ser perdido',
    highlights: [
      'Bug real corrigido (o motivo de "o offline nao funciona em alguns aparelhos"): com a aba minimizada, navegadores como Chrome e Edge nao congelam o jogo — eles deixam ele acordar so uma vez por minuto, e cada despertar desses avancava apenas 1 segundo de jogo. Na pratica, 3 horas em segundo plano rendiam cerca de 3 minutos. Aparelhos que congelam a pagina de vez (celulares, aba descartada) nunca sofreram disso, por isso o problema so aparecia em alguns dispositivos. Agora o jogo compara o relogio real com quanto tempo de fato foi simulado e recupera a diferenca inteira.',
      'O jogo agora salva tambem no momento em que a aba e ocultada. Navegador de celular costuma encerrar uma aba em segundo plano sem avisar, e o horario do ultimo save e justamente o que mede seu tempo fora — sem isso, parte do tempo offline simplesmente nao era contada.',
      'Ficar muito tempo fora nao trava mais o aparelho: a recuperacao de tempo tinha custo ilimitado e podia congelar (ou fazer o navegador matar) a pagina, e como o save so acontecia no fim, o progresso era perdido e a mesma travada se repetia a cada abertura. Agora o calculo tem teto: em periodos muito longos ele fica menos detalhado, mas o tempo continua sendo creditado.',
      'Bug real corrigido: depois da primeira captura, o jogo parava de salvar completamente, sem nenhum aviso — o que tambem derrubava o farm offline junto (sem save, nao ha como medir o tempo fora).',
      'Relogio do aparelho adiantado/atrasado (ou trocado manualmente) nao deixa mais o farm offline travado ate a hora real "alcancar" o horario errado.',
      'Se o navegador estiver bloqueando o armazenamento (ex: aba anonima do Safari), o jogo agora avisa na tela em vez de falhar em silencio — sem save nao existe farm offline nem progresso guardado.',
      'A recuperacao de tempo passou a valer tambem em situacoes que antes nao disparavam nada: voltar pelo botao "voltar" do navegador, notebook que dormiu com a aba aberta na frente, e tela de celular desligada em alguns navegadores Android.',
    ],
  },
  {
    version: '3.7',
    date: '2026-08-06',
    title: 'Texto do nome do golpe: fonte menor, deslocado pra nao encostar no nome',
    highlights: [
      'O texto que mostra o nome do golpe usado (acima do POKE em combate) ficou com fonte menor (8px, era 10px) e foi deslocado 2px pra baixo, garantindo folga em relacao ao nome/nivel do POKE logo abaixo dele.',
    ],
  },
  {
    version: '3.6',
    date: '2026-08-06',
    title: 'Zoom padrao da camera agora comeca em 150%',
    highlights: [
      'O zoom inicial da camera (mostrado no controle +/- no canto superior direito) mudou pra 150%, tanto nas hunts quanto na cena do Hospital. Ainda da pra ajustar livremente com os botoes +/- ou Ctrl+Scroll, pra qualquer lado.',
    ],
  },
  {
    version: '3.5',
    date: '2026-08-06',
    title: 'Auto/Chat/Hunt Analyser agora ficam em segundo plano ao abrir outra janela',
    highlights: [
      'Pedido explicito do usuario: quando qualquer janela principal (Equipe, Mochila, Hunts, Loja, Pokedex, Wiki, Config, ou um cartao de POKE) abre por cima, os paineis Auto, Chat/Log e Hunt Analyser (Ouro/H, XP/H) agora ficam visualmente atras dela em vez de continuar flutuando por cima — clicar onde eles estariam agora interage com a janela aberta, nao com esses paineis.',
      'O menu inferior de navegacao e o controle de zoom continuam sempre por cima, pra dar sempre pra trocar de janela num clique so.',
    ],
  },
  {
    version: '3.4',
    date: '2026-08-06',
    title: 'Janela da Wiki agora se ajusta pra caber a tabela de tipos',
    highlights: [
      'A janela da Wiki era limitada a mesma largura compacta (480px) de todos os outros menus, entao a tabela completa de efetividade de tipos (17x17) so cabia com bastante scroll horizontal escondido. Agora a janela da Wiki cresce ate 700px quando a tela permite — em telas menores que isso, a tabela continua com seu proprio scroll horizontal interno, sem cortar nada.',
      'Os outros menus (Equipe/Mochila/Hunts/Loja/Config) continuam na mesma largura compacta de sempre.',
    ],
  },
  {
    version: '3.3',
    date: '2026-08-06',
    title: 'Cartao do POKE: Vantagens de tipo + Pokedex abre automatico',
    highlights: [
      'O cartao de status agora mostra tambem "Vantagem contra" (quais tipos este POKE causa 2x de dano ao atacar), lado a lado com Fraquezas e Resistencias, em qualquer menu.',
      'Pokedex: selecionar uma especie abre o cartao automaticamente — nao precisa mais clicar num botao separado "Ver cartao do POKE" (removido).',
    ],
  },
  {
    version: '3.2',
    date: '2026-08-06',
    title: 'Combate: cancelamento de golpe ao morrer + AoE corrigido + rebalanceamento de XP/Ouro',
    highlights: [
      'Bug real corrigido: um POKE derrotado ENTRE o inicio de um golpe (pose de ataque) e o instante em que o dano realmente e aplicado continuava acertando o alvo do alem-tumulo — agora a acao e cancelada por completo se quem a usou ja estiver morto quando o golpe chegaria a resolver.',
      'Bug real corrigido: golpes em area (AoE) so atingiam inimigos ja "engajados" em combate corpo-a-corpo com o jogador, entao o raio real do golpe (240) nunca fazia diferenca nenhuma — todo inimigo fora do toque direto ficava de fora mesmo dentro do circulo. Agora o AoE atinge de verdade qualquer inimigo vivo dentro do raio real da habilidade.',
      'XP por abate reduzido em mais 30% sobre o valor atual.',
      'Ouro por abate revertido para a formula original (removido o bonus extra de +300% de uma leva anterior).',
    ],
  },
  {
    version: '3.1',
    date: '2026-08-05',
    title: 'HUD mobile: menu inferior e painel Auto ficavam cortados',
    highlights: [
      'Bug real corrigido: em telas de celular (~375px de largura), o menu inferior (Equipe...Config) nao cabia numa linha so e 4 botoes (Pokedex, Wiki, Hospital, Config) ficavam fora da area visivel — so alcancaveis por um scroll horizontal escondido, sem nenhuma pista visual de que existia. Agora o menu quebra em 2 linhas em telas estreitas, com todos os 8 botoes sempre visiveis.',
      'O painel "Automacoes" tambem vazava 55px pra fora da tela em celulares (a posicao fixa era pensada pra desktop) — cortando os controles do lado direito. Agora se ajusta a largura da tela em vez de vazar.',
      'PC/telas largas nao mudam nada (os dois ajustes so entram em telas ate 520px de largura).',
    ],
  },
  {
    version: '3.0',
    date: '2026-08-05',
    title: 'Cartao do POKE na Pokedex + fraquezas em todo cartao de status',
    highlights: [
      'Pokedex ganhou o botao "Ver cartao do POKE" em cada especie — abre o mesmo cartao animado (sprite, HP/EXP, abas Status/Golpes) usado em Equipe/Mochila/Loja/Hospital/HUD, montado com um POKE de exibicao (Lv50, IVs maximos) ja que a Pokedex nao tem uma instancia real capturada.',
      'O cartao de status (aba "Status") agora mostra Fraquezas e resistencias em qualquer lugar do jogo, nao mais so na Pokedex — mesma logica compartilhada dos dois lugares, incluindo o aviso de fraqueza dupla (4x).',
    ],
  },
  {
    version: '2.9',
    date: '2026-08-05',
    title: 'Hunt Analyser/Auto/Log ficavam presos atras de janelas abertas',
    highlights: [
      'Bug real corrigido: abrir qualquer janela flutuante (perfil de um POKE, confirmacao de venda, resumo do Farm Offline) colocava o fundo escurecido dessa janela ACIMA do painel Hunt Analyser, do botao/painel Auto e do chat/log — os paineis pareciam presentes na tela mas um clique neles na verdade fechava a janela por baixo, em vez de abrir o Auto ou trocar de aba no log.',
      'Os 3 paineis agora ficam sempre acima de qualquer janela/modal aberto (continuam abaixo dos splashes de vitoria/derrota e "LVL UP!", que sao intencionalmente um interrupt de tela cheia).',
    ],
  },
  {
    version: '2.8',
    date: '2026-08-05',
    title: 'Corrigido: Farm Offline/catch-up travava apos o primeiro ataque',
    highlights: [
      'Bug real encontrado e corrigido: toda simulacao silenciosa (Farm Offline ao reabrir o jogo, e o catch-up de aba minimizada) travava o POKE parado em "engaged" para sempre assim que ele desferia o primeiro ataque — o cronometro que trava o movimento durante a pose de ataque so era descontado pelo sistema de animacao, que e pulado de proposito nesses modos silenciosos por ser so visual. Na pratica isso reduzia horas de Farm Offline a pouquissimos abates (so quando um inimigo errante encostava por acaso no jogador congelado).',
      'Agora esse cronometro sempre desconta, silencioso ou nao — testado ao vivo: 720 segundos simulados renderam 288 abates a um ritmo constante, contra 3 abates (e travamento total) antes da correcao.',
    ],
  },
  {
    version: '2.7',
    date: '2026-08-05',
    title: 'Wiki corrigida + tabela de tipos completa',
    highlights: [
      'Corrigidas informacoes divergentes na Wiki: a captura e sempre automatica (via auto-catch, nao existe botao de jogar bola manualmente), o icone da Equipe e uma Pokebola (nao mais o emoji de baseball), a barra de habilidades fica no centro inferior da tela (nao "acima do botao Auto"), e a IA so troca pra AOE quando ele realmente acertaria 2+ inimigos.',
      'Aba "Efetividade de Tipos" ganhou a tabela completa 17x17 (golpe atacante x POKE defensor), com rolagem horizontal propria e cores por multiplicador.',
    ],
  },
  {
    version: '2.6',
    date: '2026-08-05',
    title: 'Fraquezas e resistencias na Pokedex',
    highlights: [
      'Cada especie na Pokedex agora mostra sua secao de "Fraquezas e resistencias": contra quais tipos ela recebe dano dobrado, reduzido ou nulo — calculado com a tabela real de tipos do jogo (a mesma usada em combate), inclusive combinando os dois tipos de POKEs duplos.',
      'POKEs cujos dois tipos sao fracos ao mesmo elemento (ex.: Charizard Fogo/Voador contra Pedra) ganham um aviso separado de "Fraqueza dupla (4x de dano)".',
    ],
  },
  {
    version: '2.5',
    date: '2026-08-05',
    title: 'Colisao de paredes pausada temporariamente',
    highlights: [
      'Sistema de colisao contra paredes/obstaculos (agua, cavernas, penhascos) pausado temporariamente — POKEs podem andar livremente por qualquer parte do mapa. O limite circular da borda de cada hunt continua normal.',
    ],
  },
  {
    version: '2.4',
    date: '2026-08-05',
    title: 'Correcao real do desbloqueio pos-Lance (Modo Pesadelo)',
    highlights: [
      'Corrigido bug real: todas as hunts do Modo Pesadelo (as 19 zonas espelhadas + as 11 hunts BOSS de lendarios) ficavam permanentemente marcadas como "Bloqueado - Derrote o Campeao Lance", mesmo depois de realmente derrota-lo — o desbloqueio de continente so soltava Kanto, nunca o Modo Pesadelo. Agora o Modo Pesadelo fica liberado desde o inicio (como sempre foi a intencao) tanto em jogos novos quanto em saves ja existentes.',
    ],
  },
  {
    version: '2.3',
    date: '2026-08-05',
    title: 'Novo menu Wiki: guia completo do jogo',
    highlights: [
      'Novo menu principal "Wiki" (📚), com 4 abas: Primeiros Passos, Efetividade de Tipos, Raridades Pokemon e Mecanicas.',
      '"Primeiros Passos" explica como comecar, como funciona o combate automatico, como navegar pelos menus e como progredir nas hunts.',
      '"Efetividade de Tipos" e uma ferramenta interativa: escolha qualquer um dos 17 tipos elementais e veja, com dados reais do jogo, contra quais tipos ele e super eficaz/resistido/imune tanto atacando quanto defendendo.',
      '"Raridades Pokemon" documenta a tabela completa (Comum a Mythic) com chance/multiplicador de status/multiplicador de venda de cada uma, alem de explicar Shiny e os lendarios como eixos separados.',
      '"Mecanicas" detalha captura, agressividade/lure, distancia de visao da camera, habilidades em area (AoE) e o sistema de recarga (cooldown por PP + Velocidade).',
    ],
  },
  {
    version: '2.2',
    date: '2026-08-05',
    title: 'Golpe AoE de nivel 50, debuffs reais, IA de caca ativa e ajustes de Lance',
    highlights: [
      'Todo POKE agora aprende um golpe em area exclusivo ao atingir o nivel 50, tematizado pelo seu tipo primario — a categoria (Fisico/Especial) e decidida automaticamente pelo maior atributo de ataque do proprio POKE.',
      'Self-Destruct/Explosion agora custam 50% da vida atual de quem usa o golpe, corrigindo o recuo que nunca era aplicado.',
      'Duplo clique num icone de habilidade liga/desliga o uso automatico dela pela IA de combate.',
      'Distancia de lure (aggro) dos selvagens reduzida para um alcance moderado (era 2.5x o valor real da planilha).',
      'POKE principal agora sempre foca e caca ativamente o inimigo vivo mais proximo pelo mapa, redefinindo o alvo a cada abate, em vez de priorizar quem ja estava vindo em sua direcao.',
      'Hunt Inicial troca Geodude por Sentret; Wooper e Quagsire saem da zona costeira (Agua) e passam a aparecer na zona do Deserto (Terra); Dragonite agora aparece em Ruinas Ancestrais com exatamente 1% de chance.',
      'Verificado ao vivo que Kanto desbloqueia corretamente apos vencer o Campeao Lance (persiste em save/reload). Novo botao "Retornar ao Centro Pokemon" aparece na hunt do Lance so depois da vitoria.',
      'Distancia de visao padrao da camera aumentada para 160% (nas hunts e no Hospital), mantendo o zoom manual disponivel para ajustar ainda mais.',
      'Pokebola so e jogada depois que o "corpo" do POKE derrotado desaparece por completo do campo, nao mais so apos a animacao de desmaio terminar.',
      'Taxa de drop de Stones reduzida de 20% para 5% por abate.',
    ],
  },
  {
    version: '2.1',
    date: '2026-08-05',
    title: 'Pathfinding real, mecanicas do Campeao Lance, sincronia de captura e escala de fundo',
    highlights: [
      'POKEs agora contornam paredes/obstaculos de verdade (busca de rota tipo A*) em vez de ficar travados contra eles.',
      'Hunt do Campeao Lance ganhou contagem regressiva de 5 antes do primeiro POKE aparecer, e um aviso central de Vitoria/Derrota ao fim da luta.',
      'POKEs derrotados na luta do Lance ficam visiveis no campo como corpos, em vez de desaparecer.',
      'Escala visual dos backgrounds das hunts reduzida a metade para bater melhor com o tamanho das sprites.',
    ],
  },
  {
    version: '2.0',
    date: '2026-08-05',
    title: 'Combate corpo-a-corpo real, mapas redimensionados e Campeao Lance vira o gate final de Johto',
    highlights: [
      'Tempo minimo entre acoes subiu para 2s e todo POKE trava no lugar enquanto usa um golpe (nao anda mais durante o ataque).',
      'Golpes em area agora nascem visualmente de quem usou a habilidade, nao mais de cada alvo atingido.',
      'Magnitude, Reversal, Counter, Seismic Toss e outros 10 golpes de dano variavel usam a formula real de cada um em vez do poder base generico.',
      'Camera do POKE ativo ancora um pouco abaixo do centro da tela.',
      'Escala das sprites em campo virou proporcional de verdade: o menor POKE do jogo fica em 1x, o maior em 3x.',
      'Animacao da pokebola so comeca depois que o POKE derrotado termina de desmaiar.',
      'Toda hunt agora tem um background real (nenhuma mais cai no xadrez de fundo antigo) e o mapa ficou 2x menor para o tamanho dos POKEs bater com o cenario.',
      'Colisao de mapa agora bloqueia agua de verdade tambem, nao so paredes e vazio.',
      'Campeao Lance virou a hunt final de Johto: derrota-lo agora e obrigatorio para acessar o Novo Continente (Kanto). Captura desabilitada nessa luta.',
    ],
  },
  {
    version: '1.9',
    date: '2026-08-04',
    title: 'World Building: um bioma por tipo elemental',
    highlights: [
      'Cada um dos 17 tipos elementais reais do jogo agora tem seu proprio bioma tematico (Floresta, Bosque, Costa, Cavernas, Fabrica, Ruinas Ancestrais, etc.).',
      'Corrigido bug serio: especies de certos tipos (ex. Dragao) podiam sumir por completo do jogo por nao caber em nenhuma hunt.',
      'Todo Pokemon do elenco agora tem garantidamente um local de captura correspondente ao seu tipo e nivel.',
    ],
  },
  {
    version: '1.8',
    date: '2026-08-04',
    title: 'Hunts BOSS de lendarios corrigidas + evolucao especial completa',
    highlights: [
      'Corrigido bug que fazia as 11 hunts BOSS de lendarios (Modo Pesadelo) desaparecerem silenciosamente.',
      'Evolucao via Level 80 + Stones agora cobre as 9 cadeias reais de evolucao por troca/hold-item (Kadabra, Machoke, Graveler, Haunter, Onix, Scyther, Seadra, Poliwhirl, Porygon).',
      'Taxa de drop de Stones elevada de 5% para 20% por abate.',
    ],
  },
  {
    version: '1.7',
    date: '2026-08-04',
    title: 'Evolucao especial e drop universal de Stones',
    highlights: [
      'Novo item "Pedra": 17 variantes elementais, uma por tipo, obtidas dropando de qualquer POKE derrotado.',
      'Evolucoes que antes exigiam troca (Kadabra -> Alakazam, etc.) agora evoluem no Level 80 usando 20 Stones do tipo primario.',
    ],
  },
  {
    version: '1.6',
    date: '2026-08-04',
    title: 'Correcoes de mochila, filtros de IV e busca de hunts',
    highlights: [
      'Corrigido um POKE com dado invalido cortando a lista inteira da mochila.',
      'Corrigido filtro de IV minimo/maximo invertido na Loja.',
      'Busca de hunts agora respeita o filtro de elemento selecionado.',
    ],
  },
  {
    version: '1.5',
    date: '2026-08-04',
    title: 'Badge de itens no Auto, filtro shiny e venda segura',
    highlights: [
      'Painel Auto ganhou um indicador mostrando a quantidade dos itens configurados.',
      'Mochila ganhou filtro dedicado para POKEs shiny.',
      'Venda de POKEs shiny na Loja agora exige confirmacao antes de concluir.',
    ],
  },
  {
    version: '1.4',
    date: '2026-08-04',
    title: 'Regras de auto-catch por especie',
    highlights: [
      'Auto-catch agora permite escolher uma bola dedicada por especie dentro da hunt atual.',
      'Regras por especie tem prioridade sobre a bola padrao e a bola de shiny.',
    ],
  },
  {
    version: '1.3',
    date: '2026-08-04',
    title: 'Ataque basico tipado e penalidade de morte',
    highlights: [
      'O golpe basico (fallback de todo POKE) agora usa o tipo elemental real da especie em vez de generico.',
      'Desmaiar em combate agora custa uma pequena porcentagem do EXP do nivel atual.',
    ],
  },
  {
    version: '1.2',
    date: '2026-08-04',
    title: 'Novo Continente (Kanto) e reformulacao de hunts por bioma',
    highlights: [
      'Adicionado um segundo continente (Kanto) com suas proprias zonas de caca.',
      'Hunts de Johto reagrupadas em bandas tematicas por bioma.',
    ],
  },
  {
    version: '1.0',
    date: '2026-08-04',
    title: 'Lancamento',
    highlights: [
      'Primeira versao publicada do NOVO POKE IDLE: captura, batalha automatica, EXP/nivel, Hospital, Hunts, Loja e automacoes (auto-pot/auto-catch/auto-revive).',
    ],
  },
];

/**
 * Compara versao por SEGMENTO, e nao por `Number()` (PH-138).
 *
 * `Number('7.10')` e **7.1**, e `Number('7.9')` e 7.9 — ou seja, o desempate
 * antigo punha a 7.9 ACIMA da 7.10. Nao era hipotetico: apareceu no instante em
 * que a primeira versao de minor com dois digitos entrou, e o efeito e a nota
 * mais nova renderizar embaixo da anterior. Versao e lista de inteiros
 * separados por ponto, nao decimal.
 */
function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function sortedPatchNotes(): PatchNoteEntry[] {
  return [...PATCH_NOTES].sort((a, b) => (
    a.date < b.date ? 1 : a.date > b.date ? -1 : compararVersao(a.version, b.version)
  ));
}
