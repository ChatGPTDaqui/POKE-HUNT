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
- **`docs/11-operacao.md` é a fonte de como o sistema roda e como executar cada operação** (comandos, deploy, banco, wipe, fluxo de mudança de schema passo a passo) — ler antes de rodar qualquer `db push`/`edge:publicar`/deploy manual, não descobrir o fluxo real no meio da tarefa. O caminho de produção é **PR mirando `dev`**, nunca deploy manual direto: merge em `dev` já dispara `supabase-deploy-dev.yml`, que aplica migration e publica `jogo-dev` sozinho.
- **`npx tsc -b --noEmit` rodado em loop durante uma sessão de edição não é prova de build limpo** — cache incremental (`.tsbuildinfo`) já deixou passar 5 erros reais (26/08, campo obrigatório novo quebrando literais em teste) que só `npm run build` (sem `--noEmit`, força reemissão completa) pegou. Rodar o build de verdade pelo menos uma vez antes de dar tarefa por pronta ou abrir PR.
- **"Boss" no projeto são TRÊS sistemas distintos, não dois — não confundir nenhum dos três.** (1) **Sistema de sala das hunts** (Guardian/Lord por sala, PH-223→243): NUNCA usa a palavra "boss" (nem "chefe") em nome de identificador — decisão explícita do usuário (28/08), pra zerar colisão com o (2). Nomenclatura: **Guardian** (sala 1-9) e **Lord** (sala 10). PH-236 (rename completo — engine, authority, testes, UI) fechou em 28/08 nas PRs `refactor/PH-237-guardian-lord-engine-rename`; único resíduo é a migration do PH-241 (tabela `sala_protetor`, substitui as 15 colunas `boss_*` de `game_sessions`) — escrita e commitada, mas **`db push` ainda não aplicado** (sessão sem privilégio de CLI; roda no terminal do usuário) — `database.types.ts` fica desatualizado até isso acontecer. Qualquer PR que toque nesta área segue Guardian/Lord, não "boss"; migrations antigas (`boss_pendente_*`, `boss_aparencia_*`) e patch notes já publicados ficam com o nome antigo de propósito — histórico imutável, não reescrever. (2) **Boss global** — feature separada do Marcos, totalmente fora deste repo/escopo, livre pra usar "boss" no nome dela. (3) **"Hunts BOSS" / Modo Pesadelo** (`data/legendaries.ts#LEGENDARY_SPECIES_IDS`, documentado em `docs/06-mundo-hunts-e-spawn.md`): 11 hunts dedicadas, uma por lendário, sistema PRÉ-EXISTENTE e mais antigo que (1) — mantém o nome "BOSS" como está (inclusive em ALL CAPS por toda a UI/comentários — "hunt BOSS", "as 11 BOSS"), não é afetado pelo PH-236 nem pela regra do (1), só por acaso compartilha helper visual em `src/render/sprites.ts`.
- **Quando a sessão Claude Code tem o agente `jira-planner` disponível (harness pessoal do Otávio, não algo garantido em toda sessão/todo dev), toda tarefa de Jira passa por ele — nunca `createJiraIssue`/`editJiraIssue` direto.** Decisão explícita do usuário (28/08), nem sempre seguida até aqui. Trabalho grande sempre quebrado em subtarefas pequenas (uma por arquivo/módulo coeso, critério de aceite próprio), nunca uma issue única cobrindo várias frentes. Fluxo: `jira-planner` fase Planner formata (não cria); só sobe de verdade em fase Executor com plano já aprovado. Editar issue existente pra corrigir formato/conteúdo é exceção manual (o agente só tem `createJiraIssue`, sem edição) — cabe à sessão aplicar o que o planner devolveu. Sessão sem esse agente (outro dev, outro harness) não está quebrando regra nenhuma ao criar issue direto.
- **PR mirando `dev` pode ser mergeada sem pedir confirmação a cada uma** (checks verdes, `update-branch` se preciso) — mas **PR `dev`→`main` (promoção pra produção) exige confirmação explícita do usuário sempre**, mesmo com autorização genérica tipo "mergeia tudo"/"vai" já dada pras PRs de `dev`. `main` é produção real; a promoção é decisão de negócio/timing, não mecânica de CI.

## Regras do Harness

O arquivo CLAUDE.local.md, localizado na raiz do projeto, pode indicar a configuração do harness local, com projeto e contexto de session claude salvo, mas não é obrigatório.
Como contexto complementar, utilize:

- HISTORICO.md: contém o histórico completo do projeto.
- docs/README.md: apresenta um resumo do projeto, incluindo regras e orientações relevantes.
