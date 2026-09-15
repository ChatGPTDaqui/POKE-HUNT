# Decisões por assunto

Uma decisão informa estado, motivo, fonte e condição para revisão. Regra operacional fica
somente em PROCESSO/operacao; pendência executável fica no Jira, sem copiar o backlog aqui.

| Assunto | Estado e referência |
|---|---|
| Contexto por tarefa | [Vigente: hierarquia e medição](contexto-hierarquico.md) |
| Entradas de arte versionadas | Vigente; [PH-163](../arquivo/2026-09-08/docs/20-por-que-cada-regra-existe.md#scripts-242mb). Preservar reprodutibilidade; não reescrever Git para reduzir contexto |
| Guardian/Lord e Hunts BOSS | Vigente; [nomenclatura](../dominios/mundo-hunts.md) |
| Aprovação de promoção dispensada | Vigente; [processo](../PROCESSO.md), substitui aprovação descrita nos handoffs |
| Dev/public compartilhados e tipos na PR | Vigente; [banco](../operacao/banco.md), substitui db push antecipado |
| Alternativas recusadas/reabilitadas | [Registro datado](../arquivo/2026-09-08/docs/12-decisoes-descartadas.md); verificar estado da decisão específica |
| Estágios 8-10 = fim do bioma | Vigente (PH-506, 15/09/2026): mesmo elenco, só o nível sobe; o dado real dos jogos topa em Lv 67 e as formas já são finais. Revisar só se entrar conteúdo próprio para Lv 71-100 ou raridade por profundidade (caminhos 1 e 3 da issue) |
| Proteção da dev igual à da main | Vigente (PH-461, 15/09/2026): rulesets de dev e main com bypass_actors vazio, os dois checks obrigatórios e require_extra_approval_for_unattributed_changes=false; proteção clássica da dev exige check e build-check. Sem saída de emergência: CI quebrado se conserta por PR. Conferir com gh api rulesets/21101230 e 21100682 |
| Key Jira na PR | Vigente (PH-467, 15/09/2026): só template de PR com a linha Jira; sem workflow que reprova por key ausente, para não criar portão com falso positivo. O hook local e a revisão da PR cobrem |
| Ativação Gen III | Concluída em PH-332; [preparação e resultados](../arquivo/2026-09-08/docs/17-geracao-iii-preparada.md) |

Histórico por período e inventários: [arquivo](../arquivo/README.md).
