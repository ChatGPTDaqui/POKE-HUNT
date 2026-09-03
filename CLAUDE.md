# poke-hunt

"Novo Poke Idle" — jogo de captura/idle estilo Pokémon. Porte de vanilla HTML/JS pra React+Vite+TS. Engine própria (combate, movimento, auto-play, captura, economia) renderizada em canvas fora do ciclo de render do React.

## Stack

React 19 · Vite 8 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Radix via `@base-ui/react`) · Zustand (`gameStateStore` persistente, `worldStore` efêmero) · TanStack Query 5 · Supabase (Postgres + Auth + Edge Functions; a migração de `localStorage` terminou) · oxlint · Vitest

## Comandos

```bash
npm run dev            # vite, porta 5173
npm run build           # tsc -b + vite build + copiar-assets.mjs — o de PUBLICAR
npm run build:verificar # tsc -b --force + vite build, sem a copia — o de CONFERIR
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
- **`scripts/` pesa 242MB versionados, e isso é decisão tomada, não descuido** (PH-163) — o repo guarda de propósito a ENTRADA (`body-block-refs/`, `agua-refs/`) e a SAÍDA (`subBiomaCollision.generated.ts`, `aguaMask.generated.ts`) das derivações. **Não reabrir sem argumento novo:** [por que, e por que `git filter-repo` foi descartado](docs/20-por-que-cada-regra-existe.md#scripts-242mb).
- **`authority/` não builda sem `npm run build:engine` (raiz) rodado antes** — `authority/package.json` importa `#engine`, gerado só por esse script, gitignored. Sem isso: `Cannot find module '#engine'` em cascata.
- **`.env` da raiz é o MESMO pra local e remoto** — `scripts/*` (`catalog:migrar`/`db:wipe`/etc) e `edge:publicar` só leem `SUPABASE_URL`/`SERVICE_ROLE_KEY` do `.env` raiz, nunca `.env.local`. Sem mecanismo de override — errar o `.env` roda `db:wipe` contra o ambiente errado sem avisar.
- **Limite de negócio só no cliente vira 502, não erro tratado** (`MAX_TEAM_SIZE` já bateu constraint de banco direto) — todo limite precisa revalidar no adaptador do servidor.
- **`.length` em resultado do PostgREST mente acima de 1000 linhas**, corta sem erro — contagem real precisa `Range 0-0` + header `Content-Range`.
- **Zustand `persist` engole erro de storage silenciosamente** — `hydrate()` nunca rejeita a promise mesmo em falha; gate de "erro real vs conta nova" precisa checar flag registrada em `getItem`, não esperar rejeição.
- **Ação com round-trip ao servidor** (comprar/vender/evoluir) precisa reivindicar entrega ANTES e desfazer se recusada — wrapper `comEstadoParaEscrita`, não tratar erro call-site por call-site.
- **Sessão dupla por jogador**: índice UNIQUE precisa ser parcial no banco — validação só de cliente não impede duplo-clique abrir 2 sessões.
- **Mudança de schema no Supabase é SEMPRE por migration versionada, nunca `db query`/dashboard direto.** Gate de CI (`supabase-check.yml`) reprova o PR se o banco remoto tiver algo aplicado sem arquivo local correspondente, ou se `database.types.ts` estiver desatualizado — já pegou 2 incidentes reais no dia em que foi criado. Fluxo obrigatório em `docs/11-operacao.md#fluxo-de-mudança-de-schema`.
- **`docs/11-operacao.md` é a fonte de como o sistema roda e como executar cada operação** (comandos, deploy, banco, wipe, fluxo de mudança de schema passo a passo) — ler antes de rodar qualquer `db push`/`edge:publicar`/deploy manual, não descobrir o fluxo real no meio da tarefa. O caminho de produção é **PR mirando `dev`**, nunca deploy manual direto: merge em `dev` já dispara `supabase-deploy-dev.yml`, que aplica migration e publica `jogo-dev` sozinho.
- **`npx tsc -b --noEmit` rodado em loop durante uma sessão de edição não é prova de build limpo** — cache incremental (`.tsbuildinfo`) já deixou passar 5 erros reais (26/08, campo obrigatório novo quebrando literais em teste) que só `npm run build` (sem `--noEmit`, força reemissão completa) pegou. Rodar o build de verdade pelo menos uma vez antes de dar tarefa por pronta ou abrir PR. **O alvo dessa conferência é `npm run build:verificar`** (`tsc -b --force && vite build`), que faz a reemissão completa sem copiar os 348MB de arte — medido 21s contra 27-29s do `build` inteiro. **`npm run build` continua sendo o de publicar** e não muda: sem `copiar-assets.mjs` o Pages sobe o site com 404 em todo sprite, e nenhum teste pega isso. O `--force` ali é o que separa os dois papéis desde a PH-458: `npx tsc -b` avulso passou a usar cache incremental de verdade (0,9s em vez de 16,8s), e a conferência que fecha a tarefa continua sendo a completa, do mesmo jeito que o CI faz (`npx tsc -b --force`).
- **"Boss" no projeto são TRÊS sistemas distintos, não dois — não confundir nenhum dos três.** (1) **sala das hunts**: usa **Guardian** (sala 1-9) e **Lord** (sala 10), e NUNCA a palavra "boss" ou "chefe" em identificador. (2) **Boss global**: feature do Marcos, fora deste repo, livre pra usar o nome. (3) **"Hunts BOSS" / Modo Pesadelo** (`data/legendaries.ts#LEGENDARY_SPECIES_IDS`): sistema pré-existente, **mantém o nome BOSS em ALL CAPS** como está. Migration antiga e patch note publicado ficam com o nome antigo — histórico imutável. [Quem é quem, e o que já deu errado aqui](docs/20-por-que-cada-regra-existe.md#tres-bosses).
- **Sessão com o agente `jira-planner` disponível passa TODA tarefa de Jira por ele** — nunca `createJiraIssue`/`editJiraIssue` direto. Trabalho grande sempre quebrado em subtarefas pequenas, uma por arquivo ou módulo coeso, com critério de aceite próprio. Sessão sem esse agente cria issue direto e não está quebrando regra nenhuma. [O fluxo Planner/Executor e a exceção manual](docs/20-por-que-cada-regra-existe.md#jira-planner).
- **PR mirando `dev` E promoção `dev`→`main` podem ser mergeadas sem pedir confirmação** (checks verdes, `update-branch` se preciso). O fluxo não mudou: PR de promoção **sempre aberta**, nunca push direto na `main`, `bypass_actors` vazio. [O que caiu em 30/08 e por quê](docs/20-por-que-cada-regra-existe.md#sem-confirmacao).
- **Promover não acaba no merge — quem promove tem QUATRO obrigações depois dele, e elas não são opcionais.**
  1. **Abrir o run do `supabase-deploy.yml` e LER O RESUMO DO JOB — não só a cor.** Desde a PH-460 o deploy roda as duas bancadas sozinho, então **verde significa uma de três coisas**, e só o resumo distingue: `Producao verificada: login, /estado, CORS e abertura de hunt` (as duas passaram — a obrigação 2 já foi cumprida pela máquina); `A verificacao de producao NAO rodou` (faltam secrets — **ninguém verificou nada**); `A verificacao NAO concluiu: a credencial foi recusada` (secret errado — **ninguém verificou nada**). Ler "verde" sem abrir o resumo é a armadilha da PH-451 um nível acima.
  2. **Se o resumo NÃO disser "Producao verificada", conferir na mão** — e conferir é conferir que o jogo CARREGA, não que a tela sobe: `node scripts/harness/fumaca-de-producao.mjs` **e** `node scripts/harness/abrir-hunt-em-producao.mjs`. As duas, sempre: a primeira sozinha já deu TUDO OK com o jogo trancado. Abrir a página no navegador não substitui nenhuma das duas.
  3. **Patch notes junto ou logo atrás** (regra de `CLAUDE.local.md`).
  4. **Se quebrar, reverter primeiro e investigar depois.** Não se depura com produção no ar quebrada.

  [As duas vezes em que isto falhou com deploy verde](docs/20-por-que-cada-regra-existe.md#quatro-obrigacoes).

## Regras do Harness

O arquivo CLAUDE.local.md, localizado na raiz do projeto, pode indicar a configuração do harness local, com projeto e contexto de session claude salvo, mas não é obrigatório.
Como contexto complementar, utilize:

- HISTORICO.md: contém o histórico completo do projeto.
- docs/README.md: apresenta um resumo do projeto, incluindo regras e orientações relevantes.
