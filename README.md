# NOVO POKE IDLE — app React

Porte do jogo (antes HTML/CSS/JS puro na raiz do repo) para React + Vite +
TypeScript + Tailwind + shadcn/ui + Zustand.

## Documentacao

**Arquitetura e regras de negocio: [`docs/`](docs/README.md).** Comece pelo indice.

## Rodar

```bash
npm install          # so na primeira vez (na RAIZ do repo — o app e a raiz)

npm run dev          # desenvolvimento, http://localhost:5173
npm start            # build + servidor de producao, http://localhost:5173
```

**O jogo NAO funciona sem o servidor de autoridade.** Desde que a RLS foi revogada
(`supabase/migrations/*_cliente_perde_a_escrita.sql`), o cliente nao escreve progresso: sem
`VITE_SERVIDOR_URL` apontando pra um servico vivo, o jogo carrega e nao salva. Isso e o
recurso, nao um bug — ver [`docs/04-autoridade-do-servidor.md`](docs/04-autoridade-do-servidor.md).

```bash
cd server && npm run dev    # servico de autoridade local, porta 8787
```

O jogo vanilla antigo NAO faz mais parte deste repositorio — foi movido pra fora
no corte da migracao. Enquanto ele ficava aqui, era publicado por acidente
sempre que o deploy apontasse pra raiz, que foi exatamente o que aconteceu no
Cloudflare Pages.

## Onde as coisas estao

| Pasta | O que e |
|---|---|
| `src/engine/` | Motor: entidades, efeitos, sistemas (combate, movimento, auto, captura, economia, progressao) e o `controller` com as acoes de jogo |
| `src/render/` | Desenho no canvas (`renderer.ts`, `sprites.ts`) — imperativo, fora do ciclo de render do React |
| `src/stores/` | Estado Zustand: `gameStateStore` (persistente), `worldStore` (combate, efemero), `uiStore`, `toastStore` |
| `src/data/` | Dados do jogo. `generated/` vem da planilha, o resto e logica hand-authored |
| `src/features/` | Telas de menu (Equipe, Mochila, Loja, Hunts, Pokedex, Wiki, Config) |
| `src/components/` | HUD, modais, toasts, painel Auto e componentes compartilhados |

## Coisas que nao sao obvias

**A arte nao fica aqui.** `assets/` (~270MB) vive na raiz do repo e e servida
em `/assets/*` por um plugin em `vite.config.ts` (dev e preview) e por
`serve.js` (producao). Nada e copiado nem linkado — por isso `dist/` fica em
~1MB. Se voce criar `web/public/assets`, o git vai duplicar 6.300 arquivos;
existe uma regra no `.gitignore` da raiz justamente pra barrar isso.

**Os chunks do build saem em `dist/build/`,** nao no `dist/assets/` padrao do
Vite, pra nao colidir com o `/assets/` da arte.

**O save e compativel com o jogo antigo:** mesma chave de localStorage
(`novo-poke-idle:save`) e mesmo formato de payload. Um save do vanilla carrega
aqui direto, e vice-versa.

**Nao edite `src/data/generated/`.** A fonte do catalogo e Pokemon Ultra Sun
(Geracao VII), em `scripts/usum/catalog.json` + `scripts/usum/formulas.json`,
os dois commitados:

```bash
npm run usum:baixar      # PokeAPI -> scripts/usum/catalog.json (so quando quiser re-baixar)
npm run usum:conferir    # confere o catalogo contra a Bulbapedia; exit 1 se divergir
npm run usum:gerar       # catalog.json -> src/data/generated/*.ts (offline)
```

`planilha:aplicar`, `catalog:gerar`, `catalog:migrar` e `catalog:verificar` sao
os geradores ANTIGOS (Gen2, da planilha e do Postgres) e estao **bloqueados**:
rodar qualquer um sobrescreveria o catalogo atual com dado de outra geracao sem
nenhum erro. So rodam com `PERMITIR_CATALOGO_GEN2=1`.

**HP e EXP do POKE em campo ficam no `worldStore` durante a hunt,** nao no
`gameStateStore` — mudam a cada tick e so sincronizam com o save
periodicamente e nas transicoes de cena. Componentes que mostram HP ao vivo
(HUD, barra de habilidade) precisam ler do `worldStore`, senao mostram valor
velho durante o combate.

**O canvas nao passa pelo React.** O loop de simulacao (`useGameLoop`)
atualiza o `worldStore`; o desenho roda num `requestAnimationFrame` proprio
dentro de `GameCanvas`, lendo `useWorldStore.getState()` direto. Canvas nao
tem virtual DOM pra reconciliar, entao rotear o desenho pelo React so somaria
overhead.

## Armadilha ao testar no browser

Nao leia estado do jogo via `import('/src/stores/...')` no console ou em
automacao. O Vite serve modulos editados durante a vida do dev server com
query de versao (`?t=...`); um import sem essa query instancia um **segundo**
modulo, com stores e contadores proprios. Sintomas ja observados: `team` vazio
num jogo que claramente tem POKE, e IDs de entidade colidindo com o player
(quebrando o combate) ao chamar `controller.enterMap` por esse caminho.

Fontes confiaveis: o save em `localStorage`, o texto renderizado na tela, e os
pixels do canvas.
