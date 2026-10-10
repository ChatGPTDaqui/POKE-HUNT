# Retomada — identidade Jornada do Treinador

Data: 10/10/2026. Modelo escolhido pelo usuário: opção B, GPT-6.1 Sol;
não refazer roteamento nas continuações desta tarefa.

## Decisão vigente

[Especificação aprovada](../2026-10-10-identidade-jornada-do-treinador-design.md).
Mobile-first; equipamento de jornada; menus claros/quentes e HUD escura discreta;
Hunt é o próprio jogo. Revisão explícita do usuário: remover botão de retorno;
barra Equipe · Mochila · Pokédex · Hunt · Loja · Hospital · Mercado · Mais, na ordem
original. Coluna abaixo do treinador: Diário · Especialidades · Tasks · Calculadora
· PvP. Acessos permanentes não devem ficar escondidos no guia.

## Feito

Brainstorming e especificação aprovados. Primeira composição implementada em
[protótipo isolado](../../../scripts/harness/identidade-jornada/README.md).
Nenhuma integração visual no jogo real, alteração de banco ou save nesta etapa.
Primeiro protótipo na PR #875; revisão da navegação aplica o feedback acima,
substituindo a proposta inicial de cinco destinos. Mobile estreito usa duas fileiras
de quatro acessos inferiores; coluna direita permanece ao abrir painéis.

## Próximos passos

Apresentar a composição concreta e incorporar feedback visual. Em seguida,
fundação de tokens/controles/painéis e navegação real; migrar os domínios e demais
superfícies conforme seção 9 da especificação. Não tratar o protótipo como entrega
global. Preservar Hospital, tutorial/trancas, badges e comportamento do combate.

Vault E:/Context indisponível nesta sessão; registro local substitui a retomada
do vault. Não foram criados diagramas ou decisões arquiteturais além do spec.
