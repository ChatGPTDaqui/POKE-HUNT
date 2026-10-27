# Mercado: preço médio, "ver no mercado" e página estilo Steam — design

Data: 27/10/2026. Status: aprovado pelo dono no chat (brainstorm), aguardando revisão do arquivo.

## Pedido

- O mercado tem um **preço médio** por item/Pokémon, calculado pelas transações (como no Steam Market).
- No inventário, a ficha do Pokémon ganha **"Ver no mercado"**, que abre o mercado já filtrado por Pokémon com as mesmas características.
- Melhorar o mercado no visual e no funcional.

## Decisões do dono

| Pergunta | Decisão |
|---|---|
| O que é "mesmo Pokémon" | **Espécie + shiny + faixa de IV** |
| Que número é o "preço médio" | **Mediana das vendas dos últimos 7 dias** |
| Sem vendas suficientes | **"Sem vendas recentes" + "à venda a partir de X"** (menor anúncio aberto). Nunca inventa preço |
| Extras desta leva | **Sugestão de preço ao vender**, **página do item estilo Steam**, **preço médio no inventário** |
| Fora desta leva | Favoritos/alerta de preço; média por nível ou habilidade |

## Estado atual (medido em 27/10/2026)

- `market_trades` guarda `kind`, `item_id`, `species_id`, `quantity`, `unit_price`, `currency`, `buyer_id`, `seller_id`, `created_at`. **Não guarda shiny nem IV.**
- Já existe histórico de preço (PH-97): views com mediana diária (`percentile_disc`) e resumo 24h/7d **por espécie** ou item, e o gráfico `HistoricoDePreco.tsx` (30 dias + volume). Ele só aparece dentro do anúncio expandido.
- `market_listings` já guarda `is_shiny` e `iv_percent` (calculado no servidor ao anunciar), `species_id`, `level` e `rarity`.
- Volume em produção: **2 vendas na história toda, 0 nos últimos 30 dias, 9 anúncios abertos e 3 ordens de item**. Por isso o caso "sem vendas" é o caso normal hoje, e a tela precisa ficar boa nele.

## Faixas de IV

| Faixa | `iv_percent` | Rótulo |
|---|---|---|
| `f0` | 0–59 | IV comum |
| `f60` | 60–79 | IV bom |
| `f80` | 80–94 | IV ótimo |
| `f95` | 95–100 | IV perfeito |

A função vive em **um lugar no SQL** (`faixa_de_iv(int) returns text`) e **um no cliente** (`src/features/mercado/faixaDeIv.ts`). Um teste prende os dois aos mesmos limites, com uma tabela de casos compartilhada.

Chave de grupo:
- Pokémon: `poke:<species_id>:<shiny 0|1>:<faixa>`, por exemplo `poke:charizard:1:f95`.
- Item: `item:<item_id>`.

## Parte 1 — servidor e preço de referência (PR 1)

### Migration (par public/dev; dev com timestamp terminado em 1)

1. `alter table market_trades add column is_shiny boolean, add column iv_faixa text`. Ficam nulos nas vendas de item e nas 2 vendas antigas.
2. `faixa_de_iv(p int) returns text`: `immutable`, `language sql`.
3. `comprar_anuncio`, `dar_lance` (no fechamento do leilão) e `responder_oferta` (ao aceitar) gravam `is_shiny` e `iv_faixa` copiados do **anúncio** (`market_listings.is_shiny` e `faixa_de_iv(iv_percent)`), não do Pokémon. O anúncio é o que o comprador viu.
   - Antes de editar, **localizar todos os `insert into market_trades`** das três RPCs e de qualquer outra função (`grep` nas migrations). Uma RPC esquecida grava venda sem faixa em silêncio.
4. RPC `preco_de_referencia(p_chaves text[])`, `stable`, `security definer`, `set search_path`. Para cada chave × moeda devolve:
   - `chave`, `currency`;
   - `mediana_7d int | null`: `percentile_disc(0.5)` das vendas dos últimos 7 dias do grupo;
   - `vendas_7d int`: quantas vendas entraram na mediana;
   - `a_partir_de int | null`: menor `price` de anúncio aberto de preço fixo do grupo. Leilão entra pelo lance atual (ou pelo lance mínimo, se ainda não houver lance). Para item, a menor ordem de venda aberta;
   - `anuncios int`: anúncios ou ordens de venda abertos.
   - Limite de 200 chaves por chamada (proteção). Chave mal formada é ignorada, não dá erro.
5. Grant de execução para `authenticated`. Rodar o gate de tipos (`database.types.regenerado.ts` do CI, commitado na PR).

**Regra de exibição** (cliente):
- `vendas_7d >= 1`: mostra "Preço médio X (N vendas em 7 dias)".
- Senão: "Sem vendas recentes" e, se `a_partir_de` existir, "à venda a partir de X".
- Nunca mostrar 0 nem traço clicável no lugar do preço.

### Cliente

- `src/data/remote/mercadoRpc.ts#precoDeReferencia(chaves)`: busca em lote.
- Hook `usePrecoDeReferencia(chaves)` (React Query, `STALE_MS` do mercado):
  - junta as chaves pedidas no mesmo quadro numa chamada só;
  - guarda o cache por chave.

### Sugestão de preço ao vender

`VenderPokes` e `VenderItens`:
- O campo de preço já nasce preenchido:
  - com `mediana_7d`;
  - senão, com `a_partir_de - 1` (mínimo 1);
  - senão, vazio, como hoje.
- Aviso inline, sem modal:
  - abaixo de 50% da referência: "Muito abaixo do preço médio (X)". O botão de anunciar pede um segundo clique para confirmar;
  - acima de 200%: "Bem acima do preço médio: pode demorar a vender". Só informa, não bloqueia.
- A referência do aviso é `mediana_7d` ou, sem ela, `a_partir_de`.
- Leilão: o mesmo aviso, mas sobre o lance mínimo.

### Preço no inventário

- O tooltip de item (`ItemTooltip`) e a ficha do Pokémon na Mochila ganham uma linha "~X ouro no mercado". Ela vem de `usePrecoDeReferencia` com a chave do item/grupo.
- Sem vendas: "Sem vendas recentes" (ou "à venda a partir de X").
- Item que não pode ir ao mercado (vinculado, ou que o mercado não aceita): nenhuma linha.
- O pedido só sai quando o tooltip ou a ficha abre. Nunca sai em lote para a grade inteira da mochila.

## Parte 2 — visual estilo Steam e "Ver no mercado" (PR 2)

### Vitrine agrupada (aba Comprar)

- **Pokémon**: um card por grupo (espécie + shiny + faixa) em vez de um card por anúncio. O card mostra:
  - sprite, nome, selos (✦ shiny, faixa de IV);
  - preço médio (ou "sem vendas recentes");
  - "N à venda a partir de X".
- Os filtros atuais continuam valendo sobre os anúncios: moeda, raridade, shiny, nível mínimo, IV mínimo e só leilão.
- A ordenação ganha a opção "mais anunciados".
- **Itens**: a lista atual vira a mesma grade de cards (ícone, nome, preço médio, "a partir de", quantidade à venda).
- O agrupamento é feito **no servidor** por uma view ou RPC paginada, com total exato. Agrupar no cliente quebraria a paginação.
  - Regra crítica do projeto: nada de `.length` acima de 1000 linhas. Usar `count: 'exact'`.

### Página do grupo

Clicar num card abre a página dentro da janela Mercado, com "← voltar" que mantém filtro e página:

- **Cabeçalho**: sprite grande, nome, selos e o preço médio em destaque (número grande, com "N vendas em 7 dias" ou "sem vendas recentes").
- **"À venda a partir de X"** e o botão **"Comprar o mais barato"**, que usa o fluxo de compra existente e confirma o valor.
- **Gráfico**: o `HistoricoDePreco` existente, maior, filtrado pelo grupo. Ele passa a aceitar `chave` (espécie + shiny + faixa), não só espécie.
- **Lista de anúncios do grupo**, do menor para o maior preço. Cada linha mostra nível, IV exato, habilidade e vendedor, com o botão comprar/lance que já existe.
- **Itens**: livro de ofertas com venda e compra lado a lado, como já existe em `ComprarItens`, no layout novo.
- **"Anunciar o meu"**: abre Vender já filtrado por esse grupo. Fica desabilitado se o jogador não tiver nenhum.

### "Ver no mercado"

- Na ficha do Pokémon na Mochila (aba Pokémon), botão secundário **"Ver no mercado"**. Não aparece para Pokémon vinculado/intransferível, porque esse nem pode ser anunciado.
- Ao clicar:
  - grava `destino = { tipo: 'poke', chave }` num store do mercado (`mercadoStore`);
  - abre a janela `mercado` (`uiStore`).
- O `MercadoMenu` lê `destino` ao montar ou quando ele muda, abre a página do grupo e zera `destino`. Passar por store, e não por prop, é o que deixa outra janela abrir o mercado sem acoplar as duas.
- Pelo tooltip do item, o mesmo vale com `{ tipo: 'item', chave }`. Fica como opcional nesta PR, porque o pedido foi só sobre Pokémon.

### Visual

- Segue `design-tokens`, os componentes do projeto (`SegmentedTabs`, `StickyHeader`, `SectionLabel`) e o tema de menu existente. Nada de paleta nova.
- O preço é o assunto da página: número grande, tabular, com a moeda (🪙/◆). Rótulo "Preço médio (7 dias)" escrito por extenso. Nunca escrever "PP" nem prometer farm offline.
- Celular (`compacto`): a grade vira lista de 1 coluna e a página do grupo empilha (cabeçalho → preço → gráfico → anúncios).

## Erros e bordas

- RPC de preço falhou: a linha some (tooltip/ficha) ou mostra "preço indisponível" (página). Nunca trava a compra ou a venda.
- Anúncio comprado por outro enquanto a página está aberta: o fluxo atual de erro de compra continua valendo e a lista recarrega.
- Moedas: preço médio **por moeda**. A página mostra ouro e diamante separados se o grupo tiver vendas nas duas.
- Vendas antigas sem faixa de IV: contam no gráfico por espécie (views atuais), mas **não** no preço médio do grupo. Com 2 vendas na história, o efeito é nulo.
- Manipulação (vender para um amigo por preço absurdo): a mediana resiste a vendas isoladas. Com volume baixo ainda dá para mexer no número. Isso é aceito nesta leva, e a contagem "N vendas" deixa visível quando o número vem de uma venda só.

## Testes

- SQL: `faixa_de_iv` nos limites (59/60, 79/80, 94/95); `preco_de_referencia` com 0 vendas, 1 venda e vendas fora dos 7 dias; leilão sem lance; chave inválida; limite de 200.
- Paridade das faixas cliente × SQL (tabela compartilhada).
- `usePrecoDeReferencia`: junta pedidos e o cache funciona por chave.
- Sugestão ao vender: preenche pela mediana; sem ela, cai para "a partir de - 1"; avisa abaixo de 50% e acima de 200%; o segundo clique confirma.
- "Ver no mercado": a ficha grava o destino certo (espécie + shiny + faixa daquele Pokémon); o Mercado abre a página e zera o destino.
- Vitrine agrupada: o total vem do servidor (`count: 'exact'`) e um grupo não aparece duplicado entre páginas.
- Guardas de texto existentes (wiki sem "PP", sem farm offline, sem "Correio" no cliente) continuam verdes.

## Entrega

1. **PR 1 (8.56)**: migration + RPC + gravação da faixa nas vendas + `usePrecoDeReferencia` + sugestão ao vender + linha no inventário.
2. **PR 2 (8.57)**: vitrine agrupada + página do grupo + "Ver no mercado" + o visual novo.

Cada PR com patch notes e a suíte completa verde. Promovida por lote, como a cascata dos mapas.
