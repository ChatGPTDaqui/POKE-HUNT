> Registro histórico de 08/09/2026. Não é procedimento vigente.
> Datas, comandos e pendências descrevem a base antiga. [Original preservado no Git](https://github.com/ChatGPTDaqui/POKE-HUNT/blob/016f1240dcb09788c8c44eb52b1be8044e52f190/.claude/commands/checar-merge.md).
> Consulte AGENTS.md e docs/PROCESSO.md na raiz atual para executar tarefas.

---
description: Roda scripts/checar-ordem-merge.sh contra as PRs abertas do repo e reporta ordem de merge + conflitos reais achados, sem alterar nada
---

Rode `bash scripts/checar-ordem-merge.sh` (aceita branch base opcional como argumento — `dev` por padrão) e mostre o resultado ao usuário de forma resumida:

- Lista de PRs abertas contra a base testada
- Overlap de arquivo entre PRs (informativo — overlap de arquivo não é overlap de linha)
- Quais PRs, na ordem em que o `gh pr list` devolveu, fundem limpo e quais dão **conflito de texto real** contra a cadeia acumulada até ali
- Ordem final sugerida (a que passou no teste)

Não executa nenhum merge de verdade — o script só cria objetos git de teste locais soltos, nunca toca branch real. Se achar conflito real, aponte os arquivos e as PRs envolvidas claramente, sem tentar resolver sozinho — quem decide como resolver é o usuário.
