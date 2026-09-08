# Banco e tipos

- DDL e correções DML remotas exigem migrations versionadas, revisadas na PR.
  Leitura SQL é permitida; acesso técnico de escrita não dispensa o fluxo.
- Criar par dev/public quando afeta o jogo, timestamp posterior ao da base; dados idempotentes
  com filtro explícito e motivo. Não editar migrations históricas aplicadas.
- Não aplicar `db push` da feature antes do commit/PR. O CI de dev aplica as migrations após merge.
  **Dev e public compartilham o projeto: esse push já afeta os dois schemas.** Mudanças precisam
  ser compatíveis com cliente e servidor atualmente publicados. Contrações exigem fase posterior.
- Tipos acompanham a migration na mesma PR. O check de schema restaura apenas a estrutura
  atual em banco descartável, confere a baseline com a base e aplica as migrations novas ali.
  Se os tipos divergirem, baixar `database.types.regenerado.ts` do artefato `database.types.ts`,
  revisar e commitar como `src/lib/database.types.ts` na mesma PR; repetir os checks.
  Não armar auto-merge enquanto essa preparação não terminar. Ver o procedimento abaixo.
- PR sem alteração de schema/tipos não compara seu contrato com um remoto em movimento.
  Drift continua reprovando o deploy de dev, o monitor diário e a promoção para main.
  Geração remota só descreve migrations já aplicadas, nunca justifica `db push` antecipado.
- Exceções existentes: catálogo por pipeline versionado e idempotente; `db:wipe` é operação do
  usuário, com `--confirmar=APAGAR-TUDO`, nunca ação autônoma do agente.
- Não expor `.env`, tokens ou dados de jogadores. Conferir projeto/schema antes de operar.
  Não remover guardrails, proteções de branches ou isolamento para acelerar.

## Preparar schema e tipos na mesma PR (PH-517)

1. Atualizar a base dev e escrever migrations aditivas, compatíveis com o produto publicado.
   Arquivos aplicados não são editados. Par `_public.sql`/`_dev.sql` usa o mesmo assunto e
   timestamps distintos posteriores à base; um único arquivo pode cobrir ambos explicitamente.
2. Abrir PR de rascunho. O check compara a lista remota com as migrations da base, captura
   somente `public`/`dev` por `db dump`, confere novamente a lista e restaura no Postgres
   descartável do runner. Nenhum save é copiado, nenhuma escrita de feature vai para o remoto.
   A cópia da estrutura resolve a lacuna histórica do clone dev sem reescrever migrations antigas.
3. A baseline deve gerar os tipos da base. Só então as migrations novas são executadas e os
   tipos resultantes comparados com a PR. Falha de SQL reprova; não existe bypass por tamanho.
4. Baixar o artefato `database.types.ts` do run; copiar o arquivo `database.types.regenerado.ts`
   para `src/lib/database.types.ts`, revisar o diff, typecheck/testes afetados e push na mesma PR.
   Tipos não precisam ser alterados quando a migration não muda o contrato gerado.
5. Com os checks aprovados, sair de rascunho e integrar pelo procedimento. Conferir o artefato
   `schema-deploy-status`: aplicação, Edge, saúde e tipos têm resultados separados. Drift ou
   geração inconclusiva reprova o run sem afirmar que uma migration já aplicada foi desfeita.

PR de interface não herda comparação com schema de outra tarefa. A detecção de migrations
sem arquivo permanece no check; drift de tipos permanece no deploy, no monitor diário e no
gate de promoção. Se a base remota ainda não foi publicada ou mudou durante a captura, a
bancada reprova e deve ser repetida após estabilizar, sem aplicar a feature à força.

Limites: baseline sem dados valida estrutura, execução de SQL e tipos, não prova backfill
correto em todos os saves nem compatibilidade comportamental de RPC. A revisão e testes da
migration devem cobrir esses casos com fixtures representativas. Remover coluna/RPC usada
pelo produto exige implantação em fases; o schema public já muda no merge em dev.

Implementação e reprodução: `scripts/ci/schema-plan.mjs` e `schema-sandbox.sh`, executados
pelo `supabase-check.yml` com CLI fixado. O dump é temporário e não vira artefato público.
Referência do [dump de estrutura e banco local](https://supabase.com/docs/reference/cli/supabase-db-dump).


## Pontos de atenção

- Limites de negócio são revalidados no servidor/RPC, além do cliente.
- PostgREST pode truncar listagens: contagem usa Content-Range, não .length de uma página.
- Sessão aberta única por jogador exige índice UNIQUE parcial; cliente não impede corrida.
- Verifique todas as migrations posteriores ao procurar a definição vigente de uma RPC.
- Scripts de operação podem ler o .env raiz; .env.local do Vite não isola esses comandos.

Implementação: scripts/ci/schema-plan.mjs e scripts/ci/schema-sandbox.sh.
Diagnósticos e incidentes datados: [registro de operação](../arquivo/2026-09-08/docs/11-operacao.md).
Comandos históricos desse registro não autorizam publicação manual ou db push de feature.
