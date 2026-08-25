# poke-hunt

"Novo Poke Idle" — jogo de captura/idle estilo Pokémon. Porte de vanilla HTML/JS pra React+Vite+TS. Engine própria (combate, movimento, auto-play, captura, economia) renderizada em canvas fora do ciclo de render do React.

## Stack

React 19 · Vite 8 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Radix via `@base-ui/react`) · Zustand (`gameStateStore` persistente, `worldStore` efêmero) · TanStack Query 5 · Supabase (migração em andamento, ver `SPEC-supabase-migration.md`) · oxlint · Vitest

## Comandos

```bash
npm run dev            # vite, porta 5173
npm run build           # tsc -b + vite build + copiar-assets.mjs
npm test                # vitest run
npm run db:types        # gera types do Supabase
npm run catalog:gerar   # gera catálogo a partir da planilha mestra
```

## Estrutura

```
src/engine/    # motor: entidades, sistemas (combate, movimento, auto, captura, economia) — fora do React
src/render/    # canvas imperativo (renderer.ts, sprites.ts) — nunca misturar com componentes React
src/stores/    # Zustand
src/data/      # dados do jogo (generated/ vem de planilha mestra)
src/features/  # telas
```

Jira: `oreisviana.atlassian.net`, projeto `PH`.

## Documentação (arquitetura/regras de negócio — sob demanda)

`docs/` — arquitetura e regras de negócio detalhadas, por assunto (índice em
`docs/README.md`). Não carregado por padrão: ler só quando a tarefa pedir
histórico ou decisão que este arquivo não cobre.

## Regras críticas

- **`assets/` (~270MB) fica na raiz do repo**, fora de `public/` — nunca copiar/linkar pra `public/assets`, git duplicaria ~6.300 arquivos. Servido via plugin (`vite.config.ts`) em dev, `serve.js` em produção.
- **`scripts/` pesa 242MB versionados, e isso é decisão tomada, não descuido** (PH-163) — `body-block-refs/` (211,9MB, 31 PNGs) e `agua-refs/` (28,6MB, 5 PNGs) são ENTRADA de `build-sub-bioma-collision.js` e `build-agua-mask.js`; a saída (`src/data/generated/subBiomaCollision.generated.ts`, `aguaMask.generated.ts`) também é versionada, então o repo guarda os dois lados de propósito — a derivação continua reproduzível sem depender de arte que ninguém mais tem. Reescrever histórico com `git filter-repo` é o único jeito de recuperar os ~592MB de pack e foi descartado: quebra todo clone existente e mexe em duas branches protegidas com CI que compara estado. Não reabrir sem argumento novo.
- **`authority/` não builda sem `npm run build:engine` (raiz) rodado antes** — `authority/package.json` importa `#engine`, gerado só por esse script, gitignored. Sem isso: `Cannot find module '#engine'` em cascata.
- **`.env` da raiz é o MESMO pra local e remoto** — `scripts/*` (`catalog:migrar`/`db:wipe`/etc) e `edge:publicar` só leem `SUPABASE_URL`/`SERVICE_ROLE_KEY` do `.env` raiz, nunca `.env.local`. Sem mecanismo de override — errar o `.env` roda `db:wipe` contra o ambiente errado sem avisar.
- **Limite de negócio só no cliente vira 502, não erro tratado** (`MAX_TEAM_SIZE` já bateu constraint de banco direto) — todo limite precisa revalidar no adaptador do servidor.
- **`.length` em resultado do PostgREST mente acima de 1000 linhas**, corta sem erro — contagem real precisa `Range 0-0` + header `Content-Range`.
- **Zustand `persist` engole erro de storage silenciosamente** — `hydrate()` nunca rejeita a promise mesmo em falha; gate de "erro real vs conta nova" precisa checar flag registrada em `getItem`, não esperar rejeição.
- **Ação com round-trip ao servidor** (comprar/vender/evoluir) precisa reivindicar entrega ANTES e desfazer se recusada — wrapper `comEstadoParaEscrita`, não tratar erro call-site por call-site.
- **Sessão dupla por jogador**: índice UNIQUE precisa ser parcial no banco — validação só de cliente não impede duplo-clique abrir 2 sessões.
- **Mudança de schema no Supabase é SEMPRE por migration versionada, nunca `db query`/dashboard direto.** Gate de CI (`supabase-check.yml`) reprova o PR se o banco remoto tiver algo aplicado sem arquivo local correspondente, ou se `database.types.ts` estiver desatualizado — já pegou 2 incidentes reais no dia em que foi criado. Fluxo obrigatório em `docs/11-operacao.md#fluxo-de-mudança-de-schema`.
