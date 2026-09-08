# Preservação visual sob demanda

Quando o pedido congelar tipografia, registre antes da edição família, tamanho computado,
peso, line-height, letter-spacing e text-transform dos elementos afetados.
Compare antes/depois no mesmo viewport e com fontes carregadas. Preserve declarações
existentes; novos elementos reutilizam tokens. Se o pedido exigir mudança incompatível,
explique o conflito antes de alterar a restrição.
Fontes são self-hosted via pacote e tokens em src/index.css. --font-mono já está definido.
Canvas usa ctx.font: conferir separadamente se o escopo também inclui texto no mundo.
Evite inventário da HUD inteira para ajuste localizado; verifique os elementos afetados
e dependentes. Não acrescente refatorações tipográficas fora do pedido.

Contexto: [interface](../dominios/interface.md). Prompt antigo, com diagnósticos datados:
[registro](../arquivo/2026-09-08/PROMPT-CONGELAR-TIPOGRAFIA.md).
