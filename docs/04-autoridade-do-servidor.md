# 04 — Autoridade do servidor

> Este documento descreve limiares e janelas anti-abuso. Ver a nota sobre
> publicação no [README](README.md#esta-pasta-não-é-publicada).
>
> **Reescrito por inteiro em 2026-08-17.** A versão anterior descrevia `authority/src/app.ts`,
> `acoes.ts`, `mercado.ts`, `social.ts`, `reiniciar.ts` e `node.ts` como a autoridade inteira.
> **Esses arquivos foram deletados** numa migração batizada "RPC-everything" (2026-08-11 a
> 2026-08-16, ~50 migrations): compra/venda/evolução/mercado/chat/correio/ranking/reset viraram
> **funções `security definer` do Postgres**, chamadas direto pelo cliente via
> `supabase.rpc(...)`. Só a sessão de hunt (abrir/flush/fechar/estado) continua HTTP — é a
> única parte que precisa rodar o motor de simulação real (`stepWorld`), que não roda em
> `plpgsql`. Ver [13](13-divergencias-conhecidas.md) para o registro do achado.

## O princípio, atualizado para dois mecanismos de autoridade

**O cliente manda intenção. Nunca resultado.** Isso continua valendo nos dois mecanismos —
só o *como* mudou:

1. **Sessão de hunt (HTTP, `authority/src/appSessao.ts`)**: o jogador declara "estou na hunt X
   com o POKE Y". O servidor simula o intervalo pelo relógio **dele**, com o motor de jogo
   real (`stepWorld`), e grava. A simulação local vira predição cosmética.
2. **Tudo o mais (RPC do Postgres, `supabase.rpc('nome_da_funcao', {...})`)**: o jogador diz
   "quero comprar 5 poções" (uma **intenção**, não um resultado); a função SQL lê o preço do
   catálogo e o saldo do jogador **dentro da própria transação** e decide. Não existem RPCs
   `addGold`, `addItem` nem `setTrainer` — todo efeito é um delta relativo calculado a partir
   de estado lido no mesmo `update`, nunca um valor absoluto que o cliente entrega pronto
   (a única exceção estrutural é a própria gravação de sessão, abaixo, que por rodar o motor
   em TypeScript **precisa** escrever um resultado pós-simulação — isso é HTTP + `service_role`,
   nunca RPC).

## Onde a autoridade mora hoje

| Peça | Papel |
|---|---|
| `authority/src/appSessao.ts` | Router mínimo: só as 4 rotas de sessão (abaixo). Roda como HTTP porque precisa do motor de simulação real |
| `authority/src/progresso.ts` | Carregar, simular, gravar a sessão. O coração do lado HTTP — praticamente inalterado pela migração RPC |
| `authority/src/estadoDoJogador.ts` | Implementa `GameStateStore` sobre `GameStateData` puro, para a simulação de sessão |
| `authority/src/farmOffline.ts` | O piso do farm offline (ver [07](07-farm-offline.md)) |
| `authority/src/entregas.ts` | Fila de entregas do mercado (`market_deliveries`), reivindicada em toda gravação de sessão |
| `authority/src/db.ts` | Cliente PostgREST com retry, usado pelo lado HTTP |
| `authority/src/auth.ts` | Verificação de token, usada pelo lado HTTP |
| `authority/src/edge.ts` | Adaptador de plataforma (Deno/Edge Function) |
| `supabase/migrations/*rpc*.sql` | As funções `dev.*`/`public.*` que substituíram `acoes.ts`/`mercado.ts`/`social.ts`/`reiniciar.ts` — ver "O que virou RPC" abaixo |
| `src/data/remote/acoesRpc.ts` | Cliente: despacha ~19 tipos de ação para a RPC certa |
| `src/data/remote/mercadoRpc.ts` | Cliente: leituras de mercado via view/RLS, escritas via RPC |
| `src/data/remote/rankingRpc.ts` | Cliente: leituras de ranking via view/RLS, `meu_perfil` via RPC |
| `src/data/remote/correioRealtime.ts`, `chatRealtime.ts` | Cliente: leitura/escrita direta via RLS + Realtime, ações sensíveis (marcar lido, coletar anexo, amizade) via RPC |

`authority/src/estadoDoJogador.ts` implementa o tipo `GameStateStore` **inteiro** sobre
`GameStateData` puro. Esquecer um método quebra o type-check em vez de estourar no meio de
uma simulação de 6 horas em produção.

**Não existe hoje nenhum script de smoke-test commitado para a camada de RPC.** A migração
foi validada com contas de teste descartáveis, criadas e apagadas na hora — nenhuma delas
ficou como registro auditável de comportamento esperado. `scripts/conta-de-teste.js` existe
por causa disso (ver [11](11-operacao.md)): antes dele, cada sessão criava um script próprio
de teste e ia embora, chegando a 72 contas de teste acumuladas contra 5 jogadores reais.

## A forma do serviço

`fetch(Request) => Response`, sem framework. Um Worker do Cloudflare **é** exatamente
`export default { fetch }`, e o Node 22 tem `Request`/`Response` nativos: o mesmo arquivo
roda nos dois. `authority/src/edge.ts` e `supabase/functions/jogo/index.ts` (casca Deno) são os
únicos com código de plataforma. Isso vale só para as 4 rotas de sessão que sobraram — a
camada RPC não tem "forma de serviço" nenhuma, é função de banco.

Isso manteve a escolha de hospedagem aberta de graça enquanto ela estava indefinida.

**A conclusão inicial de que Edge Function não serviria estava errada.** O limite de 2s de
CPU por invocação é real; a conclusão foi tirada antes de haver número. Medido: 30 min de
jogo em 26ms, e o pior caso (6h, teto do farm offline) em ~1,6s de ida e volta incluindo
rede, com 21.594s creditados e 8.550 abates. Cabe.

Hoje o serviço roda como Edge Function do Supabase (`supabase/functions/jogo/`).
`vite.edge.config.ts` empacota **motor + serviço num arquivo só** (~240kB gzip) — necessário
porque o servidor usa `#engine` (subpath import do Node) e especificadores `.js` apontando
para `.ts`, e o resolvedor do Deno não aceita nenhum dos dois.

## Rotas HTTP — só sessão de hunt

| Rota | Método | O que faz |
|---|---|---|
| `/saude` | GET | Ping, sem autenticação |
| `/estado` | GET | Carrega o progresso. **Grava** se houver entrega pendente |
| `/sessao/abrir` | POST | Valida a intenção, gera a semente, abre a sessão |
| `/sessao/flush` | POST | Simula do último flush até agora e grava |
| `/sessao/fechar` | POST | Flush final + fecha, devolvendo o resumo |

Toda rota exceto `/saude` exige jogador autenticado. **Não há mais `/acao`, `/mercado/*`,
`/chat`, `/correio/*`, `/perfil` nem `/ranking/*`** — essas 5 rotas somem quando as ações
viram RPC; qualquer erro não tratado que ainda passe por `appSessao.ts` é reportado pela
própria função RPC `registrar_evento_auditoria` (a mesma que o cliente chama), não por um log
HTTP próprio.

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

## Leitura parcial: o flush não carrega a mochila

`lerSnapshot(cfg, userId, { comBag: false })` lê `pokemon_instances` filtrada por
`location=eq.team`. É o modo que **todo flush** usa, e também `/sessao/abrir` e
`GET /estado?parcial=1` — ou seja, hoje, todo caminho que um cliente atual percorre. O modo
completo sobrou só para `GET /estado` **sem** o parâmetro, que é o que um cliente anterior a
esta mudança pede.

O cliente atual busca a mochila por conta própria, direto no PostgREST, quando abre uma tela
que a usa (`mochilaRemota.ts` / `mochilaStore`) — assim a leitura atravessa **uma** perna de
egress em vez de duas, e quem nunca abre a Mochila não paga por ela. Medido ao vivo na conta
de teste (458 POKEs): `/estado?parcial=1` responde **4.575 bytes** contra **226.184** do modo
completo.

**Por que:** o snapshot completo cresce sem limite. Auto-catch despeja captura na mochila e
nada sai sozinho. Medido em produção em 2026-08-17: uma conta com 5035 POKEs custava
**3,23 MB por leitura**, e o flush lê a cada 30s — ou a cada 5s, quando `commitAgora`
dispara por level-up (`INTERVALO_MINIMO_COMMIT_MS`). Um jogador ativo queimava ~2 GB/h de
egress; três jogadores fecharam o dia em 23,5 GB de PostgREST + 2,4 GB de Functions, contra
5 GB/mês de cota.

**Por que é seguro:** a simulação de hunt só *adiciona* POKE na mochila
(`addCapturedPoke`, um `push`). Vender, soltar, mover e anunciar são RPC — não passam por
`aplicarFlush`. Então, no modo parcial:

- `estado.bagPokes` começa vazio e termina contendo **só as capturas daquela janela** — que
  é exatamente o conjunto que precisa ser gravado;
- `pokeIdsNoLoad` fica com os ids do time, e como o diff de remoção de `gravarEstado` é
  dirigido por ele (ver a seção abaixo), **nenhuma linha de mochila é alcançável por um
  flush**. Trancado em `authority/src/snapshotParcial.test.ts`.

`ctx.bagCarregada` diz qual modo produziu o estado. `bagPokes` vazio com
`bagCarregada: false` significa "não carregada", **não** "mochila vazia" — quem confundir os
dois apaga a mochila do jogador.

### O cliente reconcilia em vez de substituir

A resposta do flush vem com `estadoParcial: true`. O cliente não pode mais trocar a mochila
local pela resposta: ela traria só as capturas da janela. Também não pode somar, porque a
mesma captura apareceria duas vezes — a simulação local roda o mesmo `captureSystem` como
predição e gera `uid` próprio, diferente do que o servidor gravou.

`predicoesDeCaptura.ts` guarda quais uids da mochila local são predição (registrados em
`addCapturedPoke`, o único ponto do cliente por onde toda captura passa). Ao aplicar um
estado parcial: sai a predição, entra a linha real, o resto da mochila fica. Antes desta
mudança o mesmo efeito vinha de graça — a resposta trazia a mochila inteira e o `setState`
jogava a predição fora junto.

**Compatibilidade:** o modo enxuto só vale para quem pede — `{"parcial":true}` no corpo de
`/sessao/flush` e `/sessao/fechar`, `?parcial=1` na query de `/estado`. Aba aberta antes do
deploy não pede e continua recebendo o estado completo; sem isso ela ficaria com a Mochila
vazia na tela até o F5. Medido ao vivo na conta de teste (456 POKEs): flush parcial
**5.077 bytes**, flush completo **225.711 bytes**.

`mochilaStore.carregada` é o que, no cliente, separa "o jogador não tem POKE guardado" de "a
lista ainda não veio". Toda fusão de estado e todo refetch cirúrgico de RPC consulta essa
chave antes de tocar em `bagPokes` — sem ela, as capturas de uma janela de flush viravam "a
mochila inteira" numa conta de milhares.

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

## O que virou RPC

`acoes.ts` (lista branca de ~19 ações, síncrona e pura sobre a store) não existe mais como
arquivo TypeScript — virou ~20 funções `security definer` do Postgres, uma por ação, cada
uma na sua própria transação SQL. `src/data/remote/acoesRpc.ts` mantém a mesma lista de
**tipos** de ação no cliente (`DESPACHO`, um dicionário tipo → nome da função RPC), então a
superfície pro jogador não mudou — só onde a regra roda:

| Grupo | Função RPC (`dev.*`/`public.*`) |
|---|---|
| Início | `escolher_starter`, `definir_nome_do_treinador`, `reiniciar_jogo` |
| Economia | `comprar_item`, `vender_item`, `vender_todos_itens`, `vender_poke`, `vender_pokes` |
| POKE | `usar_item`, `curar_equipe`, `evoluir_poke`, `definir_ativo`, `tirar_da_equipe`, `por_na_equipe`, `definir_golpes_ativos` |
| Mundo | `desbloquear_hunt` |
| Preferência | `alternar_trava_item`, `alternar_trava_poke`, `alternar_habilidade`, `configurar_auto` |

Mercado e social (compra/venda entre jogadores, chat, correio, amizades, ranking) também são
RPC hoje, mas ficam documentados em [08](08-social-e-mercado.md) — são operações que tocam
linha de **outro** jogador, categoria própria.

**Todo `security definer` segue o mesmo padrão**, visto em toda função lida (ex.:
`comprar_item`, `criar_ordem_mercado`):

```sql
create function dev.comprar_item(p_item_id text, p_qtd int default 1)
returns jsonb language plpgsql security definer
set search_path = dev, public   -- trava contra injeção de search_path em funcao definer
as $$
declare v_user_id uuid := auth.uid();  -- quem age, resolvido do JWT, NUNCA parametro
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;
  update dev.players set gold = gold - v_custo
    where user_id = v_user_id and gold >= v_custo;      -- UPDATE condicional = lock de linha
  if not found then raise exception 'Ouro insuficiente.' using errcode = 'P0001'; end if;
  ...
```

- **A identidade de quem age nunca é parâmetro** — só `auth.uid()`, lido dentro da função a
  partir do JWT que o Supabase já validou. Não há como uma RPC aceitar "aja como o
  jogador X"; os parâmetros são sempre alvos (id do item, do anúncio, da oferta), nunca o
  ator.
- **`UPDATE ... WHERE ... IF NOT FOUND THEN RAISE` é ao mesmo tempo a validação e o lock de
  concorrência.** Duas compras simultâneas do mesmo jogador serializam pelo lock de linha do
  próprio `UPDATE` — não precisa de um CAS separado como o lado HTTP (`players.updated_at`)
  precisa, porque aqui não há reconstrução de estado em memória entre ler e escrever.
- **Mensagem de recusa em português direto no `RAISE EXCEPTION`** (`errcode = 'P0001'`), não
  um código traduzido depois: `acoesRpc.ts` relança `error.message` quase verbatim
  (`ErroServidor(statusPorErrcode(error.code), error.message)`). Antes (`acoes.ts`) a tradução
  morava no servidor Node porque o cliente não sabia o preço; hoje a mensagem já nasce em
  português porque quem calculou o preço foi a própria função que está recusando.

### Validações que sobreviveram à migração (mudou onde, não a regra)

- **`escolher_starter`** continua com lista branca explícita dos 3 iniciais.
- **`definir_nome_do_treinador`** continua só aceitando com a conta sem nenhum POKE, e a
  unicidade do nick continua checada por função de banco — não virou `ilike` (o mesmo
  problema de sempre: `_` é curinga de uma letra em LIKE, e `{"nick":"%"}` enumeraria a base).
- **`configurar_auto`** ainda valida `MAX_REGRAS_AUTO = 20` e tipo/faixa de cada regra — a RPC
  reusa a mesma validação que existia em `acoes.ts`, só movida de lugar.
- **`MAX_TEAM_SIZE`** continua exportado do motor compartilhado e usado nos dois lados.
- **`definir_golpes_ativos` é a RPC com mais churn de toda a migração**: 5 revisões em 2 dias
  (trava de hunt ligada, depois desligada, depois religada, ataque-básico-ocupa-slot ligado e
  no dia seguinte **revertido**). Se esta seção descrever um comportamento que não bate com o
  jogo, é a primeira suspeita.

## RLS: o cliente perdeu a escrita — e ganhou um segundo escritor legítimo

Migration `20260807030000_cliente_perde_a_escrita`: `own rows all`
(select + insert + update + delete) virou **select apenas** nas cinco tabelas de jogador
(`players`, `pokemon_instances`, `player_items`, `player_pokedex`,
`player_auto_catch_rules`), e a policy de update de `players` foi removida. **Essa RLS
continua exatamente assim** — nenhuma migration da era RPC-everything reabriu policy de
escrita nessas tabelas.

**O que mudou é que existem hoje DOIS escritores legítimos, não um:**

1. **`service_role`** (o servidor de sessão, `authority/src/db.ts`) — ignora RLS por completo,
   é a chave usada por `gravarEstado` para escrever o resultado de uma simulação.
2. **Funções `security definer`** (as RPC) — não ignoram RLS por uma chave ambiente; cada uma
   roda com o privilégio do **dono da função** (o papel que aplicou a migration), escopado a
   essa função só, e **revalida `auth.uid()` e a posse de cada linha por dentro do próprio
   SQL** antes de tocar nela. `anon` não pode chamar nenhuma delas (`grant execute ... to
   authenticated` só, exceto as duas RPCs de log de erro, liberadas também pra `anon` de
   propósito — telemetria tem que funcionar mesmo em estado de auth incerto).

Funções auxiliares internas (`dev._valor_venda_poke`, `dev._calcular_stat`,
`dev.recusar_ofertas_pendentes`) têm `execute` **revogado** de `authenticated`/`public` — só
são chamáveis de dentro de outra função `security definer`, nunca direto pelo cliente. Uma
delas (`recusar_ofertas_pendentes`) foi corrigida numa migration própria depois de ter sido
concedida a `authenticated` por engano.

**A conclusão original — "o jogo parou de funcionar sem o servidor" — continua verdadeira,
só que "o servidor" hoje é dois: sem `service_role` (sessão HTTP), não há como abrir/flushar
hunt; sem as RPCs (que não dependem do serviço Node/Edge, só do Postgres estar de pé), não há
como comprar, vender, evoluir, negociar ou conversar.** As RPCs funcionam contra qualquer projeto
Supabase linkado; a sessão HTTP exige `VITE_SERVIDOR_URL` apontando para a Edge Function
publicada — **não há mais como rodá-la local** (`authority/src/node.ts` foi deletado em `29a4da4`;
ver [11-operacao.md](11-operacao.md#comandos)).

### Teste adversarial

Oito ataques com o token legítimo do próprio jogador — o que qualquer um tem com DevTools:
imprimir ouro e diamantes, criar Mewtwo Lv100 mythic, multiplicar itens, apagar o próprio
progresso, escrever na pokedex. **Todos falharam**; leitura funciona; a `service_role`
continua escrevendo.

**O caso que mais engana: DELETE bloqueado devolveu 204.** A RLS não rejeita — ela não acha
linha que case com a policy. Um teste que olhasse só o status code passaria com o banco
aberto. Todo caso afirma o **efeito no banco**.

## O interruptor `VITE_SERVIDOR_URL`

`src/data/remote/autoridade.ts` — `pedirAcao(acao, fallback)`, o único caminho de mutação em
toda tela do jogo. A checagem `servidorAtivo()` (a variável estar definida) segue sendo o
único interruptor, mesmo depois da migração RPC — inclusive para ações que **tecnicamente**
não precisam do servidor Node/Edge (uma RPC fala direto com o Postgres). Ligar/desligar
autoridade continua sendo um flag só, não um por mecanismo.

- **Sem servidor**: roda `fallback()` local — o comportamento pré-autoridade, preservado
  inteiro, não um "modo degradado".
- **Com servidor**: `pedirAcao` chama `executarAcaoRpc(acao)` (`acoesRpc.ts`) — que despacha
  pro `supabase.rpc(...)` certo. **A resposta de uma RPC é só `{ok, mensagem}`, nunca o
  estado inteiro do jogador** — diferença real do desenho antigo (HTTP `/acao`, que devolvia
  o snapshot completo e o cliente sobrescrevia tudo). Cada tipo de ação tem seu próprio
  "refetch cirúrgico" depois (`refetchGold`, `refetchItem`, `refetchPoke`,
  `refetchEquipeInteira`...) — só relê a tabela/coluna que aquela ação especificamente pode
  ter mudado, em vez de recarregar o jogador inteiro a cada compra.

  A **sessão de hunt** (abrir/flush/fechar/estado) é a exceção que continua devolvendo
  estado — porque ela roda o motor de simulação de verdade, e o resultado de uma simulação
  não tem como ser "cirurgicamente" relido, é o próprio propósito da chamada. Só `/estado`
  devolve o snapshot **inteiro**; flush e fechar devolvem estado **parcial** (sem a mochila,
  ver "Leitura parcial" acima).

`gameStatePersistence.ts` é **onde o cliente deixa de ser autoritativo**: sob servidor,
`setItem` faz early-return (não grava) e `getItem` lê do servidor. Sem esse return, o
autosave sobrescreveria o servidor — última escrita vence, pior que não ter servidor.

`pedirAcao` devolve `boolean`. Isso não é detalhe: `controller.enterMap` virou `async` e a
tela só fecha se a entrada foi aceita. Antes, `void abrirSessaoDeHunt(...)` trocava a cena
sem esperar — com recusa (hunt trancada, POKE fora da equipe, serviço fora do ar), o jogador
entrava, via combate, não ganhava nada, e não recebia aviso: a simulação local continua
desenhando. Só aparecia como "o jogo parou de dar ouro".

`src/data/remote/servidor.ts` ficou **menor** com a migração: hoje exporta só 4 membros
(`estado`, `abrirSessao`, `flush`, `fecharSessao`) — tudo que não é sessão de hunt saiu de
lá. Ranking, mercado, chat e correio têm seus próprios módulos (`rankingRpc.ts`,
`mercadoRpc.ts`, `correioRealtime.ts`) e não passam mais por `servidor.ts` nem por
`pedirAcao`.

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

Achados **antes** da migração RPC-everything, no código Node que existia então. Os dois
primeiros (FK de mapa, hunt de conta nova) continuam vivendo no lado HTTP/sessão, intocado
pela migração. O de mercado ("duas ofertas aceitas") e o de perfil (`perfilDoJogador`)
descreviam código que **hoje é RPC** (`dev.responder_oferta`, `dev.meu_perfil`) — mantidos
aqui como registro histórico do bug e do raciocínio da correção; ver
[08](08-social-e-mercado.md) para a forma atual desses dois.

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
