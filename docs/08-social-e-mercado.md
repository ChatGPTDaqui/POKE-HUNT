# 08 — Social e mercado

> **Atualizado em 2026-08-17.** A lógica descrita aqui (invariantes de escrow, claim de
> entrega, modelo de dados) continua valendo — o que mudou é a **camada**: toda mutação
> (`comprarAnuncio`, `responderOferta`, `reiniciarJogo`, `saneiaAnexos`...) que este documento
> descrevia como função TypeScript em `server/src/mercado.ts`/`social.ts`/`reiniciar.ts` foi
> migrada para função `security definer` do Postgres (`dev.*`/`public.*`) numa leva chamada
> "RPC-everything" (2026-08-11 a 2026-08-16). Esses três arquivos **não existem mais**. Nomes
> de função ao longo deste documento foram atualizados para o RPC equivalente; ver
> [04](04-autoridade-do-servidor.md#o-que-virou-rpc) para o padrão geral (toda RPC é
> `security definer`, identidade sempre `auth.uid()`, nunca parâmetro).

## O invariante que sustenta tudo aqui

O servidor grava progresso reescrevendo a **linha inteira** de `players` com valores
ABSOLUTOS (`gravarEstado`) — inclusive `gold`. As RPCs de economia creditam por
**incremento** (`gold = gold + X`), num UPDATE próprio. As duas escrevem a mesma coluna sem
se conhecer, e o que impede a segunda de apagar a primeira são **duas coisas juntas**:

> 1. `gravarEstado` grava com **CAS** em `players.updated_at` (o valor lido no snapshot).
> 2. O trigger `players_set_updated_at` faz `new.updated_at = now()` em **TODO** UPDATE da
>    linha — sem condição de coluna.

Com as duas, a sequência perigosa termina certa: o flush lê (ouro G0, versão U0), a RPC
credita e a versão vira U1, o flush tenta gravar com `where updated_at = U0`, acerta **zero
linhas**, recebe 409 e `comRetryDeColisao` relê e soma os dois. Medido em produção em
2026-08-18: 26 rodadas com venda disparada no meio de um flush (atraso de 0, 50, 400 e
800ms) — **zero divergência de ouro, zero flush descartado**.

**O que quebra isso** (e quebra em silêncio, nas 13 RPCs que creditam por incremento, de uma
vez): tornar o trigger condicional ("só avança se a coluna X mudou"), tirar o CAS de
`gravarEstado`, ou fazer o retry reaproveitar o snapshot velho em vez de reler. Trancado em
`server/src/progresso.test.ts` — inclusive com um caso **contrafactual** que roda a mesma
sequência sem o trigger e mostra o ouro evaporando.

Verificar o trigger no banco (não há como um teste de unidade alcançá-lo):

```
npx supabase db query --linked "select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.players'::regclass and not tgisinternal"
```

Sobra um buraco teórico: `now()` é o timestamp da **transação**, então duas transações que
carimbassem o mesmo microssegundo passariam pelo CAS. Fecharia com uma coluna `version`
inteira em vez de timestamp; não foi feito porque o custo é mexer na linha que impede perda
de progresso, para eliminar uma colisão que exige duas escritas na mesma linha no mesmo
microssegundo.

**Antes do CAS (PH-5) a regra era outra:** crédito de terceiro tinha que virar **linha** em
`market_deliveries`, reivindicada com claim atômico
(`update ... where claimed_at is null returning`) dentro do próximo request do próprio B. Essa
fila ainda existe e ainda é assentada em `/estado`, mas **nenhuma RPC client-facing escreve
nela hoje** (ver o comentário da rota em `appSessao.ts`) — a migração RPC-everything trocou
isso por crédito direto de propósito, apoiada no CAS.

`carregarEstadoParaEscrita` é a única porta para isso, e **só pode ser usada por quem vai
gravar em seguida** — `/sessao/abrir`, que só valida intenção, continua no `carregarEstado`
cru. `/estado` virou um GET que grava justamente porque é o único caminho de quem só abriu o
jogo.

## Mercado: dois modelos, porque item e POKE não são a mesma coisa

### Item = livro de ofertas

Item é fungível, então existe "melhor preço" e faz sentido cruzar filas.

**O preço de execução é o da ordem QUE JÁ ESTAVA no livro**, nunca o da que chegou. Quem
compra com limite alto paga o preço da melhor venda e recebe o troco na hora.

### POKE = anúncio de preço fixo

Em ouro ou diamante. IV, raridade e shiny fazem cada linha ser única; não existe "melhor
preço" entre coisas diferentes, e um livro de POKE cruzaria oferta de Charmander com procura
por Mewtwo.

## Os três invariantes do mercado

**1. Escrow.** Criar ordem de venda tira o item do inventário **agora**; ordem de compra tira
o ouro **agora**. Sem isso, duas ordens de venda do mesmo estoque vendem o dobro do que
existe.

**2. Nenhum valor vem do cliente além de preço e quantidade** — mesma regra de toda RPC (ver
[04](04-autoridade-do-servidor.md#o-que-virou-rpc)).

**3. Toda escrita concorrente é serializada.** Cada RPC de mercado roda inteira numa
transação SQL só, e a baixa numa ordem alheia é um `UPDATE ... WHERE remaining >= p_qtd`
condicional — o lock de linha do próprio `UPDATE` resolve a corrida (perdeu a corrida = zero
linhas afetadas, tenta a ordem seguinte do livro), sem precisar de compare-and-swap manual
entre duas chamadas HTTP separadas como o desenho anterior (PostgREST puro, sem transação
entre requests) exigia. `criar_ordem_mercado` casa contra o livro com `for update skip
locked`, para duas ordens não tentarem casar com a mesma linha ao mesmo tempo.

## POKE anunciado sai do inventário via `location='market'`

Valor novo do enum `pokemon_location`. `snapshotToGameState` filtra `team`/`bag`, então o POKE
some do vendedor sozinho — inclusive da Loja, onde poderia ser vendido para o sistema
enquanto anunciado.

Com uma coluna booleana, cada leitura teria que lembrar de filtrar, e a que esquecesse virava
venda dupla.

**Duas armadilhas reais nisso:**

- **`gravarEstado` teria APAGADO o POKE anunciado.** O delete-diff compara contra tudo que
  está no banco; a linha em `market` não está no snapshot do jogador e seria removida no
  primeiro flush depois de anunciar. Corrigido filtrando o diff por
  `location=in.(team,bag)`.
- **`ALTER TYPE ... ADD VALUE` precisa de migration própria.** O Postgres proíbe **usar** o
  valor novo na mesma transação em que ele foi adicionado. Por isso o enum vai num arquivo e
  as tabelas em outro.

### O bug que a check antiga causava

`team_slot_required` foi escrita quando o enum tinha dois valores e enumerou os dois:

```sql
(location='team' AND team_slot IS NOT NULL) OR (location='bag' AND team_slot IS NULL)
```

Ou seja, ela não dizia "team precisa de slot" — dizia "location só pode ser team ou bag".
Anunciar POKE respondia **502**.

Reescrita como `case when location='team' then team_slot is not null else team_slot is null
end`: expressa a regra real, e um valor novo do enum passa a valer sozinho.

## `dev.comprar_anuncio`: cobrar e mover o POKE na MESMA transação

Como RPC, cobrar e transferir o POKE acontecem dentro da mesma transação SQL — o problema que
o desenho anterior tinha (cobrar via um snapshot HTTP, mover o POKE por outro caminho, e um
flush concorrente gravando por cima de um dos dois) não existe mais estruturalmente: ou a
transação inteira aplica, ou nenhuma parte aplica. O raciocínio de ordem ("cobrar antes de
mover", preferir o erro que aparece visível ao erro que apaga POKE) continua sendo o
princípio geral que guia toda RPC de mercado, só não precisa mais ser garantido à mão.

## Modo "Somente Lance"

`market_listings.price` é nullable, com a coluna `apenas_oferta` amarrada por check
(`market_listings_preco_coerente`): anúncio sem preço **precisa** estar marcado como
somente-lance, e vice-versa.

Sem a check, uma linha meio preenchida ficaria invisível na vitrine (sem preço para mostrar)
e não venderia por caminho nenhum.

`market_offers` tem o mesmo escrow: o valor sai do bolso do ofertante na hora. Sem isso, dez
ofertas do mesmo ouro seriam todas aceitáveis e a décima aceita não teria como ser paga.

Índice único parcial `(listing_id, buyer_id) where status='pendente'`: reenviar substitui, não
empilha. Segundo lance no mesmo anúncio respondia **502** — o índice barrava certo, mas o erro
cru do PostgREST vira 502 por desenho; hoje é 409 com frase.

### Devolução do escrow em TODO caminho de saída

Recusa, cancelamento pelo comprador, cancelamento do anúncio pelo vendedor, e as demais
ofertas quando uma é aceita (`recusarOfertasPendentes`).

**Sem cobrir o cancelamento do anúncio, o ouro ficaria retido para sempre**: o jogador não
teria como cancelar uma oferta cujo anúncio sumiu da vitrine.

Aceitar fecha o anúncio por CAS. Perder esse CAS (o anúncio saiu no meio) **devolve o escrow
desta oferta** antes de responder 409 — não dá para entregar um POKE que já não está lá, e
reter o dinheiro seria o pior dos dois erros.

**Bug corrigido** (na época em que isto era `responderOferta`, TypeScript sobre PostgREST sem
transação entre chamadas): CAS na oferta e depois CAS no anúncio, dois passos separados. Com
dois "Aceitar" simultâneos, as duas ofertas passavam pelo primeiro CAS; a perdedora tinha o
escrow devolvido corretamente, mas ficava gravada como **aceita**. O dinheiro estava certo; o
registro é que mentia. Corrigido para a perdedora voltar para 'recusada' — e, como
`dev.responder_oferta` hoje é uma RPC (transação única), essa classe específica de corrida
entre dois passos não-atômicos deixou de ser possível estruturalmente; o fix de nomenclatura
sobrevive como a regra de negócio (perdedor de uma disputa de oferta é 'recusada', nunca
'aceita').

Compra direta em anúncio de lance responde 409 explícito. A ordenação por preço manda anúncio
sem preço para o **fim**, em vez de tratá-lo como 0 (o mais barato do mercado).

## RLS do mercado e do social — leitura pública chegou, escrita continua fechada

A leva RPC-everything **abriu leitura pública** onde fazia sentido de negócio, algo que a
versão anterior deste documento (RLS 100% fechada, tudo passando por rota de servidor) ainda
não tinha: `market_listings`/`market_orders` ganharam `select` público para linhas **ativas**
(a vitrine precisa ser vista por todo mundo) mais `select` do próprio dono para o histórico
completo; `market_trades` ganhou `select` só para quem participou da negociação; e
`players` ganhou uma view `treinadores_publico` (projeção segura — sem ouro, sem
diamantes) para ranking e nomes.

**`market_offers` continua sem nenhuma policy para `authenticated`** — só a `service_role`
(sessão) e as próprias RPCs (que rodam como `security definer`, não como o papel
`authenticated`) enxergam. O motivo não mudou: uma policy de leitura ali exporia quanto cada
jogador está disposto a pagar antes de a oferta ser respondida.

Toda escrita nas tabelas de mercado/social continua sem policy de INSERT/UPDATE/DELETE para
`authenticated` — só chega por RPC `security definer`, mesmo padrão de
[04](04-autoridade-do-servidor.md#rls-o-cliente-perdeu-a-escrita--e-ganhou-um-segundo-escritor-legítimo).

## Chat Mundo: Realtime, não mais polling

**Isto mudou de verdade, não só de nome.** A versão anterior deste documento explicava por
que Realtime era proibido — exigiria policy de SELECT para `authenticated` direto na tabela,
que era exatamente o que a Fase D tinha fechado. Com a leitura pública liberada
(`dev.chat_messages`/`mail_messages` ganharam `select`+`insert` sob RLS na mesma leva), essa
restrição deixou de existir, e o chat migrou de fato: `src/data/remote/chatRealtime.ts`
assina `supabase.channel('chat-mundo').on('postgres_changes', {event:'INSERT', schema:'dev',
table:'chat_messages'}, ...)` em vez de reler a cada 6 segundos.

A aba "Mundo" é **só** mensagem de jogador. Os avisos do jogo foram para a aba **"Sistema"**
(`CHANNEL_TO_TAB.world` → `'sistema'`). `ChatTab` deixou de ser redeclarado no `uiStore` — as
duas cópias já divergiram uma vez.

### Anexo guarda SNAPSHOT, não id

Antes vivia em `social.ts#saneiaAnexos` (arquivo removido); a mesma sanitização hoje acontece
no cliente antes de montar a mensagem (o servidor nunca resolve um id de POKE por conta
própria — só grava e retransmite o que o autor já exibiu). Duas coisas de uma vez:

1. O link continua mostrando o que foi mostrado na hora (o POKE pode ser vendido ou evoluir
   depois).
2. Ninguém ganha um jeito de consultar POKE alheio por id — o servidor nunca resolve o id, só
   repassa o que o autor exibiu.

Shift+clique (`components/shared/linkarNoChat.ts`) injeta `[Nome Lv12]` no rascunho e guarda o
anexo. No envio, **só vão os anexos cujo rótulo ainda está no texto**: apagar o
"[Charmander Lv12]" e mandar outra frase não envia o POKE colado numa mensagem que não fala
dele.

O rascunho vive na store (não num `useState` do chat) porque quem escreve nele é a Mochila,
de outro ponto da árvore e com o chat possivelmente fechado.

Há anti-flood.

## Correio e amizades

`mail_messages` + `friendships`.

**O pedido de amizade é uma MENSAGEM com dois botões, não uma tabela de pedidos**: um lugar só
para olhar quando alguém interage com você.

Índice único parcial (`para_id, de_id` where pendente) impede spam. Amizade é gravada nos dois
sentidos, para que "meus amigos" seja uma consulta sem `or`.

### Anexo de item no correio

`mail_messages.anexo_itens` (jsonb) + `anexo_coletado_em` (timestamptz).

**A coleta é explícita, não crédito automático como `market_deliveries`.** No mercado não há
o que o jogador decidir; aqui ele **precisa ver** o que chegou — uma compensação caindo no
inventário em silêncio é indistinguível de bug ("meu save mudou sozinho").

`anexo_coletado_em` é timestamp e não booleano porque a coluna **é** o claim atômico:
`update ... where anexo_coletado_em is null returning` não acha linha na segunda vez.

O claim vem **antes** do crédito: se o crédito falhar, o jogador perde o anexo — erra contra
ele, mas não imprime item, que é o lado certo de errar.

> **Cuidado ao ler o parágrafo abaixo:** ele descreve o desenho ANTIGO (coleta por HTTP,
> crédito enfileirado em `market_deliveries`). Hoje a RPC credita na própria transação — o
> claim e o crédito são a mesma unidade atômica, e não há fila no meio.

**Bug corrigido ao vivo** (na época em que a coleta era ação HTTP): a primeira versão chamava
`liquidar()` depois de coletar. `liquidar()` era `/sessao/flush`, que respondia 409 sem hunt
aberta — e coletar no Hospital é exatamente esse caso. A mensagem virava "Recebido" e o item
só aparecia quando o jogador entrasse numa hunt. Corrigido então com `recarregarEstado()`
(`GET /estado`). Hoje a coleta é a RPC `dev.coletar_anexo_correio`, que credita o item **na
própria transação** (não enfileira em `market_deliveries` como o desenho antigo fazia) — a
classe de bug (esperar um flush que não vai acontecer) não se aplica mais estruturalmente.
Marcar como lida também é RPC (`dev.marcar_correio_lido`), de propósito e não um simples
`update` sob RLS: "não marcar como lida enquanto o anexo não foi coletado" é um invariante
que o servidor precisa impor, não o cliente.

## Nome do treinador é único

"Adicionar amigo pelo nick" só funciona se o nick identificar uma pessoa — e ele nascia
`'Treinador'` para todo mundo.

A migration de-duplica os existentes (sufixo com os 4 primeiros caracteres do `user_id`)
**antes** de criar o índice único sobre `lower(trainer_name)`; sem isso ela falharia.

O nome viaja em `options.data` do `signUp` (= `raw_user_meta_data`) e é gravado pelo trigger
`handle_new_user` **na mesma transação da conta**. A alternativa — UPDATE do cliente logo
após o cadastro — é proibida pela RLS e deixaria uma janela com o nome errado.

Colisão no trigger desambigua com sufixo em vez de derrubar o cadastro: perder a conta por
causa de um nick é desproporcional. A tela checa antes por RPC
(`nome_de_treinador_disponivel`, chamável por `anon` porque devolve boolean e nada mais — essa
função já era RPC antes da leva "RPC-everything", não faz parte dela).

**O wipe não reseta `trainer_name`.** Dois motivos: com o índice único, N linhas voltando para
o mesmo nome abortam o wipe inteiro; e o nick deixou de ser cosmético — é a identidade
pública que `original_trainer` e as amizades referenciam.

### O bug do "Novo Jogo" que nunca rodou

Reproduzido contra o servidor local (que loga o corpo do PostgREST, ao contrário da Edge):

```
PostgREST 409 em players?user_id=eq.<uid>:
{"code":"23505","details":"Key (lower(trainer_name))=(treinador) already exists."}
```

`reiniciarJogo` (então uma ação HTTP) zerava o estado com `defaultGameStateData()`, cujo
`trainer.name` é `'Treinador'`. Desde que o nick virou único, gravar esse nome colide com
quem já o tem — o UPDATE de `players` falhava e **toda a ação voltava 502**. O reset nunca
chegou a apagar nada depois daquela migration.

Hoje o nick sobrevive ao reset, e a lógica inteira é a RPC `dev.reiniciar_jogo()`
(`security definer`, ver [04](04-autoridade-do-servidor.md#o-que-virou-rpc)) — o mesmo
princípio (nick é identidade pública, reset apaga progresso, não identidade) continua valendo,
só não pode mais falhar por 502 de constraint: a função nunca escreve `'Treinador'` por cima
de um nick existente.

**Lição de diagnóstico:** a Edge Function não repassa o corpo do erro do PostgREST (correto —
traz nome de coluna e constraint). Rodar `cd server && npm run dev` e repetir o request contra
`localhost:8787` mostrou a causa em um minuto. Vale como primeiro passo para qualquer 502 do
serviço.

### O que o reset ainda deixava para trás

`gravarEstado` só propaga o estado zerado para as cinco tabelas que ele conhece. Tudo que
nasceu depois desse desenho sobrevivia:

- **Anúncio de POKE no mercado** (o POKE vive em `location='market'` e o delete-diff filtra
  por `location in (team,bag)` de propósito)
- **Ordem de compra/venda com escrow**
- **Entrega pendente** — seria aplicada no request seguinte, injetando ouro numa conta
  recém-zerada
- **Histórico de `game_sessions`**, de onde o Perfil tira o tempo de jogo

A RPC de reset apaga os quatro, **nessa ordem** — anúncio antes do POKE, porque
`market_listings.poke_uid` tem `on delete restrict`.

Chat, correio, amizades e Hall da Fama **não** são apagados: são o registro social do
jogador, não o save dele.

## Ranking e Perfil

O cliente ainda **não** lê a tabela `players` de outro jogador diretamente — afrouxar RLS ali
exporia ouro, itens e equipe de todo mundo. A leva RPC-everything resolveu isso com uma
**view pública restrita** (`treinadores_publico`, sem ouro nem diamantes) em vez de rota de
servidor: listas de ranking/nome (`rankingRpc.ts#rankingTreinadores`/`rankingPokemon`/
`hallDaFama`) são `select` simples nessa view e em `ranking_pokemon`/`hall_da_fama` sob RLS.
Só o perfil agregado do **próprio** jogador (`meu_perfil()`) continua sendo RPC — juntar dados
de várias tabelas por trás de uma projeção seria estranho de expressar como RLS simples.

- **`rank` é contado, não ordenado**: "quantos têm mais EXP que eu, +1". Ordenar a base para
  achar uma posição daria o mesmo número por muito mais.
- **Os seis critérios de atributo não ganharam índice**, de propósito: seriam seis índices
  mantidos a cada escrita de POKE numa tabela de milhares de linhas. Revisar se a base mudar
  de escala.
- **`play_seconds` não existe como coluna.** O tempo de jogo já é acumulado em
  `game_sessions.simulated_seconds`, e sessões fechadas ficam na tabela — o total do jogador é
  a soma das linhas dele. Uma coluna nova custaria uma escrita a mais em **todo** flush (30 em
  30s por jogador ativo) para um dado lido só quando alguém abre o Perfil.

### O ranking devolve o POKE inteiro, não um resumo

A view/consulta de ranking de POKE selecionava só 11 colunas, num desenho anterior. Para
abrir o cartão de perfil (que mostra IV, EXP e HP reais) faltava quase tudo — e sintetizar a
partir de (espécie, nível) daria números plausíveis e **errados** numa tela cuja única função
é comparar POKEs de jogadores diferentes.

A correção — selecionar a linha inteira e mapear com `rowToPoke`, o **mesmo** mapper que
carrega o save do dono — é uma decisão de modelagem que sobrevive independente da migração:
`pokemon_instances` não guarda nada privado além do `user_id`, que já é devolvido pela leitura
pública de ranking.

`EntradaPoke` carrega `treinador` (dono agora) e `treinadorOriginal` (quem capturou)
separados — a lista mostra o original.

Espécie desconhecida (renomeada num sync posterior) continua listada mas não abre: o cartão
inteiro é montado a partir de `species`.

**Bug real pré-existente:** `HuntMenu` keava linhas por `sp.id`, e a hunt do Campeão Lance tem
**três Dragonites** (composição real dele) — o React reclamava de chave duplicada e podia
omitir linhas. Os encontros sempre estiveram certos (indexados, `lance_0..lance_5`); só a key
estava errada, e virou o id do encontro.

## Hall da Fama

Gravado em `aplicarFlush`, comparando `unlockedContinents` antes e depois — a única coisa que
libera `kanto` é limpar a sequência do Campeão Lance.

Registrado no **servidor** e não no motor, de propósito: o motor roda igual no cliente, e o
cliente não pode escrever conquista. `on_conflict` faz a segunda vez ser no-op, então a data
guardada é sempre a da primeira.
