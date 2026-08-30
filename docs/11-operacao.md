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

**Não existe mais serviço de autoridade local.** `authority/src/node.ts` (o adaptador `node:http`,
porta 8787) foi deletado em `29a4da4` — `authority/package.json` tem só `build`, e nenhum
`listen()` sobrou em `authority/src/`. Consequência a aceitar: testar mudança no servidor exige
publicar antes — não há ciclo local, mas desde a função `jogo-dev` (docs/15, Parte 3) não
precisa mais ser DIRETO em produção.

**Dois alvos possíveis pra `VITE_SERVIDOR_URL` em `.env.local`:**

| Alvo | URL | Quando usar |
|---|---|---|
| `jogo` (produção) | `https://uogmhqbyjgafjujbqdty.supabase.co/functions/v1/jogo` | Padrão histórico — testa direto contra dado real |
| `jogo-dev` (staging) | `https://uogmhqbyjgafjujbqdty.supabase.co/functions/v1/jogo-dev` | Testar mudança de servidor/migration sem tocar produção — schema `dev`, populado só com dado de teste |

Trocar de alvo é só editar essa linha em `.env.local` e reiniciar `npm run dev` — nenhuma outra
mudança de código. `jogo-dev` só reflete o que já foi mergeado em `dev` (deploy automático via
`supabase-deploy-dev.yml` a cada push nesse branch, ver docs/15) — não é live-reload do que está
sendo editado localmente; ainda assim, publicar em `dev` é bem mais barato que publicar em `main`.

### Staging tem DOIS lados, e "smoke em jogo-dev" cobre só um (PH-134)

Vale a distinção porque ela já custou tempo: **"smoke em `jogo-dev`" testa o SERVIDOR.** É a Edge
Function respondendo, a migration aplicada, a RPC recusando o que deve recusar. Não diz nada sobre
o cliente.

**O cliente de staging é `https://dev.poke-hunt-euj.pages.dev`**, publicado pelo Cloudflare Pages a
cada push na `dev`. Ele passou meses **sem iniciar** — o build compilava, o deploy ficava verde, o
HTTP respondia 200, e o app morria no browser porque o ambiente de *preview* do Pages não tinha
variável nenhuma. Ninguém notou porque nada olha a tela depois do deploy.

Consertado em 2026-08-25. As cinco variáveis do preview:

| variável | preview (staging) | produção |
|---|---|---|
| `VITE_SUPABASE_URL` | mesmo projeto | mesmo projeto |
| `VITE_SUPABASE_ANON_KEY` | mesma | mesma |
| `VITE_SERVIDOR_URL` | **`…/jogo-dev`** | `…/jogo` |
| `VITE_SUPABASE_SCHEMA` | **`dev`** | não declarada (cai no padrão `public`) |
| `VITE_AUTH_STORAGE_KEY` | **valor próprio** | valor próprio, diferente |

As duas últimas linhas não são detalhe. `VITE_SUPABASE_SCHEMA` é o segundo caminho de escrita:
apontar só o `VITE_SERVIDOR_URL` pra `jogo-dev` e deixar o schema em `public` manda metade do
tráfego pra produção. E `VITE_AUTH_STORAGE_KEY` repetido entre os dois faria staging e produção
**dividirem a sessão no mesmo navegador** — entrar num logaria no outro.

**Armadilha ao inspecionar pela API:** *todo* deploy deste projeto aparece com
`environment: "preview"`, inclusive os da branch `dev`. Não conclua que mexer no preview não
alcança o jogador sem antes conferir por onde produção é servida.

**Enquanto não houver check automático** (item pendente da PH-134, bloqueado porque mexe em
`.github/workflows/` e o token de push não tem escopo `workflow`), o passo é manual e entra no
pré-voo da promoção: abrir `https://dev.poke-hunt-euj.pages.dev`, confirmar que a tela sobe e que o
console está limpo. Deploy verde não é evidência de app que inicia.

### O lado servidor do smoke tem bancada (PH-220)

```bash
node scripts/harness/fumaca-credito.mjs                        # jogo-dev, ~2min
node scripts/harness/fumaca-credito.mjs --espera=15            # mais rápido, janela menor
node scripts/harness/fumaca-credito.mjs --funcao=jogo --confirmar-public
```

Responde **"o flush ainda credita?"** com a conta canônica de teste: abre sessão, espera, flusha, e
confere que ouro/XP subiram. Depois dispara **dois flushes simultâneos** e confere que exatamente um
credita — a serialização do CAS que impede POKE duplicado. Códigos de saída: `0` credita e
serializa, `2` não, `1` inconclusivo (POKE desmaiou no meio, hunt inexistente — nada disso é
evidência sobre o claim).

Vale rodar depois de qualquer mexida em `aplicarFlush`/`gravarEstado` ou em `db.ts`, e depois de
upgrade de PostgREST. O modo de falha que ela cobre é invisível de outra forma: `FLUSH_OCUPADO`
responde **HTTP 200 com `segundosCreditados: 0`**, então um claim que pare de funcionar deixa o jogo
sem creditar nada sem emitir erro, sem log vermelho e sem check reprovado. A PH-194 já foi um
upgrade de PostgREST quebrando o projeto sem ninguém tocar em nada.

**Ouro não serve para medir crédito duplicado** — a auto-venda de POKE capturado cai na mesma
carteira e a variância chega a 2,5x por abate. A bancada mede `game_sessions.simulated_seconds` (o
servidor soma a janela nele) e `rng_draws`. Esse detalhe custou um falso alarme na PH-219.

Mirar `--funcao=jogo` é recusado sem `--confirmar-public`, pelo mesmo motivo de
`scripts/lib/schema-alvo.cjs`: a bancada **escreve** (abre sessão e credita ouro de verdade).

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

Projeto: `uogmhqbyjgafjujbqdty` ("PokeInspiration's Project", `sa-east-1`, Postgres 17.6) — migrado
de `cffbihbmhiuudahsgjsn` em 2026-08-20 (motivo: matar a service_role key vazada de 13/08, ver
docs/15). Progresso de jogador NÃO foi copiado — só catálogo (species/moves/items/etc) e a conta
admin.

`.env` da raiz tem `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHEMA`,
`CLOUDFLARE_API_TOKEN`, `POKE_HUNT_CI` e `CONTA_TESTE_SENHA` — o inventario completo, porque
a versao anterior citava so os dois primeiros e isso ja induziu a achar que o resto nao
existia (PH-151). `.env.local` tem as chaves do
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

### Cloudflare: o token EXISTE (PH-151)

Esta seção afirmava o contrário — *"exige um token que não está aqui"* — e a afirmação era falsa.
Custou caro: **PH-134 foi escrita registrando isso como bloqueio**, e ficou parada por uma
limitação inventada pelo documento.

`CLOUDFLARE_API_TOKEN` está no **`.env` da raiz**. Ativo, com validade até **2026-10-01**.

| Precisa de | Comando |
|---|---|
| Testar se o token vale | `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` |
| Variáveis de build do Pages | `GET accounts/<conta>/pages/projects/poke-hunt` → `deployment_configs.{production,preview}.env_vars` |

O `<conta>` sai da URL que o check "Cloudflare Pages" linka em qualquer PR — é o id logo depois de
`/accounts/`. **`GET accounts` sem id devolve lista vazia**, então não tente descobrir a conta por
ali: o token tem escopo de projeto, não de conta.

O id não fica escrito aqui de propósito. Este repositório é **público** (`gh repo view --json
visibility`), e o id não é credencial mas é atalho de alvo — a troca de conta Supabase de 20/08
aconteceu por uma `service_role` vazada, então o custo desse tipo de descuido aqui não é hipotético.
Quem precisa do id acha em dois cliques pela linha acima.

**Leitura está confirmada** (foi assim que o diagnóstico de PH-134 saiu). **Escrita não foi
testada** — configurar variável de preview é ação de baixa reversibilidade num ambiente
compartilhado, e a própria PH-134 registra que errar ali é "pior que staging quebrado".

O deploy do cliente continua acontecendo por `git push`; o token é para inspecionar e configurar.

### O CLI local e o CI dividem o mesmo token (PH-106)

`POKE_HUNT_CI`, no `.env`, é **o mesmo token** que os workflows usam. E `supabase link` cria o
role temporário `cli_login_postgres` pela Management API **rotacionando a senha a cada login**.

Consequência prática: **rodar `npm run db:types`, `db push` ou `edge:publicar` na sua máquina
enquanto um deploy do CI está em voo derruba o deploy**, com

```
FATAL: password authentication failed for user "cli_login_postgres" (SQLSTATE 28P01)
```

Quem morre é sorteio — pode ser o seu comando, pode ser o deploy. Deploy morto significa migration
não aplicada e Edge Function não republicada, **com a PR já verde e mesclada**; foi assim que
PH-92 deixou a função com código velho e a captura gravando errado até alguém ir jogar.

**Antes de rodar o CLI, confira se há workflow em execução:**

```
gh run list --limit 5
```

#### O CI se recupera sozinho; a sua máquina não (PH-106)

Os três workflows que tocam o CLI (`supabase-check`, `supabase-deploy`, `supabase-deploy-dev`)
chamam **`scripts/ci/supabase-cli.sh`** em vez de `supabase` direto. O wrapper linka, roda o
comando e, **quando a falha tem assinatura de autenticação** (`28P01`,
`password authentication failed`, `failed to connect as temp role`), **re-linka e repete** — até 3
vezes. Erro de SQL de verdade (constraint, tipo, migration fora de ordem) reprova na primeira
tentativa, sem gastar rodadas escondendo o log útil.

Isso fecha a colisão entre workflows, que era a mais frequente: **3 das 20 execuções de
`supabase-deploy-dev` anteriores a 30/08 morreram assim** — o `check` e o `deploy-dev` disparam no
mesmo segundo em todo push em `dev`.

**Não é `concurrency.group` compartilhado**, que era a correção óbvia da issue. O GitHub mantém
apenas **um** run pendente por grupo e **cancela o pendente anterior** quando outro entra na fila:
com os três no mesmo grupo, um push em `dev` durante um deploy de `main` cancelaria o deploy de
`main` que estava na fila — migration de **produção** silenciosamente não aplicada. Trocar "morre
por sorteio" por "morre por fila" não é conserto.

O que o wrapper **não** cobre é o comando que você roda na sua máquina: ele não passa por lá. Se o
seu `db:types` morrer com `28P01`, foi um workflow que rotacionou a senha — espere o run terminar e
rode de novo.

### O que não existe nesta máquina

Nada mapeado no momento. Esta seção existia para o token da Cloudflare, que **está** aqui — ver
acima. Se algo entrar nela de novo, escreva **como confirmar a ausência**, e não só a afirmação:
a versão anterior desta seção não trazia teste nenhum, e por isso ninguém percebeu que ela tinha
deixado de ser verdade.

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
   `npx supabase link --project-ref uogmhqbyjgafjujbqdty`).
4. Se mudou tabela/coluna/tipo: `npm run db:types` — regenera `src/lib/database.types.ts`.
   Commitar junto da migration, no mesmo commit.
5. `git add` migration(s) + `database.types.ts` → commit → push numa branch de feature.
6. **PR mira `dev`, nunca `main` direto** (docs/15, Parte 3 — reforçado por CI desde
   `483266f`: PR pra `main` que não vem de `dev` é reprovado automático). `build-check-dev.yml`
   roda tsc+testes; `supabase-check.yml` roda o gate de migration/types, comparando contra
   `dev` (não `main`) nesta etapa.
7. Merge em `dev` → `supabase-deploy-dev.yml` aplica migration + publica `jogo-dev` +
   confirma o schema ativo (`/saude`). Testar local: `.env.local` com `VITE_SERVIDOR_URL`
   apontando pra `jogo-dev` (seção acima) — agora sim existe ciclo antes de produção.
8. Validado em `jogo-dev` → PR `dev` → `main` (gate de par `dev`/`public` reaplica aqui,
   comparando contra `main` de verdade — é o ponto real de promoção).

   **"Validado em `jogo-dev`" é o SERVIDOR.** O cliente de staging tem que ser aberto à parte:
   `https://dev.poke-hunt-euj.pages.dev`, tela subindo e console limpo. Ver a seção "Staging tem
   DOIS lados" acima — esse front-end passou meses sem iniciar, com o deploy verde o tempo todo.
9. Merge em `main` → `supabase-deploy.yml` aplica em produção. **Não rodar `db
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
