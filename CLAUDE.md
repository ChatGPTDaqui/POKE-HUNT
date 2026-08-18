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

## Regras críticas

- **`assets/` (~270MB) fica na raiz do repo**, fora de `public/` — nunca copiar/linkar pra `public/assets`, git duplicaria ~6.300 arquivos. Servido via plugin (`vite.config.ts`) em dev, `serve.js` em produção.
- **`server/` não builda sem `npm run build:engine` (raiz) rodado antes** — `server/package.json` importa `#engine`, gerado só por esse script, gitignored. Sem isso: `Cannot find module '#engine'` em cascata.
- **`.env` da raiz é o MESMO pra local e remoto** — `server/src/node.ts` e scripts (`catalog:migrar`/`db:wipe`/`edge:publicar`) só leem `SUPABASE_URL`/`SERVICE_ROLE_KEY` do `.env` raiz, nunca `.env.local`. Sem mecanismo de override — errar o `.env` roda `db:wipe` contra o ambiente errado sem avisar.
- **Limite de negócio só no cliente vira 502, não erro tratado** (`MAX_TEAM_SIZE` já bateu constraint de banco direto) — todo limite precisa revalidar no adaptador do servidor.
- **`.length` em resultado do PostgREST mente acima de 1000 linhas**, corta sem erro — contagem real precisa `Range 0-0` + header `Content-Range`.
- **Zustand `persist` engole erro de storage silenciosamente** — `hydrate()` nunca rejeita a promise mesmo em falha; gate de "erro real vs conta nova" precisa checar flag registrada em `getItem`, não esperar rejeição.
- **Ação com round-trip ao servidor** (comprar/vender/evoluir) precisa reivindicar entrega ANTES e desfazer se recusada — wrapper `comEstadoParaEscrita`, não tratar erro call-site por call-site.
- **Sessão dupla por jogador**: índice UNIQUE precisa ser parcial no banco — validação só de cliente não impede duplo-clique abrir 2 sessões.
