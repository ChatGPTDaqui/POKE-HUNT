# PH-554 — Validação

17/09/2026. Build limpo aprovado; suíte completa: 327 arquivos, 3.384 testes.
Lint sem erros. Verificação documental acusa apenas o limite preexistente do
AGENTS.md (2.908 caracteres, limite 2.500); instruções preservadas.

Bancada isolada: `npx vite --config scripts/harness/menus-rpg.vite.mts`, página
`http://127.0.0.1:5174/scripts/harness/menus-rpg.html`. Usa componentes e Painel
reais, dados fictícios e respostas PvP em memória; fetch externo bloqueado.

Inspeção visual em desktop, 390×844 e 844×390: mochila com seleção/detalhes,
item trancado, busca, quantidades grandes, loja, equipe e formação PvP.
Sem overflow horizontal no celular. No deitado o conteúdo usa a rolagem do
Sheet existente. Formação testada com busca e preenchimento do quarto slot.
Testes automatizados cobrem falha de leitura, falha de salvamento, bloqueio de
ações concorrentes, ordem dos slots e foco de teclado após seleção/Escape.

Sem mudanças em banco, economia, catálogo, Canvas ou regras de combate.
Publicação e links de integração são registrados na issue e na PR.
