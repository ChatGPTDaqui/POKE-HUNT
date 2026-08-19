# 14 — Coordenação de time e Supabase

## Por que este documento existe

Três incidentes reais com só **2 devs** no projeto: migration criada e nunca aplicada por quem
não estava na sessão que a criou, `edge:publicar` de um dev sobrescrevendo o deploy do outro sem
aviso, e cliente rodando contra um schema que já tinha mudado no Supabase.

Causa raiz comum: **zero CI, zero gate.** `db push` e `edge:publicar` são comandos manuais
disparados de máquina local (ver [11-operacao.md](11-operacao.md)), sem nada que force o outro
dev a saber que aconteceram. Correção depende de lembrar avisar — e já provou falhar com o time
no menor tamanho possível.

## Parte 1 — `CLAUDE.md` deixa de ser gitignored

**Problema:** `CLAUDE.md` está fora do git (`.gitignore`) porque mistura duas coisas — regra de
projeto (stack, comandos, gotchas, compartilhável) e uma referência pessoal ao vault Obsidian do
Otávio (`get_project_file(poke-hunt, ...)`, MCP que só existe na máquina dele). Sem separar isso,
não dá pra versionar sem forçar todo dev a ter o mesmo MCP configurado.

**Solução:** hierarquia nativa do Claude Code — `CLAUDE.md` (time, versionado) +
`CLAUDE.local.md` (pessoal, gitignored). Os dois carregam automaticamente por sessão.

| Arquivo | Conteúdo | Git |
|---|---|---|
| `CLAUDE.md` | Stack, comandos, estrutura, regras críticas — tudo que já está lá hoje, menos a seção Vault | versionado |
| `CLAUDE.local.md` | Seção "Vault" (referência pessoal ao Obsidian) | gitignored |

`.gitignore`: remove entrada de `CLAUDE.md`, adiciona `CLAUDE.local.md`.

Cada dev pode ter seu próprio `CLAUDE.local.md` com atalhos pessoais — não é obrigatório
preencher.

## Parte 2 — Gate de CI para mudanças no Supabase

### Fluxo atual (sem gate)

```
dev cria migration --> roda `db push` manual (ou esquece) --> outro dev não sabe
dev builda edge function --> roda `edge:publicar` manual --> sobrescreve deploy do outro sem aviso
schema muda --> `database.types.ts` não é regenerado --> front assume estrutura antiga
```

### Fluxo proposto

```
dev abre PR (migration e/ou mudança de servidor)
    |
    v
CI (supabase-check.yml) roda em todo push/PR:
  1. `supabase link` no projeto (usa secrets)
  2. `supabase db diff` contra o remoto -- detecta schema já divergente do esperado pelas migrations do repo
  3. regenera `database.types.ts` e compara com o commitado -- falha se divergir
    |
    v
merge em `main`
    |
    v
CI (supabase-deploy.yml) roda só em push em `main`:
  1. `supabase db push` (real, aplica migrations pendentes)
  2. `npm run edge:publicar` (build:edge + functions deploy)
    |
    v
Cloudflare Pages publica o cliente (já observa `main`, sem mudança)
```

**Efeito em cada incidente:**

- **Migration não aplicada** — pega no passo 2 do gate: se o schema remoto já não bate com o que
  as migrations do repo esperam, falha antes do merge, não depois.
- **Edge function sobrescrita** — só existe um caminho de deploy real (a Action, disparada por
  push em `main`), serializado pelo git. Dois devs publicando ao mesmo tempo vira dois commits em
  sequência, não uma corrida de `edge:publicar` local.
- **Front desatualizado** — gate falha se `database.types.ts` divergir do gerado, força regenerar
  e commitar junto da migration.

### O que muda em [11-operacao.md](11-operacao.md)

`db push` e `edge:publicar` deixam de ser o fluxo padrão de deploy e viram **diagnóstico /
emergência** — uso consciente, fora do caminho normal. Documentar isso explicitamente lá quando o
workflow entrar no ar, pra não haver dois fluxos "oficiais" ao mesmo tempo.

### Pré-requisitos

- Secret `SUPABASE_ACCESS_TOKEN` no GitHub Actions — hoje a credencial mora no Windows Credential
  Manager local (ver 11-operacao.md), precisa gerar um token novo dedicado a CI.
- Secret `SUPABASE_PROJECT_REF` (`cffbihbmhiuudahsgjsn`).
- Testar o workflow numa branch descartável antes de depender dele — CI mexendo em produção sem
  ensaio é o mesmo tipo de risco que motivou este documento.

### Fora de escopo aqui

Supabase branching (preview branches por PR) foi considerado e descartado por ora: resolve
isolamento total, mas é recurso pago e overhead grande para 2 devs. Fica como próximo passo se o
time crescer.

## Parte 3 — Branch `dev` (git) + schema `dev` como staging ao vivo

Design aprovado em 2026-08-18. Contexto: `npm run dev` hoje roda o front local contra a Edge
Function JÁ PUBLICADA em produção — testar mudança de servidor/migration exige publicar antes
(zero ciclo de teste real). Docker local (`supabase start`) foi descartado — objetivo é **tudo
sempre no ar, nada rodando na máquina do dev** além do front (`vite`, local, port 5173).

### Simetria git ↔ Supabase

| Camada | Staging | Produção |
|---|---|---|
| Branch git | `dev` | `main` |
| Schema Supabase | `dev` | `public` |
| Edge Function | `jogo-dev` (nova) | `jogo` (já existe) |
| Secret de schema | `JOGO_SCHEMA_DEV=dev` | `JOGO_SCHEMA=public` |

Mesmo bundle `servidor.js` (`authority/`) nas duas functions, mas **nomes de secret diferentes por
function** — achado real: `supabase secrets set` é por PROJETO, não por function (confirmado nos
docs oficiais, um dashboard só em `/functions/secrets`, compartilhado). Se as duas lessem a mesma
var `JOGO_SCHEMA`, setar um valor pra uma mudaria a outra junto — mesma classe do incidente de
13/08 (schema trocado). `jogo/index.ts` lê `JOGO_SCHEMA` (default `'dev'` se ausente — fail-safe
deliberado, nunca promove pra `public` por omissão); `jogo-dev/index.ts` lê `JOGO_SCHEMA_DEV`
(também default `'dev'`). Os dois secrets coexistem no mesmo project-wide store sem colisão.

### Isto NÃO é trunk-based development

Fica parecido de longe ("staging ao vivo", deploy contínuo) mas é outro modelo — importa deixar
explícito pra não confundir o time.

Trunk-based de verdade seria: um branch só (`main`), commit direto ou via branch curtíssima
(<1 dia), feature incompleta atrás de feature flag (não de branch separada), deploy dev/prod
saindo do MESMO commit, diferenciado só por config de ambiente.

O que este design faz: `dev` e `main` são branches **permanentes**, cada PR vive até revisão,
promoção `dev`→`main` é evento separado e explícito. Mais devagar que trunk-based — troca-off
aceito de propósito pra time de 2 pessoas, sem custo de infra de feature flag. Mais próximo de
GitFlow simplificado (2 branches de longa duração) do que de trunk-based.

### Fluxo

```
PR feature -> dev (nao push direto -- ponto de decisao explicito do dev, mesma
  disciplina que ja existe pra main. Push solto na feature branch nao promove nada)
    |
    v
CI (job de tsc+test) roda no PR
    |
    +-- falhou --> para aqui. Branch `dev` intocada.
    |
    v (passou)
merge em `dev` (git)
  `supabase db push` (aplica migration nova que toca `dev.*`)
  deploy `jogo-dev` (JOGO_SCHEMA_DEV=dev) com o codigo de `dev`
  CI confirma JOGO_SCHEMA_DEV correto pos-deploy (chama endpoint de debug/health
  que ecoa o schema ativo) -- sem isso, secret errado bota codigo nao testado
  rodando contra dado real de producao, silenciosamente (mesma classe do
  incidente de 13/08, ver _Session do vault)
    |
    v
dev testa local: .env.local -> VITE_SERVIDOR_URL aponta pra URL de `jogo-dev`
  (unico ponto de config do front, ja suportado por src/data/remote/servidor.ts:22 -- zero mudanca de codigo)
    |
    v (validado)
PR `dev` -> `main` (migration par completo: arquivo que toca `dev.*` PRECISA
  ter o correspondente `public.*` na mesma PR -- gate da Parte 2)
    |
    v
merge em `main` --> supabase-deploy.yml de sempre (Parte 2): db push completo
  (parte dev ja aplicada = no-op) + deploy `jogo` (public/prod)
```

### Mudança necessária no gate da Parte 2 (achado no pente fino)

`supabase-check.yml` já dispara em `push: branches-ignore: [main]` — roda em QUALQUER push fora
de `main`, inclusive na feature branch e em `dev`, sempre diffando contra `origin/main`
(`git diff origin/main...HEAD`, linha 74-75). Isso quebra o fluxo acima: um commit só `_dev.sql`
(sem `_public.sql` ainda) falharia esse gate na feature branch, antes mesmo de chegar em `dev` —
**não é "trava sem mudança", precisa mudar**.

Fix: base do diff varia por trigger.
- `push` (não-main, ou seja feature branch / `dev`) → diff contra `dev`, não contra `main`. Commit
  só-`_dev` passa livre (não se espera par ainda).
- `pull_request: branches: [main]` → diff contra `main`, como já é hoje. Aqui sim exige par
  completo — é o ponto real de promoção.

O mecanismo em si (compara diff da PR inteira, não commit a commit) continua são — só a branch de
comparação do job de push precisa ficar condicional ao alvo.

### Risco aceito

`dev`/`jogo-dev` são **compartilhados** entre os 2 devs — sem isolamento por branch (isso é
Supabase branching pago, já descartado na Parte 2). Duas branches simultâneas mexendo em schema
competem pelo mesmo merge-target de staging. Aceito pelo tamanho do time; reavaliar se o time
crescer.

### Pendente de implementação

- Criar função `jogo-dev` (Supabase Dashboard ou CLI) + secret `JOGO_SCHEMA_DEV=dev` (nome
  dedicado, não `JOGO_SCHEMA` — ver seção acima).
- Workflow novo (CI): merge-de-teste feature→`dev`, build+test gate, só então merge real +
  `db push` + deploy `jogo-dev`.
- `supabase-check.yml`: diff base do job de `push` vira condicional por trigger (branch `dev` como
  base fora de `main`, ver seção acima) — mudança obrigatória, não opcional.
- `supabase-deploy.yml` (deploy de `main`) permanece como está — sem alteração.
