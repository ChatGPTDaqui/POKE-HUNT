# 04 — Autoridade do servidor

> Este documento descreve limiares e janelas anti-abuso. Ver a nota sobre
> publicação no [README](README.md#esta-pasta-não-é-publicada).

## O princípio

**O cliente manda intenção. Nunca resultado.**

O jogador declara "estou na hunt X com o POKE Y". O servidor simula o intervalo pelo
relógio **dele**, decide o que aconteceu e grava. A simulação local vira predição
cosmética, igual a client-side prediction de FPS.

Nenhuma ação aceita valor do cliente. Ele diz "quero comprar 5 poções"; o preço sai do
catálogo no servidor. Não existem ações `addGold`, `addItem` nem `setTrainer` — **ganho só
nasce de simulação**.

## Onde a autoridade mora

| Arquivo | Papel |
|---|---|
| `server/src/app.ts` | Roteamento, CORS, validação de intenção |
| `server/src/progresso.ts` | Carregar, simular, gravar. O coração |
| `server/src/acoes.ts` | Lista branca de 19 ações |
| `server/src/estadoDoJogador.ts` | Implementa `GameStateStore` sobre dados puros |
| `server/src/mercado.ts` | Negociação entre jogadores |
| `server/src/social.ts` | Chat, correio, amizades |
| `server/src/farmOffline.ts` | O piso do farm offline |
| `server/src/db.ts` | Cliente PostgREST com retry |
| `server/src/auth.ts` | Verificação de token |
| `server/src/reiniciar.ts` | O que `gravarEstado` não alcança |
| `server/src/node.ts` / `edge.ts` | Adaptadores de plataforma |

`server/src/estadoDoJogador.ts` implementa o tipo `GameStateStore` **inteiro** sobre
`GameStateData` puro. Esquecer um método quebra o type-check em vez de estourar no meio de
uma simulação de 6 horas em produção.

## A forma do serviço

`fetch(Request) => Response`, sem framework. Um Worker do Cloudflare **é** exatamente
`export default { fetch }`, e o Node 22 tem `Request`/`Response` nativos: o mesmo arquivo
roda nos dois. `node.ts` (adaptador `node:http`) e `supabase/functions/jogo/index.ts` (casca
Deno) são os únicos com código de plataforma.

Isso manteve a escolha de hospedagem aberta de graça enquanto ela estava indefinida.

**A conclusão inicial de que Edge Function não serviria estava errada.** O limite de 2s de
CPU por invocação é real; a conclusão foi tirada antes de haver número. Medido: 30 min de
jogo em 26ms, e o pior caso (6h, teto do farm offline) em ~1,6s de ida e volta incluindo
rede, com 21.594s creditados e 8.550 abates. Cabe.

Hoje o serviço roda como Edge Function do Supabase (`supabase/functions/jogo/`).
`vite.edge.config.ts` empacota **motor + serviço num arquivo só** (~240kB gzip) — necessário
porque o servidor usa `#engine` (subpath import do Node) e especificadores `.js` apontando
para `.ts`, e o resolvedor do Deno não aceita nenhum dos dois.

## Rotas

| Rota | Método | O que faz |
|---|---|---|
| `/saude` | GET | Ping, sem autenticação |
| `/estado` | GET | Carrega o progresso. **Grava** se houver entrega pendente |
| `/sessao/abrir` | POST | Valida a intenção, gera a semente, abre a sessão |
| `/sessao/flush` | POST | Simula do último flush até agora e grava |
| `/sessao/fechar` | POST | Flush final + fecha, devolvendo o resumo |
| `/acao` | POST | Uma ação da lista branca |
| `/mercado/*` | GET, POST | 11 rotas de negociação |
| `/chat`, `/correio/*` | GET, POST | 6 rotas sociais |
| `/perfil` | GET | Dados do próprio jogador |
| `/ranking/*` | GET | Treinadores, pokémon, hall da fama |

Toda rota exceto `/saude` exige jogador autenticado.

**`/estado` é um GET que grava, de propósito.** É o único caminho por onde um jogador que só
abriu o jogo — sem entrar em hunt nem comprar nada — recebe o que vendeu enquanto estava
fora. `carregarEstadoParaEscrita` carimba a entrega como aplicada, então a gravação não é
opcional. Mas ele **só grava quando há entrega**: sem isso, ele regravava um snapshot
idêntico ao que acabou de ler, e essa escrita inútil chegava depois de um flush ainda em
andamento e o desfazia.

## Autenticação

Pergunta ao Supabase (`GET /auth/v1/user`); não decodifica JWT localmente.

Custa uma ida de rede por request. É troca consciente: verificar em casa exige acertar
segredo, algoritmo, `aud`, `exp`, rotação e revogação — errar qualquer um é falha de
autenticação silenciosa. Se a latência incomodar, a saída é cache curto por token, não
verificação caseira.

## CORS

`ORIGENS_PERMITIDAS` é lista explícita. `*` com `Authorization` liberado deixaria qualquer
site do mundo chamar isto com o token do jogador.

Valor atual: `http://localhost:5173,http://localhost:4173,https://poke-hunt-euj.pages.dev`.

**O domínio de produção tem sufixo aleatório.** `poke-hunt.pages.dev` **não** é este jogo —
já pertencia a outro projeto, de outra conta, e hoje serve uma página sem relação nenhuma.
Sondar o nome óbvio devolve `200 OK` com HTML em todo caminho (inclusive
`/assets/....gif`, que volta `text/html`), parecendo um deploy quebrado deste jogo. Isso já
custou um diagnóstico errado e uma entrada de CORS apontada para o domínio de terceiro. O
nome real sai de `GET /accounts/{id}/pages/projects/poke-hunt`, campo `subdomain`.

## O ciclo de uma sessão de hunt

```
/sessao/abrir  →  valida intenção, gera semente, grava a sessão
      │
      │  a cada 30s (e em toda /acao, /mercado, visibilitychange, level-up)
      ▼
/sessao/flush  →  claim atômico do intervalo
                  ↓
                  reconstrói o mundo com buildMapWorld
                  ↓
                  retoma o RNG de rng_state
                  ↓
                  simula (pessimista se o intervalo > 120s)
                  ↓
                  grava o snapshot + o novo rng_state
      │
      ▼
/sessao/fechar →  flush final, devolve o resumo, limpa current_map_id
```

### Uma sessão aberta por vez

Índice único parcial `game_sessions_abertas` (migration `20260809180000`).

**Sem isso, era duplicação medida de ouro e POKE.** O índice antes não era único, e
`abrirSessao` só fechava a anterior — o que resolve o caso sequencial e nada em corrida. Com
duas sessões abertas, `sessaoAberta` lê `order=started_at.desc&limit=1` e flusha só a mais
recente; a órfã fica com `last_flush_at` congelado na abertura, e quando a recente fecha, o
próximo request credita **o mesmo período de novo**:

```
sessões abertas após clique duplo em "Entrar": 2
flush da sessão recente:  1779s | ouro 1000 → 5555 | POKEs 1 → 119
uma ação qualquer depois: ouro 5555 → 13660 | POKEs 119 → 179
>>> +8.105 de ouro e +60 POKEs do MESMO período
```

Colisão no índice não é erro para o jogador — a intenção dele foi atendida —, então
`abrirSessao` devolve a sessão vencedora em vez de um 502. A varredura de órfãs continua
como defesa em profundidade e conserto de dado legado.

### Claim atômico do intervalo

O cliente tem cinco gatilhos de flush: timer de 30s, toda `/acao`, toda rota de mercado,
`visibilitychange` e o commit forçado de level-up. Dois flushes do mesmo jogador simulando
o mesmo intervalo é o caso **normal** quando alguém clica em algo perto do tique dos 30s.

Ouro não denunciava, porque é gravado como valor **absoluto** — os dois flushes convergiam
para o mesmo total. Já uma **captura** cria linha nova com `uid` de `crypto.randomUUID()`,
que fica fora da sequência semeada: os dois flushes sorteavam o mesmo POKE e gravavam com
ids diferentes. Medido antes da correção:

| código | segundos por flush | capturas por resumo | linhas em `pokemon_instances` |
|---|---|---|---|
| antigo | 1200 ×6 | 66 ×6 | **396** |
| novo | 1177, 0, 0, 0, 0, 0 | 61, 0, 0, 0, 0, 0 | **61** |

O mecanismo é um `PATCH` com o valor lido no filtro:

```
game_sessions?id=eq.X&closed_at=is.null&last_flush_at=eq.<valor lido>
  → { last_flush_at: agora, flushing_since: agora }
```

Quem escreve primeiro leva o intervalo. O perdedor não encontra linha, recebe
`FLUSH_OCUPADO` e **não grava** — gravar seria sobrescrever o resultado do vencedor com um
estado lido antes dele.

**Custo assumido:** se a simulação estourar depois do claim, aquele intervalo se perde (a
âncora já avançou). Perder um intervalo é melhor que duplicar POKE, e o próximo flush segue
de onde este parou.

### A marca `flushing_since`

O claim serializa dois flushes. Ele **não** protege contra um request qualquer que leia o
estado durante a simulação e o grave segundos depois. E como `gravarEstado` reescreve o
snapshot **inteiro**, esse request grava um retrato de *antes* do flush — com o intervalo já
consumido pelo claim, o ouro e o XP daquele período não voltam em flush nenhum.

Medido antes da correção, com 10 minutos de caçada pendente:

| request concorrente | 30ms | 80ms | 130ms | 200ms | 300ms |
|---|---|---|---|---|---|
| `GET /estado` (página recarregando) | 0/6 | **3/6** | **4/6** | 0/6 | 0/6 |
| `POST /acao` (clique na Loja) | **2/6** | **5/6** | **1/6** | 0/6 | 0/6 |

Mais de 10.000 de ouro perdidos por lote de 6 tentativas. Os dois gatilhos são rotina:
recarregar a página (o `commitAgora()` do `visibilitychange` dispara o flush, a aba morre, o
servidor **continua simulando**, e a página nova pede `/estado` no meio disso) e clicar em
qualquer coisa perto do tique dos 30s.

`aguardarFlushEmAndamento` sonda a marca antes de todo caminho que lê para gravar:

| Constante | Valor | Por quê |
|---|---|---|
| `MARCA_DE_FLUSH_EXPIRA_MS` | 30.000 | Marca órfã (invocação morta pelo limite de CPU, deploy) faria todo request seguinte travar |
| `ESPERA_MAXIMA_POR_FLUSH_MS` | 2.500 | Estourar segue em frente: volta ao comportamento antigo (a corrida) em vez de travar a conta |
| `INTERVALO_DE_SONDAGEM_MS` | 120 | — |

**É espera, não erro.** O outro request não está fazendo nada de errado — vai terminar em
milissegundos, e a resposta certa é usar o resultado dele como ponto de partida. Devolver
409 trocaria uma perda rara por uma falha certa.

**A espera entra ANTES do claim, dentro do próprio `aplicarFlush`.** Colocá-la só no
`comEstadoParaEscrita` não bastava: `/acao` liquida a sessão antes de agir, lê a linha já
com `last_flush_at` novo, reivindica um intervalo de ~0 segundo legitimamente e — por ser um
flush — pulava a espera, indo ler o estado enquanto o primeiro ainda escrevia. Depois do
claim seria esperar pela própria marca.

### Estado do sorteio persistido entre janelas

Flush não é simulação contínua: é uma janela nova a cada ~30 segundos, cada uma montando o
mundo do zero com `buildMapWorld`. Logo, **o estado do sorteio precisa sobreviver entre
janelas** — `game_sessions.rng_state` e `rng_draws`, semeados de `seed` na abertura e
regravados no fim de todo flush.

Começou errado, e foi o bug mais grave da fase: `aplicarFlush` fazia `createRng(sessao.seed)`
por janela, com semente imutável. Toda janela repetia a **mesma sequência** — inimigos,
níveis, IVs, raridade, shiny. Seis janelas de 30s: idênticas, 9 abates, o mesmo
`spearow:1:comum` em cada uma. A sessão era um loop de 30 segundos, e o jogador só notava na
mochila ("várias cópias iguais do mesmo POKE"). Ouro e XP não denunciavam.

`seed` continua imutável de propósito (origem auditável da sessão); `rng_state` guarda onde
a sequência está. `restoreRng` torna a distinção explícita no tipo, em vez de um `createRng`
que parece certo em qualquer call site.

**A tentação errada aqui é "só não reconstruir o mundo".** Não adianta: o serviço é
serverless e não guarda estado entre requests por design — o mundo *vai* ser reconstruído.
O que precisa sobreviver é a sequência.

Efeito colateral aceito e não corrigido: reconstruir o mundo devolve o jogador ao spawn e
respawna os inimigos a cada janela, então o tempo até o primeiro inimigo é pago toda vez.
Medido, é pequeno (~10 abates por 30s tanto em janelas quanto em simulação contínua de 1h),
mas passa a morder se o intervalo de flush cair muito.

### O tempo descartado não é devolvido

`MAX_SEGUNDOS_POR_FLUSH` = 6 horas. `last_flush_at` avança para **agora**, não para
`desde + creditado`: o tempo cortado pelo teto foi tempo real que passou, e creditá-lo daria
ao jogador o direito de acumular semanas paradas e sacar tudo de uma vez.

Intervalo negativo (relógio para trás — resync de NTP, dual boot, save de máquina
adiantada) credita zero e só reancora.

### Quando a sessão morre

`aplicarFlush` devolve `null` — e o chamador **fecha a sessão e limpa `current_map_id`** —
em três casos:

1. O POKE da sessão não existe mais (conta reiniciada, POKE vendido, POKE anunciado).
2. A hunt da sessão não existe mais (rebalanceamento recortou o pool, sync renomeou).
3. O POKE caiu sem como levantar (`resumo.stoppedEarly`) — ver [07](07-farm-offline.md).

**Nos dois primeiros isso já foi um 409, e travava a conta inteira.** Como toda rota passa
por um flush obrigatório, uma sessão nesse estado derrubava todo request — nem escolher um
novo inicial funcionava depois de "Iniciar novo jogo". O caminho realmente alcançável é
tirar da equipe o POKE que está caçando: a linha sobrevive (`location='bag'`), não há
cascade, e a sessão fica apontando para um POKE fora da equipe.

## Gravação de estado

`gravarEstado(cfg, userId, estado, pokeIdsNoLoad)` escreve o snapshot nas cinco tabelas:
`players`, `pokemon_instances`, `player_items`, `player_pokedex`,
`player_auto_catch_rules`.

### As cinco tabelas precisam de diff de remoção — e três não tinham

Bugs reais, cada um com sintoma próprio:

- **`player_items` sem diff de remoção** (crítico): item chegando a 0, `removeItem` apagava
  a chave de `estado.items`, e a linha nunca era reescrita **nem apagada** — o banco mantinha
  o valor velho. Efeito: as 20 Stones gastas numa evolução especial voltavam no reload,
  dando evoluções especiais infinitas com um lote. Poção e bola zeradas ressuscitavam.
- **`player_pokedex` sem diff de remoção** (crítico): o reset apagava POKEs e itens, mas a
  Pokedex sobrevivia inteira — a conta "zerada" voltava com todos os abates.
- **`player_auto_catch_rules` nunca era gravada.** `carregarEstado` a lia,
  `gameStateToAutoCatchRuleRows` existia **sem nenhum call site**. A regra "capturar Dratini
  com Ultra Ball" valia para o request corrente e sumia no próximo load — e sobrevivia a um
  reset. Corrigida primeiro como delete-tudo + insert, o que causou um segundo bug (ver
  abaixo), e depois com o mesmo diff das outras.

`gameStateToItemRows` preserva item travado com quantidade 0, para que uma trava com saldo
zero sobreviva.

### `pokeIdsNoLoad`: só apaga o que este snapshot conhecia

O snapshot é gravado inteiro. Um request que carregou o estado **antes** de uma
transferência gravaria por cima dela:

- `anunciarPoke` move o POKE para `location='market'`. Um flush concorrente, com o POKE
  ainda na mochila em memória, gravava `location='bag'` — o mesmo POKE em dois lugares, com
  as duas pontas vendáveis.
- `comprarAnuncio` troca o `user_id`. Um flush concorrente do vendedor reescrevia o
  `user_id` de volta (o comprador pagava e perdia o POKE); um flush do comprador via a linha
  nova "sobrando" no diff e a **apagava**.

Duas regras saem disso:

1. **Só apaga linha que este snapshot conhecia.** Linha criada depois da leitura nunca entra
   no diff.
2. **Só grava linha que ainda é deste jogador e ainda está em `team`/`bag`**, conferido numa
   única leitura de `id, user_id, location`. Linha sem par no banco é POKE novo (captura,
   inicial, compra) e passa.

O filtro `location=in.(team,bag)` continua valendo, agora por id — necessário porque o POKE
anunciado (`location='market'`) não está no snapshot do jogador e seria removido no primeiro
flush depois de anunciar.

### Delete-tudo + insert numa tabela com UNIQUE é corrida garantida

`player_auto_catch_rules` tem `UNIQUE (user_id, species_id)`. Reescrevê-la apagando tudo e
inserindo de novo faz dois requests do mesmo jogador intercalarem
DELETE/DELETE/INSERT/INSERT, e o segundo INSERT viola a constraint. Medido com 8 regras
configuradas: **33 de 48** `GET /estado` concorrentes voltaram 502.

E como `getItem` do save é justamente `GET /estado`, isso virava a tela **"Não foi possível
carregar seu progresso — falha ao falar com o banco"**. Era o erro relatado ao apertar
Ctrl+Shift+R.

A premissa antiga ("a lista é pequena e não tem chave estável") estava errada: a chave
estável existe e é a própria constraint.

## Entregas do mercado: um request recusado apagava o que o jogador recebeu

`carregarEstadoParaEscrita` reivindica as entregas pendentes (`market_deliveries`) e as soma
ao estado **antes** de a operação rodar. O claim carimba a linha; quem grava é o
`gravarEstado` no fim.

Só que uma ação **recusada** lança `ErroHttp` e nunca chega lá. Recusa é o caminho mais
comum do jogo: "Ouro insuficiente", item travado, POKE indisponível.

```
entregas pendentes: 1 (500 de ouro)
ação recusada: 409 (Ouro insuficiente.)
pendentes: 0 | já reivindicadas: 1
ouro após GET /estado: 1000   ← os 500 nunca chegaram
```

Vendeu no mercado, tentou comprar algo caro demais, perdeu a venda. Sem erro, sem log.

A correção não foi "lembrar de tratar o erro" — a versão sem embrulho falhou em **todos** os
8 call sites de uma vez, nenhum tinha `try/catch`. `comEstadoParaEscrita(cfg, userId, fn)`
carrega, roda e devolve as entregas se `fn` abortar. `aplicarFlush` também devolve quando
sai por `null`, que é saída sem exceção e o `catch` não cobriria.

## As 19 ações da lista branca

`server/src/acoes.ts`. `aplicarAcao` é **síncrona e pura** sobre a store do jogador — é isso
que faz o arquivo ser auditável.

| Grupo | Ações |
|---|---|
| Início | `escolherStarter`, `definirNomeDoTreinador`, `reiniciarJogo` |
| Economia | `comprarItem`, `venderItem`, `venderTodosItens`, `venderPoke`, `venderPokes` |
| POKE | `usarItem`, `curarEquipe`, `evoluirPoke`, `definirAtivo`, `tirarDaEquipe`, `porNaEquipe` |
| Mundo | `desbloquearHunt` |
| Preferência | `alternarTravaItem`, `alternarTravaPoke`, `alternarHabilidade`, `configurarAuto` |

**Uma ação por request de propósito.** Em lote, uma ação inválida no meio deixaria o cliente
sem saber quais das outras foram aplicadas — e o cliente sobrescreve o estado local com a
resposta, então ambiguidade ali vira dessincronização.

**Se há sessão de hunt aberta, ela é liquidada ANTES da ação.** Sem isso, vender o POKE que
está caçando (ou usar a última poção) mudaria o estado sob os pés de uma simulação ainda não
creditada.

O mercado tem rotas próprias, não entradas nesta lista, porque toda operação de mercado é
assíncrona e toca linhas de **outro** jogador. Enfiar I/O em `aplicarAcao` quebraria a
garantia de pureza.

### Validações que só existem no servidor

- **`escolherStarter`** tem lista branca explícita. Sem ela, "escolher inicial" viraria "me
  dá um Mewtwo nível 1 de graça".
- **`definirNomeDoTreinador`** só aceita com a conta sem nenhum POKE. Livre para trocar a
  qualquer hora, o nick viraria um jeito barato de se desassociar do próprio histórico
  social (chat, ranking, `original_trainer`). Regras: 3 a 16 caracteres, `[A-Za-z0-9_]`.
- **A unicidade do nick é checada em `app.ts`, não na ação** — é pergunta de banco, e
  `aplicarAcao` é síncrona. Sem a checagem, um nome repetido só estouraria no índice único e
  voltaria como 502 "falha ao falar com o banco": erro de servidor para um erro de jogador.
- **A checagem usa RPC, não `ilike`.** `_` é caractere válido de nick **e** curinga de uma
  letra em LIKE: `trainer_name=ilike.ash_1` casaria com `ashX1` de outra pessoa. Mesmo
  problema já explorado na busca de amigo — `{"nick":"%"}` mandava pedido de amizade para um
  jogador arbitrário e permitia enumerar a base.
- **`configurarAuto`** era o único ponto que persistia um objeto do cliente sem validação.
  Medido: **5.000 regras de poção aceitas e gravadas**, e `{itemId: 42, hpPercent: "abc"}`
  também. Não é só sujeira: `updateAutoHeal` percorre as regras a cada tique, e uma
  simulação de 6h faz ~216 mil tiques. Milhares de regras viram bilhões de iterações, a Edge
  Function bate no teto de 2s de CPU e o request morre — e **com o claim atômico, morrer no
  meio custa o intervalo**. Dava para travar a própria conta. Hoje: `MAX_REGRAS_AUTO` = 20 +
  validação de tipo e faixa.
- **O critério do ranking de POKE** vira nome de coluna numa URL do PostgREST, então passa
  por lista branca (`COLUNA_POR_CRITERIO`). Interpolar o que o cliente mandou seria injeção
  de query.
- **`MAX_TEAM_SIZE` é exportado do motor** e usado nos dois lados. Antes só o cliente tinha
  a guarda, e o que segurava no servidor era a check `team_slot <= 5` do banco — que só
  estoura na hora de gravar, então o 7º POKE virava 502.

### Mensagens de recusa são traduzidas no servidor

`buyItem`/`sellItem`/`unlockMap` devolvem um **código** (`insufficient_gold`), não uma
frase. Como sob autoridade o cliente não executa a ação nem sabe o preço, ele só exibe a
mensagem que volta — então a tradução mora no servidor (`MENSAGEM_ERRO_ECONOMIA`). Antes o
chat mostrava literalmente "insufficient_gold".

## RLS: o cliente perdeu a escrita

Migration `20260807030000_cliente_perde_a_escrita`: `own rows all`
(select + insert + update + delete) virou **select apenas**, e a policy de update de
`players` foi removida. Escrita nas cinco tabelas de jogador só pela `service_role`.

**Consequência que é o ponto, não efeito colateral: o jogo parou de funcionar sem o
servidor.** O fallback local escrevia direto no Postgres e agora falha — era a brecha
fechada. Rodar exige `cd server && npm run dev` mais `VITE_SERVIDOR_URL`.

### Teste adversarial

Oito ataques com o token legítimo do próprio jogador — o que qualquer um tem com DevTools:
imprimir ouro e diamantes, criar Mewtwo Lv100 mythic, multiplicar itens, apagar o próprio
progresso, escrever na pokedex. **Todos falharam**; leitura funciona; a `service_role`
continua escrevendo.

**O caso que mais engana: DELETE bloqueado devolveu 204.** A RLS não rejeita — ela não acha
linha que case com a policy. Um teste que olhasse só o status code passaria com o banco
aberto. Todo caso afirma o **efeito no banco**.

## O interruptor `VITE_SERVIDOR_URL`

`src/data/remote/autoridade.ts` — `pedirAcao(acao, fallback)`:

- **Com servidor**: manda intenção e **sobrescreve o estado local com a resposta**.
- **Sem servidor**: roda `fallback` local.

Um caminho por tela. Ligar ou desligar autoridade não mexe em tela nenhuma.

`gameStatePersistence.ts` é **onde o cliente deixa de ser autoritativo**: sob servidor,
`setItem` faz early-return (não grava) e `getItem` lê do servidor. Sem esse return, o
autosave sobrescreveria o servidor — última escrita vence, pior que não ter servidor.

`pedirAcao` devolve `boolean`. Isso não é detalhe: `controller.enterMap` virou `async` e a
tela só fecha se a entrada foi aceita. Antes, `void abrirSessaoDeHunt(...)` trocava a cena
sem esperar — com recusa (hunt trancada, POKE fora da equipe, serviço fora do ar), o jogador
entrava, via combate, não ganhava nada, e não recebia aviso: a simulação local continua
desenhando. Só aparecia como "o jogo parou de dar ouro".

### Recusa é traduzida, e "sem resposta" não acusa a internet do jogador

`src/lib/erroDeRede.ts` centraliza a decisão. Todo `TypeError` de fetch virava "sem conexão
— verifique sua internet", e na tela de login vazava a string crua **"Failed to fetch"**.
Quem usa Pi-hole ou uBlock ia reiniciar o roteador.

O navegador **não conta ao JS** que o request foi bloqueado — proposital, senão a página
detectaria e chantagearia quem usa bloqueador. A única pista honesta é `navigator.onLine`:
aparelho dizendo que está online + nenhuma resposta = quase nunca é a internet. A frase cita
bloqueador, extensão de privacidade e filtro de DNS **como causa provável**, sem afirmar.

Módulo próprio porque os dois pontos que precisam disso não se conhecem: o login
(`authStore`, fala direto com o Supabase) e o cliente do serviço
(`data/remote/servidor.ts`).

**Verificado:** nenhuma URL do jogo casa com regra de EasyList, EasyPrivacy, EasyList
Portuguese ou uBlock Origin — 6.420 URLs testadas contra as regras de rede genéricas. Em
particular `/mercado/anuncio`, o suspeito óbvio, não é alcançado (as regras com "anuncio" da
EasyList Portuguese são cosméticas ou ancoradas em site específico). A rota **não** foi
renomeada: renomear sem evidência é superstição e quebra o cliente publicado durante a
janela de deploy.

**Risco estrutural registrado, sem correção:** o jogo é servido de `pages.dev`, domínio
compartilhado cujos subdomínios individuais já aparecem em listas de bloqueio. Nenhuma regra
alcança o nosso hoje, mas se alguém sinalizar o subdomínio por engano, o site inteiro morre
para quem usa bloqueador, e não há nada no código que conserte isso. É o argumento prático a
favor de um domínio próprio.

## Rede: timeout, retry, e retry só onde repetir é seguro

Não havia timeout em lugar nenhum — uma conexão travada deixava a promessa pendurada para
sempre (jogo "parado", zero erro). Hoje `AbortSignal.timeout`: 15s, e 45s no flush, que
simula até 6h numa invocação.

Retry é **opt-in por chamada** (`retentavel`), e a linha divisória é "repetir estraga alguma
coisa?":

| Rota | Retenta | Por quê |
|---|---|---|
| `/estado`, rankings | sim | Leitura pura |
| `/sessao/flush`, `/sessao/fechar` | sim | Idempotentes por desenho (intervalo do banco, ouro absoluto) |
| `/acao` | **não** | "Comprar 5 poções" duas vezes compra dez |
| `/sessao/abrir` | **não** | Geraria segunda sessão e descartaria o intervalo da primeira |

**502 fica fora dos status retentáveis de propósito**: o serviço responde 502 quando o
Postgres falha, e isso pode ter acontecido no meio de uma escrita. Retenta só
408/425/429/503/504 e falha de rede pura.

No servidor, `db.ts#buscarComRetry` retenta o PostgREST — todas as chamadas de lá são
idempotentes (leitura, upsert de chave fixa, delete por filtro, PATCH com valor absoluto), e
o pooler do Supabase derruba conexão de vez em quando, o que virava 502 na cara do jogador.

O toast de erro tem janela anti-repetição de 20s por mensagem: um flush de 30s com rede ruim
empilhava o mesmo aviso indefinidamente.

## Bugs achados por auditoria, com o mecanismo

- **`game_sessions.map_id` tinha FK para `maps(id)`**, mas as 19 hunts do Modo Pesadelo e as
  11 hunts BOSS são geradas em **runtime** e nunca entram na tabela `maps`. O INSERT violava
  o FK e `/sessao/abrir` respondia 502. Com a RLS revogada, o servidor é o único caminho:
  **o endgame inteiro estava injogável.** O FK era redundante — `abrirSessao` já valida mapa
  existente, hunt desbloqueada e continente liberado em código. A migration que o remove
  busca o nome real em `pg_constraint`: um `drop constraint if exists <palpite>` seria no-op
  e deixaria o bug de pé em silêncio.
- **Jogador novo nascia sem hunt nenhuma.** `handle_new_user` inseria em `players` e
  `unlocked_maps` caía no default `'{}'`. No cliente passava despercebido porque nenhum mapa
  tem `unlock_cost`: o cartão mostrava "Desbloquear" e desbloquear de graça funcionava. Para
  o servidor virou bloqueio duro — e estava certo, o banco dizia que o jogador não tinha
  hunt nenhuma. A migration semeia de `maps where unlock_cost is null`, não de constante à
  mão: hunt nova continua funcionando sozinha.
- **Duas ofertas ficavam "aceitas" no mesmo anúncio.** `responderOferta` faz CAS na oferta e
  depois CAS no anúncio; com dois "Aceitar" simultâneos, as duas passavam pelo primeiro. O
  dinheiro estava certo (escrow devolvido), mas o registro mentia. Hoje a perdedora volta
  para 'recusada'.
- **`perfilDoJogador` contava jogadores com `selecionar(...).length`** — e o PostgREST corta
  em 1000 linhas em silêncio. A partir do jogador 1001 o rank e o total congelariam num
  número plausível. Hoje usa `Range: 0-0` + `Content-Range`.
- **Poção com vida cheia era consumida por nada.** `Math.min` devolvia o mesmo HP e o item
  sumia. O Revive já tinha a recusa simétrica. Corrigido no servidor **e** na tela — só no
  servidor trocaria desperdício silencioso por um botão que sempre dá erro.

## Suspeita de exploit refutada (registrado para ninguém "consertar" depois)

`aplicarFlush` faz read-modify-write de `last_flush_at` sem lock, e há vários gatilhos de
flush — parecia vetor de duplicação de ouro por flush concorrente, inclusive um atacante
disparando N flushes com o próprio token.

**Medido: 20 flushes simultâneos do mesmo intervalo de 120s creditaram 1,03x** (os ~5 de
ouro de diferença são ruído de RNG), todos 200. Dois motivos estruturais neutralizam a
corrida, e por isso **não** foi construído um RPC de claim atômico para isso:

1. Ouro é gravado como **valor absoluto** (`gold = G0 + g`), não incremento — flushes
   concorrentes que leem o mesmo `last_flush_at` convergem para o mesmo total.
2. `sessaoAberta` usa `order=started_at.desc&limit=1`: só a mais recente é flushada.

**A conclusão era estreita demais, e isso importa.** Ela vale para dois flushes da *mesma*
sessão. Duas *sessões* têm cada uma seu `last_flush_at`, então os intervalos **somam** — que
é exatamente o exploit descrito acima em "Uma sessão aberta por vez". A medição estava
certa; a generalização não.

## Pendências conhecidas

- **Dois `/acao` concorrentes entre si** (sem flush no meio) ainda são last-write-wins: os
  dois leem e os dois gravam o snapshot inteiro. Não foi corrigido porque o cliente
  serializa por botão (`useAcaoPendente`) e o dano é "a ação perdida", não "10 minutos de
  caçada perdidos". O conserto de verdade seria travar a escrita por jogador (lease com
  expiração), o que troca uma perda rara por um modo de falha novo — escrita travada.
- **Toda rota que muta paga uma sondagem a mais** (um `select` em `game_sessions`), e
  `/acao` paga duas. Correção acima de latência: pular a segunda exigiria assumir que a
  primeira cobriu, e ela pode ter devolvido `FLUSH_OCUPADO` por causa de um flush que
  começou depois.
- **Se a invocação do flush morrer no meio da escrita**, o snapshot fica parcialmente
  gravado. A marca expira e o jogo destrava, mas nada reconstrói o que faltou.
- **`/sessao/fechar` é retentável**: se a primeira tentativa der certo mas a resposta se
  perder, a segunda encontra a sessão já fechada e devolve `fechada: false`. O crédito
  acontece; o **relatório** se perde naquele boot. Corrigir exige id de request, e o custo
  não paga.
- **401 intermitente no cadastro.** Token recém-emitido ainda não propagado no lado do
  Supabase; `GET /auth/v1/user` às vezes recusa um token de milissegundos atrás. Retry-on-401
  no servidor mascararia token inválido de verdade e somaria latência a toda falha legítima;
  o conserto correto é client-side (não disparar request autenticado antes de a sessão
  assentar). Não reproduz isolado e não quebra função.
