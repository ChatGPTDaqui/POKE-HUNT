# NOVO POKE IDLE — Inventário completo de UI

> **REGISTRO HISTÓRICO — retrata a UI ANTES do redesenho de 2026-09-02.**
>
> Ele foi escrito como referência **para** um redesenho, e o redesenho aconteceu (PH-425→442, em
> produção desde 02/09). O que este documento descreve deixou de existir em pontos centrais:
>
> - fala em **faixa**, vocabulário removido na PH-434 — hoje o modelo é **bioma + estágio**;
> - não conhece a **trilha de estágios**, que é a navegação principal de hunts;
> - fala em **Correio**, que virou **Social** na PH-436.
>
> Vale como retrato do que existia e como inventário de padrões de UI que sobreviveram — **não
> como descrição do jogo atual**. Cabeçalho posto na PH-468 (2026-09-03).

Descreve **cada** tela, painel, janela, modal, balão,
tooltip e botão que existe hoje no jogo, com posição, conteúdo, estados e o que cada controle faz.
Escrito a partir do código real (`src/`), não de memória.

Stack atual: React + TypeScript + Vite + Tailwind v4 + shadcn/ui (base-ui) + Zustand.
Todo texto de interface está em português (sem acentos em boa parte do código, por herança do
projeto vanilla). O mundo do jogo é desenhado em `<canvas>`; tudo em volta é DOM.

---

## 0. Contexto do produto (o que o jogador faz)

Idle/incremental de captura e batalha automática, tema Pokémon Gen 1/2 (251 espécies no banco,
~226 alcançáveis). O jogador **não ataca**: escolhe onde caçar, cuida da equipe e administra
recursos. O POKE ativo anda sozinho pelo mapa, engaja o inimigo mais próximo, usa golpes por conta
própria, e o loop se repete. O progresso continua rodando com a aba fechada (Farm Offline
simulado no servidor).

Duas moedas: **Ouro** (economia principal) e **Diamantes** (existe na carteira e no HUD, mas hoje
nenhuma loja consome — jogo novo começa com 5).

---

## 1. Arquitetura de navegação

Duas camadas, de propósito:

**Rotas (React Router)** — só o shell:

| Rota | Tela |
|---|---|
| `/` | Landing pública (HomePage) |
| `/login` | Formulário de login |
| `/registro` | Formulário de cadastro |
| `/jogo` | O jogo (exige sessão) |
| `*` | Redireciona para `/` |

**Dentro do jogo, não há rotas.** Qual menu está aberto é estado (`uiStore.currentScreen`),
porque nenhum menu é compartilhável nem faz sentido como deep-link, e virar rota causaria remount
de tela cheia com o canvas rodando por baixo.

### Hierarquia de camadas (z-index real, importante para o redesign)

```
canvas do jogo (fundo, tela inteira)
└─ camada de HUD  (absolute inset-0, pointer-events:none — cada filho reativa o clique)
   ├─ z-30  backdrop do ScreenOverlay (preto 50%)
   ├─ z-35  HUD topo, menu principal, zoom, barra de golpes, painel de taxa, chat
   ├─ z-40  StartScreen (escolha do inicial) / painel flutuante Auto aberto
   ├─ z-55  modais de estado de mundo (derrota BOSS, contagem Lance, vitória Lance, revive)
   └─ z-60  splash "LVL UP !"
toasts / modal de perfil / dialog de confirmação (fora da camada de HUD)
```

Nota de design: **não existe blur atrás dos menus** — foi removido por pedido explícito. O
backdrop só escurece. O jogo tem que continuar visível/legível atrás de qualquer painel.

---

## 2. Telas de entrada (fora do jogo)

### 2.1 HomePage (`/`)

Landing centralizada, tela inteira, fundo `background`.

- Título `NOVO POKE IDLE` (3xl, bold).
- Parágrafo de pitch (máx. ~28rem, cor `muted-foreground`): "Um idle de captura e batalha
  automática. Escolha seu inicial, explore as hunts e evolua sua equipe — o progresso continua
  rodando enquanto você está fora."
- Dois botões lado a lado, tamanho `lg`: **Criar conta** (primário) e **Entrar** (outline).
- Se já houver sessão, redireciona direto para `/jogo` (nunca pisca a landing).

### 2.2 Login (`/login`) e Cadastro (`/registro`)

O mesmo componente (`AuthForm`) com textos diferentes. Card centralizado, `max-w-sm`, borda,
fundo `card`, padding 6.

Campos e controles:
- Título + descrição.
- **Email** (`type=email`, obrigatório).
- **Senha** (`type=password`). No cadastro aparece a dica "Pelo menos 8 caracteres, com letras e
  números".
- **Confirme a senha** — só no cadastro.
- Faixa de erro (`role=alert`): borda + fundo vermelho translúcido, texto `destructive`. Casos:
  senha curta, senha sem mistura letra/número, senhas diferentes, erro devolvido pelo Supabase.
- Botão de ação, largura total. Enquanto envia, vira **"Aguarde..."** e fica desabilitado.
- Rodapé com link para a outra tela ("Ainda não tem conta? Criar conta" / "Já tem conta? Entrar").

### 2.3 Estados de carregamento entre login e jogo

- **Recuperando sessão**: tela cheia, centralizada, só o texto "Carregando..." em
  `muted-foreground`. Existe para não piscar a tela de login para quem já está logado.
- **Carregando progresso do servidor**: tela cheia centralizada, "Carregando seu progresso...".
  O jogo **não** monta antes disso (montar antes gravaria estado vazio por cima do save real).
- **Erro ao carregar progresso**: "Não foi possível carregar seu progresso." (destructive) +
  mensagem do erro + botão **Tentar de novo** (recarrega a página).

---

## 3. Primeira sessão: escolha do inicial (StartScreen)

Sobreposição de tela cheia (`z-40`, fundo `background/95`), mostrada sempre que o jogador não tem
nenhum POKE. **Não é fechável** — é o gate de início.

- Título `NOVO POKE IDLE` (2xl).
- Subtítulo: "Você está prestes a começar sua jornada. Escolha um POKE para chamar de seu."
- Três cards de 224px (`w-56`), lado a lado, com wrap:
  - Sprite **animada** (GIF estilo Pokémon Showdown, `assets/gen5ani/`), 96x96,
    `image-rendering: pixelated`, `object-contain`.
  - Nome da espécie (base, medium).
  - Descrição vinda do dado ("Pokedex Nº4 - tipo FIRE.").
  - Botão **Escolher**, largura total.
- Trio fixo: Charmander, Squirtle, Bulbasaur. Nasce Nível 1 com IVs fixos (23 em cada = 75%) e
  raridade `comum` — de propósito previsível.

---

## 4. HUD permanente (sempre por cima do canvas)

Tudo abaixo é `pointer-events-auto` dentro de uma camada `pointer-events-none`, para o clique na
Enfermeira (no canvas) continuar funcionando.

### 4.1 Barra de status — topo centro (`top-2`, centralizada)

Card arredondado, borda, `background/85`, `backdrop-blur-sm`, texto `xs`. Três linhas:

1. **Linha do Treinador**: nome · `Lv{n}` · barra de EXP fina (96px × 4px, preenchimento âmbar).
2. **Linha do POKE ativo** (ou o texto "Nenhum POKE ainda"):
   - **Botão-ícone** 40×40: retrato do POKE, borda de 2px **na cor da raridade**; badge ✨ no
     canto superior esquerdo se shiny. Clicar abre o **modal de perfil**. `title="Ver perfil de X"`.
   - Nome com: ✨ (se shiny) · **badge de raridade** (contornado, na cor da raridade, ex. `RARO`) ·
     nome (roxo `violet-400` se shiny) · `Lv{n}`.
   - **Botão "Evoluir"** — aparece só quando o POKE atingiu o nível de evolução. Contornado em
     âmbar. Se a evolução for do tipo "especial" (ex-troca), o label já mostra o custo:
     `Evoluir (20x Pedra ROCK)`. Clique com Stones insuficientes mostra toast de erro.
   - `- Desmaiado!` em vermelho quando o POKE caiu.
   - **Barra de HP** (6px): verde `emerald-500`, vira `destructive` abaixo de 30%.
   - **Barra de EXP** (4px): azul `sky-500`.
3. **Linha da carteira**: `🪙 {ouro}` e `Diamantes: {n}`.

Fonte de HP/EXP é o estado de mundo ao vivo (muda a cada tick), não o save.

### 4.2 Menu principal — logo abaixo do HUD (`top-20`, centralizado)

Barra horizontal (`flex-wrap`), fundo `card/90`, `backdrop-blur`, botões `size=sm`, texto `xs`.
O botão da tela aberta fica em variante `default` (preenchido); os outros `ghost`. **Clicar de
novo na tela aberta fecha** (toggle).

Ordem e rótulos exatos (emojis fazem parte do label):

| Botão | Ação |
|---|---|
| `🏥 Hospital` | **Só aparece quando o jogador está numa hunt.** Não abre painel — troca a cena do canvas de volta ao Hospital e fecha o menu aberto. |
| `⚾ Equipe` | Abre painel Equipe |
| `🎒 Mochila` | Abre painel Mochila |
| `🗺️ Hunts` | Abre painel Hunts |
| `🛒 Loja` | Abre painel Loja |
| `📖 Pokedex` | Abre painel Pokedex |
| `📚 Wiki` | Abre painel Wiki |
| `⚙️ Config` | Abre painel Configurações |

O botão **Auto** não está aqui — é flutuante (ver 4.6).

### 4.3 Controle de zoom — canto superior direito (`top-20 right-2`)

Pílula pequena: botão `−`, label `{n}%` (tabular-nums, 40px), botão `+`. Passo de 10%, limites
50%–250%, padrão 150%. `title`: "Diminuir zoom" / "Aumentar zoom". O gesto **Ctrl+Scroll** sobre o
canvas faz o mesmo e o label acompanha.

### 4.4 Barra de golpes — rodapé centro (`bottom-3`)

Fileira de slots 48×48, um por golpe utilizável do POKE em campo (Ataque Básico sempre primeiro).
Cada slot:

- **Fundo sólido na cor do tipo elemental** do golpe.
- **Borda de 4px por categoria**: cinza `#9aa0a6` = físico, azul `#60a5fa` = especial.
- Texto central: sigla de até 3 letras do nome do golpe (ex. `RAZ`), branco, com sombra escura.
- **Anel branco** (`ring-2`) quando o golpe está pronto.
- **Bolinha verde** 12px no canto superior direito quando o golpe é **AOE** (área).
- **Overlay de cooldown**: preto 65% cobrindo o slot inteiro, com o tempo restante em segundos
  (1 decimal).
- **Overlay `OFF`**: preto 75% quando o jogador desativou aquele golpe.
- **Faixa de dano** no rodapé do slot (preto 70%, 9px): o `power` base do golpe. Fica **acima** do
  overlay de cooldown, então continua legível com o golpe recarregando.
- **Duplo clique** liga/desliga o golpe na rotação automática da IA. `title` explica isso.

### 4.5 Painel de taxa de farm — rodapé esquerdo (`bottom-3 left-3`)

Card de 160px, `background/85`, blur, texto `xs`. Quatro linhas label/valor:
**Ouro/H**, **XP/H**, **Mobs/H**, **Shinys**. Ouro/H e XP/H são abreviados (`10k`, `1.3M`);
Mobs/H e Shinys são número cheio. Abaixo, botão **Resetar** (outline, largura total, 24px de
altura). A amostra também zera automaticamente ao entrar em qualquer hunt. Recalcula 1×/s.

### 4.6 Botão + painel flutuante Auto (canto inferior esquerdo)

- **Botão `🤖`** (outline, altura 40px, fonte 20px, `title="Automacoes"`). Toggle.
- **Badge de itens ativos**, logo abaixo do botão: card de 160px listando **só** as bolas que o
  bot pode usar agora (bola padrão, bola shiny se ligada, e a bola de cada regra por espécie),
  com ícone 16px + `Nome xN`. Some inteiro se auto-catch estiver desligado. De propósito **não** é
  o inventário completo.
- **Painel aberto**: janela flutuante `fixed bottom-24 left-4`, 288px, `z-40`,
  `background/95` + blur. **Não passa pelo overlay escuro** — foi feito assim para o jogador
  continuar vendo o campo de batalha enquanto mexe nas automações.
  - Barra de título arrastável (`cursor-move`) com "Automacoes" e botão `✕`.
  - Corpo rolável (`max-h-60vh`).
  - Fecha por: `✕`, ou clique fora (o clique que abriu não conta).

#### Conteúdo do painel Auto (todo em texto `xs`)

Cada seção com toggle tem um **ícone `?` circular** de 16px que abre tooltip explicativo.

1. **Auto-pot** + `Switch`. Tooltip: como as regras funcionam e que a primeira que casar é usada.
2. **Lista de regras de auto-pot** (máx. 3), cada uma numa caixa com borda:
   `Vida <= [input numérico 56px] %, usar [select de poção]` + **badge de quantidade** `x{n}` ao
   lado do select + botão **Remover** (só quando há mais de 1 regra).
   O select tem a opção especial **"Escolher melhor"** (que não mostra badge de quantidade).
3. Botão **+ Adicionar regra**, largura total, desabilitado no limite de 3.
4. **Auto-catch** + `Switch`. Tooltip: lança a bola em todo inimigo derrotado; capturas vão para a
   mochila.
5. **Catch Shiny** + `Switch`. Tooltip: usa uma bola diferente especificamente em shinies.
6. **Grid 2 colunas**: `Bola padrao` e `Bola Shiny`, cada uma um select + badge de quantidade. O
   select de shiny fica **desabilitado (opacity 50%)** quando "Catch Shiny" está desligado.
7. **Regras por espécie** (título + tooltip: tem prioridade sobre a bola padrão; se a bola da
   regra acabar, o bot só mata aquela espécie).
   - Se não estiver numa hunt: "Entre numa hunt pra configurar regras por especie."
   - Cada regra: select de espécie (as da hunt atual; uma espécie de outra hunt aparece como
     `Nome (fora da hunt atual)` em vez de desaparecer) + select de bola + badge de quantidade +
     **Remover**.
   - Botão **+ Adicionar regra**, desabilitado fora de hunt.
8. **Auto-revive** + `Switch`. Tooltip: usa um Revive da mochila automaticamente.

Os três toggles começam **ligados** por padrão.

### 4.7 Chat / log — rodapé direito (`bottom-3 right-3`)

Janela de 288px, `background/90` + blur, texto `xs`, **arrastável** pela barra de título.

- Barra de título: três abas-botão (**Mundo**, **Comercio**, **Log**) — a ativa com fundo `accent`;
  à direita um botão `−`/`+` que **colapsa** o corpo.
- Corpo: lista rolável (`max-h-40`), rola sozinho para o fim quando chega linha nova. Vazio mostra
  "Nada por aqui ainda."
- Cor por tipo de mensagem: ouro `amber-300`, level-up `sky-300`, sucesso/captura `emerald-300`,
  falha de captura `orange-300`, erro `destructive`.
- Roteamento: mensagens de **combate** vão **só** para a aba Log (nunca viram toast); `world` e
  `trade` viram toast **e** ficam logadas. Limite de 60 linhas por aba.

### 4.8 Toasts

Pilha centralizada de cartõezinhos (`rounded-md`, borda, `background/90`, blur, texto `xs`), cada
um sumindo sozinho depois de **2,5s**. Borda e texto coloridos por tipo (mesma paleta do chat).
Não clicáveis (`pointer-events-none`).

---

## 5. Painéis do menu principal (janelas)

Todos usam o **mesmo contêiner** (`ScreenOverlay`):

- Backdrop `absolute inset-0`, preto 50%, `z-30`. **Clique no backdrop fecha.**
- Janela centralizada: `max-h-78vh`, largura `min(560px, 100vw - 2rem)`, `rounded-xl`, borda,
  fundo `background`, `shadow-xl`.
- **Barra de título fixa** (fora da área rolável): serve de **alça de arraste** (`cursor-move`) e
  contém só o botão `✕` alinhado à direita.
- Corpo rolável com padding 4. Cada painel escreve seu próprio `<h2>` de título dentro do corpo.

### 5.1 Equipe (`⚾`)

- Título: **`Equipe (n/6)`**.
- Vazio: "Voce ainda nao tem nenhum POKE."
- Um card por POKE (borda, fundo `card`, hover `accent/40`, **todo o card é clicável** → abre o
  modal de perfil):
  - **Swatch** 40×40 (retrato, borda na cor da raridade, ✨ se shiny) — com **tooltip de hover**
    (ver 6.4).
  - Nome (tag shiny + badge de raridade + nome) · `Lv{n}`.
  - Botão **Evoluir** (secondary, 24px) quando elegível — com custo em Stones no label se for
    evolução especial.
  - Marcador `(Em campo)` no POKE ativo.
  - Segunda linha: `HP {atual}/{máx} | EXP {atual}/{necessário}`.
  - Coluna de ações à direita (empilhada):
    - **Colocar em campo** — só nos POKEs que não estão ativos. O POKE escolhido sobe para o topo
      da lista.
    - **Retirar da equipe** — só se houver mais de 1 POKE (sempre tem que sobrar um). Manda o POKE
      para a mochila.

### 5.2 Mochila (`🎒`)

Título **Mochila** + abas **Pokemons** / **Itens**.

**Aba Pokemons**
- Vazio: "Nenhum POKE na mochila."
- Campo de busca: "Buscar POKE por nome...".
- Linha de controles: label `Ordenar por` + select (**Raridade** / **IV** / **Nivel**) + botão de
  direção `↓`/`↑` + checkbox **Somente Shiny ✨**.
- Sem resultado: "Nenhum POKE encontrado."
- Card por POKE (clicável → perfil): swatch · nome+raridade+shiny · `Lv{n}` · `HP a/b` ·
  botão **🔓/🔒** (trancar contra venda, com `title` "Trancar"/"Destrancar") ·
  botão **Mover p/ equipe** — que vira o texto `Equipe cheia` quando já há 6.

**Aba Itens**
- Vazio: "Nenhum item."
- Card por item: ícone 40×40 (`title` = descrição; **Stones ganham uma borda de 3px na cor do
  tipo elemental**, já que as 17 compartilham a mesma arte) · `Nome xQuantidade` · descrição ·
  botão **🔓/🔒** · botão **Usar**.
- **Usar** só aparece quando faz sentido: poção apenas com o POKE de pé, Revive apenas com o POKE
  desmaiado.

### 5.3 Loja (`🛒`)

Título **Loja** + linha `Ouro: n | Diamantes: n` + abas **Itens** / **Pokemons**.

**Aba Itens** — duas colunas lado a lado (empilham no mobile):

*Coluna COMPRAR* (label em maiúsculas, `muted-foreground`):
- Card por item vendido: ícone · `Nome (voce tem: n)` · `Preço: n ouro` · **controle de
  quantidade** (slider de 96px + input numérico de 64px sincronizados, teto = o que o ouro paga) ·
  botão **`Comprar (n ouro)`** com o total já calculado.
- Stones **não** aparecem aqui (só dropam de inimigo).

*Coluna VENDER ITENS*:
- Cabeçalho com botão **Vender Tudo** à direita.
- Vazio: "Nenhum item para vender."
- Card por item possuído: ícone · `Nome xN` · `Valor de venda: n ouro` · botão **🔓/🔒** ·
  e — **só se destrancado** — controle de quantidade + **`Vender (n)`** + **Vender Tudo**.

**Aba Pokemons** — venda em lote da mochila. Cabeçalho `VENDER POKES EXTRAS (MOCHILA)`.
- Campo de busca por nome.
- Filtros: `IV min%` e `IV max%` (inputs numéricos de 64px, 0–100) + botão
  **`Ordenar por IV ↓/↑`**. Se min > max, mostra o aviso "IV min% é maior que IV max% —
  invertido automaticamente para filtrar" e filtra com o par ordenado (nunca zera a lista por
  erro de digitação).
- Fileira de **checkboxes de raridade** (uma por raridade, o label na cor da raridade, todas
  marcadas por padrão) + checkbox **Somente Shiny ✨**.
- Linha de ações: checkbox **Selecionar tudo** à esquerda; à direita
  **`Vender Selecionados (n)`** (desabilitado sem seleção) e **Vender Tudo**.
- Mensagens de lista vazia: "Nenhum POKE extra na mochila." / "Nenhum POKE corresponde ao filtro
  de IV."
- Card por POKE (clicável → perfil): **checkbox** (ou um espaçador de 16px, para manter as colunas
  alinhadas) · swatch · nome · `Lv{n}` · `IV: n%` · botão de venda mostrando o valor real:
  **`Vender (n ouro)`**, ou **`🔒 Trancado`** desabilitado.
- **Regras de segurança visíveis na UI**: POKE trancado nunca entra em seleção nem em "Vender
  Tudo"; shiny fica fora da seleção em lote a menos que o filtro "Somente Shiny" esteja ligado, e
  vender shiny sempre exige um **diálogo de confirmação** ("Vender POKE Shiny?" / "Vender POKEs
  Shiny?", com botões `Cancelar` e `Vender`).
- Depois de "Vender Tudo", toasts informam quantos shinies e quantos trancados foram poupados.

### 5.4 Hunts (`🗺️`)

Estados de bloqueio (substituem o painel inteiro):
- Sem nenhum POKE: "Volte ao Hospital e escolha seu primeiro POKE antes de sair para caçar."
- POKE desmaiado: "Seu POKE esta desmaiado! Volte ao Hospital para cura-lo antes de sair para
  caçar."

Painel normal, título **Selecione um mapa**:
- **Abas de continente** (botões): `Johto`, `Novo Continente (Kanto)`, `Modo Pesadelo`. Só
  aparecem se houver mais de um continente.
- Linha de filtro: busca "Buscar local ou POKE..." (casa pelo nome da hunt **ou** pelo nome de
  qualquer espécie que aparece nela) + select **"Todos os elementos"** com os 17 tipos.
- Sem resultado: "Nenhuma hunt encontrada (pode estar oculta pelo filtro de elemento)."
- **Card de hunt** (todo o corpo é clicável → expande/recolhe o detalhe):
  - **Círculo de 32px** colorido com o **tipo elemental dominante** da hunt (ponderado pelas odds
    reais de spawn).
  - `{Nome da hunt} (Lv {min}-{max})`.
  - **Ícone `?`** circular de 16px ao lado do nome, `cursor-help` → **tooltip** com:
    - "Pokemons na area": lista rolável (`max-h-48`) de `retrato 20px + chips de tipo + nome —
      {n.n}%`.
    - "Tipos dominantes": chips de tipo com a % somada.
  - Linha de bloqueio, **só quando trancado**: "Derrote o Campeao Lance (Johto) para desbloquear"
    (gate de continente) ou `Custo: n ouro`.
  - **Botão de ação**: **Entrar** (desbloqueado) · **Desbloquear** (custa ouro) · **Bloqueado**
    (gate de continente — clicar mostra toast explicando).
    A tela **só fecha se o jogador realmente entrou** (o servidor pode recusar).
  - **Painel expandido** abaixo do card: "Pokemons de {nome}" com a mesma lista de espécies + %.

### 5.5 Pokedex (`📖`)

Título **Pokedex**. Lista **todas** as espécies do jogo, mesmo as nunca vistas, ordenadas por
número da Dex.

- Linha superior: busca "Buscar Pokemon..." + botão toggle
  **`✨ Abates Totais` / `✨ Abates Shiny`** (troca o contador exibido).
- Card por espécie (clicável): swatch · `#{dex} {Nome}` + chips de tipo · `Abates: n`
  (ou `✨ Abates shiny: n`).
  Clicar **expande o detalhe e abre o modal de perfil** com uma instância de preview
  determinística (Nível 50, IVs 31, raridade comum) — nunca entra no save.
- **Detalhe expandido**:
  - **Status base**: grid 3 colunas com HP, Atk Fis, Atk Esp, Defesa, Def Esp, Velocidade.
  - **Fraquezas e resistencias**: o bloco compartilhado (ver 6.5).
  - **Golpes aprendidos**: tabela de 6 colunas — `Nv | Golpe | Tipo | Cat. | Dano | AOE`, corpo
    rolável (`max-h-64`). Tipo é chip colorido; Dano vazio vira `—`; AOE vira `✓`/`—`.
  - **Onde encontrar**: botões, um por hunt, com `{nome} (Lv x-y)`. Clicar **pula para a tela de
    Hunts já filtrada** naquela hunt. Vazio: "Nenhuma hunt conhecida ainda."

### 5.6 Wiki (`📚`)

Título **📚 Wiki**, quatro abas. É documentação in-game em cartões (`card`, título medium, corpo
`xs muted-foreground` com `<b>` de ênfase).

**Aba "Primeiros Passos"** — 5 cartões: boas-vindas/o que é um idle; escolhendo o inicial; como
funciona o combate automático (incluindo o duplo clique para desligar golpe); navegando pelos
menus (lista com os mesmos emojis do nav); progredindo nas hunts.

**Aba "Efetividade de Tipos"** — parte texto, parte ferramenta:
- Cartão explicando 2x / 0.5x / 0x e como tipo duplo multiplica, com um **select de tipo**.
- Cartão "Atacando com golpes de [chip]": três listas de chips — super eficaz, pouco eficaz, sem
  efeito.
- Cartão "Defendendo como um POKE de [chip]": fraqueza, resistência, imunidade.
- Cartão com a **matriz completa 17×17** (linha = golpe atacante, coluna = defensor), rolável na
  horizontal. Cabeçalhos coloridos por tipo. Células: `2` em verde translúcido e bold, `0.5` em
  âmbar, `0` em vermelho e bold, `·` (= 1x) em `muted-foreground`. Nota: "Arraste pros lados...".

**Aba "Raridades"** — cartão explicando o eixo de raridade; **tabela de 4 colunas**
(`Raridade | Chance | Status | Venda`) com o nome na cor da raridade; cartão sobre Shiny ser um
eixo separado; cartão sobre lendários (exclusivos das 11 hunts BOSS, 1.5x de escala visual, barra
de HP maior).

**Aba "Mecanicas"** — 5 cartões: sistema de captura; ódio/agressividade (aggro e leash); distância
de visão (câmera/FOV e zoom); habilidades em área (AoE, e o golpe de área que todo POKE aprende no
Nível 50); sistema de recarga (PP → cooldown, ajuste por Velocidade, o POKE fica parado enquanto
usa o golpe).

### 5.7 Configurações (`⚙️`)

Título **Configuracoes**, abas **Geral** / **Patch-notes**.

**Geral** — um único cartão: "Iniciar novo jogo" + "Apaga todo o progresso (equipe, itens, ouro,
mapas) e comeca do zero." + botão **destructive** "Iniciar novo jogo" que abre um
**AlertDialog**: título "Apagar todo o progresso?", corpo "Equipe, itens, ouro e mapas
desbloqueados serao perdidos. Essa acao nao pode ser desfeita.", botões `Cancelar` e
`Apagar e recomecar`.

**Patch-notes** — um cartão por versão, mais recente primeiro: título · `v{versão}` à direita ·
data · lista com marcadores dos destaques.

---

## 6. Modais, balões e sobreposições

### 6.1 Modal de perfil do POKE (o mais importante do jogo)

É a experiência **única e canônica** de "clicar num POKE" — Equipe, Mochila, Loja, Pokedex e o
ícone do POKE ativo no HUD abrem todos o mesmo modal. Dialog centralizado, `max-w-md`,
`max-h-85vh` rolável, **arrastável pelo cabeçalho**.

- **Cabeçalho fixo (nunca re-monta ao trocar de aba** — se remontasse, o GIF reiniciaria):
  - **Box de sprite 132×132** com borda de 2px na cor da raridade, fundo `muted/40`, contendo a
    **sprite animada** (GIF gen5, `object-contain`, `pixelated`). Se o arquivo faltar, a imagem se
    remove sozinha.
  - À direita: nome (shiny + badge de raridade + nome) · `Lv{n}` · chips de tipo · barra de **HP**
    com `atual/máx` · barra de **EXP**.
- **Duas abas** (`Status` / `Golpes`), sublinhado no ativo. Trocar de POKE volta para Status.
- **Aba Status**: grid 3 colunas com Atk Fis, Atk Esp, Defesa, Def Esp, Velocidade; fileira de
  **chips de IV** compactos (`HP 20`, `AF 15`, `AE 31`, `DF`, `DE`, `VL`); linha
  `Habilidades: ...` (ou "Nenhuma ainda"); e o bloco **Fraquezas e resistencias**.
- **Aba Golpes**: o **learnset completo da espécie** (não só o que já foi desbloqueado) na tabela
  de 6 colunas. Linhas já aprendidas ganham fundo `accent/40` e texto normal; o resto fica
  esmaecido — a tabela também serve de preview do que vem por aí.

### 6.2 Diálogo de confirmação genérico

`AlertDialog` com título, mensagem, `Cancelar` e um botão de ação **destructive** (labels
customizáveis). Usado por qualquer ação destrutiva o bastante para merecer um segundo clique.

### 6.3 Relatório de Farm Offline ("Bem-vindo de volta!")

Mostrado **uma vez** no boot quando o jogador ficou fora tempo relevante e a simulação rendeu pelo
menos 1 abate. Dialog `max-w-md`, `max-h-85vh` rolável, arrastável pelo título, texto `xs`.

- Título **Bem-vindo de volta!** + "Voce ficou fora por {2h 15min}".
- Avisos condicionais (laranja `orange-400`):
  - POKE desmaiou e acabaram os Revives → a farm parou antes do tempo.
  - Simulação truncada para não travar o aparelho.
  - Nota de teto: "Limitado a Xh de simulacao...".
- Se nada aconteceu: "Nada aconteceu enquanto voce esteve fora."
- **Bloco de ganhos** — cada linha só aparece se o valor for > 0 (pedido explícito: nunca mostrar
  parede de zeros): Ouro ganho, EXP ganho, "POKE ativo: Subiu de nivel!", "Treinador: Subiu de
  nivel!", POKEs capturados, Shinys avistados, Shinys capturados.
- **CAPTURAS**: grid de 2 colunas com até 40 entradas (sprite 24px + nome com raridade/shiny +
  `Lv{n}`), e `+N outro(s)...` para o resto.
- **ITENS OBTIDOS** e **CONSUMIVEIS GASTOS (n)**: listas com ícone 16px + `Nome xN`.
- **BALANCO ESTIMADO**: Ganho (ouro + itens + POKEs), Gasto (consumíveis), e **Saldo** em verde
  `emerald-400` se positivo, `destructive` se negativo.
- Botão **Fechar** alinhado à direita.

### 6.4 Tooltip de hover do POKE (balão)

Aparece ao passar o mouse em qualquer **swatch** que tenha um POKE associado. Resumo compacto:
`Nome (TIPO / TIPO2)`, `HP a/b`, `Atk Fis/Esp`, `Def Fis/Esp`, `Velocidade`, `IV medio: n%`. O
detalhamento completo fica atrás do clique (modal de perfil).

### 6.5 Bloco "Fraquezas e resistencias" (compartilhado)

Usado no perfil e na Pokedex. Fileiras de chips de tipo com rótulos:
- "Vantagem contra (2x de dano)" — título em verde.
- "⚠ Fraqueza dupla (4x de dano)" — só quando existe, título em vermelho e bold.
- "Fraco contra (2x)", "Resiste (0.5x)", "Resiste em dobro (0.25x)" (só quando existe),
  "Imune a".
- Lista vazia mostra "Nenhum".

### 6.6 Splash "LVL UP !"

Sobreposição de tela cheia, `z-60`, não clicável. Texto gigante (`text-6xl`, monospace black,
âmbar `amber-300`) com **pseudo pixel-art** feito por camadas de `text-shadow` em degrau (não há
asset). Entra com fade + zoom e **desaparece sozinho em 2s**. Dispara na evolução de um POKE e no
level-up do Treinador (nunca durante simulação offline).

### 6.7 Contagem regressiva de Auto-Revive

Tela cheia, `z-55`, fundo preto 60%, não clicável: "POKE desmaiado! Auto-Revive em..." + número
gigante (5xl monospace, verde `emerald-300`) contando ~3–5s antes de reanimar.

### 6.8 Modal de derrota em hunt BOSS

Nas 11 hunts BOSS, auto-pot e auto-revive são **desligados à força** — morrer é definitivo. Em vez
da contagem, aparece: tela cheia `z-55`, preto 70%, card com **borda vermelha**, título
**"Voce foi derrotado!"** (destructive, bold) e um único botão destructive:
**"Volte para Hospital e nao pise mais aqui"**. É a única saída.

### 6.9 Modais exclusivos do Campeão Lance (chefe final de Johto)

- **Contagem de intro**: tela cheia `z-55`, preto 60%, "O Campeao Lance se aproxima..." + número
  6xl monospace âmbar. O combate fica congelado e nada nasceu ainda enquanto isso corre.
- **Atalho de vitória**: faixa `top-24`, centralizada, card com **borda âmbar**:
  "Voce derrotou o Campeao Lance!" + botão **Retornar ao Centro Pokemon**. Aparece enquanto o
  jogador ainda estiver parado na hunt dele.

---

## 7. UI desenhada no canvas (não é DOM, mas é interface)

O redesign precisa considerar isso porque compete visualmente com o HUD.

### 7.1 Por entidade em campo (jogador e cada inimigo)

- **Sombra**: elipse escura nos pés.
- **Aura por IV máximo** (`drawAura`): cada atributo com IV 31 projeta um halo neon **na silhueta
  real do sprite** (técnica de shadow-cast, não moldura retangular) — HP verde, Atk Fis vermelho,
  Atk Esp roxo, Def cinza, Def Esp azul, Velocidade amarelo. Vários atributos maxados = camadas
  sobrepostas com alpha reduzido.
- **Sprite de batalha** animada (PMD Sprite Collab, 8 direções), com fallback geométrico colorido
  pelo tipo quando falta arte.
- **Barra de HP**: pílula desenhada em canvas — trilho preto 60% arredondado + preenchimento que
  troca de cor por percentual. Padrão 32×5px. **Lendários: 5x mais larga e 2x mais alta.**
- **Nome + nível**: duas linhas de texto 9px monospace com contorno preto (`lineJoin: round`),
  centralizadas acima do sprite. Shiny ganha `✨` no nome e cor roxa `#b366ff`.

### 7.2 Texto flutuante de combate (sistema de "raias")

Todo texto de combate é ancorado **na entidade** e a segue enquanto ela anda, empilhado em coluna
alinhada à esquerda acima do nome (raias de 16px, folga base de 44px). Cada efeito reserva sua
raia e libera ao terminar, então textos simultâneos nunca se sobrepõem.

- **Número de dano**: `-{n}` (bold 12px), na cor do efeito, sobe 30px e desvanece.
- **Rótulo de efetividade** acima do dano: "Super efetivo!" em **bold 13px** (maior, de propósito;
  reserva raia dupla), os outros em 9px.
- **Nome do golpe**: bold 8px, **na cor do tipo elemental**, estático (só faz fade).
- **Texto de recompensa**: `+{n} 🪙` (bold 11px, amarelo), sobe 34px.

### 7.3 Efeitos de golpe (100% procedurais, sem nenhum asset)

- **Golpe single-target**: `drawImpactBurst` — glow radial aditivo + 7 partículas na cor do tipo
  espalhando-se para fora, com **forma temática por tipo elemental** (12 famílias: chama, gota,
  folha, fragmento, raio, cristal, estrela, bolha, pedra, pena, espiral, névoa, garra).
- **Golpe AOE**: `drawAoeRing` — anel expandindo até o **raio real de efeito** (então dá para ver
  quem vai ser atingido), com preenchimento fraco por baixo e halo por cima, mais 12 partículas
  temáticas.
- **Animação de captura**: spritesheet de pokébola quicando, com variação por bola e por
  sucesso/falha.

### 7.4 Cena do Hospital

Não é um menu — é uma **cena do canvas** (o mapa é `null`). Fundo em xadrez azulado procedural.

- **Enfermeira**: marcador quadrado 32×32 creme com uma cruz vermelha e o rótulo "Enfermeira"
  abaixo. **Clicar nela cura a equipe inteira, de graça** — é a única forma de curar
  manualmente. O cursor vira `pointer` no hover (hit-test de 30px de raio).
- O POKE ativo aparece desenhado abaixo dela, com barra de HP e nome.
- Não há nenhum outro elemento interativo na cena.

### 7.5 Câmera

Zoom padrão 150% (limites 50%–250%). O jogador é ancorado a 58% da altura da tela (mostra mais
mapa à frente do que atrás). Fundo de hunt é uma imagem única por bioma
(`assets/hunt-backgrounds/`), desenhada centrada no mapa — fora dela, cor lisa do tema do bioma.
Não há nenhuma marcação visual do limite caminhável (que é um círculo invisível).

---

## 8. Linguagem visual atual (ponto de partida do redesign)

### 8.1 Tokens

- Tema **dark fixo** (`class="dark"` no `<html>`, sem alternância).
- Paleta shadcn **neutra padrão, totalmente acromática** — todos os tokens são `oklch(... 0 0)`,
  chroma zero. Ou seja: **a interface hoje não tem cor de marca nenhuma.** Toda cor vem do dado
  (tipo elemental, raridade) ou de utilitários Tailwind pontuais (`amber-400`, `emerald-500`,
  `sky-500`, `violet-400`, `orange-400`).
- Fonte de UI: **Geist Variable** (sans). O canvas usa **monospace** de propósito (texto do
  mundo/pixel art).
- `--radius: 0.625rem` como base, escalado por token (`sm` 0.6x … `4xl` 2.6x).
- Superfícies de HUD: `background/85`–`/95` + `backdrop-blur-sm` + borda + `shadow-lg`.
- Densidade: texto `xs`/`[10px]`/`[11px]` em quase todo HUD; `text-lg` só nos títulos de painel.

### 8.2 As três paletas semânticas de dado (não inventar novas)

1. **17 tipos elementais** (`TYPE_COLORS`): NORMAL `#a8a878`, FIRE `#ff6b35`, WATER `#4fc3f7`,
   ELECTRIC `#ffd23f`, GRASS `#4caf50`, ICE `#7dd3fc`, FIGHTING `#c0392b`, POISON `#9b59b6`,
   GROUND `#c9a66b`, FLYING `#a8d8ea`, PSYCHIC `#ff6b9d`, BUG `#8bc34a`, ROCK `#8d6e63`,
   GHOST `#6c5b7b`, DRAGON `#5b6ee1`, DARK `#4a4a4a`, STEEL `#b0bec5`.
   (Não existe Fairy neste dataset Gen2.) Usados em: chips de tipo, fundo do slot de golpe, cor
   do nome do golpe, partículas de impacto, círculo do card de hunt, borda do ícone de Stone.
2. **6 raridades**: COMUM `#9aa0a6` (69%), INCOMUM `#4ade80` (22,7%), RARO `#60a5fa` (7%),
   ULTRA `#a78bfa` (1%), LEGENDARY `#d4a017` (0,25%), MYTHIC `#e0348c` (0,05%).
   Usadas em: borda de todo ícone de POKE, badge de raridade ao lado do nome, filtros da Loja.
3. **Categoria de golpe**: físico `#9aa0a6`, especial `#60a5fa` (borda do slot).

**Shiny é um eixo separado da raridade**: `✨` + nome em `violet-400`/`#b366ff`.

### 8.3 Padrões de interação estabelecidos

- **Clicar num POKE em qualquer lugar abre o mesmo modal de perfil.** Nunca expandir inline.
- **Clicar no corpo de um card de hunt/espécie expande** um detalhe abaixo dele; os botões dentro
  do card param a propagação.
- **Toda janela flutuante é arrastável** pela barra de título (painéis, perfil, farm offline,
  Auto, chat). Toasts e o confirm simples não são — são transitórios.
- **Botão de tela clicado de novo fecha** (toggle).
- **Clique no backdrop fecha** o painel; a StartScreen forçada não.
- **Ícone `?` circular** = tooltip explicativo (padrão em hunts e no painel Auto).
- **`🔓/🔒`** = trancar item/POKE contra venda.
- Ações destrutivas (vender shiny, apagar save) exigem AlertDialog.
- Botões mostram o **custo/valor real no próprio label** (`Comprar (250 ouro)`,
  `Vender (1200 ouro)`, `Evoluir (20x Pedra ROCK)`).

---

## 9. Problemas reais que o redesign deveria corrigir

Encontrados lendo o código atual. Vale passar isso junto para quem for desenhar.

**Alta prioridade — layout quebrado**

1. **O botão `🤖` Auto e o badge de itens estão renderizando no canto superior esquerdo, não no
   inferior.** Em `GameShell.tsx`, `<AutoFloatingPanel />` é filho direto do contêiner
   `absolute inset-0` **sem wrapper posicionado**, e o próprio componente só posiciona o *painel
   aberto* (`fixed bottom-24 left-4`) — o botão fica em fluxo normal, ou seja, no topo à esquerda,
   colidindo com a área do HUD. O comentário no código diz que ele "se posiciona sozinho", o que
   não é verdade. Precisa de posição explícita (empilhado acima do painel de taxa, como o
   comentário descreve).

2. **A largura dos painéis (560px) não acomoda a densidade da aba Itens da Loja.** Duas colunas
   (comprar/vender), cada uma com ícone + nome + preço + slider + input + botão, dentro de
   ~264px por coluna. O `md:grid-cols-2` empilha só acima do breakpoint, mas o contêiner é fixo em
   560px — as colunas ficam apertadas em **qualquer** viewport. Ou o painel de Loja é mais largo,
   ou os controles de quantidade viram um popover.

3. **A barra de HP/nome desenhada no canvas colide com a barra de golpes e o painel de taxa em
   zoom alto.** Textos de combate sobem até ~90px acima do sprite; o jogador está ancorado a 58%
   da altura. Vale reservar uma faixa segura no rodapé no novo layout.

**Média — mensagens que mentem para o jogador**

4. **Vários toasts da Loja reportam valores fixos, não o resultado real.** Em `ShopMenu.tsx` o
   código faz `const res = { success: true } as const` / `{ gold: 0, itemCount: 0 }` antes de
   chamar a ação e depois lê `res` para montar a mensagem. Consequências visíveis: comprar
   **sempre** diz "Comprou", mesmo sem ouro; "Vender Tudo" de itens **nunca** mostra toast
   (`itemCount` é 0); vender POKEs sempre diz "por 0 ouro". Isso é bug de lógica, não de design,
   mas o redesign vai encostar nesses textos — melhor corrigir junto.

5. **A venda individual de POKE na Loja não passa pela autoridade do servidor** (chama
   `sellBagPoke` local direto, sem `pedirAcao`) — sob servidor, o POKE reaparece no próximo
   sincronismo. De novo: bug de lógica, mas afeta a percepção da tela.

**Média — inconsistências de UX**

6. **A carteira mostra Diamantes, e nada no jogo os consome.** Uma moeda visível sem uso lê como
   funcionalidade quebrada. Ou esconder até existir um uso, ou dar um uso.

7. **Duas superfícies mostram a mesma lista de espécies de uma hunt** (o tooltip do `?` e o painel
   expandido do card). Consolidar em uma.

8. **A Pokedex abre o modal de perfil E expande o card no mesmo clique.** Duas coisas ao mesmo
   tempo, uma escondendo a outra — o modal cobre o detalhe que acabou de abrir.

9. **Interface acromática num jogo cujo conteúdo é 100% colorido.** Os tokens shadcn estão no
   preset neutro de fábrica. O jogo se apoia inteiramente nas paletas de tipo/raridade para ter
   cor, e o chrome não tem nenhuma identidade própria. É o maior ganho de percepção disponível num
   redesign, e o mais barato.

10. **Densidade tipográfica muito baixa em toda parte** (`text-xs` e `[10px]` dominam, inclusive em
    valores importantes como HP, ouro e % de spawn). Hierarquia quase inexistente: o nome da
    espécie e o rótulo "HP" têm quase o mesmo peso visual.

11. **Nenhum estado de carregamento/desabilitado nos botões que fazem round-trip ao servidor**
    (Entrar numa hunt, comprar, vender, evoluir). O jogador pode clicar várias vezes sem feedback.

12. **Sem responsividade real para mobile.** Os painéis usam `100vw - 2rem`, mas o HUD tem 6
    superfícies fixas nos cantos (status, nav, zoom, golpes, taxa, chat) que juntas cobrem uma tela
    de celular por inteiro. O nav de 8 botões com emoji + texto já quebra em várias linhas em telas
    estreitas.
