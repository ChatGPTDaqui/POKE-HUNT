# Processo de trabalho

Fonte vigente para execução de tarefas, consolidada em 08/09/2026 (PH-515).
Decisões e incidentes anteriores são contexto em `20-por-que-cada-regra-existe.md`,
não etapas adicionais. Arquitetura e comandos operacionais: `README.md` e `11-operacao.md`.

## Começar e registrar

- Ler `CLAUDE.md` para os cuidados técnicos e consultar somente os documentos do assunto.
- Usar uma issue real do projeto PH no Jira: reutilizar a issue do programa/tarefa existente;
  para trabalho avulso, uma issue do dia basta. Não criar outra por arquivo ou correção.
- Pendência que ficará sem solução agora tem issue própria com sintoma e critério de aceite;
  pesquisar duplicatas por JQL antes. Jira indisponível: registrar a pendência localmente e
  reconciliar quando voltar, sem inventar keys ou perder o trabalho.
- Conferir `git status -sb`, atualizar referências e criar `tipo/PH-<n>-slug` de `origin/dev`.
  Usar worktree próprio em sessões concorrentes, com dependências próprias.
- Uma PR corresponde a uma mudança coerente e reversível. Não fragmentar por número de arquivos.

## Verificar proporcionalmente

| Impacto | Antes do push final |
|---|---|
| Só documentação | Revisar diff e links; não executar testes de aplicação sem motivo |
| Código localizado | `npx tsc -b` e testes afetados |
| Motor, authority, stores ou código compartilhado | Suíte completa; `build:engine` antes de authority e typecheck próprio |
| Configuração de build, dependências ou empacotamento | `npm run build:verificar` e verificações afetadas |
| CI/harness | Exercitar decisões de sucesso e falha com fixtures; conferir execução real no CI |

`tsc -b` incremental auxilia a edição, não prova build limpo. O CI obrigatório executa
typecheck completo e suíte em toda PR para dev/main. Até o CI incluir o bundle Vite,
mudança no cliente também exige `build:verificar` local antes da PR.
Não repetir checks já aprovados sem alteração ou nova evidência. Manter isolamento do Vitest.
`npm run build` é o comando de publicar: inclui a cópia dos assets; `build:verificar` não publica.

## Banco e segurança

- DDL e correções DML remotas exigem migrations versionadas, revisadas na PR.
  Leitura SQL é permitida; acesso técnico de escrita não dispensa o fluxo.
- Criar par dev/public quando afeta o jogo, timestamp posterior ao da base; dados idempotentes
  com filtro explícito e motivo. Não editar migrations históricas aplicadas.
- Não aplicar `db push` da feature antes do commit/PR. O CI de dev aplica as migrations após merge.
  **Dev e public compartilham o projeto: esse push já afeta os dois schemas.** Mudanças precisam
  ser compatíveis com cliente e servidor atualmente publicados. Contrações exigem fase posterior.
- Tipos devem acompanhar o schema; geração remota só descreve migrations já aplicadas.
  Nunca aplicar antecipadamente para satisfazer o gate. Se o gate impedir preparar tipos da
  migration pendente, resolver o fluxo de validação antes de integrar; não ignorar o diff.
- Exceções existentes: catálogo por pipeline versionado e idempotente; `db:wipe` é operação do
  usuário, com `--confirmar=APAGAR-TUDO`, nunca ação autônoma do agente.
- Não expor `.env`, tokens ou dados de jogadores. Conferir projeto/schema antes de operar.
  Não remover guardrails, proteções de branches ou isolamento para acelerar.

## Integrar e publicar

1. Revisar o diff final e registrar na PR problema, mudança, validação e risco relevante.
   Essa revisão tem um registro; não repetir o mesmo texto em comentário e memória.
2. Commit convencional em português, sem coautoria; push. Harness e protótipos úteis também
   ficam versionados. Preservar arquivos de outras sessões; não usar limpeza indiscriminada.
3. PR para dev com key e link Jira. Armar `gh pr merge --auto --squash` só após o último push.
   Manter `check` e `build-check` verdes. Não usar bypass. Se `BEHIND`, atualizar a branch.
4. Conferir merge e deploy de dev; distinguir aplicação da migration, publicação e tipos.
5. Promover por PR dev → main, **merge commit**, sem nova espera por aprovação humana.
   Conferir staging (servidor e cliente) e intervalo de patch notes: só anunciar mudanças
   completas que o jogador vê/sente. Alteração interna de CI não exige nota de jogo.
6. Conferir deploy de produção e ambas as bancadas (`fumaca-de-producao.mjs` e
   `abrir-hunt-em-producao.mjs`). Credencial ausente/recusada é inconclusivo: corrigir e
   verificar. Regressão funcional confirmada exige reversão antes de investigação prolongada.
   Cliente Pages é publicação separada e precisa conferir com o build promovido.
7. Atualizar a issue com links e resultado real. Memórias guardam decisões duráveis e
   pendências, não cópias do log de commits. Não declarar publicado/verificado enquanto pendente.

Consultar estado agregado em intervalos razoáveis enquanto realiza trabalho independente;
não manter loops de `gh pr checks`. Espera não substitui verificar o resultado final.

## Contexto desta máquina

`CLAUDE.local.md` pode apontar para Obsidian, memórias e comandos locais. Ele complementa este
documento com caminhos, sem duplicar regras. O hook Claude/Bash é proteção auxiliar local;
não cobre todos os agentes nem valida a existência da key. A PR e os checks são o controle comum.
