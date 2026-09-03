# Por que cada regra existe

O `CLAUDE.md` carrega o **imperativo**: o que fazer e o que não fazer. Este arquivo carrega o
**porquê**: o incidente que produziu cada regra, o que já foi tentado, e o que se perde ao
afrouxá-la.

A separação foi feita na PH-459, e o motivo é concreto. As duas coisas juntas somavam 28KB
carregados em toda sessão, e o volume já produziu contradição real **duas vezes**, nas duas sem
ninguém notar por dias:

- o parágrafo "boss" do `CLAUDE.md` afirmou por três dias que uma migration não tinha sido
  aplicada, depois de ela já estar nos dois schemas (corrigido pela PH-328);
- `/ph` e `/pr` mandaram esperar review por três dias depois de o review ter acabado,
  contradizendo a `CLAUDE.local.md` da mesma máquina.

**Nada foi apagado nessa mudança.** Cada seção abaixo é o texto que estava no `CLAUDE.md`,
copiado byte a byte, e o `CLAUDE.md` linka para cá.

**Quando divergirem, o `CLAUDE.md` manda.** Ele é a regra vigente; isto aqui é a memória do
motivo, e memória envelhece.

---

## Por que `scripts/` pesa 242MB versionados
<a id="scripts-242mb"></a>

Texto original, como estava no `CLAUDE.md` até a PH-459:

- **`scripts/` pesa 242MB versionados, e isso é decisão tomada, não descuido** (PH-163) — `body-block-refs/` (211,9MB, 31 PNGs) e `agua-refs/` (28,6MB, 5 PNGs) são ENTRADA de `build-sub-bioma-collision.js` e `build-agua-mask.js`; a saída (`src/data/generated/subBiomaCollision.generated.ts`, `aguaMask.generated.ts`) também é versionada, então o repo guarda os dois lados de propósito — a derivação continua reproduzível sem depender de arte que ninguém mais tem. Reescrever histórico com `git filter-repo` é o único jeito de recuperar os ~592MB de pack e foi descartado: quebra todo clone existente e mexe em duas branches protegidas com CI que compara estado. Não reabrir sem argumento novo.

---

## Por que "boss" é ambíguo neste projeto, e os três sistemas
<a id="tres-bosses"></a>

Texto original, como estava no `CLAUDE.md` até a PH-459:

- **"Boss" no projeto são TRÊS sistemas distintos, não dois — não confundir nenhum dos três.** (1) **Sistema de sala das hunts** (Guardian/Lord por sala, PH-223→243): NUNCA usa a palavra "boss" (nem "chefe") em nome de identificador — decisão explícita do usuário (28/08), pra zerar colisão com o (2). Nomenclatura: **Guardian** (sala 1-9) e **Lord** (sala 10). PH-236 (rename completo — engine, authority, testes, UI) fechou em 28/08 nas PRs `refactor/PH-237-guardian-lord-engine-rename`, e a migration do PH-241 (tabela `sala_protetor`, substitui as 15 colunas `boss_*` de `game_sessions`) está aplicada nos dois schemas — `20260828130000_sala_protetor_public` e `20260828130001_sala_protetor_dev` constam na lista de migrations aplicadas, `sala_protetor` existe em `public` e em `dev`, e `src/lib/database.types.ts` foi regerado em 31/08 (PH-318) com zero menção a `boss_`. **O rename fechou por completo — engine, authority, testes, UI e banco — e não sobrou passo manual.** Este parágrafo dizia o contrário ("`db push` ainda não aplicado", "`database.types.ts` fica desatualizado até isso acontecer") por três dias depois de a migration entrar, e mandava tratar como pendência algo já fechado; corrigido pela PH-328 em 31/08. Qualquer PR que toque nesta área segue Guardian/Lord, não "boss"; migrations antigas (`boss_pendente_*`, `boss_aparencia_*`) e patch notes já publicados ficam com o nome antigo de propósito — histórico imutável, não reescrever. (2) **Boss global** — feature separada do Marcos, totalmente fora deste repo/escopo, livre pra usar "boss" no nome dela. (3) **"Hunts BOSS" / Modo Pesadelo** (`data/legendaries.ts#LEGENDARY_SPECIES_IDS`, documentado em `docs/06-mundo-hunts-e-spawn.md`): 11 hunts dedicadas, uma por lendário, sistema PRÉ-EXISTENTE e mais antigo que (1) — mantém o nome "BOSS" como está (inclusive em ALL CAPS por toda a UI/comentários — "hunt BOSS", "as 11 BOSS"), não é afetado pelo PH-236 nem pela regra do (1), só por acaso compartilha helper visual em `src/render/sprites.ts`.

---

## Por que toda tarefa de Jira passa pelo `jira-planner` quando ele existe
<a id="jira-planner"></a>

Texto original, como estava no `CLAUDE.md` até a PH-459:

- **Quando a sessão Claude Code tem o agente `jira-planner` disponível (harness pessoal do Otávio, não algo garantido em toda sessão/todo dev), toda tarefa de Jira passa por ele — nunca `createJiraIssue`/`editJiraIssue` direto.** Decisão explícita do usuário (28/08), nem sempre seguida até aqui. Trabalho grande sempre quebrado em subtarefas pequenas (uma por arquivo/módulo coeso, critério de aceite próprio), nunca uma issue única cobrindo várias frentes. Fluxo: `jira-planner` fase Planner formata (não cria); só sobe de verdade em fase Executor com plano já aprovado. Editar issue existente pra corrigir formato/conteúdo é exceção manual (o agente só tem `createJiraIssue`, sem edição) — cabe à sessão aplicar o que o planner devolveu. Sessão sem esse agente (outro dev, outro harness) não está quebrando regra nenhuma ao criar issue direto.

---

## Por que promover não pede mais confirmação
<a id="sem-confirmacao"></a>

Texto original, como estava no `CLAUDE.md` até a PH-459:

- **PR mirando `dev` E promoção `dev`→`main` podem ser mergeadas sem pedir confirmação** (checks verdes, `update-branch` se preciso). A exigência de confirmação explícita pra promoção **caiu em 2026-08-30** (PH-298), junto com o fim do review manual (PH-297) — as duas eram o mesmo gate humano em momentos diferentes, e o dono do projeto tirou os dois. O fluxo não mudou: PR de promoção **sempre aberta**, nunca push direto na `main`, `bypass_actors` vazio.

---

## Por que existem quatro obrigações depois de todo merge em `main`
<a id="quatro-obrigacoes"></a>

Texto original, como estava no `CLAUDE.md` até a PH-459:

- **Promover não acaba no merge — quem promove tem QUATRO obrigações depois dele, e elas não são opcionais.** Com a confirmação fora, o CI virou o único gate automático, e ele tem um buraco conhecido: **`check` e `build-check` não verificam que o app sobe.** O primeiro cuida de migration e tipos, o segundo roda `tsc` e os testes; nenhum abre o jogo. Isso já falhou **duas vezes, as duas com deploy verde** — PH-134 (cliente quebrado por env ausente) e PH-293 (cliente carregando a tela e nunca o jogo, por CORS, com a primeira correção saindo verde sem resolver). Então, depois de todo merge em `main`:
  1. **Conferir o run do `supabase-deploy.yml`.** Deploy verde é o começo da verificação, não o fim.
  2. **Abrir o jogo em produção e confirmar que ele CARREGA** — não que a tela sobe. A distinção entre as duas coisas é literalmente o defeito da PH-293. A ferramenta é `node scripts/harness/fumaca-de-producao.mjs`: ela faz o caminho que o cliente faz por baixo (login + `/estado`) nos **dois** ambientes e confere status, CORS e o estado do jogador juntos — sai com código 1 se qualquer um reprovar. Abrir a página no navegador **não** substitui: a tela de login sobe mesmo com o servidor recusando tudo.
  3. **Patch notes junto ou logo atrás** (regra de `CLAUDE.local.md`). Promoção automática não é desculpa pra nota atrasar — ela já atrasou oito revarridas seguidas.
  4. **Se quebrar, reverter primeiro e investigar depois.** Não se depura com produção no ar quebrada.
