# Fundação Jornada — bancada local

Abrir `/scripts/harness/fundacao-jornada.html` no Vite local. Usa Painel,
Sheet/GameWindow, JourneyDestination e GameButton reais, com fixtures declaradas
no módulo. Não monta jogo, autenticação, queries, combate ou stores de jogador.
Não prova navegação autenticada, viagem, tutorial completo ou publicação.

O piloto de produção é **SheetMais**, não esta bancada: lista/ordem e callbacks
existentes foram preservados. A bancada acrescenta ações primária/secundária
apenas para conferir os controles compartilhados. Comparação legada mostra a
moldura antiga, não uma reprodução do antigo Mais.

## Contrato

`appearance="journey"` é opt-in em Painel, Sheet e GameWindow. Não adaptar um menu
apenas mudando a moldura: revisar também cores/estados internos antes de ativar.
`journey.css` não redefine neutros globais, cores de combate ou dados semânticos.
Superfície opaca também quando Reduzir transparência está ativo. Medidas em em,
com piso físico de 44px nos botões; título/fechar fora da área de rolagem.

## QA local — 10/10/2026

Oito viewports: 320×568, 360×640, 390×844, 430×932, 844×390, 834×1194,
1366×768 e 1920×1080; escalas 0,7/1/1,4 em todos (24 combinações).
Nenhum overflow horizontal; todos os botões >=44px. Telas baixas usam rolagem
interna sem cobrir a reserva de navegação. Ação e fechar exercitados pela UI.
Contraste: texto 10,98:1; secundário 5,59:1; aviso 7:1; primário 5,98:1;
foco 5,38:1. Comparação de moldura legada e screenshots mobile/PC.

Testes automatizados: encaminhamento opt-in nos dois regimes, legado padrão,
ancoragem em rodapé medido, toque fora/dentro, badge acessível, explicação de
cadeado ainda acionável e carregamento/desabilitação do botão.
Teclado virtual mobile e uma sessão autenticada real não exercitados nesta bancada.
