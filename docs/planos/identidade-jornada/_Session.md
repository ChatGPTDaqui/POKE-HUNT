# Retomada — identidade Jornada do Treinador

Data: 10/10/2026. Modelo escolhido pelo usuário: opção B, GPT-6.1 Sol;
não refazer roteamento nas continuações desta tarefa.

## Decisão vigente

[Especificação aprovada](../2026-10-10-identidade-jornada-do-treinador-design.md).
Mobile-first; equipamento de jornada; menus claros/quentes e HUD escura discreta;
Hunt é o próprio jogo. Revisão explícita do usuário: remover botão de retorno;
barra Equipe · Mochila · Pokédex · Hunt · Loja · Hospital · Mercado · Mais, na ordem
original. Coluna abaixo do treinador: Diário · Especialidades · Tasks · Calculadora
· PvP. Revisão seguinte: coluna com apenas ícones, nomes acessíveis e tooltip no PC.
Acessos permanentes não devem ficar escondidos no guia.

## Feito

Brainstorming e especificação aprovados. Primeira composição implementada em
[protótipo isolado](../../../scripts/harness/identidade-jornada/README.md).
Protótipo inicialmente sem integração; a fundação descrita abaixo inicia a adoção
no jogo real. Nenhuma alteração de banco, save, combate ou regras de navegação.
Primeiro protótipo na PR #875; revisão da navegação aplica o feedback acima,
substituindo a proposta inicial de cinco destinos. Revisão seguinte: Hunt central
e levemente maior, grupos laterais em duas fileiras no mobile; quatro slots de golpes;
marca só Poké Bola; Mata · expedição à direita de Companheiros; Hospital somente
na barra, não junto de Conversas. Coluna direita permanece ao abrir painéis.

## Próximos passos

Fundação iniciada: `appearance="journey"` opt-in em Painel/Sheet/GameWindow;
tokens semânticos separados dos neutros da HUD, botões e destinos compactos.
Primeiro piloto real: SheetMais, conservando lista/ordem atuais, trancas, Diário,
contadores e callbacks. Os outros menus reais continuam no tema legado.
[Bancada de componentes reais e limites da verificação](../../../scripts/harness/fundacao-jornada.md).
Ainda faltam migração por domínio, navegação final e demais superfícies; não
confundir este piloto com entrega global da identidade.

Critério de densidade estendido aos menus do protótipo: cabeçalho de 56px com
título/ícone/fechar; ocultar copy decorativa e rodapé duplicado. Listas, fichas,
artes de apresentação e espaçamentos compactados; barra mobile de 143 para 123px,
ordem e destaque central de Hunt preservados. Controles dos menus >=44px;
descrições úteis e aviso de prévia não integrada mantidos. Não altera os menus
reais do jogo: aplicar este critério na integração futura, por domínio.

Comunicador aprovado: [design](../2026-10-10-comunicador-hunt-design.md).
Protótipo com Log/Mundo/Comércio, acompanhamento compacto, minimização e expansão;
mensagens somente locais. Sem chat conectado nem badge fictício de não lidas.
Feedback aplicado: sem título na janela aberta; canais e controles numa faixa
única enxuta, sem reservar uma linha só para Conversas.
Integração futura deve preservar histórico entre menus e tratar eventos reais,
notificações, falhas e teclado mobile; o protótipo reinicia ao sair da hunt.

Apresentar a composição concreta e incorporar feedback visual. Em seguida,
fundação de tokens/controles/painéis e navegação real; migrar os domínios e demais
superfícies conforme seção 9 da especificação. Não tratar o protótipo como entrega
global. Preservar Hospital, tutorial/trancas, badges e comportamento do combate.

Vault E:/Context indisponível nesta sessão; registro local substitui a retomada
do vault. Não foram criados diagramas ou decisões arquiteturais além do spec.
