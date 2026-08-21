# 16 — Handoff pro novo dev (ler antes de puxar as mudanças)

> Ler este documento **antes** de `git pull` / `git fetch` trazer as mudanças descritas aqui.
> Objetivo: sua instância de Claude Code entender o sistema novo e adaptar o que você já tem
> localmente pro que foi combinado, sem quebrar nada no primeiro dia.

## 1. O que mudou (resumo executivo)

O projeto ganhou um ambiente de staging real. Antes, `npm run dev` local rodava o front contra a
Edge Function **já publicada em produção** — testar mudança de servidor/migration exigia publicar
antes, sem ciclo de teste. Agora existe simetria completa entre git e Supabase:

| Camada | Staging | Produção |
|---|---|---|
| Branch git | `dev` | `main` |
| Schema Supabase | `dev` | `public` |
| Edge Function | `jogo-dev` | `jogo` |
| Secret de schema | `JOGO_SCHEMA_DEV=dev` | `JOGO_SCHEMA=public` |

**Não é trunk-based development.** `dev` e `main` são branches permanentes, cada PR vive até
revisão, promoção `dev`→`main` é evento separado e explícito. Mais devagar que trunk-based —
troca-off aceito de propósito pra time de 2 pessoas, sem custo de infra de feature flag.

Detalhe completo da decisão e por que Docker local (`supabase start`) foi descartado:
[`docs/15-coordenacao-supabase.md`](15-coordenacao-supabase.md).

## 2. Por que isso existe (não é burocracia)

Três incidentes reais já aconteceram com só 2 devs: migration criada e nunca aplicada, deploy de
um dev sobrescrevendo o do outro sem aviso, cliente rodando contra schema que já tinha mudado.
Causa raiz: zero CI, zero gate — comandos manuais (`db push`, `edge:publicar`) sem nada que force
o outro dev a saber que aconteceram. O gate de CI existe porque em 2026-08-18 alguém já aplicou
DDL direto no banco sem migration, e só foi pego porque o gate achou sozinho.

## 3. Setup necessário no seu ambiente

1. **`CLAUDE.local.md`** — é pessoal e gitignored. **Não copie o meu.** O meu tem referência a um
   MCP de vault Obsidian que só existe na minha máquina. Crie o seu vazio, ou com atalhos seus, se
   quiser.
2. **Supabase CLI logada na conta certa** — `npx supabase projects list`; se `poke-hunt`
   (`PokeInspiration's Project`, ref `uogmhqbyjgafjujbqdty`) não aparecer, `npx supabase login`.
   Contas Supabase distintas coexistem na mesma máquina, já causou confusão real aqui.
3. **Link do projeto** (uma vez por máquina): `npx supabase link --project-ref
   uogmhqbyjgafjujbqdty`.
4. **`.env.local`** — `VITE_SERVIDOR_URL` apontando pra URL de `jogo-dev`, não `jogo`. Único ponto
   de config do front (`src/data/remote/servidor.ts:22`), zero mudança de código necessária.
5. **`.env` da raiz** (não `.env.local`) — é o mesmo usado por `scripts/*` (`catalog:migrar`,
   `db:wipe`) e `edge:publicar`, local e remoto. Sem mecanismo de override: `.env` errado roda
   `db:wipe` contra o ambiente errado sem avisar. Confirme `SUPABASE_URL`/`SERVICE_ROLE_KEY` antes
   de rodar qualquer script desses.

## 4. Fluxo de mudança de schema (obrigatório, sem exceção)

**Regra de ouro: nunca aplicar DDL direto no banco** — nem `db query`, nem dashboard, nem MCP
`apply_migration` sem também criar o arquivo correspondente. Toda mudança de estrutura vira
arquivo em `supabase/migrations/`, sempre.

1. Criar `supabase/migrations/<timestamp>_<nome>.sql`, timestamp `YYYYMMDDHHmmss` maior que o
   mais recente existente.
2. **Projeto tem 2 schemas espelhados** (`public` = produção, `dev` = clone de teste). Se a
   mudança afeta tabela/função/policy do jogo, criar **os dois arquivos**, um por schema
   (`..._public.sql` / `..._dev.sql`).
3. Aplicar: `npx supabase db push`.
4. Se mudou tabela/coluna/tipo: `npm run db:types`, commitar `database.types.ts` junto da
   migration, mesmo commit.
5. `git add` migration(s) + types → commit → push numa branch de feature.
6. **PR mira `dev`, nunca `main` direto.** CI (`supabase-check.yml`) reprova automático PR pra
   `main` que não vem de `dev`. `build-check-dev.yml` roda tsc+testes; `supabase-check.yml` roda o
   gate de migration/types comparando contra `dev` nesta etapa.
7. Merge em `dev` → `supabase-deploy-dev.yml` aplica migration + publica `jogo-dev` + confirma
   schema ativo via `/saude`. Testar local com `.env.local` apontando pra `jogo-dev` (seção 3).
8. Validado em `jogo-dev` → PR `dev` → `main` (gate de par `dev`/`public` reaplica, comparando
   contra `main` de verdade — ponto real de promoção).
9. Merge em `main` → `supabase-deploy.yml` aplica em produção.

**Nunca rodar `db push`/`edge:publicar` manual fora desse fluxo**, exceto diagnóstico pontual
(502 em produção — ver `docs/11-operacao.md`).

Se o gate falhar sem ficar claro por quê, passo a passo de diagnóstico em
[`docs/11-operacao.md#fluxo-de-mudança-de-schema`](11-operacao.md).

## 5. Fluxo de QA → Jira (novo, combinado agora)

Ao testar em `jogo-dev` com devtools (MCP chrome-devtools) e achar um erro:

1. Não corrige silenciosamente — abre issue no Jira, projeto `PH`
   (`oreisviana.atlassian.net`), **antes ou junto** de subir a correção.
2. Formato da issue (jira-planner):
   - **Título**: sem prefixo de key/tipo, impacto primeiro (ex: "Captura falha quando time está
     cheio", não "[BUG] captura").
   - **Description**: sempre com critério de aceite explícito, não só descrição do sintoma.
3. Jira aqui funciona como **fonte de correção arquivada** — histórico de controle do que foi
   achado em QA e como foi corrigido, não só board de planejamento. Board hoje está 100% Feito
   (zero issues abertas) — este fluxo é o que vai popular ele de novo, com rastro real de teste.

## 6. O que ainda NÃO está pronto (não presuma que está)

- **Branch protection não foi aplicada ainda no GitHub** — só quem tem `admin` no repo consegue.
  Enquanto isso não acontece, nada te impede fisicamente de mergear direto em `main` ignorando o
  X vermelho do CI. O gate existe em código, a trava de verdade (bloquear o botão de merge) ainda
  depende de alguém com admin configurar em `Settings > Branches`. **Trate a regra da seção 4 como
  obrigatória por disciplina, não por enforcement automático, até isso ser confirmado.**
- **`dev`/`jogo-dev` são compartilhados entre os 2 devs, sem isolamento por branch** (Supabase
  branching é pago, descartado por ora). Duas branches simultâneas mexendo em schema competem pelo
  mesmo staging — combine antes de mexer em schema ao mesmo tempo.
- **Deploy de `jogo-dev`/`jogo` via MCP `deploy_edge_function` não funciona** pro bundle atual —
  ~900KB minificado tokeniza pesado demais pro tool. Deploy real é via CLI
  (`npx supabase functions deploy jogo-dev --project-ref uogmhqbyjgafjujbqdty`). O workflow de CI
  já usa CLI real, não herda essa limitação — só importa se você for publicar manual (diagnóstico).

## 7. Onde ler mais, se precisar

- [`docs/15-coordenacao-supabase.md`](15-coordenacao-supabase.md) — decisão completa, incidentes
  que motivaram, risco aceito, passo a passo de branch protection.
- [`docs/11-operacao.md`](11-operacao.md) — comandos, wipe, diagnóstico de 502, variáveis de
  ambiente.
- `CLAUDE.md` (raiz do repo) — regras críticas, carregado automático toda sessão.
