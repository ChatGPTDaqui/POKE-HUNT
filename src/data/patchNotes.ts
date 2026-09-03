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
  // DOIS itens pra duas issues (PH-447, PH-448). A nota mais curta em muito
  // tempo, e a primeira que anuncia um defeito que ESTA nota anterior causou.
  //
  // O ITEM DO BUG DIZ O QUE O JOGADOR VIU, E NAO A CAUSA. Ele viu tudo
  // bloqueado pedindo o Campeao Lance — inclusive a primeira cacada do jogo,
  // que nunca teve cadeado nenhum. A causa (o nome de um grupo de gate, uma
  // coluna do banco no vocabulario antigo, uma migration que faltou) nao cabe
  // aqui: ela nao explica nada pra quem clicou e levou "Derrote o Campeao
  // Lance". Ele tambem diz QUANTO TEMPO durou, porque quem nao abriu o jogo
  // nessa janela nao viu nada, e um item sem prazo faz essa pessoa procurar um
  // problema que nunca teve.
  //
  // POR QUE ANUNCIAR EM VEZ DE ENTERRAR. A regua deste arquivo manda anunciar
  // bug VISIVEL corrigido, e a 7.38 acabou de deixar a PH-440 de fora pelo
  // criterio oposto — aquele defeito viveu so na `dev` e nenhum jogador o
  // sofreu. Este saiu em producao e foi encontrado jogando. O criterio e o
  // mesmo nas duas direcoes, senao ele nao e criterio.
  //
  // FICA DE FORA: o par de migration, o helper do gate, a fonte unica da
  // traducao, os tres arquivos de teste novos e a extracao do corpo do card —
  // encanamento e arrumacao, sem efeito na tela alem dos dois itens abaixo.
  {
    version: '7.39',
    date: '2026-09-03',
    title: 'O mundo destrancado, e a primeira caçada onde ela devia estar',
    highlights: [
      'BUG CORRIGIDO: POR CERCA DE 40 MINUTOS, NENHUMA HUNT ABRIA. Se você entrou no jogo na madrugada de 03/09, logo depois da atualização do mapa do mundo, toda hunt respondia "Derrote o Campeão Lance antes de acessar Mundo" — os 12 biomas e até a Rota 46, a primeira caçada, que nunca teve cadeado nenhum. Era a atualização anterior perguntando pelo nome errado ao conferir o que você tem liberado. Está resolvido, e o seu progresso não foi afetado: nada foi perdido nem zerado, era só a porta que não abria.',
      'A ROTA 46 (INICIAL) SUBIU PRO TOPO DA TELA DE HUNTS. Ela é a primeira caçada do jogo, de Lv 1 a 2, e estava lá embaixo, junto do Campeão Lance e do Modo Pesadelo — quem acabava de escolher o inicial tinha que rolar a tela inteira, passando por tudo o que ainda não pode jogar, pra achar a única hunt feita pra ele. Agora ela aparece antes dos biomas.',
    ],
  },
  // OITO itens pra TREZE issues (PH-425 a PH-434, mais PH-440, PH-441 e
  // PH-442) — o maior intervalo que uma nota deste arquivo ja cobriu, e por
  // isso o que mais precisou de corte.
  //
  // A NOTA ABRE PELO MENU, e nao pela mudanca maior. A regua de niveis mudou
  // por baixo de tudo, mas o jogador nao "ve" uma regua: ele abre a tela de
  // hunts e ela e outra. O primeiro item tem que ser a primeira estranheza do
  // dia, como o rename foi na 7.37.
  //
  // O ITEM DO FARM LIVRE FOI O MAIS DIFICIL DE ESCREVER, porque a coisa boa
  // dele e uma AUSENCIA: o Guardian que nao aparece mais. Anunciar ausencia
  // sem antes lembrar que ela existia nao comunica nada, entao o item diz o
  // que acontecia ANTES numa oracao e o que acontece agora na seguinte.
  //
  // NENHUM ITEM PROMETE MODO PESADELO NOVO NEM BOSS POR ELEMENTO. As duas
  // coisas foram DESENHADAS em 02/09 e nao existem em codigo. A nota so fala
  // do que esta jogavel — a 7.36 ja teve a disciplina de nao prometer impacto
  // que nao media, e prometer feature que nao existe seria pior.
  //
  // O ITEM DOS QUATRO POKES parece pequeno e NAO E: Metapod, Kakuna, Silcoon e
  // Cascoon nao nasciam em lugar nenhum do jogo. Especie ausente e o modo de
  // falha mais silencioso que este projeto tem — ela continua no Bestiario, com
  // sprite e moveset, e so nunca aparece.
  //
  // FICA DE FORA:
  //   - PH-433 (bancada de medicao) e PH-434 (limpeza do vocabulario de
  //     faixa): ferramenta e arrumacao de codigo, zero efeito na tela;
  //   - o encanamento de PH-426/429/430 (como as 120 hunts sao montadas, o
  //     formato do progresso no banco, o gate no servidor). O que o jogador ve
  //     disso ja esta nos itens da trilha e dos biomas abertos;
  //   - a PH-440, que corrigiu perda de progresso na traducao do save antigo.
  //     O defeito viveu so na `dev`: o cliente que o tinha nunca foi
  //     publicado, entao nenhum jogador perdeu nada. Anunciar conserto de bug
  //     que ninguem sofreu so assusta.
  {
    version: '7.38',
    date: '2026-09-02',
    title: 'O mapa do mundo: 12 biomas abertos, 10 estágios em cada, e o nível vai até 100',
    highlights: [
      'A TELA DE HUNTS VIROU UM MAPA. Antes era uma lista de cards com "Mata I", "Mata II", "Mata III". Agora você escolhe o BIOMA e entra nele: dentro, os 10 estágios aparecem como uma trilha desenhada sobre a arte do lugar, com o caminho descendo do raso pro fundo. Cada bioma tem arte própria, e a trilha acompanha ela — no Marinho você começa na praia e termina no leito oceânico, entre os corais.',
      'AS TRÊS FAIXAS DE NÍVEL ACABARAM. Cada bioma passou a ter 10 estágios de 10 níveis, cobrindo do Lv 1 ao Lv 100 — o teto era 90. "De 1 a 30 é muita margem" era o problema: você entrava numa hunt que anunciava trinta níveis e não tinha como escolher onde dentro dela caçar. Agora o estágio diz exatamente a faixa, e você escolhe.',
      'CADA ESTÁGIO MOSTRA O QUE TEM DENTRO, ANTES DE VOCÊ ENTRAR. Clicando num nó da trilha você vê a faixa de nível, os POKEs que podem aparecer, e a porcentagem de cada sub-bioma. E essa porcentagem MUDA ao longo da trilha: no estágio 1 do Marinho a Praia é 60% e o Leito Oceânico não existe; no estágio 10 a Praia sumiu e o Leito é 79%. O bioma afunda conforme você avança.',
      'OS 12 BIOMAS ESTÃO ABERTOS DESDE O COMEÇO, E O PROGRESSO DE CADA UM É SEPARADO. Não há mais ordem entre eles: dá pra estar no estágio 7 do Marinho e no 2 do Ígneo ao mesmo tempo. Dentro do bioma a sequência continua — o estágio seguinte pede o Lord do anterior. Um bioma vem marcado como recomendado pra quem está começando; é sugestão, não cadeado.',
      'ESTÁGIO QUE VOCÊ JÁ FECHOU VIRA FARM LIVRE. Antes, voltar a um lugar limpo cobrava o Guardião a cada 30 abates e o Lord no fim, de novo. Agora não nasce protetor nenhum num estágio que você já venceu: você entra e caça. É o que torna possível voltar a um estágio antigo só pela espécie que aparece lá, abrindo mão do ouro e do XP dos estágios altos.',
      'VOCÊ ESCOLHE, ANTES, O QUE ACONTECE AO CONCLUIR O ESTÁGIO. No painel Auto tem uma opção nova: ao limpar a última sala, o jogo repete o mesmo estágio (o padrão) ou entra no seguinte. Repetir é o padrão porque você normalmente escolheu aquele lugar por algum motivo — e se não houver próximo, ou ele ainda estiver bloqueado, o atual repete sozinho.',
      'O CAMPEÃO LANCE AGORA PRECISA SER MERECIDO. Ele estava disponível desde o primeiro dia, com um time de Lv 55-65 esperando qualquer um que clicasse. Agora ele pede o estágio 5 limpo nos 12 biomas — a metade do mundo — e o card diz quantos faltam e quais. O que ele concede continua o mesmo.',
      'BUG CORRIGIDO: QUATRO POKES NÃO NASCIAM EM LUGAR NENHUM. Metapod, Kakuna, Silcoon e Cascoon — as quatro formas de casulo — existiam no Bestiário, com sprite e golpes, e nunca apareciam numa hunt. Eles vivem entre o Lv 7 e o Lv 9, uma janela curta demais pra caber nas regras antigas. Agora aparecem no estágio 1 dos biomas onde a linha deles mora.',
    ],
  },
  // QUATRO itens pra tres issues (PH-435, PH-436, PH-437). O quarto item e um
  // defeito que veio de carona na PH-437 — ver mais abaixo.
  //
  // O RENAME ABRE A NOTA, e nao a feature maior, porque e o unico item que o
  // jogador encontra SEM PROCURAR: ele abre o jogo e o menu tem outro nome. Uma
  // nota que enterra isso no terceiro item deixa a primeira estranheza do dia
  // sem explicacao.
  //
  // O ITEM DA RESERVA NAO PROMETE MERCADO MELHOR, e essa foi a decisao mais
  // dificil da nota. O mecanismo e real e fecha um buraco real (nao havia como
  // cobrar um preco combinado sem confiar na palavra do outro), mas quantos
  // jogadores negociam preco por conversa hoje e coisa que nao esta medida. O
  // item conta o que DA PRA FAZER e onde ficam os botoes; nao diz que "o
  // comercio ficou mais justo". Mesma disciplina da 7.36 com o prazo dos buffs.
  //
  // O ITEM DO CONTADOR DE LANCES parece pequeno demais pra nota e NAO E: ele
  // fazia a tela MENTIR. "0 lance(s)" num anuncio que tinha lance e a diferenca
  // entre o vendedor voltar pra conferir e o vendedor achar que ninguem quis.
  //
  // FICA DE FORA:
  //   - as duas PRs de `database.types.ts`: encanamento puro, zero efeito pro
  //     jogador;
  //   - o rename de identificador interno (diretorio, store, hooks): o jogador
  //     ve "Social" no menu, e e disso que o primeiro item fala. O resto e
  //     arrumacao de codigo;
  //   - a escolha de estampar o anuncio NA mensagem em vez de criar uma linha
  //     propria pra ele: e a decisao que faz o card chegar ao vivo e nao virar
  //     rota de flood, mas o jogador ve o mesmo card das duas formas;
  //   - o que a reserva RECUSA (leilao, somente-lance, anuncio com lance
  //     pendente): sao guardas contra prender ouro de terceiro. Listar as
  //     recusas na nota descreveria o que NAO acontece, e o jogador so encontra
  //     isso se tentar — e ai a mensagem do servidor explica na hora;
  //   - PH-425 e PH-426 (estagios por bioma e as 120 hunts): entraram na `dev`
  //     no mesmo intervalo, sao de outra sessao e nao tem nota. Escrever a nota
  //     do trabalho de outra pessoa sobre um redesenho em andamento seria
  //     inventar o que ela quis dizer. Ficam pra quem as fez.
  {
    version: '7.37',
    date: '2026-09-02',
    title: 'O Correio virou Social, a conversa sabe de qual anúncio se trata, e o preço combinado dá pra cobrar',
    highlights: [
      'O CORREIO AGORA SE CHAMA SOCIAL, E O ÍCONE DEIXOU DE SER UM ENVELOPE. O nome era do tempo em que a tela era caixa de carta, com Entrada e Enviados separados. Ela é conversa por contato desde a 7.10 — com histórico, quem está online e a lista de amigos. Nada mudou de lugar dentro dela: só o nome e o ícone do menu.',
      'QUEM PUXA CONVERSA POR UM ANÚNCIO CHEGA COM O ANÚNCIO NA MÃO. Antes o vendedor recebia "aceita 1.8M?" e não tinha como saber de qual dos POKEs dele o sujeito estava falando. Agora a conversa começa com um cartão do anúncio — foto, nível, IV e preço —, e os DOIS lados veem o mesmo cartão. Ele continua ali depois, no histórico da conversa, mostrando o valor que valia na hora, mesmo que o POKE já tenha sido vendido.',
      'DOIS CAMINHOS NOVOS PRA COMEÇAR A CONVERSA. Na vitrine, "negociar" ao lado do nome do vendedor abre a conversa direto (antes era clicar no nome, abrir o perfil e de lá procurar "Conversar" — três telas, e o anúncio se perdia na primeira). E em "Anúncios Ativos", quem recebeu um lance agora tem um "Falar" pra responder com palavras em vez de só aceitar ou recusar um número.',
      'DÁ PRA RESERVAR UM ANÚNCIO PRA UMA PESSOA, PELO PREÇO COMBINADO. Combinar 1.8M no lugar dos 2.5M anunciados não tinha como ser cumprido: baixar o preço deixava o POKE na vitrine de todo mundo, e o primeiro que passasse levava. Agora, dentro da conversa, o vendedor põe o valor acertado e reserva pra aquele jogador: o POKE sai da vitrine pública e só ele consegue comprar. O reservado recebe um aviso com o cartão e o preço, e vê "reservado para você" no anúncio. O vendedor solta a reserva quando quiser, em "Anúncios Ativos".',
      'BUG CORRIGIDO: a aba "Anúncios Ativos" dizia "0 lance(s)" em anúncio que TINHA lance. O número certo estava ali do lado, na lista de lances recebidos, mas a linha do anúncio mostrava zero — quem batia o olho na lista achava que ninguém tinha se interessado.',
    ],
  },
  // TRES itens pra tres issues (PH-418, PH-421, PH-422). A PH-419 e a PH-420
  // entraram no mesmo intervalo e NAO tem item — ver o "fica de fora".
  //
  // O ITEM DO BUFF NAO PROMETE IMPACTO, e essa foi a decisao mais dificil da
  // nota. O prazo de 18s e real e esta medido, mas o alcance dele e estreito: no
  // conjunto de 4 golpes que o jogo escolhe sozinho, golpe de buff aparece no
  // Lv25 e SAI do conjunto do Lv40 pra cima, porque golpes melhores tomam os
  // slots (medido em cinco especies). Ou seja, a maioria dos POKEs de nivel alto
  // nao leva golpe de buff a nao ser que o jogador escolha levar.
  //
  // Escrever "seus buffs agora duram muito mais" seria a nota prometendo uma
  // melhora que a maior parte dos jogadores nao vai sentir. O item conta o FATO
  // (o efeito dura 18s e nao morre mais entre um bicho e o proximo) e deixa o
  // jogador tirar a conclusao. Mesma disciplina da nota da 7.35, que se recusou
  // a dizer "resolvido" sobre o caso que ainda nao era zero.
  //
  // O ITEM DO MULTIPLICADOR E O MAIS UTIL DOS TRES, e ele e o unico que muda o
  // que o jogador SABE. "Ataque -1" era lido como "menos um ponto de Ataque"
  // quando na verdade e 0,67x — o atributo cai um terco. Quem lia "-1" achava que
  // tinha perdido quase nada e segurava luta ja perdida. O numero cru de estagio
  // saiu de toda a tela de jogo; ele fica na wiki, junto da formula.
  //
  // FICA DE FORA:
  //   - o corte de estagio por autoria (o que veio de outro POKE sai no fim da
  //     luta, o proprio fica): e o que faz o prazo nao virar debuff eterno, mas
  //     pro jogador nada MUDA — debuff recebido ja sumia no fim da luta antes;
  //   - os tres caminhos de reanimacao que nao limpavam estagio, inclusive o
  //     Hospital, que limpava so metade e deixava o Rosnado voltar sozinho. Isto
  //     parece item de nota e NAO E: o defeito nasceu dentro desta mesma versao,
  //     junto com o prazo, e nunca chegou ao ar. Anunciar conserto de bug que o
  //     jogador nunca viu e inventar historico;
  //   - a renovacao automatica do buff pelo bot (PH-419): medida, ela mexe o
  //     tempo com buff aceso de 28,4% pra 29,8%, o que e ruido. Nao ha o que
  //     prometer;
  //   - a bancada do gate de promocao, a decomposicao por regime de nivel e o
  //     achado do conjunto de golpes padrao (PH-420): processo e encanamento;
  //   - que "turno" continua na wiki: nao e mudanca, e o lugar onde a palavra
  //     precisa existir pra explicar a equivalencia.
  {
    version: '7.36',
    date: '2026-09-02',
    title: 'Buffs duram 18 segundos, e a tela diz o quanto o atributo mudou',
    highlights: [
      'AUMENTO E REDUÇÃO DE ATRIBUTO AGORA DURAM 18 SEGUNDOS. Antes, o efeito de um golpe como Dança das Espadas só valia enquanto houvesse briga acontecendo — no vão entre um bicho e o próximo ele já tinha ido embora, o que na prática era cerca de um segundo. Agora ele tem prazo próprio: dura 18 segundos, não cai quando você troca de alvo e não cai quando o alvo morre. Usar o mesmo golpe de novo renova o prazo em vez de somar mais um degrau.',
      'A TELA PASSOU A DIZER QUANTO O ATRIBUTO REALMENTE MUDOU. Onde estava escrito "Ataque -1" agora está "Ataque 0,67x (−33%)", e no lugar de "+2" está "2x (+100%)". O número antigo enganava: "-1" parece um ponto de Ataque a menos, e é um terço do atributo embora. Vale pro selo do canto, pro número que sobe no POKE e pra descrição do golpe. Precisão e Evasão têm conta própria — lá, +1 é 1,33x.',
      'PRAZO AGORA APARECE EM SEGUNDOS, NÃO EM TURNOS. Veneno, queimadura, clima de golpe: onde estava "3 turnos" agora está "9s". Um turno deste jogo sempre foi 3 segundos de relógio, então é a mesma informação dita de um jeito que dá pra usar. O dano contínuo virou "a cada 3s".',
    ],
  },
  // UM item pra UMA issue (PH-423).
  //
  // A NOTA DIZ "NUNCA", E ISSO E O PONTO. O relato que abriu a issue foi "matei
  // 30 mobs e o guardiao caiu, e a sala nao muda", e a primeira resposta que eu
  // dei foi que era espera longa por design. Estava errado: medido, 3 salas em
  // 120 no intervalo normal de sincronia NUNCA avancavam — nao "demoravam".
  // Chamar de lentidao na nota repetiria o erro pro jogador.
  //
  // O QUE ELA NAO EXPLICA, de proposito: que existem duas contagens de abate (a
  // da tela e a do servidor), que o mundo do servidor e reconstruido a cada
  // sincronia, e que o guardiao renascia longe demais pra a luta comecar dentro
  // da janela. E a explicacao certa e o jogador nao tem o que fazer com ela — ele
  // precisa saber que travava, que nao trava mais, e que pode voltar a farmar
  // ciclo longo sem medo.
  //
  // FICA DE FORA:
  //   - as quatro hipoteses de causa que a medicao derrubou e as tres
  //     infidelidades de bancada achadas no caminho: processo;
  //   - a decomposicao pre-quota/guardiao e os numeros por tamanho de janela:
  //     encanamento;
  //   - que no caso do jogador MUITO ativo (sincronias muito curtas) o
  //     travamento caiu de 10 pra 3 em 120 e ainda nao e zero. Isto NAO entra
  //     porque prometer "resolvido" e depois o jogador travar seria pior que o
  //     silencio — e a nota tambem nao vai ensinar ninguem a evitar clicar. Fica
  //     na PH-423 como trabalho aberto.
  {
    version: '7.35',
    date: '2026-09-02',
    title: 'A sala não fica mais presa depois do Guardião',
    highlights: [
      'A CAÇADA NÃO TRAVA MAIS NA MESMA SALA. Existia um caso em que a sala parava de vez depois de as 30 kills fecharem: o Guardião ficava em campo, com a vida sempre cheia, e a área nunca mudava — só saía dali quem trocava de caçada. Medido antes do conserto, acontecia em 3 de cada 120 trocas de sala. Agora não acontece nenhuma vez.',
      'O GUARDIÃO VOLTA PRA LUTA ONDE ELA PAROU. Quando você fecha o jogo ou o progresso é sincronizado no meio de uma briga com o Guardião, ele reaparece na sua frente com a vida que já tinha perdido, em vez de do outro lado da área. A briga continua de onde parou.',
    ],
  },
  // UM item pra UMA issue (PH-416).
  //
  // A NOTA TEM DOIS FATOS E SO UM INTERESSA AO JOGADOR. O trabalho foi trocar as
  // seis artes de status por um conjunto desenhado por um gerador so; o que o
  // jogador ganha e que veneno e congelamento passaram a ter desenho, e que os
  // seis agora se leem do mesmo jeito. O item conta o segundo.
  //
  // ELA RECONHECE A 7.24 EM VEZ DE REPETIR ELA, mesmo padrao da nota da 7.33: a
  // 7.24 anunciou "POKE PARALISADO SOLTA FAISCA E QUEIMADO SOLTA BRASA", e essa
  // promessa continua valendo — o desenho e outro, a coisa que ela prometia nao
  // e nova. Reanunciar faria parecer que a 7.24 nao tinha entregado. Por isso o
  // item 1 fala de VENENO e CONGELAMENTO, que sao os dois que nao tinham nada, e
  // cita paralisia so como a comparacao que o jogador ja conhece.
  //
  // O "FICA DE FORA" DESTA VEZ E CURTO porque quase tudo do intervalo e
  // encanamento, e o jogador nao ve nada disso:
  //   - o gerador, o encoder de PNG e a saida do banco de arte antigo: quem
  //     desenha e onde mora nao muda nada na tela;
  //   - as tres correcoes que a bancada pegou (o anel que parecia moeda dropada,
  //     o disco que virou faisca, o cranio que precisou de orbita maior): sao o
  //     caminho ate a arte, nao a arte;
  //   - a opacidade 0,75 e os dois canais de desenho: continuam iguais aos da
  //     7.19, entao nao ha o que anunciar.
  {
    version: '7.34',
    date: '2026-09-02',
    title: 'Os seis status agora têm o mesmo desenho',
    highlights: [
      'VENENO E CONGELAMENTO GANHARAM SÍMBOLO. Eram os dois únicos status que só mudavam a cor do POKE, e num Gengar roxo ou num Lapras azul isso não dava pra ver — o mesmo problema que a paralisia tinha num Pikachu. Agora o envenenado carrega uma caveira e o congelado um floco de neve.',
      'OS SEIS SÍMBOLOS VIRARAM UM CONJUNTO. Caveira, chama, raio, floco, "Z" e "?" — todos no mesmo tamanho, com o mesmo contorno e com as mesmas fagulhas girando em volta do corpo. Antes cada um vinha de um lugar diferente e tinha tamanho e ritmo próprios; dava pra confundir de longe qual era qual.',
    ],
  },
  // UM item pra UMA issue (PH-402). O intervalo tem dois commits e um deles e
  // back-merge.
  //
  // ESTA NOTA CORRIGE UMA PROMESSA DA 7.31, e e por isso que ela e dificil de
  // escrever. A 7.31 ja anunciou a encarada — "agora eles circulam um ao redor
  // do outro, virados de frente" — e aquilo era a PH-397, que subiu com um passo
  // lateral de 26px. Vinte e seis pixels e geometricamente invisivel na tela: o
  // jogador leu a promessa e nao teve como ver o que ela descrevia.
  //
  // Entao o item NAO anuncia a encarada como novidade. Anunciar de novo seria a
  // segunda vez que a mesma coisa e prometida, e quem leu a 7.31 passa a
  // desconfiar da nota inteira. O item reconhece a promessa anterior e diz o que
  // de fato mudou: da pra ver.
  //
  // "MEIAS-LUAS" E A PALAVRA CERTA e nao enfeite. O que o jogador ve nao e uma
  // orbita (eles nao dao voltas um no outro) nem um vaivem (nao ha figura fixa):
  // e um arco de cada vez, com tamanho e lado sorteados. Chamar de "circulam",
  // como a 7.31 fez, foi parte do problema — descrevia um movimento que o jogo
  // nao faz.
  //
  // FICA DE FORA (a lista de exclusao e o indice barato do intervalo seguinte):
  //   - as tres geometrias descartadas no caminho (giro no ponto medio, pivo
  //     lateral fixo, oito deitado): processo, nao jogo;
  //   - os knobs da bancada (`?passo=`, `?coleira=`, `?vel=`) e as medidas de
  //     `ritmo-da-encarada.mjs`: encanamento;
  //   - a coleira, a ancora por perna e a velocidade constante entre curvaturas
  //     diferentes: sao o COMO, e o jogador ve so o resultado.
  {
    version: '7.33',
    date: '2026-09-02',
    title: 'A encarada dos duelos, agora dá pra ver',
    highlights: [
      'A ENCARADA DOS DUELOS FICOU VISÍVEL. A nota passada anunciou que os dois POKEs se mexem entre um golpe e o outro na arena do Campeão Lance e nas caçadas BOSS — e eles se mexiam, num passo tão curto que não dava pra perceber. Agora eles se deslocam de verdade: meias-luas que mudam de tamanho e de lado, cada golpe trocado começa outra, e a luta anda pela arena em vez de ficar num ponto só.',
    ],
  },
  // UM item pra um intervalo de duas issues (PH-396 e PH-404).
  //
  // O achado e de QA, nao de jogador: nenhum jogador reclamou de ver o POKE
  // errado em campo, e o caso reproduzido foi na conta de teste do dev. Ele
  // entra mesmo assim porque o sintoma E visivel e o jogador que o vivesse nao
  // teria como nomear o que aconteceu — a nota da o nome.
  //
  // A nota NAO diz "vendido, liberado ou mandado pra mochila noutra aba", que e
  // a causa real: falar de "outra aba" ensina um caminho que quase ninguem usa e
  // faz parecer que a culpa e de quem jogou. Diz o que o jogador via e o que
  // acontece agora.
  //
  // FICA DE FORA (a lista de exclusao e o indice barato do intervalo seguinte):
  //   - PH-404: aquecimento de import num arquivo de teste. Zero efeito visivel.
  {
    version: '7.32',
    date: '2026-09-01',
    title: 'Cada POKE no seu lugar, de novo',
    highlights: [
      'O POKE EM CAMPO É SEMPRE UM DA SUA EQUIPE. Em algumas situações a tela continuava mostrando lutando um POKE que já não estava na equipe, e só um recarregar da página resolvia. Agora o primeiro POKE da equipe entra no lugar na hora, com aviso na tela.',
    ],
  },
  // CINCO itens pra seis issues do intervalo (PH-393 a PH-400), e a conta nao
  // fecha de proposito — ver a lista de exclusao no fim.
  //
  // A ORDEM E POR QUANTO O JOGADOR PERDIA, nao por tamanho da mudanca. O
  // primeiro item e um jogador farmando e RECEBENDO NADA; o ultimo e um
  // solavanco de carregamento.
  //
  // O ITEM 1 (PH-399) E O MAIS IMPORTANTE DA NOTA e o mais difícil de escrever:
  // a causa e um uid de sessao apontando pro POKE errado, e isso nao se conta
  // pro jogador. O que ele viveu: trocou de POKE no meio da cacada e, a partir
  // dali, ouro e XP pararam e a sala nunca mais avancou. Medido no dev: 703
  // segundos de simulacao com um POKE morto de nivel 1, zero abates.
  //
  // A nota diz "conserte-se sozinho ao trocar de POKE de novo"? NAO — nao e
  // verdade. A sessao presa so se resolve saindo da hunt, e e isso que esta
  // escrito, porque um jogador que ainda esteja preso precisa saber o que FAZER.
  //
  // O ITEM 4 (PH-398) TIRA E DA ao mesmo tempo, e a frase diz os dois lados: o
  // cartao por nivel e o que o usuario pediu, e ele nao aparecer mais sobre menu
  // aberto e o que ninguem pediu mas todo mundo sentia.
  //
  // FORA DA NOTA, e cada um com o motivo:
  //
  //  - PH-393 (pedido extra de sala, espera de 33s -> 18s de mediana): e melhoria
  //    de protocolo DENTRO do mesmo comportamento, e o item 1 ja cobre o sintoma
  //    que o jogador relatou. Anunciar "a sala troca mais rapido" e ainda ter 18s
  //    de espera convida o desmentido no primeiro minuto.
  //  - as duas bancadas novas, o export de `reconciliarSalaDaAutoridade`, a
  //    migration em si e os 60+ testes: encanamento.
  //  - PH-396 (a tela mostrou em campo um POKE que o servidor nao tinha na
  //    equipe) esta ABERTA e sem correcao. Meia-feature nao entra em nota.
  //
  // PH-397 NAO E MINHA E ENTRA IGUAL (item 5). A nota cobre o INTERVALO, nao as
  // issues de quem escreve — foi por esquecer isso que a 7.13 e a 7.14 sairam
  // retroativas.
  {
    version: '7.31',
    date: '2026-09-01',
    title: 'O Guardião fura a fila',
    highlights: [
      'TROCAR DE POKE NO MEIO DA CAÇADA PARAVA SEU GANHO. Ao colocar outro POKE em campo sem sair da hunt, o jogo continuava contando a caçada pelo POKE anterior — se ele estava fraco ou desmaiado, ouro e XP paravam de entrar e a sala nunca avançava. Corrigido. Se a sua caçada estiver assim agora, saia e entre nela de novo.',
      'O GUARDIÃO E O LORDE VIRAM PRIORIDADE, MESMO COM O LURE LIGADO. Antes o POKE passava por eles sem atacar até terminar de reunir os selvagens, e a sala ficava travada esperando. Agora ele para tudo e vai para cima.',
      'A ÁREA NOVA SE APRESENTA. Ao entrar numa sala, um aviso de 4 segundos mostra o nome do lugar, o número da sala e a faixa de nível dela — antes isso era um toast de canto igual ao de item encontrado.',
      'CADA NÍVEL GANHA O SEU AVISO, com os atributos daquele nível e 4 segundos na tela. E ele não aparece mais por cima de menu, perfil ou painel aberto.',
      'OS DOIS POKES SE ENCARAM NOS DUELOS. Na arena do Campeão Lance e nas caçadas BOSS, o par ficava parado entre um golpe e o outro — 83% do duelo. Agora eles circulam um ao redor do outro, virados de frente, e o sentido muda a cada golpe trocado.',
      'O MAPA DA PRÓXIMA SALA CHEGA ANTES DE VOCÊ. A arte das outras salas da caçada e dos golpes do seu time é carregada em segundo plano, para nada travar no meio do jogo. Quem tem economia de dados ligada no aparelho continua sem esse download extra.',
    ],
  },
  // Dois itens, duas issues (PH-384 e PH-386), e eles NAO sao o mesmo assunto —
  // por isso vao como duas frases e nao uma. O primeiro e o corpo dos POKE no
  // campo; o segundo e a sala nao dizer que estava esperando.
  //
  // O ITEM DA SALA NAO ANUNCIA UMA CORRECAO DE VELOCIDADE, e essa distincao e o
  // ponto: a sala continua levando o mesmo tempo pra trocar. O que mudou e a
  // tela parar de mentir por omissao. Medido em
  // `scripts/harness/troca-de-sala-sob-autoridade.mjs` (as duas pontas com o
  // protocolo real, 48 trocas em 8 sementes): mediana de 33,0s parado em 30/30,
  // p90 de 33,0s, pior caso de 243s, ZERO travamentos. Em producao no mesmo dia,
  // o servidor avancava uma sala a cada 57s (Vinny), 105s (Perneta) e 126s
  // (Alfafis) — ou seja, numa sala rapida MAIS DA METADE do tempo era barra
  // cheia e parada, sem nada na tela.
  //
  // Prometer "a sala troca mais rapido" seria a mentira que o jogador desmente
  // no primeiro minuto. A nota diz o que de fato mudou, e diz tambem que o farm
  // nao para nesse tempo — porque "esperando" le como "parei de ganhar", e nao
  // e verdade: o respawn de mob comum volta assim que o protetor cai.
  //
  // FORA DA NOTA, e nenhum deles e player-facing:
  //  - as duas bancadas novas (`custo-da-separacao.mjs`,
  //    `troca-de-sala-sob-autoridade.mjs`) e o `+5,7%` de custo do passo do
  //    motor que a primeira mediu;
  //  - a correcao de `docs/06`, que afirmava que a contagem regressiva de 3s
  //    cobria a espera (media latencia de chamada, nao espera de jogador);
  //  - `reconciliarSalaDaAutoridade` exportada em `headless.ts` pra a bancada.
  //
  // TAMBEM FORA: o handicap estrutural do servidor (ele reconstroi o mundo por
  // janela e o POKE volta ao ponto de entrada, entao cada janela paga a
  // caminhada de novo, e ele fecha a quota sempre depois do cliente). E o que
  // encurtaria a espera DE VERDADE, mexe em quantos abates cabem numa janela —
  // logo em balanceamento de farm — e nao foi feito. Meia-feature nao entra em
  // nota: quando entrar, ganha entrada propria.
  //
  // TEXTO ENXUGADO NO MESMO DIA (PH-391), a pedido do usuario. A primeira versao
  // tinha quatro e cinco frases por item e duas palavras que so quem mexe no
  // codigo entende — "sprite" e "chip da sala". Patch notes e canal de JOGADOR:
  // informacao publica, de interesse dele, e curta.
  //
  // O que sobreviveu ao corte nao e enfeite, e as duas frases que evitam
  // conclusao errada: "o alcance do combate nao mudou" (senao o jogador teme que
  // o POKE pare de alcancar depois de ler que os corpos se afastaram) e "ouro e
  // XP continuam entrando" (senao "esperando" le como "parei de ganhar"). O que
  // saiu foi o resto: o numero de meio minuto, a explicacao de que a espera em si
  // nao mudou, e o jargao.
  //
  // NAO virou 7.31: e a mesma entrega, dita em menos palavras. Versao nova aqui
  // faria o jogador achar que recebeu duas coisas.
  {
    version: '7.30',
    date: '2026-09-01',
    title: 'Cada POKE no seu lugar',
    highlights: [
      'POKE NÃO ENTRA MAIS DENTRO DE POKE. Os selvagens deixam de se empilhar no mesmo ponto e se acomodam em volta. O alcance do combate não mudou.',
      'A SALA AVISA QUANDO A PRÓXIMA ÁREA ESTÁ VINDO. Ao completar os 30 abates, a tela mostra "Preparando a próxima área..." em vez de barra cheia e nada. Ouro e XP continuam entrando nessa espera.',
    ],
  },
  // A PH-382 subiu na `dev` sem nota, e ela e do tipo que NAO pode subir calada:
  // teve relato de jogador (01/09) descrevendo o time errado na tela.
  //
  // O QUE O JOGADOR VIA: com `active_team_index = 1`, o trilho de reservas
  // desenhava o MESMO POKE que estava em campo — mesma instancia, entao nivel e HP
  // da "reserva" subiam junto com os de campo — e o POKE do slot 0 ficava
  // invisivel. Na conta que reportou, o Eevee do Lance sumiu e a reserva 2 virou o
  // POKE que estava lutando.
  //
  // A SEGUNDA FRASE DA NOTA E A QUE IMPORTA, e nao e enfeite: o conserto se aplica
  // sozinho ao save torto na carga (`snapshotToGameState` roda o POKE apontado por
  // `active_team_index` pro slot 0). Sem dizer isso, quem viu o time errado nao tem
  // como distinguir "consertaram" de "mudou de novo sozinho" — e um jogador que
  // acha que o time embaralha sem motivo para de confiar no save.
  //
  // FORA DA NOTA: o custo de fork do wrapper do CLI do Supabase (PH-377). E CI, e
  // ninguem joga o CI.
  {
    version: '7.29',
    date: '2026-09-01',
    title: 'A reserva voltou a ser a reserva',
    highlights: [
      'O TRILHO DE RESERVAS MOSTRAVA O POKE QUE ESTAVA LUTANDO. Depois de uma troca automática por desmaio, o mesmo POKE podia aparecer em campo E na reserva, com o nível e o HP dos dois subindo juntos, enquanto o POKE do primeiro slot ficava invisível. Se o seu time ficou assim, ele se corrige sozinho na próxima vez que você entrar — não precisa mexer em nada.',
    ],
  },
  // ENTRADA PROPRIA, e nao um quinto item da 7.27, porque a 7.27 JA FOI
  // PROMOVIDA (PR #368) enquanto esta mudanca ainda estava em revisao. A
  // regua e uma entrada por promocao: acrescentar item numa versao que o
  // jogador ja leu reescreve o passado dele, e quem abriu a aba ontem nunca
  // veria a linha nova.
  //
  // ELA TIRA ALGO DO JOGADOR, entao diz o numero. `vazao-do-combate.mjs`,
  // 200 minutos por regime, trocando so o cooldown do Treinador (1,5s fixo
  // -> o turno) com rebuild entre as medicoes:
  //
  //   regime      curas/min 1,5s   curas/min turno   mortes/min 1,5s   turno
  //   apertado         2,04             2,04              0,000        0,000
  //   folgado          1,55             1,43              0,000        0,000
  //   sofrido          8,45             4,22              5,955        7,185
  //
  // Nos dois regimes normais o custo e ZERO mortes — o preco mora inteiro no
  // regime em que o POKE ja apanhava. Dai a nota separar os dois casos em vez
  // de anunciar so a metade que soa mal.
  //
  // FORA DA NOTA: a bancada ter ganhado um terceiro regime e a coluna de piso
  // de HP, e o contador de itens que media a funcao errada. Encanamento.
  {
    version: '7.28',
    date: '2026-09-01',
    title: 'O Treinador entrou no compasso',
    highlights: [
      'O TREINADOR PASSOU A AGIR EM TURNOS, COMO TODO MUNDO. Ele conseguia usar dois itens de cura no tempo de um turno; agora usa um, do mesmo jeito que o POKE ataca uma vez por turno. A cura automática dispara metade das vezes. Caçando no seu nível isso não aparece: medido, nenhuma derrota a mais. Caçando acima do nível, onde o POKE já apanhava, ele cai cerca de 20% mais.',
    ],
  },
  // O ritmo do combate (PH-373 a PH-376). Uma entrada so pras quatro issues,
  // porque pro jogador e UM assunto: a velocidade com que as coisas acontecem.
  //
  // O ITEM DO TURNO E O UNICO QUE TIRA ALGO DO JOGADOR, e por isso ele vem
  // primeiro e diz o numero. Esconder isso numa nota sobre animacao seria a
  // omissao que o jogador descobre sozinho no fim do dia.
  //
  // O NUMERO FOI MEDIDO, e a primeira versao desta nota estava ERRADA. Ela
  // dizia "cerca de um terco a menos", que era a conta aritmetica: o combate
  // dilata 1,5x, logo a vazao cairia pra 1/1,5. A conta ignora que o POKE passa
  // boa parte do tempo ANDANDO entre alvos, e andar nao dilatou.
  //
  // `scripts/harness/vazao-do-combate.mjs`, 200 minutos simulados por regime,
  // com rebuild do headless entre as duas medicoes:
  //
  //             ouro/min t2   ouro/min t3   queda   % do tempo em luta (t2)
  //   Nv25            928,8         784,9   -15,5%                    38,5%
  //   Nv102           475,4         380,9   -19,9%                    58,0%
  //
  // O modelo que explica: `vazao = 1 / (1 + 0,5 x f)`, com `f` = fracao do tempo
  // em combate. f=0,385 preve -16,1% e a medicao deu -15,5%; f=0,580 preve
  // -22,5% e deu -19,9%. Dai a nota dizer "15% a 20%", e nao um terco.
  //
  // Uma amostra de 12 sementes x 3 minutos tinha dado -1,4%, que era RUIDO —
  // registrado pra ninguem repetir a medicao curta e concluir que nao mudou
  // nada.
  //
  // FORA DA NOTA, por serem invisiveis jogando: a duracao autorada recuperada
  // do banco de origem (o exportador pulava esses bytes), os quadros vazios
  // aparados em 25 tiras, os tres modos de cauda como MECANISMO, o comparador
  // de velocidade e as duas bancadas. O que entra e o que se ve.
  {
    version: '7.27',
    date: '2026-09-01',
    title: 'O combate respira',
    highlights: [
      'O TURNO PASSOU DE 2 PARA 3 SEGUNDOS. Tudo no combate ficou 1,5x mais espacado: recarga de golpe, tique de veneno e queimadura, duracao de sono e congelamento. Nenhum golpe ficou melhor ou pior que outro — mudou a escala, nao o equilibrio. Em compensacao rende menos por hora: medido, entre 15% e 20% menos de ouro e de abates no mesmo tempo de jogo. Menos que o terco que a conta sugere, porque boa parte do tempo o POKE esta andando entre alvos, e andar nao ficou mais lento. Foi de proposito, pra dar pra ver o que esta acontecendo.',
      'AS ANIMACOES DE GOLPE TOCAM NA VELOCIDADE EM QUE FORAM DESENHADAS. Antes cada efeito era esticado ou espremido pra caber num tempo fixo, e quem decidia a velocidade era o numero de quadros do desenho: um golpe de gelo passava voando e um de area arrastava. Agora todos correm no mesmo ritmo, o ritmo do desenho original.',
      'GOLPE CURTO DEIXOU DE CONGELAR NO FIM. Efeito com poucos quadros agora repete ou volta de tras pra frente, conforme o desenho — a mordida do Bite fecha e abre, a chama do Fire Spin continua girando. Antes eles paravam numa imagem fixa esperando o proximo golpe.',
      'ALGUNS GOLPES COMECAVAM ATRASADOS. Vinte e cinco efeitos tinham quadros em branco na ponta, e o Dig gastava o primeiro terco da animacao sem desenhar nada. Foram aparados.',
    ],
  },
  // Entrada de UMA LINHA, e de proposito. A regua manda anunciar so o que o
  // jogador ve ou sente, e o que entrou aqui e uma coisa so: o texto pequeno
  // ficou legivel. Esticar isso em tres linhas seria encher a nota.
  //
  // POR QUE ENTRA, ja que "ajuste de cor" soa a detalhe interno: nao e escolha
  // de gosto, e correcao de acessibilidade medida. O token do MENOR texto do
  // jogo dava 3,96 de contraste sobre o fundo de card e 4,29 sobre o de painel,
  // contra os 4,5 que a WCAG pede pra texto normal. Quem sente sao os mesmos
  // que hoje apertam os olhos pra ler o rotulo de Gold/h e as abas do chat.
  //
  // Fora da nota, por ser invisivel jogando: o teste que passou a trancar o
  // contraste dos tokens e a guarda que impede "consertar" o valor de volta pro
  // do handoff.
  {
    version: '7.26',
    date: '2026-09-01',
    title: 'O texto pequeno ficou legível',
    highlights: [
      'OS RÓTULOS MIÚDOS DA INTERFACE CLAREARAM. Os rótulos de taxa (Gold/h, XP/h), os títulos de seção dos painéis e as abas não selecionadas do chat estavam escritos num cinza escuro demais para o tamanho deles. A cor subiu o suficiente para passar no padrão de contraste — o resto da interface não mudou.',
    ],
  },
  // A leva da auditoria de HUD (PH-372 a PH-379). SUCINTA a pedido do usuario,
  // mesma regua da 7.22 em diante: cinco linhas, uma por coisa que o jogador
  // percebe sozinho.
  //
  // O ITEM 1 E BUG, e o mais grave da leva: o ticker do celular escolhia a
  // linha por PRIORIDADE DE CANAL (`sistema ?? trade ?? log`), nao por
  // recencia. Bastava uma linha de sistema aparecer uma vez — e sao 23 pontos
  // de chamada — pra ele congelar nela pra sempre. Como no compacto o ticker e
  // o unico canal de chat, o feed de jogo inteiro (abate, ouro, nivel, captura)
  // sumia da tela. Vale a primeira linha por isso.
  //
  // FORA DA NOTA de proposito, por ser invisivel jogando: o script de
  // normalizacao de acentuacao e o teste que o tranca (o jogador ve o texto
  // certo, nao a ferramenta), o rebuild do bundle da Edge, e o `leading` das
  // faixas do slot de golpe — ele so existe pra o item 3 caber.
  //
  // O QUE NAO ENTROU e vale registrar pra proxima varredura nao procurar: a
  // raridade continua sem aparecer em POKE shiny (o roxo de shiny e o lilas de
  // ULTRA tem distancia RGB 39, indistinguiveis num nome de 10px), entao ali
  // nada mudou e nao ha o que anunciar.
  {
    version: '7.25',
    date: '2026-09-01',
    title: 'A tela conta o que está acontecendo',
    highlights: [
      'O CHAT DO CELULAR VOLTOU A MOSTRAR O JOGO. A linha sobre o rodapé travava na primeira mensagem de sistema que aparecesse e ficava nela para sempre — abate, ouro, subida de nível e captura simplesmente não apareciam mais. Agora ela mostra sempre a última coisa que aconteceu.',
      'O NOME DO POKE SELVAGEM SAI NA COR DA RARIDADE. Dá pra ver que é um RARO ou um ULTRA antes de capturar, do mesmo jeito que a borda da foto já dizia no seu time. Comum continua branco e shiny continua roxo.',
      'A BARRA DE GOLPES CRESCEU NO CELULAR. Os ícones estavam pequenos demais e o número do dano cobria metade do slot; agora o elemento do golpe aparece inteiro e o botão é mais fácil de acertar com o dedo.',
      'ESC FECHA O PAINEL ABERTO, NO COMPUTADOR. Com dois abertos, o primeiro ESC fecha o de cima. As janelas também ganharam o mesmo vidro fosco que os painéis do celular já tinham.',
      'O TEXTO DO JOGO GANHOU ACENTO. Ficha de golpe, habilidade, Wiki, tutoriais, avisos e estas próprias notas estavam escritos sem acentuação em boa parte do jogo.',
    ],
  },
  // A revisao das sprites de golpe (PH-367 a PH-370). Uma entrada so pros oito
  // commits, porque pra quem joga e UM assunto: o que aparece na tela quando um
  // golpe acerta. SUCINTA, mesma regua da 7.22 e da 7.23.
  //
  // COMO O LOTE FOI ESCOLHIDO, porque isso explica o item 2: o dono nomeou 95
  // efeitos do banco de origem, e o sufixo do arquivo e a aplicacao pretendida.
  // Cruzar essa lista com o cadastro achou cinco tipos usando arte que dizia
  // outra coisa — dai o buraco de escavacao no golpe de pedra.
  //
  // FORA DA NOTA de proposito, por ser invisivel jogando: as tres bancadas de
  // conferencia, os testes de render, o rebuild do bundle da Edge, e as seis
  // entradas de arte que foram cadastradas e REMOVIDAS na mesma PR depois de
  // reprovarem na validacao ao vivo (pilar de fogo de tela inteira no Eruption,
  // chuva invisivel no Rain Dance, cupula invisivel no Spore). Pro jogador elas
  // nunca existiram — anunciar a remocao de algo que nunca esteve no ar so
  // confunde.
  {
    version: '7.24',
    date: '2026-08-31',
    title: 'Cada golpe com a cara dele',
    highlights: [
      'SESSENTA E UM GOLPES GANHARAM ARTE PRÓPRIA. Bite mostra uma mandíbula, Hyper Beam um feixe dourado, Razor Leaf folhas voando, Pay Day uma moeda de ouro girando, Recover uma cruz verde, Fissure uma rachadura no chão. Antes todos desenhavam o mesmo efeito genérico do tipo, então Ice Shard saia igual a Ice Beam.',
      'GOLPE DE PEDRA DEIXOU DE ABRIR UM BURACO NO CHÃO e golpe de inseto deixou de soltar grama — as duas artes estavam trocadas. Fada ganhou efeito de área, que não tinha, e o de dragão parou de ser idêntico ao de gelo.',
      'CHARM, TAUNT E SPIDER WEB VOLTARAM A APARECER. Os três tinham arte própria desde a leva passada e ela nunca chegava na tela: o brilho genérico do tipo desenhava por cima e escondia.',
      'POKE PARALISADO SOLTA FAÍSCA E QUEIMADO SOLTA BRASA. Antes os dois só ficavam com o corpo tingido, e num Pikachu amarelo ou num Charizard laranja isso não dava pra ver — justo a paralisia, que e o status que mais atrapalha.',
    ],
  },
  // A cacada por tier do PokeRogue. Uma entrada so pros seis commits, porque pra
  // quem joga e UM assunto: mudou quem aparece, com que frequencia e quem guarda
  // a sala. SUCINTA a pedido do usuario — mesma regua da 7.22 (PH-338).
  //
  // Fora da nota de proposito, por ser invisivel jogando: o teto de fatia que
  // passou a valer por sala, o tier de Hoenn que estava derivado e desligado, o
  // conserto do gerador de missoes e a conta de chance do card de hunt. Os
  // quatro aparecem indiretamente nas linhas abaixo (as chances mudaram), e
  // listar cada um encheria a nota de mecanica que ninguem confere na tela.
  {
    version: '7.23',
    date: '2026-08-31',
    title: 'Cada lugar tem os bichos dele',
    highlights: [
      'A CHANCE DE CADA POKE AGORA DEPENDE DO LUGAR. Antes cada espécie tinha uma frequência só, igual em qualquer hunt. Agora vale a raridade que ele tem NAQUELE sub-bioma — forma final ficou bem mais rara, forma base do lugar bem mais comum.',
      'GUARDIÃO E LORD VIRARAM BICHO GRANDE. Saiam do mesmo bolo dos selvagens (dava Guardião Rattata); agora saem do elenco de chefe do sub-bioma, e o Lord da sala 10 e mais raro que o Guardião. Em nível baixo ainda cai bicho comum.',
      'A PRIMEIRA CAÇADA TEM NOVE POKE E VAI ATÉ O NÍVEL 3. Pidgey, Caterpie, Weedle, Zigzagoon, Poochyena e Wurmple entraram. Lv3 e raro de propósito: medido, morrer no primeiro minuto ficou MENOS provável que antes.',
      'AS EVOLUÇÕES DO EEVEE SAIRAM DO MATO. Elas só vem de evoluir o Eevee que o Campeão Lance da — como já valia pro Porygon.',
      'AS MISSÕES DE HOENN CHEGARAM: 517 no lugar de 335, nos 18 tipos. Missão concluída continua concluída, mas alvo novo entra no meio das cadeias que você ainda não terminou.',
    ],
  },
  // PH-338. Entrada de LIMPEZA DE DIVIDA, e resumida de proposito (pedido do
  // usuario): cinco linhas curtas, nao os paragrafos das 7.15-7.21.
  //
  // COMO ELA FOI ACHADA, porque o metodo importa mais que a lista: cruzei as 310
  // keys `PH-` do historico da `main` contra as 103 citadas neste arquivo, filtrei
  // as posteriores a 25/08 (quando a regua de citar a issue no comentario comecou,
  // na 7.11) e conferi cada uma POR TEMA, nao por key — as notas anunciam por
  // descricao, e uma mudanca pode estar coberta sem a key nunca aparecer aqui.
  // Conferir so por key teria dado 123 "buracos", quase todos falsos.
  //
  // Sobraram SEIS, viradas em cinco linhas porque os dois de chat sao a mesma
  // coisa pra quem joga: PH-212 e PH-262 (chat), PH-214 (amigo), PH-244 (hunt
  // ativa), PH-221 (cabecalho sem F5), PH-321 (fim da mesa de troca).
  //
  // JA COBERTAS, conferidas uma por uma — fica escrito pra proxima varredura nao
  // refazer o trabalho: PH-208 (teto da hunt) na 7.14; PH-258, PH-259, PH-260,
  // PH-263, PH-264, PH-265, PH-281, PH-283, PH-225, PH-226 e PH-230 na 7.15
  // (sala vazia, caminhada da hunt inicial, numero escondido nas automacoes,
  // timer do Hospital, Lure, missao reivindicada, a placa do POKE, boss nos doze
  // biomas, fallback de sala); PH-282 tambem na 7.15, DENTRO do item "A TELA DE
  // JOGO FOI ARRUMADA" ("o proprio cartao agora fica colado no canto"); PH-311 na
  // 7.18.
  //
  // Fica de fora, mesma regua da 7.11 pra ca: PH-219, PH-251, PH-252, PH-253,
  // PH-288, PH-289, PH-298, PH-304, PH-322, PH-323 e os back-merges — CI, tipos
  // do banco, `.gitattributes`, carimbo de migration, teste e processo. Nenhum
  // chega ao jogo.
  {
    version: '7.22',
    date: '2026-08-31',
    title: 'Miudezas que já estavam no ar: chat, amizade, a hunt ativa na lista e o fim da troca',
    highlights: [
      'O CHAT PAROU DE INCOMODAR. Ele voltava sempre na aba Mundo e aberto, mesmo se você o tinha deixado recolhido lendo outra aba — agora ele volta como você deixou. E a faixa escura do rodapé passou a ter a largura do texto: uma linha curta não cobre mais o campo de batalha de ponta a ponta.',
      'DA PRA ADICIONAR AMIGO DIRETO DO RANKING E DO CHAT. Antes era preciso digitar o nick de cor no Correio, olhando pra um nome que estava ali na tela.',
      'A TELA DE HUNTS DIZ EM QUAL HUNT VOCÊ ESTA. Borda no card, selo EM CAÇADA no nome, e uma linha no cabeçalho que sobrevive a busca e aos filtros — com botão pra achar o card na lista.',
      'EVOLUIR PAROU DE PRECISAR DE F5 PRA APARECER. O POKE evoluia e o cabeçalho continuava mostrando a forma antiga; correção de nível vinda do servidor também só aparecia depois de recarregar.',
      'O FIM DA TROCA AVISA OS DOIS LADOS. Quem confirmava PRIMEIRO não via nada: a mesa sumia sem uma palavra, e o POKE recebido não aparecia na Mochila até fechar e abrir. Agora os dois recebem o aviso e a Mochila mostra o POKE novo na hora.',
    ],
  },
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
    title: 'A Geracao III chegou: 135 POKE de Hoenn, 10 hunts BOSS novas e o preço das Stone mudou',
    highlights: [
      'CENTO E TRINTA E CINCO POKE NOVOS ENTRARAM NO MATO E NA POKEDEX. Hoenn inteira, de Treecko a Deoxys: o elenco do jogo saiu de 245 para 380 espécies. Elas não foram jogadas num canto — cada uma tem bioma, sub-bioma e faixa de nível próprios, medidos nos encontros de verdade do jogo original. Se você já conhecia uma hunt de cor, ela tem bicho novo agora: 38 espécies novas no Campo Aberto, 24 na Mata, 18 no Subterraneo, 18 no Sombrio, 18 nos Aridos, e vai por ai. Tudo com arte, retrato, shiny e cara de emocao — nenhuma delas aparece como quadrado vazio.',
      'AS HUNTS BOSS PASSARAM DE 11 PARA 21. Os dez lendários de Hoenn ganharam hunt dedicada, uma pra cada: Regirock, Regice, Registeel, Latias, Latios, Kyogre, Groudon, Rayquaza, Jirachi e Deoxys. Eles NÃO aparecem em hunt comum — chegaram a nascer no mato durante o desenvolvimento e isso foi corrigido antes de ir ao ar, porque Rayquaza como encontro de rotina não e hunt BOSS, e sim hunt quebrada.',
      'OS TRÊS INICIAIS DE HOENN SÃO SELVAGENS, E ISSO E DE PROPÓSITO. Treecko, Torchic e Mudkip aparecem no mato. A regra do jogo nunca foi "inicial não e selvagem" — e "o que você pode ESCOLHER na tela inicial não aparece no mato", e a tela oferece Charmander, Squirtle e Bulbasaur. Chikorita, Cyndaquil e Totodile já eram selvagens desde a Geracao II, pelo mesmo motivo.',
      'CINCO HABILIDADES QUE NÃO EXISTIAM AGORA FUNCIONAM, E DUAS DELAS SEGURAM POKE QUEBRADO. Slaking tem o maior conjunto de atributos do jogo inteiro, e agora tem TRUANT: ele descansa um turno a cada dois, e sem isso seria entregar o POKE mais forte do jogo como encontro de rotina. Shedinja tem 1 de HP máximo e agora tem WONDER GUARD: só golpe super efetivo o acerta, e sem isso a espécie era piada. Entraram também TOXIC BOOST (envenenado bate mais forte), SIMPLE (mudança de atributo conta dobrada) e HEAVY METAL. E de brinde: LIGHT METAL, que estava no jogo desde sempre com seis donos e NUNCA fez nada — o motivo escrito dizia que nenhum golpe usava peso, e Low Kick, Heavy Slam e Heat Crash usam desde o primeiro dia. As duas agora pesam de verdade.',
      'O PREÇO DE TROCAR A ESPECIALIDADE MUDOU MUITO EM ALGUNS TIPOS, PRA CIMA E PRA BAIXO. O custo em Stone sempre acompanhou quanto daquela Stone o jogo oferece, e 135 POKE novos mudaram a oferta de quase todo tipo. AÇO, PEDRA, GELO e TERRA ficaram bem mais caros (Aço saiu de 2 pra 16 Stone no primeiro nível — Aron, Lairon, Aggron, Beldum, Metang, Metagross, Mawile e Registeel entraram todos de uma vez). VENENO, FADA, SOMBRIO e FANTASMA ficaram mais baratos. Não e reajuste solto: e a mesma conta de antes, rodada sobre o elenco novo.',
      'QUARENTA GOLPES NOVOS GANHARAM DESCRIÇÃO EM PORTUGUÊS. Os golpes que chegaram com Hoenn não aparecem mais sem texto na tela de golpes.',
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
    title: 'O clima dura de verdade, o guardião virou prioridade e o Eevee do Lance e único',
    highlights: [
      'CHUVA, SOL, AREIA E GRANIZO DE GOLPE DURAVAM UM PISCAR DE OLHOS. O jogo dizia dez turnos e entregava menos de um segundo: o clima caia no instante em que o último inimigo do grupo morria, e o cronometro dele só andava enquanto havia luta acontecendo. Agora ele dura o tempo que promete, contado em tempo corrido — atravessa a espera pelo próximo inimigo, atravessa o seu POKE desmaiado, atravessa a tela de "entrando em nova área". Na prática: Dança da Chuva, Dia Ensolarado, Granizo e Tempestade de Areia ficaram bem mais fortes do que eram.',
      'E HABILIDADE DE CLIMA (Drizzle, Drought, Sand Stream, Snow Warning) ERA O OPOSTO: NÃO ACABAVA NUNCA. Um POKE com Drizzle entrava em campo e a chuva dele apagava o clima do lugar pelo resto da sala inteira. Agora ela dura os mesmos dez turnos do golpe, e depois o clima da área volta a aparecer.',
      'SEU POKE IGNORAVA O GUARDIÃO DA SALA E IA BATER NO BICHO MAIS PERTO. O guardião e o único inimigo que destrava a sala, e ele nasce longe — então o POKE saia atrás de qualquer outro e a hunt ficava parada em 30/30 esperando. Agora o guardião tem a mesma prioridade que um shiny: seu POKE vai direto nele, de qualquer distância, e bate NELE quando os dois estão em cima de você.',
      'E MATAR O GUARDIÃO AS VEZES DAVA... OUTRO GUARDIÃO. Quando o abate acontecia nos últimos segundos antes do jogo gravar, a troca de sala se perdia no meio do caminho: o servidor guardava a sala velha ainda em 30/30, e um guardião novo, de HP cheio, nascia no lugar do que você acabou de derrubar. Corrigido — a sala troca no mesmo instante em que ele cai.',
      'O EEVEE DO CAMPEÃO LANCE ERA IGUAL PRA TODO MUNDO, E AGORA E SORTEADO. Ele vinha sempre com a mesma raridade, os mesmos seis atributos e nenhuma habilidade — dois jogadores que vencessem o Lance ganhavam POKEs idênticos, e shiny era impossível. Agora ele e sorteado como qualquer POKE do jogo: raridade, atributos, natureza, habilidade (com chance da oculta) e shiny. Ele vem no NÍVEL 1, pra você criar do começo. QUEM JÁ RECEBEU O ANTIGO TEM UM NOVO NO CORREIO — ao coletar, o antigo da lugar ao sorteado, e nada e perdido no meio.',
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
      'CANCELAR UM ANÚNCIO DIZIA QUE O POKE TINHA VOLTADO, E ELE NÃO APARECIA. A mensagem era essa mesma — "o POKE voltou pra sua mochila" — e a Mochila continuava sem ele. Ele estava lá, seu, inteiro: era a tela que só descobria depois de você fechar e abrir de novo. Agora ele volta na hora.',
      'E COMPRAR UM POKE NO MERCADO TAMBÉM NÃO MOSTRAVA NADA. Você pagava, o ouro saia, e a Mochila seguia igual — o POKE comprado só aparecia na próxima vez que você abrisse a tela. Era o pior dos três casos, porque nele você já tinha pago. Corrigido junto: aceitar uma oferta também para de deixar na sua lista um POKE que você acabou de vender.',
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
    title: 'Troca direta entre jogadores, com confirmação dos dois lados',
    highlights: [
      'AGORA DA PRA TROCAR POKE COM OUTRO JOGADOR, DE VERDADE. Até aqui o único jeito de um POKE mudar de dono era o Mercado, que troca POKE por OURO — POKE por POKE não existia. A tela nova fica no menu, em "Troca": você convida alguém pelo Ranking ou pelo Correio (o ícone de duas setas ao lado do nome), o outro aceita, e os dois montam a oferta na mesma mesa. POKE e item entram; os dois lados veem o que o outro pos, na hora, sem recarregar nada.',
      'E ELA E A PROVA DE GOLPE, NÃO SÓ UM COMBINADO. O golpe classico e trocar a oferta no instante em que o outro clica em confirmar — você ve três POKEs, confirma, e o que sai e um. Aqui isso não funciona: qualquer mudança na mesa DERRUBA as duas confirmacoes na hora, e o servidor recusa qualquer confirmação que não seja da mesa que você esta vendo agora. Só com os dois lados confirmados sobre a MESMA mesa a troca acontece — e ela acontece inteira ou não acontece, nunca pela metade.',
      'O QUE VOCÊ POE NA MESA SAI DA SUA MOCHILA ENQUANTO ESTIVER LÁ. Não e uma promessa: o POKE ofertado não pode ser vendido, anunciado, evoluido nem posto na equipe enquanto a mesa estiver aberta, e o item vai reservado também. Desistir devolve tudo. Qualquer um dos dois cancela a qualquer momento, e a mesa fecha sozinha depois de 15 minutos parada — o que estava nela volta pra quem era.',
      'ANUNCIAR UM POKE NO MERCADO PODIA FAZER ELE SUMIR PARA SEMPRE. Com a Mochila aberta, anunciar um POKE (ou coloca-lo em leilao) fazia a gravação seguinte APAGAR o POKE do banco. O anúncio continuava na vitrine, mas apontando pra nada — quem comprasse pagava por um POKE que não existia mais, e o dono não tinha como recuperar. Corrigido.',
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
    title: 'Derrotar o Campeão Lance finalmente conta',
    highlights: [
      'DERROTAR O CAMPEÃO LANCE NÃO ESTAVA VALENDO NADA. Você vencia os seis POKEs dele, o jogo anunciava a vitória — e a Faixa III continuava trancada, o Hall da Fama continuava vazio e o Eevee da primeira vitória nunca chegava pelo correio. As três coisas dependem do mesmo registro, e ele nunca era gravado. Agora vale.',
      'PORQUE A LUTA CONTRA ELE RECOMECAVA SOZINHA, E VOCÊ NÃO VIA. Quem guarda o placar da luta e o servidor, e a cada rodada de gravação o POKE do Lance voltava com a vida CHEIA por lá. Quem não derrubasse um deles inteiro entre duas gravacoes nunca o derrubava; e quem derrubava terminava a luta antes de o servidor concordar, então a vitória que aparecia na sua tela não existia pra ele. Agora a vida do POKE do Lance continua de onde parou.',
      'E O GUARDIÃO PAROU DE FUGIR QUANDO O SEU POKE ESTA CONGELADO. Ele sai de campo quando a luta empaca de verdade — mas estava contando junto o tempo em que o seu POKE não CONSEGUIA atacar. Resultado: ele ia embora no meio de uma luta que estava indo bem, e a vida que ele já tinha perdido voltava inteira com o substituto.',
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
    title: 'A hunt que travava para sempre, e o jogo que parava quando você minimizava',
    highlights: [
      'A HUNT PODIA TRAVAR PARA SEMPRE NUMA SALA, E NÃO HAVIA SAÍDA. Você fechava os 30 abates, o guardião nascia, seu POKE atravessava o mapa, encostava nele e batia — e a vida dele não mexia um ponto. Não era lentidao: quando o guardião era IMUNE ao tipo do seu POKE (um Ponyta com Flash Fire contra um POKE só de Fogo, por exemplo), o dano era zero, para sempre, sem erro na tela e sem nada que você pudesse fazer. Quem lutava com um POKE de um tipo só era quem mais sofria: quase uma em cada quatro salas de Campina travava assim. Agora o guardião que aparece e sempre um que o seu POKE consegue machucar.',
      'E SE A LUTA EMPACAR MESMO ASSIM, O GUARDIÃO SAI DE CAMPO. Trocar de POKE no meio da briga, ou ele se defender bem demais, ainda podia parar a sala. Passou um tempo apanhando sem perder vida nenhuma, ele foge e outro toma o lugar dele — a sala continua exigindo que você derrube um guardião, só parou de poder ficar presa num que não da pra derrubar.',
      'E SEU POKE PAROU DE INSISTIR NUM GOLPE QUE NÃO FAZ NADA. Ele seguia a ordem dos quatro golpes sem olhar quem estava na frente, então contra um alvo imune gastava turno atrás de turno num golpe de zero. Agora ele pula o que não pode dar resultado nenhum e vai pro próximo da fila que funciona — a ordem que você escolheu continua valendo em todo o resto.',
      'O JOGO PAROU DE DESACELERAR COM A ABA MINIMIZADA. Deixar a aba em segundo plano fazia o navegador estrangular o relogio do jogo, e o seu progresso passava a ser creditado em intervalos cada vez maiores. Agora o ritmo se mantem com a aba escondida, e voltar pra ela fecha a conta na hora em vez de esperar o próximo ciclo.',
      'E VOLTAR PRA ABA NÃO CONGELA MAIS O JOGO NO AVISO DE ÁREA NOVA. Aquele "Entrando em nova área" dura três segundos DE JOGO — e com a aba escondida o jogo anda devagar, então os três segundos viravam minutos de tela parada depois que você voltava. Agora a troca acontece no ato do retorno.',
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
    title: 'Farm em área, o boss guardando os doze biomas — e as Missões finalmente dando pra terminar',
    highlights: [
      'AGORA VOCÊ PODE JUNTAR ATÉ QUATRO SELVAGENS ANTES DE BATER. Seu POKE sempre andava até o mais próximo e lutava um por vez, então golpe de área nunca acertava mais de um alvo — ele existia e não servia pra nada. Com o Lure ligado (aba nova no painel de Automações) ele passa pelo raio de vários, puxa o grupo atrás de si e só então para pra lutar: um golpe de área acerta todos de uma vez. Você escolhe juntar 1, 2, 3 ou 4 no painel.',
      'O PREÇO DO LURE E LEVAR PANCADA DE TODOS AO MESMO TEMPO. Não e farm de graça: juntar quatro multiplica o dano que entra no seu POKE, e o ganho depende de ter golpe de ÁREA na rotação — sem um, o grupo só bate mais em você. Shiny em campo cancela a reuniao na hora (ele continua tendo prioridade), e hunt de um inimigo só, como as de boss, ignora o Lure.',
      'E O LURE PAROU DE COMEÇAR A BRIGA NO MEIO DA REUNIAO. Ele juntava o grupo e batia ao mesmo tempo: bastava um selvagem encostar pra o seu POKE parar pra lutar com ele, e a conta que você pediu nunca fechava. Agora o golpe fica segurado até a reuniao terminar — primeiro junta os quatro, depois luta. Enquanto junta, seu POKE apanha sem revidar, então o Lure ficou mais forte e mais arriscado ao mesmo tempo.',
      'O BOSS AGORA EXISTE NOS DOZE BIOMAS, NÃO SÓ NO IGNEO. Ele tinha nascido em um bioma só, como piloto, e ficou lá. Agora cada um dos doze tem o seu, na ordem canonica do mapa.',
      'E VENCER O BOSS E O QUE ABRE O PRÓXIMO BIOMA. O jogo passou a ter uma linha pra seguir: a área seguinte fica trancada até você derrubar o dono da atual. O menu de hunt diz quem esta trancado e o que falta — antes o botão simplesmente não levava a lugar nenhum, sem explicar.',
      'E ELE ABRE DE VERDADE — ANTES O PROGRESSO ERA CONTADO E JOGADO FORA. Você fechava as dez salas, derrubava o Lord, e o bioma seguinte continuava trancado; fechava de novo, e de novo, e nada. O jogo contava certo e a gravação descartava o número em silencio, sem erro nenhum na tela. Agora ele e guardado — e quem já tinha fechado ciclo antes desta correção recebeu o credito retroativo, sem precisar refazer nada.',
      'O ATALHO DE TROCAR DE SALA PAROU DE PULAR O GUARDIÃO. Com o avanco manual ligado, dava pra passar pra sala seguinte com o guardião (ou o Lord) ainda de pé — e quem fazia isso fechava o ciclo inteiro sem nunca vencer o dono do bioma, então nunca destravava a área seguinte. Agora, enquanto ele estiver vivo, a sala diz "Derrote o Guardião" (ou o Lorde) e não passa.',
      'CAPTURAR O GUARDIÃO E O LORD FICOU MAIS DIFÍCIL. Eles caiam com a mesma chance de um selvagem qualquer, sendo que aparecem uma vez por sala, nascem no teto de nível da área e vem com atributos que selvagem nenhum tem. A chance foi pela metade — continua sempre possível, só deixou de ser o POKE mais barato da hunt.',
      'O BOSS TAMBÉM PASSOU A SE APRESENTAR. Ele entrava em cena como qualquer outro encontro, e o único jeito de saber que aquilo era o boss era a barra de HP não acabar nunca. Agora a entrada dele tem apresentacao própria, e no menu ele tem selo.',
      'OS EFEITOS DO CENÁRIO GANHARAM ESCALA. Folha, poeira, faísca, neve e areia estavam grandes demais pro tamanho de um POKE — a poeira de caverna chegava a um quarto da altura de um Pokemon — e quase todo bioma mostrava a mesma bolinha em outra cor. Agora cada um tem tamanho e formato próprios: a folha tomba, a faísca risca, a cinza urbana e uma fibra dobrada, o reflexo da água e uma cruz de luz.',
      'E A CHUVA MOLHA O CHÃO. As gotas caem, batem e respingam, com microgotas que quicam em volta. Selva e caverna ganharam gotejo próprio, pingando sempre do mesmo ponto, do jeito que água parada na copa e em teto de gruta pinga.',
      'O NÍVEL PAROU DE SUMIR NO F5. Subir de nível e recarregar a página logo em seguida podia devolver o POKE no nível anterior: a última gravação não chegava a sair. Agora ela sai.',
      'UM SHINY NA TELA PODIA DESPENCAR O ATAQUE DO INIMIGO E ENCHER O CHAT. Com um shiny em campo e outro selvagem colado em você, a habilidade de entrada em combate do seu POKE — Intimidate, por exemplo — disparava a cada quadro em vez de uma vez por luta: o Ataque do oponente caia até o fundo em menos de um segundo e o chat levava uma linha por quadro. Agora ela dispara uma vez, como deveria.',
      'AS MISSÕES DE TIPO AGORA DÃO PRA TERMINAR — QUATRO DELAS TRAVAVAM LOGO NA PRIMEIRA. Fogo, Água, Planta e Veneno pediam, de cara, abates de Charmander, Squirtle e Bulbasaur — e nenhum dos três aparece como selvagem em lugar nenhum do jogo. Como a cadeia só libera a seguinte quando você fecha a anterior, essas quatro nunca saiam do lugar, e ao todo 148 das 359 missões eram impossiveis. Agora nenhuma missão pede POKE que você não encontra.',
      'E A ORDEM DAS MISSÕES PASSOU A SEGUIR A DIFICULDADE, NÃO O NÚMERO DA POKEDEX. A primeira missão de Voador era Charizard; a de Gelo pedia 150 Articunos no quinto degrau. Cada cadeia agora começa pelo POKE mais fácil de achar daquele tipo e vai subindo, e lendário saiu de todas elas — ele aparece 20 vezes menos que um comum e travava tudo o que vinha depois. A recompensa acompanhou: antes o ouro por abate mudava até 7,6 vezes só dependendo do tipo que você escolhesse, e agora e praticamente o mesmo em todos os 18, com o bônus de conclusao crescendo junto com o tamanho da cadeia.',
      'A ESPECIALIDADE DE VOADOR ERA IMPOSSÍVEL DE COMPRAR, E A TELA COBRAVA POR ELA MESMO ASSIM. A Pedra VOADOR não caia de lugar nenhum: o drop olhava só o tipo primario do POKE abatido, e nenhuma espécie do jogo tem Voador como primario. Agora POKE de dois tipos solta a pedra de um dos dois, então Voador tem fonte — e o progresso de 100% deixou de ser inalcancavel.',
      'E O PREÇO DAS ESPECIALIDADES PASSOU A LEVAR EM CONTA A RARIDADE DA PEDRA. Como cada pedra só cai do POKE do tipo dela, fechar as duas trilhas custava 18.800 abates em Fogo e 162.933 em Aço — nove vezes mais caro, sem nada que justificasse. Os tipos comuns seguem no mesmo preço de antes; os raros ficaram proporcionais ao que realmente aparece. A trilha de defesa também teve o texto corrigido: ela reduz o dano que você RECEBE daquele tipo, e não aumenta sua defesa.',
      'A SALA NOVA AS VEZES NASCIA VAZIA, E A HUNT MORRIA ALI. Depois de trocar de sala podia acontecer de não nascer inimigo nenhum: campo limpo, nada pra matar, a contagem parada — e como a sala só avança com 30 abates, a hunt ficava presa pra sempre naquele mapa. Recarregar a página era a única saída. Corrigido: o guardião da sala anterior ficava pendurado no lugar e desligava o nascimento dos selvagens.',
      'E A TROCA DE SALA PAROU DE ACONTECER COM A BARRA PELA METADE. Quem manda na contagem e o servidor, e o número da sua tela e uma previsao — quando os dois discordavam, a área trocava mostrando 12/30 e parecia que o jogo tinha pulado a sala. Agora a barra fecha em 30/30 antes do aviso de área nova, que e o que de fato aconteceu.',
      'E A ÁREA PAROU DE TROCAR SEM VOCÊ SAIR DA SALA. Acontecia de o sub-bioma mudar sozinho — de Relvado pra Planície, por exemplo — com o contador continuando em "Sala 2/10": quando o servidor demorava a responder, o jogo chutava a sala seguinte e depois se corrigia na sua frente. Ele agora espera de verdade antes de chutar qualquer coisa.',
      'E O SEU POKE PAROU DE ANDAR TRAVANDO ENQUANTO REUNE. Com o Lure ligado ele dava uns passos, parava, andava de novo — várias vezes por segundo, e parecia que o jogo estava engasgando. Ele parava de propósito (pra não arrastar o grupo pra longe de quem ainda estava vindo atrás), só que decidia isso a cada instante e ficava trocando de ideia. Agora, quando para pra esperar, ele espera de verdade: são 40 vezes menos paradas no caminho.',
      'A TELA DE JOGO FOI ARRUMADA. A sala em que você esta subiu pro cabeçalho, no centro; as taxas de Gold/h, XP/h e Mobs/h desceram pro canto de baixo a direita; o seu ouro e o diamante entraram no cartão do treinador, ali no canto de cima (abreviados: 1B, 1M); e o próprio cartão agora fica colado no canto em qualquer tamanho de janela — antes, em tela larga, ele parava no meio do caminho. O que sobrou no meio da tela foi embora.',
      'O NOME DO GOLPE APARECE NO SEU POKE, LOGO ABAIXO DA VIDA. Antes ele subia junto com os números de dano, misturado com o que os OUTROS estavam levando — agora ele fica colado na barra de quem usou o golpe, com fundo próprio pra dar pra ler mesmo no meio da explosão. E a porcentagem de vida saiu de cima do seu POKE: ela já esta no cabeçalho, e no campo só atrapalhava. A do alvo continua, que e a única que você não tem em outro lugar.',
      'E A HUNT PAROU DE EMPACAR COM A BARRA CHEIA. Acontecia de a sala fechar os 30 abates e simplesmente não passar: barra cheia, o guardião em pé, e você matando sem que nada andasse — em alguns casos por mais de dez minutos, até você desistir e sair. O jogo cobrava a área seguinte de tanto em tanto segundo, e essa pressa era justamente o que impedia o servidor de terminar a luta com o guardião. Ele agora pergunta no ritmo certo, e a sala vira.',
      'O F5 PAROU DE TE MANDAR DE VOLTA PRA SALA 1. Recarregar a página no meio da hunt jogava você na primeira sala do primeiro ciclo, perdendo o caminho inteiro. Agora você volta na MESMA sala, com os mesmos abates e o mesmo ciclo — e se havia um guardião em pé, ele continua lá, com a vida que tinha.',
      'REIVINDICAR MISSÃO RESPONDIA "MISSÃO JÁ REIVINDICADA" E NÃO PAGAVA. A tela voltava a oferecer, a cada 30 segundos, uma missão que você já tinha reivindicado; ao clicar de novo, o jogo recusava. O ouro da primeira vez sempre foi pago — o que sumia era a marca na tela.',
      'A HUNT INICIAL PAROU DE SER UMA CAMINHADA. Só havia um selvagem no mapa inteiro, e o POKE passava metade do tempo atravessando o cenário até o próximo. Agora eles nascem mais perto e o campo enche conforme seu inicial cresce: um até o Nível 2, dois a partir do 3, três a partir do 5. Eles continuam nascendo longe uns dos outros, então você enfrenta um por vez — a primeira meia hora de conta nova era o único lugar do jogo onde dava pra morrer sem entender por que.',
      'IR PRO HOSPITAL AGORA LEVA 3 SEGUNDOS. Era instantaneo, e virou botão de fuga: qualquer aperto em campo se resolvia saindo antes do próximo golpe. Agora há uma contagem na tela — e da pra cancelar, se você clicou sem querer.',
      'O CLIMA EXPLICA O QUE ELE FAZ, E SAIU DA FRENTE DO JOGO. Ele boiava no meio do campo; agora fica no cabeçalho, ao lado da sala. Passe o ponteiro (ou toque) e ele lista os efeitos reais daquele tempo: quanto Água ganha na chuva, quanto Fogo perde, quanto de vida o granizo e a areia tiram por turno, o que a neve muda pro tipo Gelo e quais golpes nunca erram — e, quando o clima veio de um golpe, quantos turnos ainda faltam pra ele passar. Antes só o nome aparecia, e o resto era adivinhacao.',
      'A SALA E A CARTEIRA TAMBÉM PASSARAM A SE EXPLICAR. Toque no chip de sala e ele conta quantas salas a hunt tem, quantos abates cada uma pede e o que acontece ao limpar a última; com o Guardião segurando a passagem, ele diz isso também. Na carteira aparece o valor EXATO do ouro e do diamante — no celular o número vinha abreviado ("1B") e não havia jeito nenhum de ver quanto era de verdade.',
      'E AS EXPLICACOES PARARAM DE ABRIR NO CANTO DA TELA. A bolha de qualquer card — golpe, item, POKE do chat, clima, sala — nascia grudada no alto a esquerda em vez de junto do que ela explica, e no celular ainda vazava pra fora da tela. Agora ela abre encostada no que você tocou.',
      'O SINO DO CORREIO DIZ O QUE FALTA, E NÃO SÓ QUANTOS. Uma carta com item dentro conta duas vezes: uma como mensagem por ler, outra como presente por pegar. Você lia a mensagem, o número caia de 2 pra 1 e o sino continuava aceso sem explicar — parecia travado. Agora ele diz "1 mensagem por ler e 1 item por coletar", e a conversa que tem presente preso mostra "por coletar" na lista.',
      'O AVANCO MANUAL DE SALA VOLTOU A FUNCIONAR. Ligar a opção no painel de Automações não fazia mais nada desde que todas as salas ganharam Guardião: a sala trocava sozinha assim que ele caia. Agora ela espera o seu clique, e os selvagens continuam nascendo enquanto você fica — que e o motivo de ligar a opção.',
      'ESPECIALIDADES, TASKS E BESTIÁRIO SAIRAM DE DENTRO DO "MAIS". Os três estavam a dois toques de distância, no mesmo lugar que a Wiki e os Ajustes. Agora tem coluna fixa no canto superior direito, logo abaixo do seu card de treinador.',
      'A COLUNA DO TOPO FICOU MAIS FÁCIL DE LER. As reservas encostaram no POKE em campo (elas são a fila dele, e havia um chip no meio separando os dois), e a sala/clima passou pro centro. A faixa preta do chat parou de atravessar a tela inteira pra escrever "Item encontrado: Potion" — ela agora tem o tamanho do texto.',
      'E O PAINEL DE AUTOMAÇÕES PAROU DE ESCONDER NÚMERO. Numa janela estreita, o nome do item empurrava a contagem pra fora e o aviso de "suprimentos acabando" cortava justamente as horas restantes. As regras por espécie também espremiam o nome do POKE em cinco letras. E o campo de "Vida ≤ __ %" do Auto-pot mostrava só o primeiro digito: a regra padrão de 70% aparecia como 7%, que e a diferença entre curar cedo e curar quase morto.',
      'A BARRA DE VIDA DO LENDÁRIO VOLTOU AO TAMANHO NORMAL. Ela era cinco vezes mais larga e duas vezes mais alta que a de qualquer selvagem. A escala maior, a aura e o nome continuam distinguindo ele em campo; a barra gigante ficou só pro guardião de sala.',
      'O CENÁRIO GANHOU FONTES DE VIDA ANCORADAS NO MAPA. Tocha com chama, chamine com fumaça, cristal brilhando, espuma quebrando na pedra, faísca de forja e enxame de vaga-lume: cada arte tem os seus, sempre no mesmo ponto, em vez de partícula solta atravessando a tela.',
      'E CINCO MAPAS PARARAM DE MOSTRAR O EFEITO DE OUTRO LUGAR. A mata noturna tinha fiapo de cidade voando no meio da floresta, o jardim do dojo levava poeira seca por cima das cerejeiras e do rio de carpas, o covil do dragão tinha poeira em vez de faísca com um rio de lava atravessando a tela, e o vale verde da montanha nevava sobre as flores. Cada um deles foi conferido olhando o desenho, e não o nome do arquivo.',
      'CLEFAIRY VOLTOU A EVOLUIR. A ficha mandava juntar 40 Pedras de Fada e o servidor exigia 40 Pedras Normais — quem farmasse o que a tela pediu (uns 800 abates do tipo certo) tomava recusa no fim, sem nada explicando. Os dois lados agora falam do mesmo tipo.',
      'E DOIS TEXTOS QUE APARECIAM CORTADOS. A sigla do golpe de área mostrava um parenteses no lugar da terceira letra, e o botão de comprar da Loja perdia o "C" — virava "omprar 1 · 60", com o preço em risco de sumir junto no item mais caro.',
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
    title: 'Comemoracao nos três marcos do jogo, o ouro voando até a carteira, e dois menus novos',
    highlights: [
      'SUBIR DE NÍVEL, EVOLUIR E ACHAR UM SHINY GANHARAM COMEMORACAO. Os três marcos do jogo avisavam com a mesma linha de toast que rolava e sumia. Agora nível comum mostra um chip rápido com os atributos ganhos; nível com golpe novo, multiplo de 5 ou o 100 mostra um cartão central; evolução e shiny mostram um cartão grande com antes -> depois. Abates seguidos que sobem vários níveis de uma vez juntam tudo num cartão só (Lv 33 -> 36) em vez de travar a tela repetindo, e a preferência de menos movimento do sistema e respeitada.',
      'O OURO E O XP DO ABATE VOAM ATÉ A CARTEIRA. Cada abate soltava dois textos, verde e dourado, sobre a grama — na mesma faixa estreita onde o número de dano precisa aparecer. Agora as moedas nascem no POKE derrotado, sobem em leque e voam em arco até a carteira do trilho, que pulsa na chegada com o valor exato logo abaixo. A informação passou a chegar no número que ela muda.',
      'NOVO MENU: ESPECIALIDADES — MAESTRIA DE ELEMENTOS. Dezoito tipos elementais, cada um com dez níveis: cinco de bônus de dano (+1% por nível, até +5%) e cinco de bônus de defesa, trilhas independentes. Cada nível custa um item do tipo mais ouro, com o preço subindo a cada degrau. O bônus vale no combate, e o progresso somado dos 180 níveis possíveis da um título global.',
      'NOVO MENU: TASKS & MISSÕES. Uma cadeia de missões de abate por tipo elemental — derrotar a espécie da posição N libera a N+1. O progresso vem dos abates que você já fez (o mesmo contador do Bestiário, não há meta nova pra encher), cada missão reivindicada paga ouro, e fechar a cadeia inteira de um tipo da um bônus.',
      'VOCÊ PODE SEGURAR A HUNT NUMA SALA SÓ. Fechar os 30 abates de uma sala sempre levou pra próxima sozinho. Agora há um interruptor por hunt: com ele ligado a sala trava em 30/30 e um botão de próximo nível faz o avanco quando você quiser. Farm offline de horas de verdade continua avancando sozinho de qualquer jeito.',
      'A HUD DE BATALHA FICOU LEGÍVEL EM CINCO PONTOS. O nome do alvo saia quase apagado sobre a grama e ganhou fundo. As duas porcentagens do trilho agora dizem HP e XP em vez de dois números soltos. O nome do POKE parou de truncar quando há espaço sobrando na linha. As reservas mostram a espécie, não só o nível, e a reserva desmaiada tem selo KO em vez de depender só da foto acinzentada. Golpes do mesmo tipo elemental ganham uma sigla no canto pra você distinguir sem abrir a ficha.',
      'O CABEÇALHO E O TRILHO DE RESERVAS ENCOSTARAM NO CANTO. Ficavam meio dedo pra dentro da borda, e cada reserva era um card solto com borda própria — seis mini-janelas empilhadas. Agora a coluna cola na borda superior esquerda e as reservas leem como um bloco único.',
      'O JOGO AVISA QUANDO SEU POKE PASSOU DO TETO DA HUNT. Um Noctowl de Nível 33 rodou 4h39min numa hunt de teto Nível 30 sem mudar de nível, e nada na tela dizia por que. Agora, ao entrar numa hunt fácil demais pro nível do POKE ativo, um aviso diz que o XP dali pra frente rende pouco.',
      'O AVISO DE CAPTURA PAROU DE ENTREGAR O RESULTADO ANTES DA POKEBOLA. Capturado! e a captura falhou! apareciam no instante do arremesso, antes de a bola terminar de balancar na tela. Agora a narracao espera a animação terminar.',
      'A BARRA DE XP PAROU DE VOLTAR SOZINHA DURANTE A HUNT. O servidor reconfere cada janela de 30 segundos pelo relogio dele, e o corte as vezes fechava um pouco antes do ponto que você já tinha visto na tela — a barra parecia regredir sem você ter perdido nada. Agora a queda só passa quando houve perda real por desmaio.',
      'SUMIU AQUELE TOAST VERMELHO COM [diag-sala] E UM MONTE DE NÚMERO. Era instrumentacao interna que vazou pra produção pela promocao de 26/08 — pro jogador, uma mensagem de erro incompreensivel no meio do jogo.',
      'O VENTO PASSOU A APARECER NA VEGETACAO. A folha caia numa deriva constante; agora há rajadas periodicas em que ela acelera e balança de lado por alguns segundos, como vento passando pela copa.',
      'O VULCAO GANHOU BRILHO DE LAVA RENTE AO CHÃO. Antes só a brasa subia da fonte; agora uma faixa de luz pulsa perto da base da tela nas artes de vulcao e de caverna vulcanica.',
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
    title: 'O céu deixou de ser sempre limpo — e mais quatro coisas que já estavam no ar sem aviso',
    highlights: [
      'AGORA CADA SALA TEM CLIMA PRÓPRIO. Até agora o clima só existia se um POKE gastasse o turno lancando Rain Dance e companhia — numa hunt normal o céu estava sempre limpo. O clima e sorteado ao entrar na sala e vale enquanto ela durar, com a tabela de chance vindo do sub-bioma.',
      'DOIS CLIMAS NOVOS: Neve e Neblina. Com eles são seis ao todo, junto de Chuva, Sol forte, Granizo e Tempestade de areia.',
      'UM SUBSISTEMA INTEIRO SAIU DA GAVETA. Chlorophyll, Swift Swim, Sand Rush, Rain Dish e Ice Body já existiam no jogo e quase nunca disparavam, porque dependiam de um clima que nunca acontecia. Agora valem.',
      'E VOCÊ PASSA A VER O CLIMA. Cada um dos seis tem efeito desenhado na tela, e um chip no HUD diz qual esta valendo e o que ele faz. Antes disto um POKE podia perder 1/16 do HP por turno numa sala de deserto sem NADA na tela explicando por que.',
      'AS TELAS DE VENDA DO MERCADO GANHARAM BUSCA, FILTRO E ORDENAÇÃO. Anunciar exigia caçar o item ou o POKE percorrendo a lista inteira na mão, e mochila e reserva só crescem com o tempo de jogo. POKE tem busca por nome, tipo, raridade e shiny, e ordenação por nível, IV, raridade e nome; item tem busca por nome e categoria. A busca ignora acento e maiuscula.',
      'POKE NÃO NASCE MAIS EM BANDO. Cada inimigo era sorteado sem olhar onde os outros já estavam, então os seis podiam cair colados na mesma fatia da tela. Não era só feio: era um pico de dificuldade que não vinha da faixa de nível da hunt, e nada denunciava que aquilo tinha sido sorteio. Medida em 60 sementes, a menor distância entre dois inimigos subiu de 3 para 81.',
      'O BOT PASSA A USAR MAX REVIVE. Ele só procurava Revive: quem tinha apenas Max Revive ficava com a automação morta — o POKE desmaiava, nada levantava ele, e nada na tela explicava. O seletor sempre ofereceu os dois.',
      'E O AVISO DE SUPRIMENTO PAROU DE GRITAR A TOA. Ele contava item que você tinha DESLIGADO na lista do bot, e ignorava substituto em estoque — cinquenta Max Revive não calavam o aviso por Revive. Agora a conta e por família de item.',
      'A EDIÇÃO DOS 4 GOLPES DESTRAVOU NO HOSPITAL. Voltando pro Hospital, escolher golpe ficava indisponível e só voltava com F5.',
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
    title: 'Mais quatorze POKE com menos golpes de Nível 1, e as Eeveelutions entre eles',
    highlights: [
      'QUATORZE ESPÉCIES PERDERAM GOLPES DE NÍVEL 1, E QUATRO DELAS SÃO EEVEELUTIONS. Jolteon, Flareon, Espeon e Umbreon vinham com Tackle, Tail Whip e Helping Hand no Nível 1 sem nunca terem aprendido nenhum dos três. Entram na mesma lista Mr. Mime, Mantine, Bellossom, Slowking, Chansey, Sudowoodo, Marill, Snorlax, Hitmonchan e Hitmontop. São 47 golpes ao todo.',
      'O POKE QUE VOCÊ JÁ TEM MUDA TAMBÉM — e a nota anterior disse o contrario. A lista de golpes de cada POKE e recalculada pela espécie e pelo nível toda vez que o jogo abre, então golpe que sai da espécie sai do seu junto. Nenhum slot fica vazio: o lugar e preenchido por outro golpe que ele conhece. A 7.11 prometia que nada mudava pra quem já tinha, e a promessa estava errada.',
      'AQUELE BLOCO NUNCA FOI O KIT INICIAL DELAS. Era a lista do Recordador de Golpes do jogo original, que este jogo não tem desde a 6.8, e ela entrava por engano em espécie que o jogo não reconhecia como forma evoluida — ou porque a pre-evolução esta fora do elenco (Sudowoodo vem de Bonsly, que não existe aqui), ou porque a espécie e o SEGUNDO destino de uma evolução com ramo, como as quatro Eeveelutions.',
      'O CASO MAIS VISÍVEL ERA UM SUDOWOODO SELVAGEM DE NÍVEL 1 BATENDO COM WOOD HAMMER. São 120 de poder, quase três vezes o golpe de qualquer POKE da mesma faixa de nível.',
      'QUATRO DELAS AGORA COMEÇAM SEM GOLPE NENHUM NO NÍVEL 1: Marill aprende o primeiro no Nível 2, Mantine no 3, Snorlax no 4 e Slowking no 5. Abaixo disso o POKE luta só com o Ataque Básico.',
      'AS BARRAS DE HP E XP DO TOPO PARARAM DE MUDAR DE TAMANHO, E AGORA MOSTRAM A PORCENTAGEM. Elas encolhiam e esticavam conforme o resto do cabeçalho — um selo de status aparecendo já bastava pra empurrar. O número nunca arredonda pra 0% num POKE vivo, nem pra 100% num que já levou dano.',
      'O NÍVEL NA FICHA DO POKE ATUALIZA SOZINHO. Com o perfil aberto, subir de nível deixava o Lv antigo na tela até você fechar e reabrir a janela.',
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
    title: 'Dezenove POKE novos, e as evoluções que nunca aconteciam',
    highlights: [
      'EVOLUÇÃO POR PEDRA, TROCA E AMIZADE PASSOU A EXISTIR. Se você tem um Growlithe guardado esperando virar Arcanine, ele nunca ia virar — o caminho simplesmente não existia no jogo, e nada na tela dizia isso. Eram 36 evoluções nessa situacao. Agora todas funcionam, no mesmo critério das outras especiais: Nível 80 e 40 pedras.',
      'DEZENOVE POKE NOVOS entraram no elenco, que foi de 226 pra 245. Eles não existiam porque eram destino das evoluções que não aconteciam — sem o caminho, ninguém nunca chegava neles. Entram Raichu, Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Exeggutor, Poliwrath, Slowking, Vileplume, Bellossom, Crobat, Togetic, Starmie, Cloyster, Clefairy, Clefable, Wigglytuff e Hitmontop. Todos aparecem no mato e todos podem ser capturados.',
      'O EEVEE ESCOLHE PRA QUE EVOLUIR, E A PEDRA DIZ QUAL. São cinco caminhos e cada um cobra a pedra do tipo de destino: Flareon pede 40 Pedras de FOGO, Vaporeon de ÁGUA, Jolteon de ELÉTRICO, Espeon de PSÍQUICO e Umbreon de SOMBRIO. Você ve os cinco na ficha e escolhe qual perseguir.',
      'TYROGUE AGORA TEM TRÊS CAMINHOS — Hitmonlee, Hitmonchan e Hitmontop —, todos no Nível 20 e sem pedra nenhuma. Antes eram dois.',
      'GLOOM, POLIWHIRL E SLOWPOKE também passaram a ter mais de um destino. Slowpoke e o caso curioso: Slowbro continua no Nível 37 de graça, e Slowking cobra as 40 pedras — dois caminhos com preços diferentes.',
      'A CARA DO POKE MUDA EM MAIS OITO ESPÉCIES. O retrato no trilho de status reage a dor, tontura, sono e comemoracao; oito POKE tinham cara fixa por falta de desenho e agora usam uma expressão equivalente do mesmo acervo.',
      // PH-158 — esta linha prometia que nada mudava pra quem ja tinha o POKE,
      // e a promessa era FALSA. `playerMapper.ts` deriva `unlockedAbilities` de
      // (especie, nivel) em toda carga e ignora a coluna gravada, entao golpe
      // que sai do learnset sai do POKE salvo junto. Medido: `jolteon@80` nao
      // conhece mais tackle, tail_whip nem helping_hand.
      //
      // A frase existia pra tranquilizar, e foi o pior lugar possivel pra
      // errar: quem leu "nao perde nada" e viu a build trocada nao conclui que
      // a nota estava errada — conclui que o jogo bugou o POKE dele.
      'VINTE E UMA ESPÉCIES VEM COM MENOS GOLPES DE NÍVEL 1. Steelix, Machamp, Nidoqueen e outras 18 tinham uma lista de golpes de Nível 1 que só existia porque o jogo não sabia que elas eram formas evoluidas. O POKE que você JÁ TEM muda também: a lista de golpes de cada um e recalculada pela espécie e pelo nível toda vez que o jogo abre. Nenhum slot fica vazio — o lugar e preenchido por outro golpe que ele conhece.',
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
    title: 'Evolução especial passou a pedir 40 pedras',
    highlights: [
      'EVOLUÇÃO ESPECIAL AGORA CUSTA 40 PEDRAS do tipo primario do POKE, o dobro das 20 de antes. O Nível 80 continua igual, e a pedra continua sendo a do PRIMEIRO tipo (Kadabra pede Pedra PSYCHIC, Onix pede Pedra ROCK). Vale pra quem já tinha pedra guardada: se você tinha 25 separadas pra evoluir, agora faltam 15.',
      'A MENSAGEM DE PEDRA FALTANDO parou de sair com letra sobrando — dizia "faltam 40sx Pedra BUGs". Era um erro de formatacao que estava ali desde que a evolução especial existe.',
    ],
  },
  // PH-135. Primeira entrada que sai JUNTO com o codigo que ela descreve: a
  // 7.7 e a 7.8 existiam na `dev` desde 22 e 23/08, mas a `main` estava 174
  // commits atras, entao o jogador pulou da 7.6 pra ca de uma vez.
  {
    version: '7.9',
    date: '2026-08-24',
    title: 'O combate passou a explicar o que faz, e o POKE dos outros deixou de ser público',
    highlights: [
      'PRIVACIDADE, E ESTA E A MAIS IMPORTANTE: qualquer jogador conseguia ler a ficha inteira do SEU POKE — os seis IVs, a natureza, a caracteristica, o que estava travado e quem foi o treinador original. Não era só do POKE anunciado no Mercado: era de todos, inclusive os que você nunca mostrou pra ninguém. Fechado. Agora só você lê os seus, e o que continua público e o que sempre foi de própria vontade: o POKE anunciado, o ranking e o perfil.',
      'CRÍTICO APARECE NA TELA. O golpe crítico existia e multiplicava o dano desde sempre, mas nada dizia isso — o mesmo golpe no mesmo inimigo as vezes tirava um número muito maior e você não tinha como saber por que. Agora o número cresce e vem marcado com CRIT.',
      'O DANO QUE VOCÊ LEVA ficou diferente do dano que você causa: ele sai numa placa vermelha. Numa luta com vários inimigos em volta era impossível distinguir um do outro.',
      'GOLPE QUE O INIMIGO RESISTE ficou legível. O número saia cinza escuro em cima de cena escura, justamente no caso em que você mais precisa perceber que seu golpe não esta funcionando naquele inimigo.',
      'O SELO DE ATRIBUTO DIZ QUAL ATRIBUTO E DE ONDE VEIO. Antes Ataque caindo e Velocidade caindo desenhavam exatamente o mesmo ícone, e nada dizia quem tinha feito aquilo. Agora cada atributo tem símbolo próprio, e o selo mostra o golpe e de quem partiu — "Rosnado (Rattata)" e diferente de você ter usado Dança das Espadas em si mesmo.',
      'VOCÊ PASSA A VER OS EFEITOS DO INIMIGO QUE ESTA ENFRENTANDO, numa fileira própria com o nome dele. Buff e debuff do adversário não apareciam em lugar nenhum: se ele dobrava o Ataque ou subia a Evasão, o seu dano caia ou seus golpes erravam sem nenhuma causa visível na tela.',
      'LEILAO: A CONTAGEM DE LANCES ESTAVA ERRADA pra quem não era o vendedor. Cada um via só os próprios lances, então um leilao com dez lances aparecia como "0 ofertas" — e quem tinha sido coberto nem conseguia ver que perdeu a lideranca. Pior: você montava um lance a partir do mínimo e o jogo recusava, porque o piso de verdade era outro.',
      'A HUNT CARREGA MUITO MAIS RÁPIDO em quatro cenários. O Dojo baixava 15 MB de imagem, a Arena do Dragão 13 MB — agora são 2,6 e 2,0 MB, com a mesma arte. Em conexão de celular eram uns 24 segundos de espera antes da cena aparecer, e o jogo desistia de esperar antes disso e entrava sem o fundo.',
      'A ÁGUA ONDULA DE VERDADE em cinco artes, a folha tomba, a brasa pisca e a neve ganhou profundidade.',
      'O ESFUMADO DA BORDA DA TELA caiu de 12% para 5,5% — sobrou mais mapa visível.',
      'MOCHILA E LOJA GANHARAM GRADE QUADRICULADA, e o item sem arte mostra a sigla dele em vez de um quadrado vazio. A ficha do item na Loja passou a abrir acima da grade, sem tapar o que você estava olhando.',
      'A ARTE DO GOLPE POUSA EM 0,3 SEGUNDO, ainda durante a pose de ataque — antes ela chegava depois de o POKE já ter voltado ao normal.',
    ],
  },
  // Continuacao do mesmo dia da 7.7: aquela entrada foi escrita no meio do
  // lote de merges e ficou pra tras do que entrou depois (PH-91).
  {
    version: '7.8',
    date: '2026-08-23',
    title: 'O correio virou conversa de verdade, e o ouro anexado parou de sumir',
    highlights: [
      'CORREIO E CHAT AGORA: uma conversa por contato, com todo o histórico salvo, do jeito que você espera de um aplicativo de mensagem. Antes a mesma pessoa tinha três listas — a carta numa aba, o recado em outra, a resposta numa terceira.',
      'MENSAGEM NOVA APARECE NA HORA no fio que você esta lendo, sem recarregar. Abrir a conversa zera as não lidas só daquele contato.',
      'BUG SÉRIO: OURO ANEXADO NUMA MENSAGEM ERA DESTRUIDO. Saia de quem mandou, nunca chegava em quem recebeu, e a mensagem ficava travada com o anexo por coletar pra sempre. Anexo de item nunca foi afetado. O ouro que estava preso voltou pro destinatario.',
      'VINTE E TRÊS ARTES DE GOLPE NÃO APARECIAM NA TELA — entre elas o Bullet Punch. O desenho existia e estava certo; o jogo só nunca chegava a pedir o arquivo pra desenhar.',
      'HOSPITAL: o POKE estava serrilhado e fora de proporcao com a sala. Em vez de esticar o POKE, a cena inteira encolheu — mesma proporcao entre ele e a enfermeira, com bem menos esticamento no sprite.',
      'A JANELA DE CHAT RECOLHIDA agora e só "Chat" e um "+". Antes ela continuava ocupando espaço com as abas e o campo de escrever mesmo fechada.',
      'CADA SUB-BIOMA TEM O TAMANHO QUE PRECISA. O mundo jogavel deixou de ser um retangulo fixo igual pra todos: agora ele e do tamanho do que foi desenhado naquele mapa, então há mapas maiores e menores.',
    ],
  },
  // Entrada curta de proposito, ao contrario das anteriores: pedido explicito
  // do usuario ("um resumo bem sucinto sobre todas as melhorias").
  {
    version: '7.7',
    date: '2026-08-22',
    title: 'Correio e amigos, time no canto da tela, e as arenas ganharam parede',
    highlights: [
      'CORREIO COMPLETO: mande carta com ouro ou item anexado, responda, e apague o que já leu — cada lado apaga a sua copia.',
      'LISTA DE AMIGOS: convide, aceite, remova e bloqueie. Bloquear corta os dois lados e desfaz a amizade.',
      'CONVERSA PRIVADA com amigo, em tempo real, com contador de não lidas no sino.',
      'SEU TIME NO CANTO SUPERIOR ESQUERDO: foto e nível das reservas em coluna. Arraste pra mudar a ordem, passe o mouse pro resumo, clique pra abrir o perfil ou botar em campo.',
      'A FILA DOS 4 GOLPES virou arrastavel, e da pra chegar nos golpes direto pela tela de Equipe.',
      'POKE SEM GOLPE UTILIZAVEL agora diz isso na tela em vez de ficar parado sem explicacao.',
      'A ESCOLHA DE GOLPES DESTRAVOU: um golpe orfao na lista impedia qualquer edição.',
      'NO CELULAR: a carinha do POKE muda conforme o estado dele, e tocar num termo abre a explicacao (com glossário).',
      'BUG: A ARTE DO GOLPE FICAVA PRA TRÁS. O efeito nascia parado no lugar onde o POKE estava, e ele andava mais de 100 pixels durante o segundo que a animação dura. Agora ela acompanha.',
      'DOJO E ARENA DO DRAGÃO GANHARAM PAREDE DE VERDADE. Eram as duas últimas telas do jogo em que dava pra atravessar predio, água e lava.',
      'DUELO DO CAMPEÃO LANCE COREOGRAFADO: cada lado entra por um ponto fixo da arena, e há 2 segundos entre um POKE cair e o próximo entrar — dos dois lados. Antes o seu substituto aparecia no mesmo instante, dentro do buraco onde o anterior morreu.',
      'SEU PROGRESSO PAROU DE CORRER RISCO: duas gravacoes ao mesmo tempo se atropelavam e uma podia sobrescrever a outra.',
    ],
  },
  {
    version: '7.6',
    date: '2026-08-18',
    title: 'Habilidade, Natureza e Caracteristica — e o inimigo que não morria',
    highlights: [
      'HABILIDADE: cada POKE sorteia a dele entre as da espécie, com chance pequena de sair a OCULTA. 133 no total, 102 com efeito de verdade (Intimidate, Technician, Sniper, Thick Fat, Huge Power, Speed Boost, Moxie, Trace...). As 31 que dependem de coisa que este jogo não tem (troca de POKE, item equipado, aliado em campo) ficam marcadas em amarelo na ficha, com o motivo — em vez de fingir. A lista antiga era escrita a mão, deixava 76 espécies sem nada e errava algumas (Gengar tinha Levitate, que ele perdeu na setima geracao).',
      'NATUREZA: 25 possibilidades, +10% num atributo e -10% em outro, sorteada no nascimento. HP nunca e afetado. Todo POKE que você JÁ tinha recebeu uma natureza NEUTRA de propósito — ninguém acorda com o time pior.',
      'CARACTERISTICA: a frase nova na ficha aponta qual dos seis IVs do seu POKE e o mais alto.',
      'BUG: O INIMIGO QUE FICAVA COM A VIDA VAZIA E NÃO MORRIA. Era o Endure. Agora vale a regra dos jogos — repetir Protect/Detect/Endure tem metade da chance a cada vez, e usar outro golpe zera a conta. Medido: de minutos para 25 segundos.',
      'BUG: DOZE GOLPES OCUPAVAM SLOT E NUNCA DISPARAVAM (Flail, Reversal, Seismic Toss, Night Shade, Dragon Rage, Super Fang, Psywave, Magnitude, Present, Hidden Power, Counter, Mirror Coat). Quem mais sofria era o Magikarp, cujo único golpe forte e o Flail.',
      'O KIT AUTOMÁTICO PAROU DE ESCOLHER GOLPE RUIM: agora conta precisão e recuo, não só o poder. Typhlosion Nv70 contra Kangaskhan de mesmo nível terminava com 51 de vida; agora termina com 129.',
      'PRECISÃO DO GOLPE APARECE na tabela de golpes e no tooltip, em amarelo abaixo de 100%.',
      'O ÍCONE DE CADA GOLPE MOSTRA A RECARGA DELE, e não o mesmo número em todos os quatro slots.',
      'POKEDEX COMPLETA: linha evolutiva com o nível de cada passo (inclusive a regra de Nível 80 + pedras, que não aparecia em lugar nenhum), ficha com dex/EXP/curva/captura/regiao, habilidades possíveis, e setas Anterior/Próximo pra navegar sem fechar.',
      'IV DE LENDÁRIO segue o Ultra Sun: pelo menos três IVs perfeitos garantidos.',
      'GOLPE DE ÁREA GANHOU ARTE PRÓPRIA em 13 tipos — Eruption saia como um lança-chamas deitado.',
    ],
  },
  {
    version: '7.5',
    date: '2026-08-18',
    title: '22 golpes ganharam efeito visual PRÓPRIO, em vez de dividir o mesmo desenho do tipo elemental',
    highlights: [
      'ATÉ AGORA TODO GOLPE DE UM TIPO DESENHAVA A MESMA COISA. Metal Claw, Iron Head e Bullet Punch mostravam o mesmo efeito de aço; Scratch e Fury Swipes, o mesmo estouro de normal. Agora 22 golpes tem animação própria: Scratch e Fury Swipes (garras), Comet Punch e Shadow Punch (socos), X-Scissor, Stomp, Dig, Earthquake, Whirlpool, Whirlwind, Petal Dance, Fire Fang, Thunder Fang, Ice Fang, Flamethrower, Fire Spin, Mud Shot, Charm, Taunt, Dragon Dance, Spider Web e Bullet Punch.',
      'CINCO DELES APONTAM PRA ONDE VOCÊ ESTA MIRANDO. Scratch, Mud Shot, Flamethrower, Charm e Bullet Punch tem uma direcao própria no desenho e giram pra sair na linha do golpe. Os outros 17 não giram de propósito — são anel, coluna ou estouro, e girar só os deitaria de lado.',
      'O JOGO NÃO FICOU MAIS PESADO PRA CARREGAR. A arte nova NÃO entra no carregamento inicial: ela chega quando o golpe e usado pela primeira vez. Você ve os golpes que o SEU time sabe, meia duzia, e não faria sentido baixar os outros 470 antes de entrar no jogo. Na primeira vez que cada golpe aparece, o efeito antigo cobre a fracao de segundo até a arte chegar.',
      'UM GOLPE FOI DESCARTADO DEPOIS DE PRONTO: Aqua Jet. A arte disponível e uma coluna estreitissima que, no tamanho de jogo, virava um fio de 6 pixels de largura — invisível na prática. Ele continua usando o efeito de água padrão, que da pra ver.',
      'QUATRO GOLPES PEDIDOS NÃO EXISTEM NESTE JOGO: Rock Smash, Cut, Drain Punch e Energy Ball. São golpes de MT/MO, e o catálogo daqui só tem o que se aprende SUBINDO DE NÍVEL desde que o Recordador de Golpes saiu (v6.8).',
    ],
  },
  {
    version: '7.4',
    date: '2026-08-18',
    title: 'Efeito de golpe no tamanho certo, apontando pro inimigo, e duas artes que estavam simplesmente erradas',
    highlights: [
      'O EFEITO DO GOLPE PAROU DE ESCONDER QUEM LEVOU. Todo impacto era desenhado de duas a cinco vezes maior que o POKE — a arte cobria o alvo inteiro e você via o golpe, não a luta. Agora fica em uma vez e meia o tamanho do POKE: da pra ler que acertou E continuar vendo quem apanhou.',
      'OS EFEITOS AGORA APONTAM PRA DIREÇAO DO GOLPE. Antes o impacto nascia no centro exato do inimigo, idêntico viesse o ataque da esquerda, de cima ou por trás. Agora ele encosta no lado do alvo que levou a pancada. Os golpes que TEM uma direcao própria — o jato de fogo, o respingo de inseto, o talho sombrio — já giravam; o resto ganhou a leitura pelo posicionamento, porque girar um anel ou uma cupula só os deitaria no chão.',
      'BUG REAL CORRIGIDO: O JATO DE FOGO ATRAVESSAVA QUEM LANÇAVA. A arte tem 150 pixels de comprimento e a luta acontece a 39 de distância, então a labareda passava pelo inimigo, voltava por cima do seu POKE e saia pelas costas dele. O rastro foi cortado pra terminar exatamente onde o atacante esta.',
      'BUG REAL CORRIGIDO E ESTRANHO: O GOLPE DE VOADOR TINHA UM ITEM DE OUTRO JOGO DESENHADO DENTRO. Um objeto amarelo com a palavra DROP escrita, aparecendo no meio da animação. A arte foi trocada por um tornado.',
      'GOLPE DE FADA NÃO DESENHA MAIS CAVEIRAS. A arte antiga era rosa — o matiz certo pro tipo — mas o que ela desenhava eram cranios, que e leitura de veneno e morte, não de fada. Trocada por anéis de partículas, que de brinde aparecem melhor sobre fundo escuro.',
      'INVESTIGADO, MANTIDO COMO ESTAVA: o golpe de SOMBRIO continua com o talho marrom, que reconhecidamente não lê como escuridao. As três alternativas escuras disponíveis medem praticamente preto puro e sumiriam contra o fundo de uma caverna — um golpe invisível e pior que um golpe de cor discutivel.',
    ],
  },
  {
    version: '7.3',
    date: '2026-08-18',
    title: 'Você nasce onde o mapa manda, e a tela para de fingir que não tem nada quando só esta carregando',
    highlights: [
      'O PONTO DE NASCIMENTO DE CADA MAPA AGORA E ESCOLHIDO A MÃO. Onze cenários ganharam um ponto de entrada marcado de propósito — você entra na hunt e começa na rua, na trilha ou na clareira que faz sentido pra aquele lugar, e não mais no meio geometrico da área andavel. Até agora o jogo calculava a media da regiao onde da pra andar e largava você ali, o que num mapa em L ou numa cidade de ruas estreitas caia num canto arbitrario.',
      'BUG REAL CORRIGIDO NA PRÓPRIA FERRAMENTA QUE LÊ ESSAS MARCACOES: os onze pontos já estavam marcados e TODOS estavam sendo ignorados em silencio. A arte de fundo e maior que a área jogavel — o desenho cobre o mapa com sobra e só a faixa central dele aparece na tela —, e a marcacao caia nessa sobra. O jogo agora traz o ponto pra dentro mantendo a direcao marcada, em vez de descartar.',
      'BUG REAL CORRIGIDO: O PERFIL DIZIA QUE VOCÊ NÃO TINHA CAPTURA NENHUMA enquanto a lista ainda estava chegando. A aba Capturas mostrava \'Nenhuma captura registrada ainda. Ligue o Auto-Catch no painel do Bot\' para quem tem a mochila cheia — e ainda mandava ligar um bot que já podia estar ligado. Agora aparece \'Carregando suas capturas...\' até o dado chegar.',
      'BUG REAL CORRIGIDO E MAIS GRAVE: A TELA DE ITEM DO MERCADO MOSTRAVA PREÇO ZERO enquanto carregava. Além de dizer \'Ninguém vendendo\' e \'Ninguém procurando\' sobre um item com ofertas, o campo de preço nascia em 0 — um número em que da pra clicar e comprar. A tela agora espera o livro de ofertas chegar antes de desenhar qualquer coisa.',
      'TODO BOTÃO QUE FALA COM O SERVIDOR AGORA MOSTRA QUE ESTA TRABALHANDO. Comprar, vender, trancar item, aceitar pedido de amizade, cancelar anúncio: antes o botão só apagava por um ou dois segundos, sem dizer nada, o que e igualzinho a um botão quebrado. Agora ele gira. O rotulo continua no lugar de propósito, pra lista não pular embaixo do seu dedo.',
    ],
  },
  {
    version: '7.2',
    date: '2026-08-18',
    title: 'Parede virou parede em TODA hunt, os 4 golpes são seus pra escolher, e o Lance não desfaz mais o que liberou',
    highlights: [
      'BUG GRAVE CORRIGIDO: METADE DAS HUNTS NÃO TINHA PAREDE. Modo Pesadelo, as 11 hunts de CHEFE, a luta do Campeão Lance, a hunt de Treinamento e a Rota 46 não carregavam a área andavel do mapa — o POKE atravessava rocha, água e precipicio e andava por cima do cenário inteiro. As hunts comuns tinham a delimitacao certa; essas nunca tiveram. A regra mudou de raiz: a área andavel agora vem grudada na ARTE do mapa, então qualquer conteudo novo que reaproveite um fundo já pintado já nasce com a delimitacao certa, sem depender de ninguém lembrar de configurar.',
      '10 MAPAS GANHARAM ÁREA ANDAVEL PINTADA A MÃO: caverna de gelo, gruta feerica, ilha, lago, metropole, cortico, terra devastada, vilarejo, vilarejo noturno e vulcao. As ruas estreitas da metropole obrigaram a afinar o critério — no ajuste anterior uma rua de uma celula de largura era "arredondada" pra parede, e o mapa inteiro além dela virava área proibida.',
      'METROPOLE E CORTICO GANHARAM ARTE PRÓPRIA. Até agora as duas herdavam o fundo do bioma, que e uma clareira de floresta noturna — nada a ver com o nome.',
      'OS 4 GOLPES AGORA SÃO INTEIRAMENTE SEUS. Ataque Básico e Explosão Elemental viraram golpes comuns: ocupam um dos 4 slots como qualquer outro, e cabe a você decidir se valem a vaga. Ataque Básico continua entrando sozinho como último recurso quando os 4 escolhidos estão em recarga, mas só e usado em combate se estiver num slot.',
      'BUG REAL CORRIGIDO: A CONTAGEM DE RECARGA NA TELA MENTIA. Existem dois relogios — o do golpe e um intervalo mínimo de 2 segundos entre ações quaisquer — e a barra só mostrava o primeiro. Um golpe de 1 segundo de recarga aparecia como "pronto" e não disparava. Agora a contagem mostra o tempo que o jogo de fato exige.',
      'BUG REAL CORRIGIDO: O LANCE LIBERAVA O MODO PESADELO E DESFAZIA NO RELOAD. Derrotar o Campeão abria as hunts, o servidor gravava certo, e ao recarregar a página as 11 hunts voltavam a "Bloqueado — Derrote o Campeão Lance", com a conquista registrada no Hall da Fama. Uma limpeza de dado antigo estava jogando fora justamente o grupo que o Lance concede. O bug enganava porque quando havia resumo de tempo offline logo depois de abrir o jogo, a resposta do servidor corrigia sozinha e o Pesadelo "voltava".',
      'DORMIR E CONGELAR AGORA PRENDEM O POKE NO LUGAR. Quem esta sob sono ou congelamento para de se deslocar até acordar ou descongelar. Paralisia continua sem prender de propósito: ela não passa sozinha neste jogo, e um POKE que não anda nunca mais encontra inimigo — a caçada travaria até alguém curar.',
      'ARTE DE GOLPE NOVA NOS 18 TIPOS, E ELA APONTA PRO ALVO. O efeito de impacto foi refeito com animação de verdade (de 14 a 40 quadros por tipo, contra os poucos de antes) e o jogo carrega 18 arquivos no lugar de mais de 400. Além disso, os efeitos que TEM um lado — o jato de fogo, o respingo de inseto, o corte sombrio — agora giram na direcao do inimigo em vez de sair sempre pro mesmo lado. Os que não tem lado (anéis, estouros) e os que apontam pra cima (a cupula psíquica, a coluna de vento) ficam de fora de propósito: girar esses últimos os deitaria no chão.',
      'BUG REAL CORRIGIDO: O EFEITO DO SOCO-BALA APARECIA PELA SEXTA PARTE. A arte estava fatiada errado e o jogo animava um pedaco do desenho por vez em vez do golpe inteiro.',
      'BUG REAL CORRIGIDO: "ENTRAR" NA HUNT PODIA NÃO FAZER NADA, SEM DIZER POR QUE. Quando o slot ativo estava vazio, quando o POKE em campo estava desmaiado ou quando o servidor recusava, o botão simplesmente não respondia — nenhum aviso na tela. Agora todos esses casos falam, e dizem o que fazer.',
    ],
  },
  {
    version: '7.1',
    date: '2026-08-18',
    title: 'Bot de auto-venda, mochila que carrega ao abrir a tela, e o jogo trafegando ~50x menos dado',
    highlights: [
      'NOVO BOT: AUTO-VENDA, na tela da Mochila. Ligue e marque as raridades que você quer vender: a captura e vendida NA HORA, antes de entrar na mochila, e o ouro cai direto na carteira. SHINY NUNCA E VENDIDO, mesmo com a raridade dele marcada — a regra vive no motor do jogo, não na tela, então não há jeito de contornar por engano. POKE que já esta guardado na mochila não e tocado; o bot decide só sobre a captura nova.',
      'POR QUE VENDER NA CAPTURA, E NÃO VARRENDO A MOCHILA: porque assim a mochila nunca chega a encher. Era o problema de fundo — o auto-catch despeja tudo nela e nada sai sozinho. Uma conta real chegou a 5035 POKEs guardados.',
      'A CAUSA RAIZ DE UM CUSTO QUE QUASE DERRUBOU O JOGO: a cada 30 segundos (e a cada 5, quando você subia de nível) o servidor lia e devolvia a SUA MOCHILA INTEIRA pra simular a caçada — 3,23 MB por leitura numa conta de 5 mil POKEs. Um único jogador ativo queimava ~2 GB por hora de trafego; três jogadores fecharam o dia 17/08 em 49,59 GB contra uma cota mensal de 5 GB. A caçada nunca precisou da mochila (a simulação só ADICIONA captura nela), então ela saiu do caminho.',
      'MEDIDO DEPOIS DA CORREÇÃO, na mesma conta: o pacote de cada liquidacao de caçada caiu de 225.711 para 5.077 bytes, e o do carregamento da página de 226.184 para 4.575. Numa conta de 5 mil POKEs a diferença e maior ainda — o pacote novo não cresce com o tamanho da mochila.',
      'A MOCHILA AGORA CARREGA QUANDO VOCÊ ABRE A TELA, e não mais junto do jogo. Entrar no jogo ficou mais leve; em troca, na primeira vez que você abre Mochila, Loja (aba Pokemons) ou "Anunciar POKE" no Mercado, aparece "Carregando a mochila..." por um instante. Quem nunca abre essas telas não paga esse custo em sessão nenhuma.',
      'A LISTA NOVA E PAGINADA E CONFERE O TOTAL COM O BANCO. O limite de 1000 linhas por consulta já e menor que duas mochilas reais do jogo (1328 e 813 POKEs), e ele corta a lista SEM dar erro — como as telas que leem essa lista oferecem venda em lote, uma mochila cortada pela metade seria indistinguivel de "vendi tudo". Se o total não bater, a tela avisa em vez de mostrar lista curta.',
      'INVESTIGADO, NENHUM DEFEITO ENCONTRADO: vender POKE no meio de uma caçada não perde ouro. A suspeita era concreta (a venda soma ao ouro enquanto a caçada regrava o total, e as duas podem acontecer no mesmo segundo), e foi medida no jogo publicado — 26 rodadas disparando venda dentro da janela de liquidacao, com quatro atrasos diferentes: zero divergencia de ouro e zero caçada descartada. A proteção que segura isso ganhou testes permanentes pra continuar assim.',
    ],
  },
  {
    version: '7.0',
    date: '2026-08-15',
    title: 'Hunt de Treinamento pra medir a força do time, trava de golpes de volta em hunt, e o ícone que sumia ao desligar',
    highlights: [
      'NOVA HUNT: TREINAMENTO. Um boneco de treino (Wobbuffet, nunca revida) sempre liberado, pra testar a força do seu time sem risco e sem afetar a economia — abater ele não rende ouro, XP, item nem captura, de propósito. Acompanhe "Mobs/h" no Hunt Analyzer como o placar de comparacao entre builds.',
      'BUG REAL CORRIGIDO NA PRÓPRIA CONSTRUCAO DA HUNT ACIMA: a primeira versão só zerava os atributos ofensivos do boneco, e mesmo assim ele desmaiou um POKE Lv1 de 11 HP com o próprio Ataque Básico — o termo de NÍVEL da fórmula de dano pesa mais que o ATK quase zerado. Corrigido travando o ataque no motor: o boneco literalmente nunca ataca, seguro pra qualquer nível.',
      'ESCOLHER OS 4 GOLPES ATIVOS VOLTOU A EXIGIR SAIR DA HUNT. Pedido explicito do usuário, revertendo a leva anterior (que tinha removido a pedido dele também) — build fixo durante o combate, editavel só fora dele. Agora cobre também o liga/desliga do Ataque Básico e do golpe de Nível 50, que antes escapavam da trava.',
      'BUG REAL CORRIGIDO: o ícone do golpe na barra de combate ficava praticamente invisível ao desligar Ataque Básico ou o golpe de Nível 50 (overlay preto quase solido por cima). Agora o golpe desligado só fica dessaturado e escurecido — continua reconhecivel qual e.',
      'LUTA DO CAMPEÃO LANCE: investigada a fundo (simulação isolada e ao vivo contra o jogo publicado) — os 6 POKEs dele já entram um a um corretamente até a equipe se esgotar, e o time do jogador já troca de POKE a cada desmaio do mesmo jeito. Nenhum defeito encontrado; a mecânica ganhou testes automatizados permanentes pra continuar assim.',
    ],
  },
  {
    version: '6.9',
    date: '2026-08-15',
    title: 'Personalize os 4 golpes a qualquer momento, um dispositivo por vez, e golpe de status ganhou sprite',
    highlights: [
      'ESCOLHER OS 4 GOLPES ATIVOS NÃO EXIGE MAIS SAIR DA HUNT. A trava "saia da hunt para trocar de golpe" não protegia nada técnico — o servidor reconstroi o combate do zero a cada ~30 segundos, e a troca só valia a partir da próxima janela de qualquer jeito. Removida: personalize os golpes do seu POKE na hora, inclusive no meio de uma caçada, escolhendo livremente entre os que ele já aprendeu (até 4, e pode ser só 1 se preferir).',
      'GOLPE DE STATUS GANHOU ÍCONE E VFX DE VERDADE. A barra de combate escondia qualquer golpe sem dano (Growl, Supersonic, Dança das Espadas, ...) — se você escolhia um deles como um dos 4 ativos, ele "sumia" da barra sem explicacao. Agora aparece com o ícone do tipo normal e "—" no lugar do dano. De brinde, golpe de status ganhou uma animação própria (eleva atributo = brilho pra cima, baixa atributo ou aplica uma condição = pra baixo) em vez de reusar o mesmo impacto de golpe de dano, em 16 dos 18 tipos elementais.',
      'LOGIN NOVO NÃO DERRUBA MAIS EM SILENCIO. Só um dispositivo pode estar logado por vez, mas agora o aparelho NOVO pergunta antes: "Jogar por aqui?" — só ao confirmar e que o outro aparelho perde a sessão (na próxima vez que ele tentar renovar o login, em até 1 hora). Cancelar desfaz o login sem mexer no outro aparelho.',
      'BUG REAL CORRIGIDO: "Iniciar novo jogo" zerava a mochila e NUNCA devolvia as bolas/poções/revives iniciais — toda conta resetada ficava com zero itens, e o bot (auto-poção, ligado por padrão) não tinha nada pra usar. Corrigido na fonte: reset volta a dar o kit inicial completo.',
      'BUG REAL CORRIGIDO: o chat do Correio as vezes gerava um erro no console e parava de atualizar sozinho (precisava recarregar a página) se você abrisse a tela rápido demais — duas tentativas de conexão ao mesmo canal em sequência, a segunda batendo numa já aberta. Corrigido.',
    ],
  },
  {
    version: '6.8',
    date: '2026-08-15',
    title: 'Golpe de Recordador não entra mais no aprendizado por nível',
    highlights: [
      'MUDANÇA DE REGRA: SEU POKE SÓ APRENDE GOLPE COM NÍVEL DE VERDADE. A versão 6.6 tinha corrigido o SINTOMA (Typhlosion não usava mais Eruption no Nível 1) sem mexer no catálogo, porque aquele bloco de golpes era dado real do Recordador de Golpes do Ultra Sun. Decisão nova: o Recordador sai do jogo. Um POKE só aprende golpe que ele mesmo conquista subindo de nível — quem quer um golpe que só a linha evolutiva anterior aprendia (Tackle do Cyndaquil, por exemplo) precisa manter o POKE nessa forma, ou aceitar que o golpe não vem mais de graça ao evoluir.',
      'GOLPE SEM NÍVEL NENHUM NA LINHA TAMBÉM SAIU, mesmo quando era forte: Charizard perde Air Slash, Dragon Claw, Shadow Claw e Wing Attack do aprendizado por nível (só existiam via Recordador, sem equivalente em nível nenhum da linha Charmander-Charmeleon-Charizard). Ao todo, 462 linhas de golpe saem do catálogo, afetando 108 das 251 espécies.',
      'GOLPE GANHO NA HORA DE EVOLUIR CONTINUA VALENDO — isso NÃO e Recordador. Metapod e Kakuna, por exemplo, nascem sabendo Harden no instante em que evoluem (Nível 7); a marca que a PokeAPI usa pra isso (Nível 0 cru, distinto do bloco de Recordador que também aparecia como Nível 1) foi preservada na importacao pra não confundir os dois e deixar essas duas espécies sem NENHUM golpe.',
      'CONFERIDO PONTA A PONTA CONTRA A BULBAPEDIA DE NOVO após o corte: as 251 espécies continuam batendo (agora comparando só golpe com nível real dos dois lados).',
      'POKES QUE JÁ EXISTIAM FORAM AJUSTADOS: quem tinha um desses golpes escolhido ou aprendido antes desta mudança teve a lista corrigida — 670 POKEs no total. Se um dos seus tinha Air Slash, Dragon Claw ou outro golpe de Recordador escolhido, ele pode ter perdido esse golpe agora; abra o perfil dele e escolha outro no lugar.',
    ],
  },
  {
    version: '6.7',
    date: '2026-08-15',
    title: 'Escolher os 4 golpes voltou a funcionar de verdade, e mais 7 ajustes',
    highlights: [
      'A CAUSA RAIZ DE "NÃO DA PRA ESCOLHER OS 4 GOLPES" ERA NO BANCO, NÃO NA TELA. O catálogo que o servidor usa pra validar sua escolha ainda tinha os golpes antigos (Cleffa e Togepi lá ainda apareciam como tipo Normal, não Fada); todo POKE recem-nascido ou recem-evoluido saia com golpes que o servidor não reconhecia. Resincronizado — starter novo e evolução voltam a deixar escolher os 4 normalmente.',
      'ATAQUE BÁSICO E EXPLOSÃO ELEMENTAL SEMPRE FORAM OPCIONAIS — só não dava pra ver isso. Os dois já podiam ser desligados (duplo clique na barra de combate), mas a aba Golpes do perfil nem mostrava o Ataque Básico e escondia o botão da Explosão atrás de um texto fixo. Agora os dois tem checkbox visível ali, do jeito que sempre deveriam ter tido.',
      '58 GOLPES DUPLICADOS NO CATÁLOGO, CORRIGIDOS NA FONTE. Bug da importacao do Ultra Sun: 58 espécies (Venusaur, Charizard, Gengar, Dragonite, entre outras) tinham o mesmo golpe listado duas vezes no Nível 1. Não mudava combate, só inflava a lista "Golpes" do perfil — agora aparece uma vez só.',
      'AUTO-STATUS GANHOU CONTROLE POR ITEM. Além do interruptor geral, agora da pra desmarcar um item específico (por exemplo, guardar suas Full Heal e deixar o bot só usar as curas baratas). De brinde, achamos que o interruptor GERAL do Auto-status nunca tinha persistido no servidor — ficava ligado só até você trocar de página.',
      '6 ÍCONES NOVOS: Antidoto, Anti-Sono, Anti-Queimadura, Anti-Congelante, Anti-Paralisia e Cura Total agora tem sprite própria na mochila e na loja, em vez de ficarem sem ícone nenhum.',
      'BUG CORRIGIDO: POKE parado numa caçada, entre um alvo e outro, continuava com a animação de andar — agora fica parado (Idle) de verdade.',
      'A LISTA DE HUNTS MOSTRA A EFETIVIDADE DO SEU POKE ATIVO contra cada espécie que pode aparecer ali (2x, ½x, imune) — ajuda a escolher pra onde ir sem sair caçando às cegas.',
      'BUG VISUAL CORRIGIDO: as colunas da aba Golpes desalinhavam quando a lista tinha barra de rolagem. E de brinde, o perfil do POKE agora atualiza o checkbox de golpe na hora — antes, marcar ou desmarcar funcionava por baixo dos panos mas a tela só mostrava a mudança depois de fechar e reabrir.',
    ],
  },
  {
    version: '6.6',
    date: '2026-08-15',
    title: 'Golpe de fim de lista não chega mais no Nível 1, e o bot passa a curar status sozinho',
    highlights: [
      'SEU POKE PODE TER MUDADO DE GOLPES — E ISSO E O CONSERTO. Um Typhlosion capturado vinha pro Nível 1 sabendo Eruption, de 150 de poder. Não era um número errado no jogo: no Ultra Sun o Typhlosion TEM Eruption listado no Nível 1 mesmo, porque essa lista e a dos golpes que o Recordador de Golpes pode devolver, e não o que um POKE daquele nível sabe. O jogo estava lendo a lista errada. Agora o Eruption exige Nível 82, que e quando o jogo original ensina.',
      'ISSO VALE PRA 108 DAS 251 ESPÉCIES, e 38 delas entregavam golpe de 100 de poder ou mais já no Nível 1 — o Forretress chegava a Explosion, com 200. Como capturar reseta o POKE pro Nível 1, bastava capturar qualquer espécie evoluida pra sair com um golpe de fim de jogo na mão.',
      'NENHUM POKE FICOU SEM GOLPE POR CAUSA DISSO. Onde a correção tirou um golpe que você tinha escolhido, o slot foi recomposto com o melhor golpe disponível pro nível — a escolha muda, o POKE não fica pelado. O Typhlosion de Nível 1 agora começa com Tackle e Leer, que e o kit inicial do jogo original.',
      'O ELENCO INTEIRO FOI CONFERIDO CONTRA A BULBAPEDIA: os learnsets das 251 espécies, e o poder e a precisão dos 501 golpes. Tudo bateu. A única diferença encontrada era de NOME — a fonte automática chamava o golpe de "Vise Grip", que e o nome da Geracao VIII; no Ultra Sun ele se chama "Vice Grip". Corrigido.',
      'AUTO-STATUS: o bot agora cura veneno, queimadura, paralisia, sono, congelamento e confusao sozinho, escolhendo sempre o item MAIS BARATO que resolve — um Despertar de 30 de ouro no lugar de um Full Heal de 120. Ele já fazia isso escondido dentro do Auto-poção; agora tem interruptor próprio no painel Auto, com o estoque de cada cura a vista. Nasce ligado.',
      'A precisão dos golpes foi conferida ponta a ponta: Inferno com 50% erra metade das vezes de verdade, e a escolha automática já desconta a precisão — o POKE prefere um golpe de 90 que sempre acerta a um de 100 que erra metade.',
      'O XP por abate foi conferido contra a fórmula real da Geracao VII em 144 combinacoes de nível, e o valor de EXP base de todas as 251 espécies foi conferido um a um. Nada mudou: já estava certo.',
    ],
  },
  {
    version: '6.5',
    date: '2026-08-15',
    title: 'O Centro Pokemon virou um lugar de verdade',
    highlights: [
      'O HOSPITAL GANHOU CENÁRIO. O saguao do Centro Pokemon — balcão, máquina de cura, poltronas, o tapete redondo no meio — substituiu o fundo quadriculado que estava lá desde o começo.',
      'SEU POKE FICA EM CIMA DO TAPETE, no centro do saguao, e num tamanho coerente com a moca do balcão. Pokemon grande aparece grande: o tamanho vem do sprite de cada espécie, então um Gyarados domina a sala e um Pichu chega na altura do balcão.',
      'A MOCA DO BALCÃO VIROU O BOTÃO DE CURAR. Em cima da cabeça dela tem um "Curar" que acende quando o mouse passa; clicar nela cura a equipe inteira, de graça, como sempre foi. O quadradinho branco com a cruz vermelha que fazia esse papel saiu.',
      'O CONTROLE DE ZOOM SÓ APARECE DENTRO DA CAÇADA. No Hospital ele não tinha o que fazer — a sala e desenhada pra caber na tela — e ainda dava pra usar o zoom pra esconder a enfermeira, ou seja, esconder o próprio botão de curar.',
    ],
  },
  {
    version: '6.4',
    date: '2026-08-14',
    title: 'Hunts em salas: 12 biomas, 33 sub-biomas e o Campeão Lance como portão',
    highlights: [
      'CADA HUNT VIROU 10 SALAS. Você limpa uma sala (12 abates), avança pra próxima, e cada sala e um SUB-BIOMA sorteado — com lista de Pokemon e loot próprios. Fechar as 10 reinicia o ciclo, então a caçada nunca "acaba": ela continua rendendo enquanto você estiver fora.',
      'AS HUNTS FORAM REFEITAS. Eram 69 separadas por regiao (Johto/Kanto); agora são 12 biomas x 3 faixas de nível (Lv1-30, 31-60, 61-90). Os 33 sub-biomas — Planície, Mar Aberto, Leito Oceanico, Vulcao, Cemiterio, Ruinas, Usina, Gruta Feerica... — vieram das listas do PokeRogue cruzadas com o nosso elenco. Nenhuma das 209 espécies selvagens ficou sem lugar.',
      'A SEPARACAO POR REGIAO ACABOU. As listas por bioma misturam Johto e Kanto, e recortar por regiao esvaziaria 12 dos 33 sub-biomas (Praia e Dojo não tem NENHUM Pokemon de Johto; Floresta Nevada, nenhum de Kanto). O filtro por regiao continua existindo na Pokedex, onde ele fala da espécie e não do lugar.',
      'O CAMPEÃO LANCE VIROU PORTÃO DE VERDADE. Derrota-lo libera a Faixa III (Lv61-90) e o Modo Pesadelo inteiro, com as 11 caçadas de lendário dentro. O Modo Pesadelo nascia aberto desde sempre; agora e conteudo de fim de jogo.',
      'BUG CRÍTICO CORRIGIDO: a luta contra o Lance era INGANHAVEL. O servidor recomecava a sequência no primeiro Pokemon dele a cada ~30 segundos, então só daria pra vencer matando os 6 em menos de meio minuto. Ninguém tinha notado porque ele não trancava nada — e ele acabou de virar o portão de metade do jogo.',
      'NÍVEL COERENTE COM O ESTÁGIO. Uma linha evolutiva agora aparece no estágio certo pro nível da faixa: Caterpie até Lv6, Metapod até Lv9, Butterfree dali pra frente. Antes dava pra encontrar Caterpie de nível 60.',
      'A ROUTE 46 VOLTOU A SER UM LUGAR SEGURO PRA COMEÇAR. Ela continua com os mesmos três Pokemon básicos de nível 1 e 2 (Sentret, Hoothoot e Rattata), mas agora e UM inimigo por vez em vez de seis: seu inicial tem 12 pontos de vida, e desde que precisão e status entraram no combate ele não aguentava várias fontes de dano ao mesmo tempo — morria no primeiro minuto sem chegar ao nível 2. Testado com 10 contas novas de verdade, 20 minutos cada: nenhuma morreu, e todas terminaram no nível 3 ou 4 com mais de cem abates.',
      'CADA HUNT DE BIOMA COMEÇA NO NÍVEL DELA. A primeira sala da Faixa I sai em Lv1-4 e a decima em Lv27-30 — a caçada vai ficando mais dura conforme você avança as salas, em vez de jogar um Pokemon de nível 30 em cima de quem acabou de entrar.',
      'O cartão da hunt mostra os sub-biomas dela e a chance de cada um cair, e a porcentagem de cada Pokemon já considera esse sorteio. O HUD mostra em que sala você esta e quanto falta pra limpar.',
    ],
  },
  {
    version: '6.3',
    date: '2026-08-14',
    title: 'Farm offline pausado temporariamente',
    highlights: [
      'O FARM OFFLINE ESTA PAUSADO. Enquanto isso durar, o tempo que você passa com o jogo FECHADO não rende nada — você não vai receber o relatório de "Bem-vindo de volta" nem ouro, XP ou capturas por esse período. Não e bug: foi desligado de propósito, e volta a ligar em breve.',
      'JOGAR COM O JOGO ABERTO CONTINUA NORMAL. A caçada ao vivo credita tudo como sempre, do mesmo jeito e no mesmo ritmo. A pausa atinge SÓ o período em que você esta fora.',
      'O TEMPO PARADO NÃO FICA GUARDADO. Quando o farm offline voltar, ele volta contando do zero — não há recompensa represada esperando por você. Isso e proposital: caso contrario, todo mundo receberia várias horas de recompensa de uma vez no instante em que fosse religado.',
    ],
  },
  {
    version: '6.2',
    date: '2026-08-14',
    title: 'Status de combate: veneno, queimadura, paralisia, sono, congelamento e confusao',
    highlights: [
      'OS STATUS EXISTEM DE VERDADE AGORA. Até hoje, todo golpe de status do jogo (eram 184) não fazia absolutamente nada — Tóxico, Onda de Choque, Esporo, Raio Confuso e companhia eram usados e nada acontecia. Passaram a funcionar, com as regras da Geracao VII.',
      'VENENO tira 1/8 da vida máxima por turno. QUEIMADURA tira 1/16 e ainda corta pela metade o dano dos seus golpes físicos. PARALISIA faz perder 1 turno em cada 4 e corta a Velocidade pela metade. SONO trava de 1 a 3 turnos. CONGELAMENTO trava até descongelar (20% de chance por turno, ou na hora se levar um golpe de Fogo). CONFUSAO da 33% de chance de se atacar sozinho.',
      'IMUNIDADES REAIS. Pokemon de Fogo não queima, de Elétrico não paralisa, de Gelo não congela, de Veneno e de Aço não envenena. E os de Planta ignoram golpes de pó (Esporo, Pó do Sono, Esporo Paralisante) — como nos jogos a partir da Gen VI.',
      'ITENS DE CURA NA LOJA: Antidoto (60), Despertar (30), Antigelo (30), Antiqueimadura (90), Antiparalisia (90) e Cura Total (120, cura todos). O bot de itens usa sozinho o mais BARATO que resolve o seu status — não gasta Cura Total onde um Despertar bastava. O Centro Pokemon também limpa status junto com a vida.',
      'O BOT DE ITENS PASSOU A TER UMA MÃO SÓ. Antes ele usava poção e revive no MESMO instante, porque cada um tinha seu próprio cronometro. Agora existe um cooldown único, do Treinador: um item de cura a cada 1,5 segundo, na ordem revive > poção com vida crítica > cura de status > poção normal. Pokebola não entra nessa conta — capturar não e curar.',
      'PRECISÃO PASSOU A VALER. Cada golpe tem a precisão real do jogo, e agora ele pode errar. Sem isso não havia como os status serem fieis: Hipnose (60%) e Canto (55%) virariam sono garantido. Seu Pokemon também passou a escolher golpes contando a chance de errar — ele prefere um golpe de 100% de precisão a um mais forte que erra 3 de cada 10 vezes.',
      'AUMENTOS E REDUCOES DE ATRIBUTO (os "power ups"). Dança das Espadas, Rosnado, Aro de Ferro e outros 86 golpes passaram a funcionar, com a tabela de estágios dos jogos. Eles zeram quando a luta acaba, como no original.',
      'TAMBÉM ENTRARAM: dreno de vida (Absorver e companhia curam quem usa), recuo (Investida Dupla machuca você), cura direta (Recuperar), tontura e a taxa de crítico aumentada de golpes como Corte e Folha Navalha.',
      'O COMBATE FICOU MAIS DIFÍCIL, e isso e esperado: golpes erram, status atrapalham e o inimigo também usa tudo isso contra você. Em caçadas onde você esta muito acima do nível, a queda no ritmo de abates e sensível. O balanceamento vai ser reavaliado.',
    ],
  },
  {
    version: '6.1',
    date: '2026-08-14',
    title: 'Cada Pokemon leva 4 golpes — e os preços viraram os do Ultra Sun',
    highlights: [
      'NO MÁXIMO 4 GOLPES POR VEZ, como nos jogos. Seu Pokemon continua APRENDENDO tudo do moveset dele, mas leva pra luta só 4. Escolha quais no menu Equipes, clicando no Pokemon e abrindo a aba Golpes — a coluna "Usar" marca os ativos.',
      'NÃO DA PRA TROCAR DENTRO DE UMA CAÇADA. Saia da caçada para mexer nos golpes. Fora isso, troque quando quiser, quantas vezes quiser.',
      'SEU TIME JÁ VEM CONFIGURADO com os 4 golpes de maior dano de cada Pokemon (contando o bônus de tipo). Não há nada que você precise fazer — só mexa se quiser outra combinação.',
      'O GOLPE DE ÁREA DO NÍVEL 50 continua sempre disponível e NÃO ocupa slot. O Ataque Básico também não: ele entra sozinho quando nenhum dos seus 4 esta pronto.',
      'POKEMON SELVAGEM também passou a usar só 4 golpes — os 4 últimos que a espécie dele aprenderia naquele nível, e sem o golpe de área do Nível 50.',
      'PREÇOS DA LOJA ATUALIZADOS pro Ultra Sun: Ultra Ball ficou mais barata (de 1200 para 800 antes do desconto), Potion também (300 para 200), enquanto Hyper Potion (1200 para 1500) e Revive (1500 para 2000) subiram. O desconto de 70% em bolas e poções continua igual.',
      'CORREÇÃO IMPORTANTE: derrotar um Pokemon do tipo Fada podia travar sua conta permanentemente. A Pedra Fada não existia no catálogo do servidor, então o drop entrava no inventário como item inexistente e TODA gravação seguinte falhava a partir dali. Corrigido antes de qualquer conta ser afetada.',
      'O ritmo do combate passou a ser um número só (2 segundos por ação). Antes havia dois valores concorrentes e o menor nunca tinha efeito — os cooldowns mostrados na barra de golpes mentiam.',
    ],
  },
  {
    version: '6.0',
    date: '2026-08-14',
    title: 'Tudo passou a ser Pokemon Ultra Sun — e o tipo Fada chegou',
    highlights: [
      'BASE DE DADOS NOVA. Atributos, tipos, taxas de captura, curvas de experiência e movesets de todos os 251 Pokemon passaram a ser os de Pokemon Ultra Sun (Geracao VII), no lugar dos de Ouro/Prata. Os dados vem da PokeAPI e foram CONFERIDOS um a um contra a Bulbapedia: 251 fichas de atributo, 250 de tipagem, 251 de taxa de captura, 251 de curva de experiência e as 324 celulas da tabela de tipos — zero divergencia.',
      'TIPO FADA. O 18o tipo entrou por inteiro: tabela de efetividade da Gen VI (Fada bate 2x em Dragão, Sombrio e Lutador; Dragão não causa NADA em Fada; Veneno e Aço batem 2x nela), cor própria, ícone de golpe, efeito de impacto próprio, Pedra Fada e uma hunt nova — a Clareira Encantada, onde Cleffa, Togepi, Snubbull e Granbull passam a aparecer. Jigglypuff, Igglybuff, Marill e Azumarill viraram tipo duplo com Fada.',
      'MUDANÇA QUE ATINGE QUEM NÃO E FADA: na Gen VI o tipo Aço DEIXOU de resistir a Fantasma e a Sombrio. Steelix, Scizor, Magneton e companhia ficaram mais vulneraveis a esses dois.',
      'GOLPES: de 223 para 486. Os movesets da Gen VII trazem tudo que as geracoes III a VII adicionaram — Lâmina de Folha, Combate Fechado, Pulso Sombrio, Dança do Dragão, Terreno Elétrico, Luar Explosivo e centenas de outros. Todos com descrição em português.',
      'GOLPES EM ÁREA CORRIGIDOS E MULTIPLICADOS. Antes só 6 golpes acertavam vários inimigos, por uma lista escrita a mão. Agora isso vem do alvo real do golpe: são 26 golpes de área com dano, incluindo Terremoto, Nevasca, Deslizamento de Rochas, Onda de Calor, Descarga e Voz Encantadora.',
      'FÓRMULAS DA GERACAO VII. Crítico caiu de 1/16 para 1/24 e passou a multiplicar por 1.5 em vez de 2. A captura passou a usar a fórmula real de três sacudidas (que leva o HP do alvo em conta). A experiência por abate passou a usar a fórmula ESCALADA: derrotar alvo do próprio nível rende o máximo, e farmar muito abaixo do seu nível rende cada vez menos — vale a pena subir de zona.',
      'BALANCEAMENTO PRESERVADO ONDE DAVA. O XP por abate contra alvo do próprio nível e a chance MEDIA de captura do elenco continuam nos mesmos patamares de antes: os dois multiplicadores globais foram recalculados para isso. O que mudou de verdade e a forma das curvas, que agora e a dos jogos.',
      'AJUSTES DE ATRIBUTO DA GEN VI: 23 espécies ficaram mais fortes (Farfetch’d, Dugtrio, Pidgeot, Alakazam, Beedrill, Butterfree, Electrode, entre outras). Seus Pokemon já salvos recebem os novos números na próxima vez que o jogo carregar — não e preciso capturar de novo.',
      'A ZONA "PROFUNDEZAS" deu lugar a Clareira Encantada. Os Pokemon de Água fortes que moravam lá (Gyarados, Lapras, Kingdra) continuam aparecendo em zonas de nível alto da Costa.',
      'Tyrogue passou a evoluir de verdade (nível 20). As nove evoluções especiais continuam iguais: nível 80 mais 20 Pedras do tipo primario.',
    ],
  },
  {
    version: '5.8',
    date: '2026-08-09',
    title: 'Progresso voltando atrás e "falha ao falar com o banco" ao recarregar',
    highlights: [
      'PROGRESSO REGREDINDO — CORRIGIDO (crítico). Ao recarregar a página, ou ao clicar em qualquer coisa (Loja, mochila, equipe) no momento em que o jogo estava salvando a caçada, o pedido novo gravava um retrato ANTERIOR ao salvamento por cima dele. O tempo caçado já tinha sido descontado do relogio, então aquele ouro, XP e capturas não voltavam em salvamento nenhum. Medido: com 10 minutos de caçada pendente, 3 de cada 6 recarregamentos e 5 de cada 6 cliques apagavam o período inteiro — mais de 10.000 de ouro perdidos por lote de teste. Agora o pedido novo espera o salvamento terminar antes de ler seu progresso.',
      'AVISO "FALHA AO FALAR COM O BANCO" NO CTRL+SHIFT+R — CORRIGIDO. Quem tinha regras de captura automática configuradas via esse erro ao recarregar: as regras eram apagadas e reinseridas a cada gravação, e dois pedidos ao mesmo tempo colidiam. Medido: 33 de 48 carregamentos simultaneos falhavam. Agora elas são atualizadas em vez de recriadas, e o erro sumiu (48 de 48 sem falha).',
      'Abrir o jogo deixou de regravar seu progresso a toa: a gravação no carregamento agora só acontece quando há algo novo pra registrar (uma entrega do Mercado ou um anexo do Correio). Era essa gravação inútil que desfazia o salvamento da caçada.',
      'O relatório "Bem-vindo de volta" e a entrega de itens do Mercado/Correio continuam funcionando igual — foram verificados junto.',
    ],
  },
  {
    version: '5.7',
    date: '2026-08-09',
    title: 'Bloqueador de anúncios fazia o jogo apresentar sua conta como nova',
    highlights: [
      'PROGRESSO "SUMINDO" COM BLOQUEADOR DE ANÚNCIOS — CORRIGIDO. Se uma extensão (uBlock, AdBlock, Brave Shields) ou um filtro de DNS barrasse a conversa com o servidor, o jogo NÃO avisava: ele entrava com a ficha em branco e pedia nome de treinador e Pokemon inicial pra quem já tinha equipe, ouro e Pokedex. O progresso nunca foi apagado (o servidor guarda tudo), mas na tela parecia perdido — e criar de novo também não funcionava, porque o mesmo bloqueio derrubava a criação. Agora o jogo para e explica em vez de fingir que você e novo.',
      'MENSAGEM DE ERRO QUE DIZ A VERDADE. Qualquer falha de rede virava "verifique sua internet", e quem estava com internet perfeita ia reiniciar o roteador a toa. Quando o aparelho esta online e mesmo assim não há resposta, a mensagem passa a citar bloqueador de anúncios, extensão de privacidade e filtro de DNS como causa mais provável.',
      'TELA DE LOGIN mostrava "Failed to fetch" em inglês quando o acesso era bloqueado. Agora explica o que houve em português.',
      'Nada aqui exige desligar seu bloqueador para jogar, e o jogo não verifica se você usa um: a mensagem só aparece quando alguma coisa já falhou, para você saber onde olhar.',
    ],
  },
  {
    version: '5.6',
    date: '2026-08-09',
    title: 'Caça a bugs: ouro do Mercado sumindo e duplicacao por clique duplo',
    highlights: [
      'PERDA DE OURO E ITENS CORRIGIDA (crítico). O que você recebia no Mercado (venda, lance aceito, anexo do Correio) e entregue no seu próximo pedido ao servidor. Só que qualquer pedido RECUSADO — "Ouro insuficiente", item trancado, POKE indisponível — marcava a entrega como recebida e jogava fora no meio do caminho. Medido: 500 de ouro de uma venda sumiram porque o jogador, logo depois, tentou comprar algo que não podia pagar. Como recusa e o erro mais comum do jogo, isso acontecia direto. Agora a entrega volta pra fila e chega no pedido seguinte.',
      'DUPLICACAO POR CLIQUE DUPLO CORRIGIDA (crítico). Dois cliques rápidos em "Entrar" abriam DUAS caçadas ao mesmo tempo. Só uma era contabilizada; a outra ficava parada e, quando a primeira terminava, pagava de novo TODO o período. Medido: 30 minutos creditados duas vezes = +8.105 de ouro e +60 Pokemon do nada. Agora o banco só aceita uma caçada aberta por jogador, e o clique duplo simplesmente entra na mesma.',
      'BUSCA DE AMIGO PELO NICK CONSERTADA. Digitar "%" ou "___" mandava pedido de amizade pra um jogador qualquer, sem saber o nome dele — e dava pra descobrir nicks alheios por tentativa. A busca agora compara o nome inteiro.',
      'LIMITE DE 6 NA EQUIPE PASSOU A VALER DE VERDADE. Ele só existia na tela; o 7º Pokemon era recusado lá no banco e voltava como "erro no servidor".',
      'POÇÃO NÃO E MAIS GASTA A TOA. Usar Potion com a vida cheia consumia o item e não curava nada. Agora o botão "Usar" some quando não há o que curar, igual já acontecia com o Revive.',
      'LANCE DUPLICADO NO MERCADO: enviar um segundo lance no mesmo anúncio dizia "erro no servidor"; agora explica que já existe um lance pendente. E quando dois lances eram aceitos ao mesmo tempo, os DOIS ficavam marcados como aceitos no histórico (o dinheiro voltava certo, o registro e que mentia).',
      'CONFIGURAÇÃO DO BOT VALIDADA: dava pra gravar milhares de regras de poção de uma vez (o que travava a simulação da caçada) e regras com valores sem sentido. Agora há limite e checagem.',
      'O ranking do Perfil parava de contar a partir do jogador 1.000 e mostrava uma posição errada sem avisar.',
      'Mensagens de limite no Mercado dizem qual e o teto em vez de só "valor invalido".',
    ],
  },
  {
    version: '5.5',
    date: '2026-08-09',
    title: 'O farm offline parava de render pra sempre depois que o Pokemon desmaiava',
    highlights: [
      'BUG CRÍTICO DO FARM OFFLINE CORRIGIDO. Quando o Pokemon desmaiava durante uma caçada, a caçada continuava "aberta" pra sempre com ele caido: cada vez que o jogo acertava as contas com o servidor, o período inteiro era consumido do relogio e a simulação parava no primeiro instante, porque o Pokemon já estava no chão. Medido antes do conserto: três períodos seguidos de 6 horas foram consumidos e renderam ZERO de ouro, zero abates e nenhum aviso. Quem passasse uma noite fora voltava sem nada e sem explicacao.',
      'Agora a caçada TERMINA quando o Pokemon cai sem como levantar. O jogador volta pro Hospital, o relogio para de ser consumido, e o próximo período só começa quando ele curar e entrar numa hunt de novo.',
      'O RELATÓRIO "BEM-VINDO DE VOLTA" APARECE MESMO QUANDO NÃO RENDEU NADA, dizendo que o Pokemon desmaiou e a farm parou antes do tempo acabar. Antes ele só aparecia se tivesse havido pelo menos um abate — ou seja, justamente no caso do problema ele ficava calado.',
      'AVISO NA TELA quando o Pokemon cai numa hunt sem auto-revive (ou sem Revive na mochila): antes esse aviso só existia nas hunts BOSS, e nas outras o jogador ficava olhando um Pokemon deitado sem saber que não estava mais ganhando nada.',
      'Não da mais pra entrar numa hunt com o Pokemon desmaiado (o servidor também recusa).',
      'Hunts BOSS não reanimam de propósito — mas a simulação não sabia disso e, com Revive na mochila, rodava as 6 horas inteiras com o Pokemon caido, sem explicar o zero no relatório.',
      'O "tempo de jogo" do Perfil parou de contar tempo que não foi jogado: contava o período inteiro mesmo quando a simulação parava nos primeiros segundos (três períodos de 6h viravam 30 horas de tempo jogado para 6 horas reais).',
      'LEMBRETE: o auto-revive vem DESLIGADO por padrão. Com ele ligado e Revive na mochila, o Pokemon levanta sozinho e a caçada continua enquanto você estiver fora.',
    ],
  },
  {
    version: '5.4',
    date: '2026-08-09',
    title: 'Duplicacao de Pokemon corrigida, leilao no Mercado e compra em um clique',
    highlights: [
      'BUG CRÍTICO DE DUPLICACAO CORRIGIDO. O jogo grava o progresso de tempos em tempos, e várias ações disparam essa gravação — quando duas caiam no mesmo instante, as duas simulavam O MESMO período de caçada e cada uma gravava as capturas com identidade própria. Resultado: o mesmo Pokemon aparecia várias vezes na mochila. Medido antes do conserto: seis gravacoes simultâneas de 20 minutos de caçada geraram 396 Pokemon para 66 capturas reais. Agora o período e reservado por quem chega primeiro e as demais não creditam nada — 61 capturas, 61 Pokemon.',
      'Junto disso, uma gravação atrasada não consegue mais desfazer o que outra fez: ela não apaga Pokemon que chegou depois dela (compra no Mercado) nem devolve pra mochila um Pokemon que já foi anunciado ou vendido.',
      'MERCADO — MODO SOMENTE LANCE: ao anunciar um Pokemon da pra publicar SEM preço de compra direta. Outros jogadores enviam ofertas e você aceita ou recusa em "Anúncios Ativos". O valor de quem oferta fica retido na hora e volta inteiro se a oferta for recusada, cancelada ou se o anúncio sair do ar.',
      'MERCADO — FILTROS RÁPIDOS: botões de Gold, Diamante e Somente Oferta na aba Comprar, cada um liga e desliga sozinho.',
      'MERCADO — A lista de itens da aba Comprar só mostra o que realmente tem proposta ativa (antes listava os ~30 itens do jogo com "sem oferta" na maioria). Sem nenhuma proposta, a tela diz isso em vez de ficar vazia.',
      'LOJA — COMPRA EM UM CLIQUE: os botões viraram +10, +100 e +1000 e executam a transacao na hora, sem confirmar. Vale pra comprar e pra vender. O campo de quantidade e o botão Comprar/Vender continuam lá pra qualquer outro número.',
      'ATALHO DA LOJA NO PAINEL AUTO: um botão no topo do painel leva direto pra Loja — a decisão "estou sem Poke Ball" nasce olhando as contagens desse painel.',
      'BOLINHA VERMELHA DE AVISO no Correio (mensagem nova ou item por coletar) e no Mercado (lance esperando resposta).',
      'CABEÇALHOS FIXOS: abas, busca e filtros de Mochila, Loja, Hunts, Mercado e Pokedex ficam travados no topo enquanto a lista rola.',
      'POKEDEX COM FILTROS RÁPIDOS: "Hunt Atual" mostra só quem aparece na hunt em que você esta, "Continente" só a regiao, "Pokedex" a lista inteira.',
      'HUNTS EM ORDEM DE NÍVEL. A lista vinha agrupada por bioma e pulava de Lv1-10 pra Lv71-80 e voltava.',
      'RELATÓRIO DE FARM OFFLINE mostra QUANTOS níveis o Pokemon e o Treinador ganharam, com o antes e o depois ("+3 (Lv 12 → 15)") no lugar de um "Subiu de nível!" que valia igual pra 1 ou pra 9 níveis.',
      'O Pokemon no Hospital ficou centralizado na tela.',
    ],
  },
  {
    version: '5.3',
    date: '2026-08-09',
    title: 'Pokemon forte fora do início, 500 itens pra todo mundo e o duplo clique de volta',
    highlights: [
      'BUG DE BALANCEAMENTO (grave): Pokemon forte aparecia na PRIMEIRA hunt do jogo. Scizor, Heracross, Scyther e Pinsir (500 de status total) nasciam na Zona 0, de nível 1 a 10; Meganium e Venusaur também; Kingdra, Gyarados, Lapras e Blastoise apareciam na Zona 1; e Tyranitar (600) na Zona 2. Agora cada espécie tem um NÍVEL MÍNIMO derivado da força e do estágio de evolução, e nenhuma passa dele.',
      'ZONAS AVANCADAS: quem foi tirado do início não sumiu do jogo — cada bioma ganhou versões de nível mais alto conforme precisou. "Johto Zona 5 · Bosque" (Lv 51-60) existe porque Scizor e Heracross precisavam de casa; "Johto Zona 7 · Caverna" (Lv 71-80) e onde o Tyranitar foi parar. São 69 hunts normais no lugar de 36.',
      'Formas finais continuam em 0,2% nas hunts comuns, mas a regra deixou de valer nas zonas que são MAJORITARIAMENTE de formas finais — nelas, forcar 0,2% dava mais de 99% da hunt pro único POKE que não era forma final.',
      'CHANCE DE SHINY CORTADA PELA METADE. A fórmula não mudou (espécie mais fácil de capturar continua tendo mais chance de shiny) — só o multiplicador global caiu de 200x para 100x sobre a taxa original do Gen2.',
      'TODO JOGADOR NOVO COMEÇA COM 500 Poke Ball, 500 Potion e 50 Revive (era 200/200/10).',
      'QUEM JÁ JOGAVA RECEBEU A MESMA QUANTIDADE PELO CORREIO: abra o Correio e clique em "Coletar" na mensagem "Reposicao de suprimentos". O Correio ganhou anexo de itens de verdade — com botão de coletar, e a coleta só acontece uma vez.',
      'BUG CORRIGIDO: o duplo clique que desliga um golpe tinha parado de funcionar. O evento sempre disparou; o problema e que a escolha nunca chegava ao servidor (que e quem decide o golpe em combate) e nem sequer tinha onde ser salva no banco. Agora vale na hora, vale no combate e sobrevive ao logout.',
      'Ícones das skills preenchem o slot inteiro: o fundo preto que vinha dentro da própria arte foi removido no desenho, e o ícone aparece sobre a cor do elemento.',
      'A janela do Correio deixou de parecer desabilitada — texto com contraste normal, no mesmo peso visual das outras janelas.',
      'CORES DE RARIDADE NO LOG: a cor agora pinta só a PALAVRA da raridade, e não o nome do Pokemon. O abate passou a mostrar a raridade também: "Rattata [RARO] derrotado!" com apenas RARO em azul.',
    ],
  },
  {
    version: '5.2',
    date: '2026-08-09',
    title: 'Arte de golpe em 8 elementos, ícones de skill, ataque do Charmander e menus mais densos',
    highlights: [
      'ARTE DE GOLPE EM MAIS 7 ELEMENTOS: Água, Raio, Normal, Grama, Inseto, Lutador e Pedra ganharam animação real em vez do efeito colorido genérico — cada um com uma animação pra alvo único e outra pra área, esta última desenhada no tamanho exato da área atingida. Com o Fogo (versão 5.1), são 8 dos 17 tipos com arte própria; os outros 9 seguem no efeito por cor.',
      'ÍCONES DE SKILL: cada slot da barra de golpes passou a mostrar um ícone do elemento (chama, raio, redemoinho, pedra, garra...) no lugar das três letras do nome do golpe. O nome completo continua no tooltip e o dano base continua na faixa de baixo do slot.',
      'BUG CORRIGIDO: o Charmander (e outras 14 espécies) não tinha animação de ataque — ele atacava com a pose de PARADO. Essas espécies não tem a animação "Shoot" no pacote de arte, e o jogo caia direto em "Idle" sem tentar a pose de investida, que elas TEM. Agora tenta a investida primeiro.',
      'Toda sprite de ataque passou a ser desenhada com 90% de opacidade. O efeito procedural já era assim; a arte real saia opaca, então os dois tinham peso visual diferente na tela.',
      'NOMES DE POKE COLORIDOS NO LOG: no chat (abas Sistema e Log) e nos avisos flutuantes, o nome do POKE sai na cor da raridade dele — abate, captura, subida de nível, desmaio, evolução e troca de equipe. Da pra ver que apareceu algo raro sem abrir a mochila.',
      'MENUS MAIS COMPACTOS: revisao geral de espacamento em janelas, cards e botões. Menos espaço vazio, mais informação visível por tela, sem mudar tamanho de fonte.',
      'AUTO-POT AGORA VEM CONFIGURADO EM 70% DE VIDA (era 50%). Quem já tinha mexido na porcentagem mantem a escolha; quem nunca mexeu foi movido pro novo padrão.',
      'HUNT INICIAL SÓ COM POKEMON NORMAL: Route 46 (Inicial) passou a ter apenas Sentret, Hoothoot e Rattata. Ledyba e Spinarak sairam de lá e continuam aparecendo nas zonas de Inseto.',
    ],
  },
  {
    version: '5.1',
    date: '2026-08-08',
    title: 'Novo jogo consertado, level up destravado, economia mais barata e fogo com arte',
    highlights: [
      'BUG CORRIGIDO (grave): "Iniciar novo jogo" NÃO funcionava. O reset tentava devolver seu nome de treinador pro padrão "Treinador", batia na regra de nome único e a operacao inteira falhava com erro de servidor — nada era apagado. Agora o nome sobrevive ao reset (ele e sua identidade pública, não progresso) e o resto e apagado de verdade.',
      'O reset também passou a limpar o que ficava pra trás: anúncios e ordens suas no Mercado, POKE que estava a venda, entregas pendentes e o histórico de tempo de jogo. Antes dava pra zerar a conta e continuar com um POKE anunciado, compravel por outra pessoa.',
      'BUG CORRIGIDO (grave): a barra de EXP do POKE chegava a 100% e o nível não subia. A barra media por uma curva e o level up por outra (a que ficou 30% mais cara na versão 5.0), então faltava sempre um pedaco invisível. As duas passaram a ser a mesma conta.',
      'BUG CORRIGIDO: "dou F5 e perco níveis". O que a tela mostra entre uma gravação e outra e previsao; quem credita e o servidor. Agora todo level-up (do POKE ou do Treinador) força a gravação na hora, e ocultar/minimizar a aba também grava. A janela em que a tela podia estar adiantada caiu de 30 segundos pra 5.',
      'CRIAÇÃO DE PERSONAGEM EM DUAS TELAS: o nome do treinador virou a PRIMEIRA tela, e só depois de confirmar vem a escolha do POKE inicial. Vale também depois de "Iniciar novo jogo" — antes, recomecar não dava nenhuma chance de trocar o nome.',
      'Jogador novo (e conta resetada) começa com 200 Poke Ball e 200 Potion — era 100 de cada. O Revive segue em 10.',
      'POÇÕES E POKEBOLAS 70% MAIS BARATAS: Poke Ball 200 -> 60, Great Ball 600 -> 180, Ultra Ball 1.200 -> 360, Premier Ball 3.000 -> 900, Potion 300 -> 90, e o mesmo corte nas demais poções. O preço de VENDA acompanha o desconto de propósito: comprar e revender continua dando prejuizo, como sempre foi.',
      'VENDA DE POKE VIROU 1.000 + BÔNUS, em vez de "no mínimo 1.000". Antes o piso engolia os bônus até a fórmula passar de 1.000 sozinha, e um POKE comum de nível 40 valia o mesmo que um de nível 1. Agora nível, raridade e status somam por cima da base desde o primeiro ponto.',
      'CHANCE DE APARIÇÃO DAS TERCEIRAS EVOLUÇÕES FIXADA EM 0,2% em toda hunt (o Dragonite, que tinha 1% por regra própria, entrou nesta). As demais espécies dividem o restante mantendo a raridade relativa que já tinham; a soma de cada hunt continua fechando 100%. Hunts BOSS ficam de fora — lá o elenco e a luta.',
      'FOGO GANHOU ARTE DE VERDADE: golpes do tipo Fogo deixaram de usar o efeito genérico e passaram a mostrar uma animação real — chama em quadros no alvo único, e explosão seguida de nuvem queimando nos golpes em área, desenhada no tamanho exato da área atingida. Os outros 16 tipos continuam com o efeito colorido por elemento.',
    ],
  },
  {
    version: '5.0',
    date: '2026-08-08',
    title: 'Mercado entre jogadores, Chat Mundo, Correio, Hunt Analyzer e zonas honestas',
    highlights: [
      'WIPE GERAL. Todo jogador recomeca do zero: POKEs, mochila, ouro, Pokedex, nível de treinador e hunts liberadas foram reiniciados. O NOME do treinador foi preservado — ele virou identidade pública e não pode mudar sozinho.',
      'NOVO — MERCADO ENTRE JOGADORES (menu do rodapé). Itens funcionam como livro de ofertas: você define preço e quantidade, e sua ordem casa sozinha com a melhor do outro lado, pagando o preço de quem já estava lá (o troco volta na hora). O que não casar fica esperando no livro. Pokemon vai por anúncio de preço fixo, em Ouro ou Diamante, com busca por espécie, nível mínimo, IV mínimo, raridade e shiny.',
      'No Mercado, o que você anuncia sai do inventário na hora e volta se você cancelar — não da pra vender duas vezes o mesmo estoque. Quem vende recebe assim que abre o jogo, mesmo que estivesse offline na hora da venda. Abas "Anúncios Ativos" e "Histórico" mostram o que esta de pé e o que já foi negociado.',
      'NOVO — CHAT MUNDO de verdade: a aba "Mundo" agora e só mensagem ao vivo de outros jogadores, com campo pra escrever. Os avisos do jogo que ficavam lá mudaram pra uma aba nova, "Sistema".',
      'NOVO — Shift + clique esquerdo num item ou POKE (Mochila, Equipe ou Loja) injeta um link dele no chat. Quem lê passa o mouse em cima e ve os status resumidos — no caso de POKE, nível, raridade e IV medio do momento em que foi linkado.',
      'NOVO — CORREIO E AMIZADES: adicione alguém pelo nick e o pedido chega na caixa de entrada da pessoa com botão de aceitar. Amizade aceita aparece nas duas listas.',
      'NOVO — NOME DO TREINADOR NO CADASTRO: quem cria conta escolhe o próprio nick (3 a 16 caracteres, único no servidor). Ele aparece no chat, no ranking, no Mercado e e por ele que amigos te encontram.',
      'NOVO — HUNT ANALYZER: clique no card de taxas (canto superior esquerdo). Abre uma janela com ouro/XP/abates por hora, media por abate, tempo medio por abate, projecao de ouro em 1h e 8h, quanto falta pro próximo nível do POKE e do Treinador nesse ritmo, e a lista completa do que nasce na hunt com a chance real de cada espécie.',
      'BUG CORRIGIDO (grave): o nome da zona não batia com o nível que ela spawnava. "Zona Nível 31-40" entregava POKE de nível 15 e de nível 51; "Zona Nível 1-10" entregava até nível 12. Agora a faixa e a fonte única: as zonas se chamam "Zona 0" (Lv 1-10), "Zona 1" (Lv 11-20), "Zona 2" (Lv 21-30) e assim por diante, e nenhum POKE nasce fora da faixa anunciada.',
      'Consequência do item acima: o topo das hunts normais passou de Lv105 pra Lv90 (nove zonas de dez níveis, sem buraco entre elas). O conteudo acima disso continua sendo o Modo Pesadelo e as hunts BOSS.',
      'BUG CORRIGIDO: no Modo Pesadelo da hunt inicial, os POKE nasciam nível 1 e 2 num mapa anunciado como Lv150 — a hunt mais difícil do início era a mais fácil.',
      'EVOLUIR FICOU 30% MAIS CARO: o EXP necessário pra cada nível de POKE subiu 30%. Como toda evolução aqui depende de nível, isso e o custo de evoluir. O nível de TREINADOR não mudou.',
      'Painel Auto reorganizado: auto-catch, auto-pot e auto-revive viraram três blocos separados, cada um com o próprio interruptor e as próprias regras. Os seletores de bola e poção passaram a mostrar o ícone do item e quanto você tem de cada um.',
      'NOVO no painel Auto: previsao de quanto tempo os suprimentos ainda duram, medida pelo consumo real da sessão. Só aparece quando falta menos de 2 horas.',
      'O aviso de "sem bola/poção/revive" também passou a ficar registrado no chat (aba Sistema) — antes ele só existia enquanto você estava olhando pra tela.',
      'Tooltips: passar o mouse num item mostra o que ele faz em números (quanto cura, quanto multiplica a captura, quanto custa). Passar o mouse num golpe mostra tipo, categoria, dano base, PP, recarga, área e a descrição dele. Golpe sem dano avisa explicitamente que o efeito original não e simulado neste jogo.',
      'Loja: botões de quantidade x10/x100/x1000 e "Max", total da operacao mostrado antes de confirmar, "Vender tudo" por item (separado do "Vender Tudo" geral) e rolagem horizontal nas colunas pra nada ficar cortado em tela estreita.',
      'Item trancado agora vai pro fim da lista, na Mochila e na Loja.',
      'Bestiário passou a listar na ordem oficial da Pokedex.',
      'Ouro e Diamantes ficam ancorados ao lado dos dados do treinador, no canto superior direito, em qualquer largura de tela.',
      'Fonte da interface inteira 3px maior. Em celular isso aperta o encaixe, então a escala mínima da HUD (Configurações) desceu pra 0,7 pra quem preferir o tamanho anterior.',
      'Auras de IV máximo agora se somam em vez de uma cobrir a outra: um POKE com dois ou mais atributos perfeitos ganha um halo com as cores misturadas.',
    ],
  },
  {
    version: '4.2',
    date: '2026-08-08',
    title: 'Treinador original, venda de POKE a partir de 1.000G e ranking clicavel',
    highlights: [
      'VENDA DE POKE VALE NO MÍNIMO 1.000 DE OURO. Vale pra qualquer POKE, de qualquer nível e raridade; quem já valia mais que isso continua valendo o mesmo (raridade e nível seguem multiplicando por cima).',
      'O ouro por ABATE não mudou. Ele sai da mesma fórmula da venda, mas o piso e regra de venda: sem essa separacao, o ouro por kill na hunt inicial teria pulado de ~5 pra ~330 sem ninguém pedir. Na prática, capturar e vender agora rende MUITO mais que só matar — 40 minutos de caçada renderam ~1.000 de ouro em abates contra ~21.000 vendendo as capturas do mesmo período.',
      'NOVO — Treinador original: todo POKE guarda para sempre o nome de quem o capturou, gravado no instante da captura. O card do POKE mostra esse nome. Os POKE que já existiam receberam o nome do dono atual (não há troca entre jogadores no jogo, então dono e capturador são a mesma pessoa).',
      'Ranking de Pokemon ficou clicavel: clicar numa linha abre o card completo daquele POKE — os atributos, IVs e HP reais dele, e o treinador dono — e não uma reconstrucao aproximada.',
      'Calculadora de Força: os seis atributos viraram campos editaveis. Da pra digitar um valor por atributo pra simular "e se", com o valor calculado mostrado embaixo e um botão pra voltar atrás. Trocar nível ou raridade recalcula só os atributos que você NÃO editou.',
      'O bot avisa quando um consumivel esta acabando: com menos de 10 unidades de um item que uma automação LIGADA usa, a contagem dele e o botão "auto" piscam em vermelho. Item de automação desligada não alerta.',
      'Bug corrigido: no combate, o POKE atacava virado pra onde estava andando quando parou — muitas vezes de costas pro alvo. Agora ele se vira de frente pro alvo no instante do golpe.',
      'O painel Auto passou a mostrar também a quantidade de Revive, que era o único consumivel do bot sem contagem visível.',
    ],
  },
  {
    version: '4.1',
    date: '2026-08-08',
    title: 'Johto e Kanto separados, Ranking, Perfil do Treinador e economia reiniciada',
    highlights: [
      'INVENTÁRIO E ECONOMIA REINICIADOS pra todos os jogadores. POKEs, nível, Pokedex e hunts liberadas continuam intactos — o que zerou foi o estoque e a carteira.',
      'Novos valores de início (e o que todo mundo recebeu no reinicio): 1.000 de ouro, 0 diamantes, 100 Poke Ball, 100 Potion e 10 Revive. Great/Ultra/Premier Ball, Super/Hyper/Max Potion e Max Revive deixaram de ser dados de graça — agora são comprados ou dropados.',
      'HUNTS SEPARADAS POR REGIAO: hunt de Johto só tem POKE de Johto, hunt de Kanto só tem POKE de Kanto. Como quase toda hunt era mista, cada bioma passou a existir NAS DUAS regioes — são 35 hunts agora (eram 19), cada regiao com uma escada completa de nível. Nenhuma espécie ficou sem lugar pra aparecer.',
      'Porygon, Porygon2 e Eevee sairam de todas as tabelas de spawn selvagem (são POKE de cassino/presente). Eles continuam no Bestiário e na Pokedex, mas hoje não há outra forma de obte-los no jogo.',
      'Hunt inicial (Johto Route 46): agora sai exatamente 80% de POKE nível 1 e 20% nível 2, e o elenco dela passou a ser só de Johto (Sentret, Hoothoot, Ledyba, Spinarak).',
      'Shiny ficou bem mais forte: os atributos base de um shiny passaram a ser multiplicados por 1,5 (era 1,2). A chance de encontrar shiny NÃO mudou — continua a fórmula de sempre.',
      'Os atributos de todo POKE passaram a ser recalculados ao carregar o jogo, então mudanças de balanceamento como essa valem pra equipe inteira, e não só pros POKE capturados depois.',
      'NOVO — Ranking (menu "Mais"): Treinadores por nível, Pokemon por nível/Dano Físico/Dano Especial/HP/Defesa/Defesa Especial/Velocidade, e um Hall da Fama com os primeiros a derrotar o Campeão Lance.',
      'NOVO — Perfil do Treinador: clique na sua foto, no canto superior direito. Mostra nick, nível, sua posição no ranking geral, % da Pokedex, ouro, diamantes, batalhas vencidas, shinys derrotados, tempo de jogo e um log das últimas capturas.',
      'NOVO — Tutorial do Bot na primeira vez que você joga, e um menu "Repetir Tutoriais" (dentro de "Mais") pra rever quando quiser.',
      'Bot muda de configuração inicial: poção a 50% de vida (era 40%), e auto-catch e auto-revive agora começam DESLIGADOS — os dois gastam item a cada uso, e o estoque inicial ficou bem menor.',
      'Sprites de batalha voltaram ao tamanho original do arquivo. Todo redimensionamento por altura da espécie foi removido (inclusive o dos lendários).',
      'O aviso de contagem do Auto-Revive (e os avisos de BOSS/Lance) deixaram de cobrir a tela inteira — agora ficam restritos ao campo de batalha e não passam por cima do menu de baixo.',
      'Subir de nível passou a mostrar quanto cada atributo ganhou, e o relatório de captura no chat passou a dizer a raridade do POKE capturado.',
      'Calculadora de Força: os POKE da sua equipe aparecem primeiro na lista de seleção.',
      'Ícone do menu Equipe trocado. Cabeçalho do treinador ficou mais compacto (a foto continua do mesmo tamanho).',
      'Conexão mais estavel: as chamadas ao servidor ganharam tempo limite e nova tentativa automática em falha de rede, e as mensagens de erro passaram a dizer o que houve ("sem conexão", "o servidor demorou demais") em vez do genérico "não foi possível falar com o servidor" repetido a cada 30 segundos.',
      'Bug corrigido: recarregar a página em /jogo, /login ou /registro devolvia erro 404 no site publicado.',
      'Bug corrigido: os ícones de POKE do relatório de farm offline usavam o recorte errado e vários apareciam cortados ou em branco.',
      'Bug corrigido: o Modo Pesadelo espelhava a composicao ANTIGA das hunts — agora ele reflete o elenco separado por regiao, e as hunts novas também ganharam espelho.',
    ],
  },
  {
    version: '4.0',
    date: '2026-08-08',
    title: 'Reinicio geral, interfaces mais leves e correções de sprite',
    highlights: [
      'REINICIO GERAL DO SERVIDOR: o progresso de todos os jogadores foi apagado e todo mundo começa do zero. As contas e os logins continuam os mesmos — voltam com 500.000 de ouro, 10.000 de cada consumivel e todas as hunts sem custo liberadas.',
      'Ganho de XP reduzido em 50% (por POKE e por Treinador).',
      'Golpes de nível 50 (Explosão Elemental): PP passou de 15 pra 7, ou seja, o cooldown mais que dobrou (de ~1,9s pra 4s).',
      'Golpes de nível 50 também mudaram de regra: se eles contam como Físico ou Especial passa a ser decidido pelos atributos que o POKE tem EXATAMENTE no nível 50, e não pelos atuais. Antes a categoria podia mudar sozinha ao subir de nível ou evoluir, trocando a fórmula de dano no meio do jogo.',
      'Mochila e Loja ficaram leves: as listas agora vem paginadas em 30 por página, em vez de desenhar centenas de cartões de uma vez. Busca, filtros, ordenação, "Selecionar tudo" e "Vender Tudo" continuam valendo pra coleção inteira, não só pra página visível.',
      'Bug visual corrigido: no primeiro encontro com cada espécie aparecia uma forma geometrica colorida por alguns instantes no lugar do POKE. Agora a arte da hunt inteira (todas as espécies do local, versão normal e shiny, mais o cenário) e carregada antes da cena aparecer.',
      'Bug corrigido: trocar de POKE em campo ou evoluir não mudava a sprite na hora — ela só trocava depois do POKE usar um golpe. Agora a troca e imediata.',
      'Bug corrigido: "Iniciar novo jogo" apagava o progresso mas deixava a conta travada — nem escolher um novo inicial funcionava. O reinicio agora também encerra a caçada em andamento, e limpa a Pokedex e as regras de auto-captura, que antes sobreviviam ao reinicio.',
      'Bug corrigido: as regras de auto-captura por espécie nunca eram salvas — desapareciam ao recarregar o jogo.',
      'Bug corrigido: curar na enfermeira do Hospital repunha o HP mas deixava o POKE marcado como desmaiado, e ele continuava sem lutar na hunt seguinte.',
      'Interface: o retrato do POKE ativo agora preenche a moldura do cabeçalho; os ícones de golpe ficaram menores e encolhem sozinhos em tela estreita; o bloco de contagem de bolas abaixo do botão "auto" foi removido (a mesma contagem continua dentro do painel Auto); setas e emojis usados como ícone na Mochila, na Loja e na Wiki foram trocados pelos ícones de verdade do jogo.',
    ],
  },
  {
    version: '3.8',
    date: '2026-08-06',
    title: 'Farm offline corrigido: tempo em segundo plano deixa de ser perdido',
    highlights: [
      'Bug real corrigido (o motivo de "o offline não funciona em alguns aparelhos"): com a aba minimizada, navegadores como Chrome e Edge não congelam o jogo — eles deixam ele acordar só uma vez por minuto, e cada despertar desses avancava apenas 1 segundo de jogo. Na prática, 3 horas em segundo plano rendiam cerca de 3 minutos. Aparelhos que congelam a página de vez (celulares, aba descartada) nunca sofreram disso, por isso o problema só aparecia em alguns dispositivos. Agora o jogo compara o relogio real com quanto tempo de fato foi simulado e recupera a diferença inteira.',
      'O jogo agora salva também no momento em que a aba e ocultada. Navegador de celular costuma encerrar uma aba em segundo plano sem avisar, e o horario do último save e justamente o que mede seu tempo fora — sem isso, parte do tempo offline simplesmente não era contada.',
      'Ficar muito tempo fora não trava mais o aparelho: a recuperacao de tempo tinha custo ilimitado e podia congelar (ou fazer o navegador matar) a página, e como o save só acontecia no fim, o progresso era perdido e a mesma travada se repetia a cada abertura. Agora o cálculo tem teto: em períodos muito longos ele fica menos detalhado, mas o tempo continua sendo creditado.',
      'Bug real corrigido: depois da primeira captura, o jogo parava de salvar completamente, sem nenhum aviso — o que também derrubava o farm offline junto (sem save, não há como medir o tempo fora).',
      'Relogio do aparelho adiantado/atrasado (ou trocado manualmente) não deixa mais o farm offline travado até a hora real "alcancar" o horario errado.',
      'Se o navegador estiver bloqueando o armazenamento (ex: aba anonima do Safari), o jogo agora avisa na tela em vez de falhar em silencio — sem save não existe farm offline nem progresso guardado.',
      'A recuperacao de tempo passou a valer também em situacoes que antes não disparavam nada: voltar pelo botão "voltar" do navegador, notebook que dormiu com a aba aberta na frente, e tela de celular desligada em alguns navegadores Android.',
    ],
  },
  {
    version: '3.7',
    date: '2026-08-06',
    title: 'Texto do nome do golpe: fonte menor, deslocado pra não encostar no nome',
    highlights: [
      'O texto que mostra o nome do golpe usado (acima do POKE em combate) ficou com fonte menor (8px, era 10px) e foi deslocado 2px pra baixo, garantindo folga em relacao ao nome/nível do POKE logo abaixo dele.',
    ],
  },
  {
    version: '3.6',
    date: '2026-08-06',
    title: 'Zoom padrão da camera agora começa em 150%',
    highlights: [
      'O zoom inicial da camera (mostrado no controle +/- no canto superior direito) mudou pra 150%, tanto nas hunts quanto na cena do Hospital. Ainda da pra ajustar livremente com os botões +/- ou Ctrl+Scroll, pra qualquer lado.',
    ],
  },
  {
    version: '3.5',
    date: '2026-08-06',
    title: 'Auto/Chat/Hunt Analyser agora ficam em segundo plano ao abrir outra janela',
    highlights: [
      'Pedido explicito do usuário: quando qualquer janela principal (Equipe, Mochila, Hunts, Loja, Pokedex, Wiki, Config, ou um cartão de POKE) abre por cima, os paineis Auto, Chat/Log e Hunt Analyser (Ouro/H, XP/H) agora ficam visualmente atrás dela em vez de continuar flutuando por cima — clicar onde eles estariam agora interage com a janela aberta, não com esses paineis.',
      'O menu inferior de navegação e o controle de zoom continuam sempre por cima, pra dar sempre pra trocar de janela num clique só.',
    ],
  },
  {
    version: '3.4',
    date: '2026-08-06',
    title: 'Janela da Wiki agora se ajusta pra caber a tabela de tipos',
    highlights: [
      'A janela da Wiki era limitada a mesma largura compacta (480px) de todos os outros menus, então a tabela completa de efetividade de tipos (17x17) só cabia com bastante scroll horizontal escondido. Agora a janela da Wiki cresce até 700px quando a tela permite — em telas menores que isso, a tabela continua com seu próprio scroll horizontal interno, sem cortar nada.',
      'Os outros menus (Equipe/Mochila/Hunts/Loja/Config) continuam na mesma largura compacta de sempre.',
    ],
  },
  {
    version: '3.3',
    date: '2026-08-06',
    title: 'Cartão do POKE: Vantagens de tipo + Pokedex abre automático',
    highlights: [
      'O cartão de status agora mostra também "Vantagem contra" (quais tipos este POKE causa 2x de dano ao atacar), lado a lado com Fraquezas e Resistências, em qualquer menu.',
      'Pokedex: selecionar uma espécie abre o cartão automaticamente — não precisa mais clicar num botão separado "Ver cartão do POKE" (removido).',
    ],
  },
  {
    version: '3.2',
    date: '2026-08-06',
    title: 'Combate: cancelamento de golpe ao morrer + AoE corrigido + rebalanceamento de XP/Ouro',
    highlights: [
      'Bug real corrigido: um POKE derrotado ENTRE o início de um golpe (pose de ataque) e o instante em que o dano realmente e aplicado continuava acertando o alvo do além-tumulo — agora a ação e cancelada por completo se quem a usou já estiver morto quando o golpe chegaria a resolver.',
      'Bug real corrigido: golpes em área (AoE) só atingiam inimigos já "engajados" em combate corpo-a-corpo com o jogador, então o raio real do golpe (240) nunca fazia diferença nenhuma — todo inimigo fora do toque direto ficava de fora mesmo dentro do círculo. Agora o AoE atinge de verdade qualquer inimigo vivo dentro do raio real da habilidade.',
      'XP por abate reduzido em mais 30% sobre o valor atual.',
      'Ouro por abate revertido para a fórmula original (removido o bônus extra de +300% de uma leva anterior).',
    ],
  },
  {
    version: '3.1',
    date: '2026-08-05',
    title: 'HUD mobile: menu inferior e painel Auto ficavam cortados',
    highlights: [
      'Bug real corrigido: em telas de celular (~375px de largura), o menu inferior (Equipe...Config) não cabia numa linha só e 4 botões (Pokedex, Wiki, Hospital, Config) ficavam fora da área visível — só alcancaveis por um scroll horizontal escondido, sem nenhuma pista visual de que existia. Agora o menu quebra em 2 linhas em telas estreitas, com todos os 8 botões sempre visíveis.',
      'O painel "Automações" também vazava 55px pra fora da tela em celulares (a posição fixa era pensada pra desktop) — cortando os controles do lado direito. Agora se ajusta a largura da tela em vez de vazar.',
      'PC/telas largas não mudam nada (os dois ajustes só entram em telas até 520px de largura).',
    ],
  },
  {
    version: '3.0',
    date: '2026-08-05',
    title: 'Cartão do POKE na Pokedex + fraquezas em todo cartão de status',
    highlights: [
      'Pokedex ganhou o botão "Ver cartão do POKE" em cada espécie — abre o mesmo cartão animado (sprite, HP/EXP, abas Status/Golpes) usado em Equipe/Mochila/Loja/Hospital/HUD, montado com um POKE de exibicao (Lv50, IVs maximos) já que a Pokedex não tem uma instância real capturada.',
      'O cartão de status (aba "Status") agora mostra Fraquezas e resistências em qualquer lugar do jogo, não mais só na Pokedex — mesma lógica compartilhada dos dois lugares, incluindo o aviso de fraqueza dupla (4x).',
    ],
  },
  {
    version: '2.9',
    date: '2026-08-05',
    title: 'Hunt Analyser/Auto/Log ficavam presos atrás de janelas abertas',
    highlights: [
      'Bug real corrigido: abrir qualquer janela flutuante (perfil de um POKE, confirmação de venda, resumo do Farm Offline) colocava o fundo escurecido dessa janela ACIMA do painel Hunt Analyser, do botão/painel Auto e do chat/log — os paineis pareciam presentes na tela mas um clique neles na verdade fechava a janela por baixo, em vez de abrir o Auto ou trocar de aba no log.',
      'Os 3 paineis agora ficam sempre acima de qualquer janela/modal aberto (continuam abaixo dos splashes de vitória/derrota e "LVL UP!", que são intencionalmente um interrupt de tela cheia).',
    ],
  },
  {
    version: '2.8',
    date: '2026-08-05',
    title: 'Corrigido: Farm Offline/catch-up travava após o primeiro ataque',
    highlights: [
      'Bug real encontrado e corrigido: toda simulação silenciosa (Farm Offline ao reabrir o jogo, e o catch-up de aba minimizada) travava o POKE parado em "engaged" para sempre assim que ele desferia o primeiro ataque — o cronometro que trava o movimento durante a pose de ataque só era descontado pelo sistema de animação, que e pulado de propósito nesses modos silenciosos por ser só visual. Na prática isso reduzia horas de Farm Offline a pouquissimos abates (só quando um inimigo errante encostava por acaso no jogador congelado).',
      'Agora esse cronometro sempre desconta, silencioso ou não — testado ao vivo: 720 segundos simulados renderam 288 abates a um ritmo constante, contra 3 abates (e travamento total) antes da correção.',
    ],
  },
  {
    version: '2.7',
    date: '2026-08-05',
    title: 'Wiki corrigida + tabela de tipos completa',
    highlights: [
      'Corrigidas informações divergentes na Wiki: a captura e sempre automática (via auto-catch, não existe botão de jogar bola manualmente), o ícone da Equipe e uma Pokebola (não mais o emoji de baseball), a barra de habilidades fica no centro inferior da tela (não "acima do botão Auto"), e a IA só troca pra AOE quando ele realmente acertaria 2+ inimigos.',
      'Aba "Efetividade de Tipos" ganhou a tabela completa 17x17 (golpe atacante x POKE defensor), com rolagem horizontal própria e cores por multiplicador.',
    ],
  },
  {
    version: '2.6',
    date: '2026-08-05',
    title: 'Fraquezas e resistências na Pokedex',
    highlights: [
      'Cada espécie na Pokedex agora mostra sua secao de "Fraquezas e resistências": contra quais tipos ela recebe dano dobrado, reduzido ou nulo — calculado com a tabela real de tipos do jogo (a mesma usada em combate), inclusive combinando os dois tipos de POKEs duplos.',
      'POKEs cujos dois tipos são fracos ao mesmo elemento (ex.: Charizard Fogo/Voador contra Pedra) ganham um aviso separado de "Fraqueza dupla (4x de dano)".',
    ],
  },
  {
    version: '2.5',
    date: '2026-08-05',
    title: 'Colisao de paredes pausada temporariamente',
    highlights: [
      'Sistema de colisao contra paredes/obstaculos (água, cavernas, penhascos) pausado temporariamente — POKEs podem andar livremente por qualquer parte do mapa. O limite circular da borda de cada hunt continua normal.',
    ],
  },
  {
    version: '2.4',
    date: '2026-08-05',
    title: 'Correção real do desbloqueio pos-Lance (Modo Pesadelo)',
    highlights: [
      'Corrigido bug real: todas as hunts do Modo Pesadelo (as 19 zonas espelhadas + as 11 hunts BOSS de lendários) ficavam permanentemente marcadas como "Bloqueado - Derrote o Campeão Lance", mesmo depois de realmente derrota-lo — o desbloqueio de continente só soltava Kanto, nunca o Modo Pesadelo. Agora o Modo Pesadelo fica liberado desde o início (como sempre foi a intenção) tanto em jogos novos quanto em saves já existentes.',
    ],
  },
  {
    version: '2.3',
    date: '2026-08-05',
    title: 'Novo menu Wiki: guia completo do jogo',
    highlights: [
      'Novo menu principal "Wiki" (📚), com 4 abas: Primeiros Passos, Efetividade de Tipos, Raridades Pokemon e Mecânicas.',
      '"Primeiros Passos" explica como começar, como funciona o combate automático, como navegar pelos menus e como progredir nas hunts.',
      '"Efetividade de Tipos" e uma ferramenta interativa: escolha qualquer um dos 17 tipos elementais e veja, com dados reais do jogo, contra quais tipos ele e super eficaz/resistido/imune tanto atacando quanto defendendo.',
      '"Raridades Pokemon" documenta a tabela completa (Comum a Mythic) com chance/multiplicador de status/multiplicador de venda de cada uma, além de explicar Shiny e os lendários como eixos separados.',
      '"Mecânicas" detalha captura, agressividade/lure, distância de visão da camera, habilidades em área (AoE) e o sistema de recarga (cooldown por PP + Velocidade).',
    ],
  },
  {
    version: '2.2',
    date: '2026-08-05',
    title: 'Golpe AoE de nível 50, debuffs reais, IA de caça ativa e ajustes de Lance',
    highlights: [
      'Todo POKE agora aprende um golpe em área exclusivo ao atingir o nível 50, tematizado pelo seu tipo primario — a categoria (Físico/Especial) e decidida automaticamente pelo maior atributo de ataque do próprio POKE.',
      'Self-Destruct/Explosion agora custam 50% da vida atual de quem usa o golpe, corrigindo o recuo que nunca era aplicado.',
      'Duplo clique num ícone de habilidade liga/desliga o uso automático dela pela IA de combate.',
      'Distância de lure (aggro) dos selvagens reduzida para um alcance moderado (era 2.5x o valor real da planilha).',
      'POKE principal agora sempre foca e caça ativamente o inimigo vivo mais próximo pelo mapa, redefinindo o alvo a cada abate, em vez de priorizar quem já estava vindo em sua direcao.',
      'Hunt Inicial troca Geodude por Sentret; Wooper e Quagsire saem da zona costeira (Água) e passam a aparecer na zona do Deserto (Terra); Dragonite agora aparece em Ruinas Ancestrais com exatamente 1% de chance.',
      'Verificado ao vivo que Kanto desbloqueia corretamente após vencer o Campeão Lance (persiste em save/reload). Novo botão "Retornar ao Centro Pokemon" aparece na hunt do Lance só depois da vitória.',
      'Distância de visão padrão da camera aumentada para 160% (nas hunts e no Hospital), mantendo o zoom manual disponível para ajustar ainda mais.',
      'Pokebola só e jogada depois que o "corpo" do POKE derrotado desaparece por completo do campo, não mais só após a animação de desmaio terminar.',
      'Taxa de drop de Stones reduzida de 20% para 5% por abate.',
    ],
  },
  {
    version: '2.1',
    date: '2026-08-05',
    title: 'Pathfinding real, mecânicas do Campeão Lance, sincronia de captura e escala de fundo',
    highlights: [
      'POKEs agora contornam paredes/obstaculos de verdade (busca de rota tipo A*) em vez de ficar travados contra eles.',
      'Hunt do Campeão Lance ganhou contagem regressiva de 5 antes do primeiro POKE aparecer, e um aviso central de Vitória/Derrota ao fim da luta.',
      'POKEs derrotados na luta do Lance ficam visíveis no campo como corpos, em vez de desaparecer.',
      'Escala visual dos backgrounds das hunts reduzida a metade para bater melhor com o tamanho das sprites.',
    ],
  },
  {
    version: '2.0',
    date: '2026-08-05',
    title: 'Combate corpo-a-corpo real, mapas redimensionados e Campeão Lance vira o gate final de Johto',
    highlights: [
      'Tempo mínimo entre ações subiu para 2s e todo POKE trava no lugar enquanto usa um golpe (não anda mais durante o ataque).',
      'Golpes em área agora nascem visualmente de quem usou a habilidade, não mais de cada alvo atingido.',
      'Magnitude, Reversal, Counter, Seismic Toss e outros 10 golpes de dano variável usam a fórmula real de cada um em vez do poder base genérico.',
      'Camera do POKE ativo ancora um pouco abaixo do centro da tela.',
      'Escala das sprites em campo virou proporcional de verdade: o menor POKE do jogo fica em 1x, o maior em 3x.',
      'Animação da pokebola só começa depois que o POKE derrotado termina de desmaiar.',
      'Toda hunt agora tem um background real (nenhuma mais cai no xadrez de fundo antigo) e o mapa ficou 2x menor para o tamanho dos POKEs bater com o cenário.',
      'Colisao de mapa agora bloqueia água de verdade também, não só paredes e vazio.',
      'Campeão Lance virou a hunt final de Johto: derrota-lo agora e obrigatório para acessar o Novo Continente (Kanto). Captura desabilitada nessa luta.',
    ],
  },
  {
    version: '1.9',
    date: '2026-08-04',
    title: 'World Building: um bioma por tipo elemental',
    highlights: [
      'Cada um dos 17 tipos elementais reais do jogo agora tem seu próprio bioma tematico (Floresta, Bosque, Costa, Cavernas, Fabrica, Ruinas Ancestrais, etc.).',
      'Corrigido bug sério: espécies de certos tipos (ex. Dragão) podiam sumir por completo do jogo por não caber em nenhuma hunt.',
      'Todo Pokemon do elenco agora tem garantidamente um local de captura correspondente ao seu tipo e nível.',
    ],
  },
  {
    version: '1.8',
    date: '2026-08-04',
    title: 'Hunts BOSS de lendários corrigidas + evolução especial completa',
    highlights: [
      'Corrigido bug que fazia as 11 hunts BOSS de lendários (Modo Pesadelo) desaparecerem silenciosamente.',
      'Evolução via Level 80 + Stones agora cobre as 9 cadeias reais de evolução por troca/hold-item (Kadabra, Machoke, Graveler, Haunter, Onix, Scyther, Seadra, Poliwhirl, Porygon).',
      'Taxa de drop de Stones elevada de 5% para 20% por abate.',
    ],
  },
  {
    version: '1.7',
    date: '2026-08-04',
    title: 'Evolução especial e drop universal de Stones',
    highlights: [
      'Novo item "Pedra": 17 variantes elementais, uma por tipo, obtidas dropando de qualquer POKE derrotado.',
      'Evoluções que antes exigiam troca (Kadabra -> Alakazam, etc.) agora evoluem no Level 80 usando 20 Stones do tipo primario.',
    ],
  },
  {
    version: '1.6',
    date: '2026-08-04',
    title: 'Correções de mochila, filtros de IV e busca de hunts',
    highlights: [
      'Corrigido um POKE com dado invalido cortando a lista inteira da mochila.',
      'Corrigido filtro de IV mínimo/máximo invertido na Loja.',
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
      'Venda de POKEs shiny na Loja agora exige confirmação antes de concluir.',
    ],
  },
  {
    version: '1.4',
    date: '2026-08-04',
    title: 'Regras de auto-catch por espécie',
    highlights: [
      'Auto-catch agora permite escolher uma bola dedicada por espécie dentro da hunt atual.',
      'Regras por espécie tem prioridade sobre a bola padrão e a bola de shiny.',
    ],
  },
  {
    version: '1.3',
    date: '2026-08-04',
    title: 'Ataque básico tipado e penalidade de morte',
    highlights: [
      'O golpe básico (fallback de todo POKE) agora usa o tipo elemental real da espécie em vez de genérico.',
      'Desmaiar em combate agora custa uma pequena porcentagem do EXP do nível atual.',
    ],
  },
  {
    version: '1.2',
    date: '2026-08-04',
    title: 'Novo Continente (Kanto) e reformulacao de hunts por bioma',
    highlights: [
      'Adicionado um segundo continente (Kanto) com suas próprias zonas de caça.',
      'Hunts de Johto reagrupadas em bandas tematicas por bioma.',
    ],
  },
  {
    version: '1.0',
    date: '2026-08-04',
    title: 'Lancamento',
    highlights: [
      'Primeira versão publicada do NOVO POKE IDLE: captura, batalha automática, EXP/nível, Hospital, Hunts, Loja e automações (auto-pot/auto-catch/auto-revive).',
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
