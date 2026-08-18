# 11 — Operação

## Comandos

### Desenvolvimento

| Comando | O que faz |
|---|---|
| `npm run dev` | App em desenvolvimento, `http://localhost:5173` |
| `npm run build` | `tsc -b` + `vite build` + **cópia da arte** |
| `npm start` | build + `serve.js`, porta 5173 |
| `npm run preview` | Preview do build, porta 4173 |
| `npm test` | vitest |
| `npm run lint` | oxlint |
| `npm run edge:publicar` | Publica o serviço de autoridade (build:edge + deploy) |

**Rodar o jogo exige o servidor de autoridade.** Desde que a RLS foi revogada, o cliente não
escreve progresso: sem `VITE_SERVIDOR_URL` apontando para um serviço vivo, o jogo não
funciona. Isso é o recurso, não um bug.

**Não existe mais serviço de autoridade local.** `server/src/node.ts` (o adaptador `node:http`,
porta 8787) foi deletado em `29a4da4` — `server/package.json` tem só `build`, e nenhum
`listen()` sobrou em `server/src/`. `.env.local` aponta `VITE_SERVIDOR_URL` direto para a Edge
Function publicada, e é assim que se desenvolve hoje: `npm run dev` no cliente contra a função
em produção. Consequência a aceitar: **testar mudança no servidor exige `npm run edge:publicar`
antes** — não há ciclo local.

### Dados

| Comando | O que faz |
|---|---|
| `npm run catalog:gerar` | **Build de dados atual.** Postgres → arquivos gerados |
| `npm run catalog:verificar` | Prova byte a byte que os dois geradores concordam. Sai 1 se divergir |
| `npm run catalog:migrar` | Planilha → Postgres (idempotente) |
| `npm run planilha:aplicar` | Gerador antigo, do `.xlsx`. Lado esquerdo da verificação |
| `npm run db:types` | Regenera `src/lib/database.types.ts` |

`catalog:gerar` e `catalog:migrar` precisam de `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` no
`.env` da raiz.

### Motor e deploy

| Comando | O que faz |
|---|---|
| `npm run build:engine` | Empacota o motor num ESM para o Node (`vite build --ssr`) + os tipos |
| `npm run build:edge` | Empacota **motor + serviço** num arquivo só para o Deno |
| `npm run edge:publicar` | `build:edge` + `supabase functions deploy jogo` |
| `npx supabase db push` | Aplica as migrations no projeto linkado |

O cliente é publicado por `git push` na `main`, que o Cloudflare Pages observa.

### Wipe

| Comando | O que faz |
|---|---|
| `npm run db:wipe -- --confirmar=APAGAR-TUDO` | Reset de todos os saves |

Ver a seção de wipe abaixo.

## Acesso ao Supabase

**Não há nada a configurar** — os caminhos abaixo já funcionam nesta máquina. Isto está
escrito porque uma sessão futura vai perder tempo redescobrindo.

| Caminho | Comando | Alcance |
|---|---|---|
| SQL arbitrário | `npx supabase db query --linked "<sql>"` (ou `-f arquivo.sql`) | DDL + DML, sem Docker — vai pela Management API |
| Migrations | `npx supabase db push` | Aplica `supabase/migrations/*.sql` |
| Edge Function | `npm run edge:publicar` | Publica o servidor de autoridade |
| REST / Auth admin | `fetch` com `SUPABASE_SERVICE_ROLE_KEY` | Ignora RLS; inclui `/auth/v1/admin/users` |
| Secrets | `npx supabase secrets list \| set` | `ORIGENS_PERMITIDAS` e afins |

**Onde mora a credencial da Management API:** no **Windows Credential Manager**, não num
arquivo. `~/.supabase/access-token` não existe e `env | grep -i supabase` volta vazio — os
dois dão a impressão falsa de "CLI não autenticada". O teste que vale é
`npx supabase projects list`.

Projeto: `cffbihbmhiuudahsgjsn` ("Poke Idle Hunt", `sa-east-1`, Postgres 17.6).

`.env` da raiz tem `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. `.env.local` tem as chaves do
cliente (anon + `VITE_SERVIDOR_URL`).

### `db query` NÃO substitui migration

Ter SQL arbitrário é útil e perigoso pela mesma razão.

Mudança de **schema** (tabela, coluna, função, policy, índice, grant) vai por **migration
versionada + `db push`**, sempre. Aplicar schema direto por `db query` deixa o banco divergindo
do repositório em silêncio: a próxima `db push` não sabe que aquilo existe, um ambiente novo
nasce diferente, e a auditoria de "por que esta coluna existe" some junto com o terminal.

`db query` é para: inspecionar, diagnosticar, medir, e correção pontual de **dado** (não de
estrutura).

### Ações destrutivas pedem confirmação

Este acesso apaga produção inteira sem rede de segurança. Wipe, `drop`, `delete` em massa,
revogar policy, trocar secret e deploy que muda comportamento são confirmados antes — a
autonomia é para não precisar pedir *credencial*, não para decidir sozinho o que é
irreversível.

### O que não existe nesta máquina

**Token da Cloudflare.** O deploy do cliente acontece por `git push`, então não é bloqueio para
o fluxo normal. Consultar ou alterar o projeto no painel (domínio, variável de build, log de
deploy) exige um token que não está aqui.

## Domínio de produção

**`https://poke-hunt-euj.pages.dev`**

O projeto se chama `poke-hunt`, mas o subdomínio emitido leva o sufixo `-euj` porque
`poke-hunt.pages.dev` **já pertencia a outro projeto, de outra conta** — hoje serve uma página
sem relação nenhuma com este jogo.

**Armadilha cara:** sondar o nome óbvio devolve `200 OK` com HTML em **todo** caminho
(inclusive `/assets/....gif`, que volta `text/html`), parecendo um deploy quebrado deste jogo.
Já custou um diagnóstico errado e uma entrada de CORS apontada para o domínio de terceiro.

O nome real sai de `GET /accounts/{id}/pages/projects/poke-hunt`, campo `subdomain` — não de
adivinhação.

`ORIGENS_PERMITIDAS` (secret do projeto Supabase, lido pela Edge Function) precisa conter esse
domínio. **O valor volta hasheado na API**: para saber o que está lá, sondar origem por origem
com preflight `OPTIONS` e ver quem recebe `Access-Control-Allow-Origin`.

## Wipe

`supabase/migrations/*_rotina_de_wipe.sql` cria `public.wipe_todos_os_saves()`;
`scripts/wipe-todos-os-saves.js` só dispara.

**Três decisões que não são estética:**

**1. A lógica mora no banco, por ATOMICIDADE.** Um wipe pela metade (POKEs apagados, ouro
intacto, sessão de hunt ainda aberta) é pior que não apagar nada. Uma função roda numa
transação só.

**2. A linha de `players` é RESETADA, não apagada.** `handle_new_user` só dispara em
`auth.users` novo — apagar a linha deixaria toda conta **existente** sem linha em `players`, e
`carregarEstado` responde 404 nesse caso: **o jogo simplesmente não abriria mais para
ninguém**. O estado inicial sai de `default` por coluna + `hunts_iniciais()`, as **mesmas**
regras do `handle_new_user`, então item novo no catálogo ou hunt nova sem custo passa a valer
no wipe sozinho.

**3. `revoke execute ... from anon, authenticated`.** Toda função no schema `public` é chamável
por RPC (`POST /rest/v1/rpc/<nome>`) com a anon key que **vai no bundle do jogo**. Sem o
revoke, qualquer visitante apagaria o progresso de todos com um `fetch`. Conferido ao vivo: com
a anon key a chamada volta **401 "permission denied for function"**.

### Ordem obrigatória

`wipe_mundo_social()` roda **antes** de `wipe_todos_os_saves()`: `market_listings.poke_uid`
referencia `pokemon_instances` com `on delete restrict`, então apagar POKE antes violaria o FK.

### Armadilha real (falhou na primeira execução)

`delete from <tabela>` sem WHERE estoura `21000 / "DELETE requires a WHERE clause"`.

Não é o Postgres — é a extensão `safeupdate`, que o Supabase carrega no papel usado pela API
REST, e **ela vale dentro de uma função chamada por RPC** (`security definer` troca o dono dos
privilégios, não o `session_preload_libraries`).

Em `psql` como superusuário a mesma função roda; só aparece pelo caminho que o script realmente
usa. `where true` resolve.

### Wipe parcial

`wipe_inventario_e_economia()` — só estoque e carteira. POKE, Pokedex, nível e hunts
permanecem. Mesmo `revoke` e mesmo `where true`.

## Migrations

Sequência em `supabase/migrations/`, ordenada por timestamp. Marcos:

| Migration | O que resolveu |
|---|---|
| `..._initial_schema` | Catálogo + jogador |
| `..._sessoes_de_jogo` | Base da Fase D |
| `..._semear_hunts_desbloqueadas` | Jogador novo nascia sem hunt nenhuma |
| `..._cliente_perde_a_escrita` | **RLS revogada.** Fim da autoridade do cliente |
| `..._sessao_guarda_o_estado_do_sorteio` | Sessão repetia a mesma sequência a cada flush |
| `..._sessao_map_id_sem_fk` | Modo Pesadelo e BOSS eram 100% injogáveis |
| `..._pokemon_pode_estar_no_mercado` | Enum `location` ganha `market` (arquivo separado!) |
| `..._team_slot_aceita_pokemon_no_mercado` | Check antiga proibia o valor novo do enum |
| `..._uma_sessao_aberta_por_jogador` | Índice **único** parcial. Fim da duplicação por sessão dupla |
| `..._busca_de_nick_sem_curinga` | `_` e `%` do LIKE em busca de amigo |
| `..._marca_de_flush_em_andamento` | Request concorrente apagava o flush já creditado |

### Regras aprendidas

- **`ALTER TYPE ... ADD VALUE` precisa de migration própria.** O Postgres proíbe usar o valor
  novo na mesma transação em que ele foi adicionado.
- **`drop constraint` busca o nome real em `pg_constraint`.** Um
  `drop constraint if exists <palpite>` é no-op e deixaria o bug de pé em silêncio se o nome
  divergisse.
- **`where true` em todo DELETE e UPDATE**, por causa do `pg_safeupdate`.
- **De-duplicar antes de criar índice único.** A migration do nick único falharia com as linhas
  duplicadas existentes.
- **Migration que muda default não toca conta existente** — a menos que a intenção seja
  explicitamente essa, e mesmo então, comparando o valor antigo. A migração de auto-poção para
  70% só atualizou quem tinha **exatamente** o default antigo (`[{"hpPercent":50,...}]`,
  comparado como jsonb inteiro): 56 migrados, 2 personalizados preservados (10% e 65%).
  Sobrescrever escolha de jogador com "novo balanceamento" é o tipo de mudança que aparece como
  bug para quem a sofre.

## Fluxo de mudança de schema

Escrito assumindo **zero contexto de sessão anterior** — vale tanto pra um humano quanto pra
outra instância de Claude Code (ou qualquer outro agente) que nunca viu este projeto antes.
Motivo de existir: em 2026-08-18 alguém aplicou 2 colunas novas (`pokemon_instances.nature`,
`.trait`) direto no banco, sem nunca criar migration — o gate de CI (abaixo) achou isso sozinho na
primeira vez que rodou. Sem o gate, ninguém saberia que aquilo existia até quebrar em outra
máquina. Histórico completo em [15-coordenacao-supabase.md](15-coordenacao-supabase.md).

### Regra de ouro

**Nunca aplicar DDL direto no banco** — nem `db query`, nem dashboard do Supabase, nem MCP tool
`apply_migration` sem também criar o arquivo correspondente. Toda mudança de estrutura (tabela,
coluna, função, policy, índice, grant) vira arquivo em `supabase/migrations/`, sempre, sem
exceção — mesmo pra teste rápido, mesmo achando que vai desfazer depois.

### Passo a passo

1. Criar `supabase/migrations/<timestamp>_<nome_descritivo>.sql` — timestamp formato
   `YYYYMMDDHHmmss`, maior que o mais recente já existente no diretório.
2. **Este projeto tem 2 schemas espelhados: `public` (produção) e `dev` (clone de teste).** Se a
   mudança afeta uma tabela/função/policy do jogo (não algo `public`-only por natureza, tipo grant
   de sistema), criar **os dois arquivos**, um por schema, timestamps próximos — convenção já em
   uso, ver `supabase/migrations/2026081*_..._public.sql` / `..._dev.sql`.
3. Aplicar: `npx supabase db push` (precisa estar linkado uma vez por máquina —
   `npx supabase link --project-ref cffbihbmhiuudahsgjsn`).
4. Se mudou tabela/coluna/tipo: `npm run db:types` — regenera `src/lib/database.types.ts`.
   Commitar junto da migration, no mesmo commit.
5. `git add` migration(s) + `database.types.ts` → commit → push.
6. PR abre → `supabase-check.yml` roda sozinho e reprova se algo ficou pra trás. Seguir a
   mensagem de erro — ela diz exatamente o que falta (ver seção abaixo).
7. Merge em `main` → `supabase-deploy.yml` aplica de verdade em produção. **Não rodar `db
   push`/`edge:publicar` manual fora desse fluxo**, a menos que seja diagnóstico pontual (a seção
   de Diagnóstico de 502 abaixo já é esse caso legítimo).

### Se o gate (`supabase-check.yml`) falhar e não estiver claro por quê

- **"Migration aplicada no remoto sem arquivo local"** → `npx supabase migration list --linked`
  mostra quais versões estão descasadas. Se for migration de outro dev já mesclada que você não
  puxou ainda: `git pull`. Se for mudança aplicada direto no banco (o erro que este documento
  existe pra evitar): reconstruir o `.sql` com o **mesmo timestamp** já registrado — `select
  version, name from supabase_migrations.schema_migrations where version = '<versao>'` (via `db
  query`) dá o nome; `information_schema.columns` + `pg_constraint` dão a definição real pra
  reconstruir o `alter table`/`create ...` com precisão, não achismo.
- **"database.types.ts esta desatualizado"** → `npm run db:types`, commitar o resultado.
- **"Migration nova mexe em dev sem mexer em public" (ou vice-versa)** → falta o arquivo par do
  passo 2 acima.

## Diagnóstico de 502

A Edge Function **não repassa o corpo do erro do PostgREST** — o que é correto, porque ele traz
nome de coluna e constraint. Lá o erro é opaco.

**A receita que resolvia isso morreu.** Até `29a4da4`, o primeiro passo era subir o serviço local
(`cd server && npm run dev`, porta 8787) e repetir o request — o erro completo aparecia. Aquele
adaptador Node não existe mais. O que sobrou, em ordem de custo:

1. **Reproduzir a query com `npx supabase db query --linked`.** Funciona sempre e é o mais rápido
   quando você já sabe qual tabela está envolvida — o erro vem completo.
2. **Log da função publicada** (`npx supabase functions logs jogo`, ou o painel).
3. `npx supabase functions serve jogo` — daria o ciclo local de volta com erro completo, mas
   **não foi testado nesta máquina** e provavelmente exige Docker, que todos os outros caminhos
   de Supabase daqui evitam de propósito.

Dois diagnósticos que estavam parados foram resolvidos em minutos pela receita antiga; vale
reconstituir o equivalente antes de precisar dele sob pressão.

## Variáveis de ambiente

| Variável | Onde | Papel |
|---|---|---|
| `SUPABASE_URL` | `.env` (raiz) | Scripts de catálogo |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (raiz) | Scripts, admin |
| `VITE_SUPABASE_URL` | `.env.local` + Pages | Cliente |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` + Pages | Cliente |
| `VITE_SERVIDOR_URL` | `.env.local` + Pages | **O interruptor da autoridade** |
| `ORIGENS_PERMITIDAS` | secret do Supabase | CORS da Edge Function |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são **injetadas pela plataforma** dentro da Edge
Function — não há segredo para subir à mão.

As três `VITE_*` são de **build**: sem elas o bundle sobe e quebra no load, porque
`lib/supabase.ts` estoura de propósito quando falta config.

## O que falta na Fase D

- **CORS**: `ORIGENS_PERMITIDAS` precisa acompanhar qualquer domínio novo.
- **401 intermitente no cadastro** — ver
  [04](04-autoridade-do-servidor.md#pendências-conhecidas).
