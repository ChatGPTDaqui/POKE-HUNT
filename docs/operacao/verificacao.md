# Verificação proporcional

| Impacto | Antes do push final |
|---|---|
| Só documentação | Revisar diff e links; não executar testes de aplicação sem motivo |
| Código localizado | `npx tsc -b` e testes afetados |
| Motor, authority, stores ou código compartilhado | Suíte completa; `build:engine` antes de authority e typecheck próprio |
| Configuração de build, dependências ou empacotamento | `npm run build:verificar` e verificações afetadas |
| CI/harness | Exercitar decisões de sucesso e falha com fixtures; conferir execução real no CI |

`tsc -b` incremental auxilia a edição, não prova build limpo. O CI obrigatório executa
typecheck completo, bundle Vite e suíte em toda PR para dev/main.
Não repetir checks já aprovados sem alteração ou nova evidência. Manter isolamento do Vitest.
`npm run build` é o comando de publicar: inclui a cópia dos assets; `build:verificar` não publica.

## Verificação funcional

Antes de authority: npm run build:engine na raiz, depois typecheck em authority.
Verifique efeitos, não só status HTTP: RLS pode retornar sucesso sem mudar linha.
No navegador use UI real, pixels e respostas do servidor. Importar /src/stores pelo
console pode instanciar outro módulo Vite; não trate essa store como a sessão ativa.
Para simulação aleatória, compare distribuições/sementes representativas e precondições.

Invariantes por área e medições anteriores: [mapa histórico](../arquivo/2026-09-08/docs/10-invariantes-e-testes.md).
O checklist universal e catalog:verificar nesse registro foram substituídos por esta matriz
e pelo [catálogo atual](../dominios/catalogo.md).

## Documentação

Revisar links locais e âncoras, caminhos antigos, destino de cada regra e orçamento
de leitura. Rodar node scripts/docs/verificar-contexto.mjs. Não rodar aplicação só
por editar documentação. Ver [critério da migração](../decisoes/contexto-hierarquico.md).
