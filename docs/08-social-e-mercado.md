# 08 — Social e mercado

## O invariante que sustenta tudo aqui

O servidor grava progresso reescrevendo o **snapshot inteiro** do jogador
(`gravarEstado`). Logo:

> **Nunca creditar outro jogador com `update players set gold = gold + X`.**

Se A compra de B e o crédito de B for um UPDATE direto, o próximo flush de B — que pode estar
caçando nesse segundo — grava por cima o ouro que **ele** tinha em memória. B simplesmente
não recebe, sem erro em lugar nenhum. É a mesma classe de bug que já mordeu `player_items` e
`player_auto_catch_rules` (ver [04](04-autoridade-do-servidor.md)).

O crédito vira **linha** (`market_deliveries`), reivindicada com claim atômico
(`update ... where claimed_at is null returning`) dentro do próximo request do próprio B, e
aplicada ao estado que aquele request já vai gravar.

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

**2. Nenhum valor vem do cliente além de preço e quantidade** — mesma regra de `acoes.ts`.

**3. Toda escrita concorrente é compare-and-swap.** Não há transação entre duas chamadas ao
PostgREST (serverless), então cada baixa numa ordem alheia manda o valor antigo no filtro
(`&remaining=eq.7`); resposta vazia = perdi a corrida, sigo para a próxima.

`atualizarRetornando` (`db.ts`) existe para isso: com `return=minimal`, perder a corrida seria
indistinguível de sucesso.

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

## Ordem deliberada em `comprarAnuncio`: cobrar e gravar ANTES de mover o POKE

O estado do comprador é gravado como snapshot com diff de remoção. Se o POKE fosse
transferido primeiro, o `gravarEstado` — montado de um estado carregado **antes** da
transferência — não teria a linha nova e a apagaria: o comprador pagaria e o POKE sumiria do
jogo.

O risco invertido (falhar depois de cobrar) existe, mas erra a favor do jogador e fica
visível.

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

**Bug corrigido:** `responderOferta` faz CAS na oferta e depois CAS no anúncio. Com dois
"Aceitar" simultâneos, as duas ofertas passavam pelo primeiro CAS; a perdedora tinha o escrow
devolvido corretamente, mas ficava gravada como **aceita**. O dinheiro estava certo; o
registro é que mentia — e um histórico de negociação existe justamente para não fazer isso.
Hoje a perdedora volta para 'recusada'.

Compra direta em anúncio de lance responde 409 explícito. A ordenação por preço manda anúncio
sem preço para o **fim**, em vez de tratá-lo como 0 (o mais barato do mercado).

## RLS do mercado

`market_offers`, `market_listings` e `hall_da_fama` têm RLS ligada e **nenhuma policy** para
`authenticated`. Só a `service_role` enxerga.

Uma policy de leitura em `market_offers` exporia quanto cada jogador está disposto a pagar
antes de a oferta ser respondida.

## Chat Mundo: polling pelo servidor, não Realtime

Realtime exigiria policy de SELECT para `authenticated` na tabela — ou seja, cliente lendo
tabela direto, que é exatamente o que a Fase D fechou. Com dezenas de jogadores, uma leitura
a cada 6s é barata e não abre porta nenhuma.

A aba "Mundo" é **só** mensagem de jogador. Os avisos do jogo foram para a aba **"Sistema"**
(`CHANNEL_TO_TAB.world` → `'sistema'`). `ChatTab` deixou de ser redeclarado no `uiStore` — as
duas cópias já divergiram uma vez.

### Anexo guarda SNAPSHOT, não id

`saneiaAnexos` em `social.ts`. Duas coisas de uma vez:

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

O claim vem **antes** de enfileirar: se o enfileiramento falhar, o jogador perde o anexo —
erra contra ele, mas não imprime item, que é o lado certo de errar.

O crédito reusa `market_deliveries` (nome histórico; ela é a fila genérica de "creditar isto
no próximo request que grava").

**Bug corrigido ao vivo:** a primeira versão chamava `liquidar()` depois de coletar.
`liquidar()` é `/sessao/flush`, que responde 409 sem hunt aberta — e coletar no Hospital é
exatamente esse caso. A mensagem virava "Recebido" e o item só aparecia quando o jogador
entrasse numa hunt. Corrigido com `recarregarEstado()` (`GET /estado`, que carrega para
escrita e grava).

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
(`nome_de_treinador_disponivel`, chamável por `anon` porque devolve boolean e nada mais).

**O wipe não reseta `trainer_name`.** Dois motivos: com o índice único, N linhas voltando para
o mesmo nome abortam o wipe inteiro; e o nick deixou de ser cosmético — é a identidade
pública que `original_trainer` e as amizades referenciam.

### O bug do "Novo Jogo" que nunca rodou

Reproduzido contra o servidor local (que loga o corpo do PostgREST, ao contrário da Edge):

```
PostgREST 409 em players?user_id=eq.<uid>:
{"code":"23505","details":"Key (lower(trainer_name))=(treinador) already exists."}
```

`reiniciarJogo` zerava o estado com `defaultGameStateData()`, cujo `trainer.name` é
`'Treinador'`. Desde que o nick virou único, gravar esse nome colide com quem já o tem — o
UPDATE de `players` falhava e **toda a ação voltava 502**. O reset nunca chegou a apagar nada
depois daquela migration.

Hoje o nick sobrevive ao reset, nos dois caminhos. É o correto pelo conteúdo também: reset
apaga **progresso**.

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

`server/src/reiniciar.ts` apaga os quatro, **nessa ordem** — anúncio antes do POKE, porque
`market_listings.poke_uid` tem `on delete restrict`.

Chat, correio, amizades e Hall da Fama **não** são apagados: são o registro social do
jogador, não o save dele.

## Ranking e Perfil são rotas do servidor

O cliente **não** pode consultar isso direto: a RLS (corretamente) não deixa ler a linha de
outro jogador, e afrouxar para montar ranking exporia ouro, itens e equipe de todo mundo — o
ranking precisa de dois campos, não da linha inteira.

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

`rankingDePokemon` selecionava 11 colunas. Para abrir o cartão de perfil (que mostra IV, EXP e
HP reais) faltava quase tudo — e sintetizar a partir de (espécie, nível) daria números
plausíveis e **errados** numa tela cuja única função é comparar POKEs de jogadores diferentes.

Hoje seleciona `*` e mapeia com `rowToPoke` — o **mesmo** mapper que carrega o save do dono,
reexportado por `headless.ts`. Sem uma segunda tradução linha→POKE vivendo no servidor.
`pokemon_instances` não guarda nada privado além do `user_id`, que já era devolvido.

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
