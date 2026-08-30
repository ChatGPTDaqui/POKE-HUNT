import { type GameStateData, type PlayerSnapshot, type OfflineSimSummary, type SalaAtiva, type ClimaTipo, type ProtetorPendente } from '#engine';
import { type Config } from './db.js';
import { type ResultadoPiso } from './farmOffline.js';
import { type LinhaEntrega } from './entregas.js';
export declare const MAX_SEGUNDOS_POR_FLUSH: number;
/**
 * Janela minima que vale a pena SIMULAR, em segundos (PH-278).
 *
 * O servidor nao guarda posicao: a cada flush ele reconstroi o mundo com
 * `buildMapWorld`, o POKE volta pro ponto de entrada e os inimigos sao
 * recriados. Isso cobra uma RAMPA por janela — o tempo ate o primeiro abate —
 * paga em TODA janela, e nao uma vez por hunt.
 *
 * A rampa TEM uma compensacao, e ignora-la foi o erro da primeira leitura desta
 * issue: a janela nova nasce com o campo cheio, sem pagar o `respawnDelay` que
 * uma simulacao continua pagaria. Medido em
 * scripts/harness/custo-fixo-por-janela.mjs (8 sementes, 900s de mata_faixa1,
 * saldo de abates contra uma janela unica de 900s):
 *
 *   janela   lure off   lure 2    lure 4
 *      3s     -71,3%    -67,9%    -93,7%
 *      5s     -40,6%    -39,6%    -42,6%
 *      8s     +12,7%     +8,1%     -3,7%
 *     10s     +11,4%    +12,6%    +26,7%
 *     30s     +17,2%    +19,2%    +18,3%
 *
 * Ou seja: de 10s pra cima a compensacao vence e o servidor rende MAIS que a
 * simulacao continua — nao ha o que corrigir ali, e a hipotese original da issue
 * ("o rendimento por janela continua abaixo do que deveria") nao se sustenta na
 * janela de 30s de hoje. Abaixo de 10s o quadro vira, e vira forte. O ponto de
 * virada mais tardio e o do lure com 4 (ainda negativo em 8s), e este piso fica
 * logo depois dele.
 *
 * POR QUE ISSO ACONTECE NA PRATICA: TODO request do jogador passa por um flush
 * obrigatorio. Comprar, vender, mexer no auto, abrir o Mercado — cada um encerra
 * a janela em andamento. Uma rajada de cliques nao produz "varias janelas
 * normais": produz varias janelas de 2-5s seguidas, cada uma rendendo perto de
 * zero. Era o jogador MAIS ativo que pagava.
 *
 * O QUE O PISO FAZ: abaixo dele o flush nao simula E NAO MOVE A ANCORA
 * (`last_flush_at` fica onde estava), entao o tempo NAO e descartado — acumula
 * pro proximo flush, que ai simula uma janela util. E o oposto deliberado da
 * regra do teto de 6h e do farm pausado, que descartam: la o descarte impede
 * sacar semanas de uma vez, aqui o descarte roubaria segundos de quem esta
 * jogando agora.
 *
 * O claim atomico do intervalo perde o efeito nesses flushes (dois concorrentes
 * passam pelo filtro `last_flush_at=eq.<lido>`), e isso e seguro porque a classe
 * de bug que o claim existe pra impedir — o MESMO POKE capturado duas vezes — so
 * acontece se a janela simular alguma coisa. Com `segundos = 0` nao ha sorteio,
 * nao ha captura, nao ha linha nova. A escrita segue serializada pelo CAS de
 * `gravarEstado` e pelo `flushing_since`.
 *
 * NAO se aplica quando a sessao esta FECHANDO (`ignorarPiso`): ali nao existe
 * "proximo flush" pra herdar o tempo acumulado, e represar viraria descarte.
 */
export declare const PISO_DE_JANELA_SEGUNDOS = 10;
/**
 * FARM OFFLINE PAUSADO — chave temporaria, ligada a pedido do usuario.
 *
 * Com `true`, o intervalo que caracteriza AUSENCIA (acima de
 * LIMIAR_OFFLINE_SEGUNDOS) deixa de ser simulado: o jogador que volta depois de
 * horas fora nao recebe nada por esse tempo. Jogo AO VIVO nao e afetado — os
 * flushes de 30 em 30 segundos continuam creditando normalmente, porque ficam
 * abaixo do limiar.
 *
 * O TEMPO PARADO E DESCARTADO, nao acumulado. `last_flush_at` continua avancando
 * pra agora no claim, entao retomar nao paga uma divida represada. E a mesma
 * regra que este arquivo ja aplica ao teto de 6h logo acima ("creditar depois
 * daria ao jogador o direito de acumular semanas paradas e sacar tudo de uma
 * vez") — e, na pratica, evita que religar o farm despeje 6 horas de recompensa
 * na conta de todo mundo no mesmo instante.
 *
 * A pausa vive NO SERVIDOR porque e ele quem simula: desde a Fase D o cliente
 * so pede o resumo (ver useOfflineFarmOnBoot). Uma chave no cliente nao pausaria
 * nada — so esconderia o relatorio de um farm que aconteceu.
 *
 * PARA RETOMAR: trocar para `false` e republicar a Edge Function
 * (`npm run edge:publicar`). Nao basta mergear — o deploy dela e manual.
 */
export declare const FARM_OFFLINE_PAUSADO = true;
export interface LinhaSessao {
    id: string;
    user_id: string;
    map_id: string;
    poke_uid: string;
    seed: number | string;
    rng_state: number | string;
    rng_draws: number | string;
    last_flush_at: string;
    simulated_seconds: number | string;
    closed_at: string | null;
    flushing_since: string | null;
    sequence_index: number | string;
    sequence_cleared: boolean;
    sala_indice: number | string;
    sala_chave: string | null;
    sala_abates: number | string;
    ciclos: number | string;
    sala_protetor?: LinhaSalaProtetor | null;
}
/** PH-241: espelha as colunas de `sala_protetor` (uma linha por sessao, no maximo). */
export interface LinhaSalaProtetor {
    session_id: string;
    uid: string;
    species_id: string;
    encounter_id: string;
    level: number | string;
    iv_hp: number | string;
    iv_atk_fis: number | string;
    iv_atk_esp: number | string;
    iv_def: number | string;
    iv_def_esp: number | string;
    iv_speed: number | string;
    rarity: string;
    is_shiny: boolean;
    nature: string | null;
    trait: string | null;
    hp_atual: number | string;
    tipo: string;
}
/**
 * PH-217/236/241: reconstroi o `ProtetorPendente` da linha da sessao (via
 * `sala_protetor` embutido) pra passar ao `buildMapWorld`, ou `null` quando
 * nao ha protetor pendente.
 *
 * Le o que `payloadDoProtetor` (abaixo) monta e `gravar_flush_de_sessao`
 * grava — mas NAO e round-trip simetrico: a RPC recebe jsonb camelCase
 * (`payloadDoProtetor`) e devolve colunas relacionais snake_case
 * (`LinhaSalaProtetor`, via `sala_protetor` embutido), porque uma vira
 * INSERT/UPDATE e a outra e SELECT de volta. Os `Number()` cobrem o
 * PostgREST devolver `numeric`/`int8` como string, igual ao resto de
 * `LinhaSessao`.
 */
export declare function protetorDaLinha(s: LinhaSessao): ProtetorPendente | null;
/**
 * PH-241: monta o payload jsonb de `p_protetor` pra `gravar_flush_de_sessao`
 * — `null` quando nao ha protetor (a funcao Postgres DELETA a linha de
 * `sala_protetor` nesse caso). `tipo` (Guardian/Lord) nao vem de
 * `ProtetorPendente` — precisa ser resolvido a parte por quem chama
 * (`protetorDaSala(world.sala)`, ver `simularSessao`), porque o motor nunca
 * guardou o proprio tipo no objeto persistido.
 */
export declare function payloadDoProtetor(bp: ProtetorPendente | null, tipo: string | null): Record<string, unknown> | null;
/**
 * Segura o request enquanto um flush do MESMO jogador ainda esta escrevendo.
 *
 * O CAS de `gravarEstado` (playerUpdatedAt) impede sobrescrita SILENCIOSA —
 * mas nao impede DESCARTE: `aplicarFlush` avanca `last_flush_at` no claim,
 * ANTES de simular, e so grava no fim. Se o CAS final perder a corrida (outro
 * request escreveu `players` no meio da simulacao), a excecao 409 propaga e a
 * simulacao inteira — ouro, XP, capturas de um intervalo real — e jogada fora
 * SEM que `last_flush_at` volte atras, entao aquele tempo nao credita em
 * flush nenhum. Esperar em vez de correr evita perder o trabalho: quem chega
 * depois so precisa ler o resultado do flush que ja estava terminando.
 */
export declare function aguardarFlushEmAndamento(cfg: Config, userId: string): Promise<void>;
/**
 * Estado carregado com a lista de POKEs que EXISTIAM no momento da leitura.
 *
 * O conjunto de ids nao e detalhe de implementacao: e o que permite `gravarEstado`
 * distinguir "este POKE sumiu do estado, apague a linha" de "esta linha nasceu
 * DEPOIS que eu li, nao e minha pra apagar". Sem isso, um snapshot velho apaga o
 * POKE que outro request acabou de comprar (ver o cabecalho de `gravarEstado`).
 */
export interface EstadoParaEscrita {
    estado: GameStateData;
    pokeIdsNoLoad: Set<string>;
    /**
     * As entregas do Mercado reivindicadas por ESTE request.
     *
     * Ficam expostas porque o claim e irreversivel do ponto de vista do banco: a
     * linha ja esta carimbada. Se a operacao abortar antes de gravar, elas TEM que
     * voltar pra fila — ver `devolverEntregas`. Quem usa `comEstadoParaEscrita`
     * ganha isso de graca.
     */
    entregas: LinhaEntrega[];
    /**
     * `players.updated_at` no momento desta leitura — CAS obrigatorio na
     * escrita final de `gravarEstado` (PH-5). Sem isso, duas acoes concorrentes
     * do mesmo jogador (duas abas, duplo clique, comprar+evoluir quase juntos)
     * leem o mesmo snapshot e a escrita que terminar por ultimo sobrescreve em
     * silencio o efeito da outra.
     */
    playerUpdatedAt: string;
    /**
     * Se a mochila veio junto (ver `OpcoesDeLeitura`).
     *
     * `false` significa que `estado.bagPokes` NAO e a mochila do jogador: e so o
     * que esta janela adicionou a ela. Quem for mandar esse estado pro cliente
     * tem que avisar que ele e PARCIAL — senao o cliente troca a mochila inteira
     * por essa lista curta.
     */
    bagCarregada: boolean;
    /**
     * Se a Pokedex veio junto (PH-186). Mesma ideia de `bagCarregada`, e pelo
     * mesmo motivo: ela e a maior leitura recorrente do jogo depois da mochila.
     *
     * `false` significa que `estado.pokedexKills` NAO e a Pokedex do jogador: sao
     * so os abates DESTA janela. Duas consequencias obrigatorias em `gravarEstado`:
     *
     *  - o diff de REMOCAO fica desligado (ele apagaria toda especie ausente do
     *    estado, ou seja, a colecao inteira);
     *  - a gravacao SOMA sobre o valor do banco em vez de sobrescrever (senao um
     *    POKE com 400 abates viraria 3).
     *
     * E quem mandar esse estado pro cliente tem que avisar que e parcial — igual
     * a mochila.
     */
    dexCarregada: boolean;
    /**
     * As LINHAS CRUAS que este snapshot leu, guardadas pra `gravarEstado` poder
     * gravar so o que mudou.
     *
     * Sem baseline, todo flush reescrevia o conjunto inteiro: as linhas do time em
     * `pokemon_instances`, TODOS os itens, TODA a Pokedex e TODAS as regras de
     * auto-captura — 120 vezes por hora por jogador, mesmo numa janela em que o
     * jogador nao matou nada. E cada tabela dessas custa dois round-trips (o
     * select do diff de remocao e o upsert), o que fazia um flush parado custar o
     * mesmo que um flush cheio de abates.
     *
     * Guardado como linha, e nao como `PokeInstance`: `rowToPoke` recalcula campo
     * derivado na leitura (`unlockedAbilities`, `stats`) e e justamente esse
     * recalculo que atualiza a coluna quando o catalogo muda. Comparar objeto de
     * jogo congelaria essa atualizacao; comparar a linha ja mapeada nao.
     */
    linhasNoLoad: PlayerSnapshot;
}
/**
 * Opcoes de leitura do snapshot.
 *
 * `comBag: false` e o que separa um flush de ~35 KB de um flush de MEGABYTES.
 *
 * O snapshot completo le `pokemon_instances` INTEIRA do jogador — inclusive a
 * mochila, que so cresce (auto-catch despeja tudo la e nada sai sozinho). Medido
 * em producao em 2026-08-17: uma conta com 5035 POKEs custava 3,23 MB POR
 * LEITURA, e o flush le a cada 30s (ou a cada 5s, quando `commitAgora` dispara
 * por level-up). Um unico jogador ativo queimava ~2 GB/h de egress; tres
 * jogadores estouraram 10x a cota do plano.
 *
 * A simulacao de hunt NAO precisa da mochila: o unico caminho que a toca durante
 * um flush e `addCapturedPoke`, que so faz `push`. Vender/soltar/mover POKE sao
 * RPC (`acoesRpc`/`mercadoRpc`), nao passam por aqui. Entao, no modo parcial:
 *
 *  - le so `location=eq.team` (5 linhas em vez de 5 mil);
 *  - `estado.bagPokes` comeca VAZIO e termina contendo apenas as capturas desta
 *    janela — que e exatamente o conjunto que precisa ser gravado;
 *  - `pokeIdsNoLoad` fica com os ids do time, entao o diff de remocao de
 *    `gravarEstado` nao alcanca (nem pode apagar) nenhuma linha da mochila.
 *
 * Quem PRECISA da mochila inteira: `/estado` (o cliente monta a tela da Mochila
 * com ela) e qualquer caminho que va decidir algo olhando POKE guardado.
 */
export interface OpcoesDeLeitura {
    comBag?: boolean;
    /**
     * `comDex: false` tira a Pokedex do snapshot (PH-186).
     *
     * Mesma familia do `comBag`, e a segunda maior leitura recorrente do jogo:
     * `player_pokedex` era relida INTEIRA a cada flush — 21.126 leituras contra
     * 12.713 flushes em 24h, medido no log de producao em 26/08, e sozinha
     * respondia por praticamente todo o egress de PostgREST do projeto.
     *
     * Vale porque a simulacao NAO precisa dos totais: `recordPokedexKill` so
     * acumula, e quem le contagem (`pokedexKillCount`) e tela, nao motor. O que a
     * gravacao precisa saber — o total anterior das especies que MUDARAM — e lido
     * na hora de gravar, e sao 2 a 5 especies por janela em vez de centenas.
     *
     * Quem PRECISA da Pokedex inteira: `/estado` (o cliente monta a tela com ela)
     * e qualquer caminho que va decidir algo olhando contagem de abate.
     */
    comDex?: boolean;
}
export declare const COLUNAS_ITENS = "user_id,item_id,quantity,locked";
export declare const COLUNAS_POKEDEX = "user_id,species_id,normal_kills,shiny_kills";
export declare const COLUNAS_AUTO_CATCH = "user_id,species_id,ball_item_id";
export declare function lerSnapshot(cfg: Config, userId: string, opcoes?: OpcoesDeLeitura): Promise<EstadoParaEscrita>;
export declare function carregarEstado(cfg: Config, userId: string, opcoes?: OpcoesDeLeitura): Promise<GameStateData>;
/**
 * Como `carregarEstado`, mas tambem REIVINDICA as entregas pendentes do
 * Mercado e as soma ao estado devolvido.
 *
 * So pode ser usada por quem VAI GRAVAR o estado em seguida: a reivindicacao
 * carimba a linha como entregue, entao um caminho que carregue e nao grave
 * perderia o credito. Por isso `/sessao/abrir` (que so valida a intencao)
 * continua usando `carregarEstado` cru.
 */
export declare function carregarEstadoParaEscrita(cfg: Config, userId: string, opcoes?: OpcoesDeLeitura): Promise<EstadoParaEscrita>;
/**
 * Carrega o estado pra escrita, roda `fn`, e DEVOLVE as entregas se `fn` abortar.
 *
 * Este embrulho existe porque a versao "carregue e lembre de tratar o erro" ja
 * falhou na pratica em TODOS os call sites de uma vez: nenhum tinha try/catch, e
 * qualquer 409 (o erro mais comum do jogo — ouro insuficiente, item travado,
 * POKE indisponivel) apagava o que o jogador tinha recebido no Mercado. Com o
 * embrulho, esquecer o tratamento deixa de ser possivel: quem carrega, carrega
 * por aqui.
 */
export declare function comEstadoParaEscrita<T>(cfg: Config, userId: string, fn: (ctx: EstadoParaEscrita) => Promise<T>, opcoes?: {
    esperarFlush?: boolean;
} & OpcoesDeLeitura): Promise<T>;
/**
 * Grava o snapshot do jogador nas cinco tabelas.
 *
 * `pokeIdsNoLoad` (os ids que existiam quando ESTE estado foi lido) e o que
 * impede um snapshot velho de destruir POKE que mudou de dono no meio do
 * caminho. Duas regras, e as duas vieram de bug real de duplicacao/sumico:
 *
 *  - So APAGA linha que este snapshot conhecia. Uma linha criada depois da
 *    leitura (o POKE que o jogador acabou de comprar no Mercado, num request
 *    paralelo) nao esta no conjunto — antes ela caia no diff de remocao e o
 *    comprador pagava por um POKE que sumia.
 *  - So GRAVA linha que AINDA e deste jogador e ainda esta em team/bag. Sem
 *    isso, o upsert (que escreve `user_id` e `location` a partir do estado em
 *    memoria) ressuscitava o POKE recem-anunciado de volta pra mochila — com o
 *    anuncio ainda de pe, ou seja, o mesmo POKE em dois lugares — e revertia
 *    pro vendedor um POKE que o comprador ja tinha pago.
 */
export declare const CONFLITO_ESCRITA_JOGADOR = "outro comando em andamento \u2014 tente de novo";
export declare function gravarEstado(cfg: Config, userId: string, estado: GameStateData, pokeIdsNoLoad: Set<string>, playerUpdatedAtEsperado: string, 
/**
 * As linhas que a leitura viu (`EstadoParaEscrita.linhasNoLoad`). Ausente =
 * sem baseline, e ai o comportamento e o de sempre: reescreve tudo.
 */
linhasNoLoad?: PlayerSnapshot, 
/**
 * `EstadoParaEscrita.dexCarregada` (PH-186). Ausente = `true`, o comportamento
 * de sempre — chamador que nao sabe da Pokedex parcial nunca cai no caminho
 * novo por acidente.
 */
dexCarregada?: boolean): Promise<void>;
export interface ResultadoFlush {
    segundosCreditados: number;
    truncado: boolean;
    resumo: OfflineSimSummary;
    /**
     * O estado do jogador depois da janela — PARCIAL: `bagPokes` traz so o que
     * esta janela capturou, nao a mochila inteira (ver `OpcoesDeLeitura`). Quem
     * responde ao cliente tem que marcar `estadoParcial: true` junto.
     */
    estado: GameStateData;
    piso: ResultadoPiso;
    /** Sala em que a hunt parou. Nulo nas hunts sem salas. */
    sala: SalaAtiva | null;
    /**
     * O clima de AMBIENTE da sala acima (PH-140) — o do LUGAR, nunca o de golpe.
     *
     * O cliente nao tem como derivar: a semente da sessao nao sai daqui. Sem
     * este campo ele mostraria um clima e o servidor cobraria o dano de outro.
     */
    clima: ClimaTipo | null;
    /**
     * A cacada acabou sozinha e a sessao TEM que ser fechada pelo chamador.
     *
     * Hoje so ha um motivo: o POKE desmaiou e nao ha como reanima-lo (auto-revive
     * desligado, sem Revive na mochila, ou hunt BOSS, onde reanimar e proibido).
     *
     * Existe porque uma sessao nesse estado nao "renderia menos" — ela rendia ZERO
     * e mesmo assim continuava consumindo o relogio: cada flush creditava o
     * intervalo inteiro, simulava 0,1 segundo (o primeiro passo ja encontra o POKE
     * caido) e devolvia nada. Medido: tres flushes seguidos de 6h creditaram 6h
     * cada e renderam 0 de ouro. O jogador ficava dias sem farmar nada sem
     * nenhum aviso, e nao havia caminho automatico de volta — o POKE so levanta
     * curando no Hospital.
     */
    encerrada: 'desmaio' | null;
    /**
     * PH-178: so relevante quando o chamador pediu `forcarAvancoDeSala`. `true`
     * significa que a sala travada em 30/30 foi trocada nesta chamada; `false`
     * quer dizer que, ao fim desta janela, a sala AINDA nao estava travada —
     * nao e erro (a quota pode fechar bem no meio do intervalo simulado, ou o
     * jogador clicou antes de qualquer abate contar), so nao havia o que
     * avancar. Sempre `false` quando `forcarAvancoDeSala` nao foi pedido.
     */
    avancoDeSalaAplicado: boolean;
}
/**
 * Outro request do mesmo jogador ja esta creditando este intervalo.
 *
 * Distinto de `null` (sessao insimulavel, tem que fechar): aqui nao ha nada
 * errado, so nao ha nada a fazer — quem perdeu a corrida nao simula, nao
 * carrega e NAO grava, pra nao sobrescrever o resultado de quem ganhou com um
 * estado lido antes dele.
 */
export declare const FLUSH_OCUPADO: "ocupado";
export type ResultadoFlushOuOcupado = ResultadoFlush | null | typeof FLUSH_OCUPADO;
/**
 * Roda `fn` de novo se ela falhar por CAUSA do CAS de `gravarEstado`
 * (`CONFLITO_ESCRITA_JOGADOR`) — nunca por qualquer outro motivo.
 *
 * Exportada em vez de inline pra ser testavel isolada: a logica "quais erros
 * merecem retry e quantas vezes" e exatamente o tipo de decisao que uma
 * mudanca futura (ex: alguem adicionando outro 409 no meio) pode inverter sem
 * querer, e o sintoma so aparece como "as vezes perde progresso", nao como
 * teste vermelho.
 */
export declare function comRetryDeColisao<T>(fn: () => Promise<T>): Promise<T>;
/**
 * O coracao da Fase D: simula do ultimo flush ate agora e grava.
 *
 * Repare no que NAO entra aqui: nada vindo do cliente. Nem quanto tempo passou
 * (sai de `now()` menos `last_flush_at`), nem quantos kills houve, nem quanto
 * ouro. O cliente so declarou, na abertura da sessao, em qual hunt esta.
 */
export declare function aplicarFlush(cfg: Config, userId: string, sessao: LinhaSessao, opcoes?: OpcoesDeLeitura & {
    forcarAvancoDeSala?: boolean;
    ignorarPiso?: boolean;
}): Promise<ResultadoFlushOuOcupado>;
