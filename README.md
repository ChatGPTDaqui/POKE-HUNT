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

**Nao existe mais servico de autoridade local** (o adaptador `node:http` foi deletado em
`29a4da4`). `.env.local` aponta `VITE_SERVIDOR_URL` direto pra Edge Function publicada — e e
assim que se desenvolve hoje: `npm run dev` no cliente contra a funcao em producao. Testar
mudanca de servidor exige `npm run edge:publicar` antes (ver
[`docs/11-operacao.md`](docs/11-operacao.md)), nao ha ciclo local.

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

## Conta de teste: uma so, e o resto se apaga

Em 8 dias o projeto acumulou **72 contas de teste contra 5 jogadores reais** —
apagadas em 2026-08-14. Nenhuma nasceu de descuido: cada sessao escrevia um
script proprio (`jogavel_<timestamp>@...`, `smoke52-...`, `t54akz...`), usava
uma vez e ia embora. O lixo veio de nao existir um lugar combinado pra criar e
pra limpar.

1. **Reusar a conta canonica** — `claude@teste.pokehunt.local`, credenciais em
   `CONTA_TESTE_EMAIL` / `CONTA_TESTE_SENHA` no `.env` da raiz.
   `npm run conta:criar` provisiona de novo se sumir (rodar duas vezes nao cria
   duas).
2. **Conta extra so quando o teste exige duas de verdade** (cadastro, troca no
   Mercado, correio entre jogadores) e obrigatoriamente terminando em
   `@teste.pokehunt.local`.
3. **`npm run conta:limpar` antes de encerrar a tarefa** — apaga tudo no
   dominio reservado menos a canonica.

O dominio reservado e o que torna a limpeza segura: jogador de verdade nunca vai
ter email nele, entao o delete nao alcanca ninguem, mesmo rodado distraido. E
por isso que o filtro e por dominio e nao por uma lista de quem fica — a lista
de emails reais nao pode viver em arquivo versionado, e "dominio parece de
teste" ja falhou na pratica: duas das 72 contas apagadas estavam em `gmail.com`.

`npm run conta:teste` mostra o estado sem mexer em nada.

## Armadilha ao testar no browser

Nao leia estado do jogo via `import('/src/stores/...')` no console ou em
automacao. O Vite serve modulos editados durante a vida do dev server com
query de versao (`?t=...`); um import sem essa query instancia um **segundo**
modulo, com stores e contadores proprios. Sintomas ja observados: `team` vazio
num jogo que claramente tem POKE, e IDs de entidade colidindo com o player
(quebrando o combate) ao chamar `controller.enterMap` por esse caminho.

Fontes confiaveis: o save em `localStorage`, o texto renderizado na tela, e os
pixels do canvas.
