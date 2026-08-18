# 01 — Arquitetura

## O que o jogo é

Idle 2D top-down. O jogador escolhe uma hunt, o POKE ativo caça sozinho (auto-walk,
auto-battle, auto-captura, auto-poção) e o progresso acumula com ou sem o jogador na tela.

Stack: React 19 + Vite + TypeScript + Tailwind 4 + Zustand + React Query. O mundo é
desenhado em `<canvas>`, nunca em DOM.

## As quatro camadas

```
┌─ Cliente (navegador) ────────────────────────────────────────┐
│                                                              │
│  React (features/, components/)   ← menus, HUD, modais       │
│         │                                                    │
│  Zustand stores (stores/)         ← gameState, world, ui     │
│         │                                                    │
│  Motor (engine/, core/)           ← simulação pura           │
│         │                                                    │
│  Canvas (render/)                 ← desenho imperativo       │
└──────────────────────────────────────────────────────────────┘
                    │ intenção (nunca resultado)
                    ▼
┌─ Servidor de autoridade (authority/, publicado como Edge Function) ┐
│  MESMO motor, importado via `#engine`                           │
│  Simula, decide, grava                                          │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ Postgres (Supabase) ────────────────────────────────────────┐
│  Catálogo do jogo + progresso dos jogadores + social         │
│  Cliente tem SELECT. Escrita só pela service_role.           │
└──────────────────────────────────────────────────────────────┘
```

## Decisões estruturais e o porquê de cada uma

### O motor não sabe que existe um servidor

`src/engine/simulation.ts` é o núcleo: construção de mundo, `stepWorld`,
`handleEnemyDefeated`. Ele **não importa nenhum valor** de `gameStateStore` — só o *tipo*
`GameStateStore`, que o build apaga.

O motivo é concreto: importar um valor de lá puxaria `lib/supabase` → `import.meta.env`,
que só existe no bundle do navegador. Com essa disciplina, `vite build --ssr` empacota o
motor num ESM que o Node importa direto (`npm run build:engine`), e o servidor roda a
simulação de verdade em vez de reimplementá-la.

**Não existe uma segunda implementação das regras no servidor.** Duas implementações
divergem no primeiro ajuste de balanceamento, e a divergência vira exatamente o buraco que
a autoridade deveria fechar. Ver [04](04-autoridade-do-servidor.md).

`engine/controller.ts` é o oposto: só as ações que a UI chama, e pode tocar as stores à
vontade. `engine/headless.ts` é a porta de entrada do servidor — reexporta o motor e o
**tipo** `GameStateStore`, para que o adaptador do servidor sobre o Postgres quebre no
type-check se esquecer um método, em vez de estourar no meio de uma simulação de 6 horas.

### Canvas imperativo, fora do React

`useGameLoop` avança a simulação; o desenho roda num `requestAnimationFrame` próprio do
`GameCanvas` lendo `useWorldStore.getState()`.

Canvas não tem virtual DOM. Rotear o desenho pelo ciclo de render do React só somaria
overhead a cada quadro sem comprar nada — não há reconciliação a fazer sobre pixels.

### Referência entre entidades é id, nunca ponteiro

`entity.target`, `effect.owner`, `pendingHit.attacker`: todos guardam **id + lookup**.

Com estado imutável (immer no `worldStore`), guardar uma referência direta arrisca apontar
para uma versão anterior do objeto. O caso patológico é o immer **revogar** o proxy depois
que o producer termina — e aí a leitura lança.

### Contadores de id vivem no mundo, não no módulo

`world.counters` (`entity`, `effect`, `pendingHit`), não `let` de módulo.

Isso não é estética: um contador de módulo faz o id depender de quantas vezes o módulo foi
avaliado naquela aba. Já mordeu duas vezes — um `import()` dinâmico no console criava uma
segunda cópia do módulo com contador zerado, e os ids novos colidiam com os do jogo em
andamento (o filtro de engajamento do combate quebrou e pareceu regressão de performance
de 7x).

### Duas camadas de navegação

React Router escolhe o **shell** (`/`, `/login`, `/registro`, `/jogo`). Essas quatro
precisam de URL: são compartilháveis, o navegador guarda no histórico e o Auth as usa como
allow-list de redirect.

Dentro do jogo, a troca de tela (Equipe, Mochila, Loja…) é estado no `uiStore`, não rota.
Nenhuma delas é compartilhável nem faz sentido como deep-link, e virar rota só somaria
remount de tela cheia num app com canvas rodando por baixo.

### `assets/` não está no bundle

~270MB de arte na raiz do repositório, servida em `/assets/*` por um plugin do Vite (dev e
preview) e por `serve.js` (produção). Nada é copiado nem linkado — por isso `dist/` fica em
~1MB de código.

Armadilha que já custou um deploy: **em produção estática (Cloudflare Pages) não existe
plugin do Vite.** `scripts/copiar-assets.mjs` roda no fim do `npm run build` justamente por
isso. Sem ele, o site sobe com o código certo e zero sprite, com todo `/assets/*` em 404 —
invisível em teste local, onde o plugin cobre.

A cópia **não** vive em `public/`: 281MB e 6.300 arquivos ali fariam o dev server indexar
tudo a cada boot.

### Estado dividido em quatro stores

| Store | Persistido | Dono | Contém |
|---|---|---|---|
| `gameStateStore` | sim (servidor) | servidor | equipe, mochila, ouro, itens, treinador, pokedex |
| `worldStore` | não | cliente | entidades, efeitos, combate em andamento, RNG da cena |
| `uiStore` | localStorage | aparelho | tela aberta, posição de janela, escala da HUD |
| `toastStore` | não | cliente | fila de avisos |

A divisa que importa: **`gameStateStore` é propriedade do servidor** — a resposta de
qualquer rota sobrescreve o objeto inteiro. Preferência de aparelho (escala da HUD,
tutorial já visto) **não pode** morar ali, ou some no primeiro flush. Por isso `uiStore` e
`tutorialStore` têm `localStorage` próprio.

HP e EXP do POKE em campo vivem no `worldStore` durante a caçada, sincronizando com o save
nas transições. Quem mostra HP ao vivo (HUD, barra de golpes) lê do `worldStore`, não do
`gameStateStore`.

## Onde ficam as coisas

| Pasta | Conteúdo |
|---|---|
| `src/engine/` | Motor: entidades, efeitos, sistemas, `controller`, `simulation`, `headless` |
| `src/engine/systems/` | combate, movimento, animação, auto, captura, economia, progressão, pokedex, offline, estatísticas |
| `src/core/` | RNG semeado, helpers de aleatoriedade, motor de fórmula, pathfinding |
| `src/data/` | Dados do jogo. `generated/` vem do catálogo; o resto é lógica escrita à mão |
| `src/data/remote/` | Ponte com o servidor de autoridade |
| `src/render/` | Desenho no canvas |
| `src/stores/` | Estado Zustand |
| `src/features/` | Telas |
| `src/components/game/` | Primitivos de UI em `em` (ver [09](09-interface.md)) |
| `authority/src/` | Serviço de autoridade |
| `supabase/` | Migrations e a Edge Function publicada |
| `scripts/` | Geradores de catálogo, importadores de arte, wipe |

## O que foi cortado

O jogo vanilla original (HTML/CSS/JS puro, `index.html` + `js/` + `css/` + `server.js` na
raiz) **não faz mais parte do repositório**. Enquanto ficava lá, era publicado por acidente
sempre que o deploy apontasse para a raiz — que foi exatamente o que aconteceu no Cloudflare
Pages.

O `README.md` da raiz ainda manda `cd web`, de quando o app React vivia numa subpasta. Ele
está desatualizado; o app **é** a raiz.
