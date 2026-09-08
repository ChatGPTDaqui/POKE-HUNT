# Processo vigente

PH-515, consolidado em 08/09/2026. Histórico não adiciona etapas.

1. Reutilize issue real PH do programa/tarefa; para trabalho avulso, uma do dia basta.
   Pendência fora do escopo tem issue própria com sintoma/aceite; pesquise duplicatas
   por JQL. Jira indisponível: preserve registro local e reconcilie, sem inventar keys.
2. Confira git status -sb e atualize referências. Branch tipo/PH-<n>-slug de origin/dev;
   worktree próprio em concorrência, com dependências próprias quando necessárias.
3. Consulte o domínio em [índice](README.md). Execute uma mudança coerente e reversível.
   Preserve arquivos alheios; harness e protótipos úteis também são versionados.
4. Antes dos checks, siga [verificação proporcional](operacao/verificacao.md).
   Antes de DDL/DML ou tipos, siga [banco](operacao/banco.md).
5. Revise o diff final uma vez; PR registra problema, mudança, validação e risco relevante.
   Commit convencional em português, sem coautoria; push e PR para dev com key/link Jira.
6. Após o último push e preparação concluída, armar gh pr merge --auto --squash.
   check e build-check obrigatórios, sem bypass; se BEHIND, atualizar a branch.
7. Confira deploy de dev e staging (servidor/cliente). Siga [publicação](operacao/publicacao.md)
   para promover dev → main por merge commit e verificar produção, sem nova aprovação
   humana já dispensada. Respeite restrição explícita do pedido atual.
8. Atualize issue com links e resultado real. Memória guarda decisões duráveis e
   pendências, não cópias de revisão/commits. Não declare publicado/verificado se pendente.

O hook Claude/Bash é proteção auxiliar local; não cobre todo agente nem valida a key.
PR e checks são o controle comum. Não remova proteções para acelerar.
