# POKE-HUNT

React/TypeScript; simulação e Canvas fora do React; Supabase para persistência
e autoridade. Catálogo atual: scripts/usum. Versões/comandos: package.json.

## Escopo e fontes
Execute somente o pedido. Auditoria/plano são somente leitura; implemente quando
autorizado. Preserve alterações de outras sessões.
Processo vigente: docs/PROCESSO.md. Comportamento existente: código e testes;
intenção: decisão vigente do produto. Registre divergências, sem assumir que o
código representa a intenção. Histórico e memórias não acrescentam procedimentos.

## Contexto por tarefa
Consulte docs/README.md; leia apenas a seção necessária e confira o símbolo no código.
Antes de editar, leia docs/PROCESSO.md. Antes de banco, publicação ou testes,
leia o procedimento correspondente em docs/operacao/.
Mudança técnica: consulte o domínio indicado no índice antes de editar seus arquivos.
Não carregue históricos, bundles, gerados ou memórias inteiros sem necessidade.
Busque por caminho/símbolo e delimite a saída. Cite símbolos, não copie constantes.

## Cuidados transversais
- Não exponha credenciais ou dados de jogadores; db:wipe nunca é ação autônoma.
- Dev/public compartilham Supabase; acesso de escrita não dispensa migration/PR.
- Preserve migrations aplicadas e entradas de geração; não reescreva o Git por limpeza.
- Assets ficam na raiz: nunca copiar/linkar para public/assets. Build de publicação
  inclui copiar-assets; build:verificar não publica.
- Simulação compartilhada não importa valores de stores do navegador. Canvas fora do React.
- Não remova guardrails, proteções ou isolamento para acelerar.

Informe resultado, evidência e limitações com concisão. Caminhos pessoais opcionais
ficam em CLAUDE.local.md; regras compartilhadas ficam no repositório.
