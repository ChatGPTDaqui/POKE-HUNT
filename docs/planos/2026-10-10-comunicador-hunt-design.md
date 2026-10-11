# Comunicador da hunt — proposta aprovada

Continuação do protótipo Jornada do Treinador. O usuário aprovou a proposta
de janela compacta em 10/10/2026. Esta etapa usa somente fixtures locais;
não conecta chat real, servidor, saves, jogadores ou comércio.

## Composição e comportamento

- Conversas deixa de abrir Social e passa a ser um comunicador da HUD.
- Canais Log, Mundo e Comércio, com seleção explícita. Log somente leitura.
- Acompanhamento inicial: últimas três linhas no mobile, cinco no PC;
  mensagens longas truncadas podem ser lidas integralmente ao expandir.
- Minimizado: controle Conversas com canais; restaurar mantém canal e mensagens.
- Expandido: histórico rolável, identificação de demonstração e compositor nos
  canais sociais, limite de 240 caracteres e envio exclusivamente em memória.
- Não puxar a rolagem de quem lê histórico antigo. Novas mensagens oferece
  retorno ao fim. Sem entradas externas nesta etapa; o teste simula chegada local.
- Esc minimiza quando o foco está no comunicador; controles têm nome acessível.
- Sem contagem fictícia de mensagens não lidas: badge depende de eventos reais
  na futura integração. Fixtures não simulam jogadores conectados.

## Layout

Fundo escuro translúcido, canais com acento dourado e autores em azul claro.
No PC, chat à esquerda dos golpes; no mobile, acima dos golpes em espaço próprio.
O acompanhamento não cobre Pokémon, navegação ou atalhos. Em pouca altura,
toolbar e canais compartilham uma linha e a HUD acomoda quatro golpes lado a lado.
Objetivo decorativo fica oculto no mobile baixo enquanto o comunicador acompanha;
Tasks permanece acessível na coluna. Expandido pode cobrir temporariamente parte
do campo, nunca a barra de navegação; redução/minimização sempre disponíveis.

## Limites e verificação

Componente Chat isolado, estado em memória, sem temporizadores ou persistência.
Enviar, trocar canal, reduzir, minimizar, restaurar, Log somente leitura e rolagem
protegida têm testes. Medir telas estreitas, baixas, paisagem e PC; verificar
limites da doca, overflow e alvos de toque. Teclado móvel físico e integração
de mensagens recebidas ficam para etapa futura. Estado é reiniciado ao sair
da hunt para outro painel, conforme o ciclo de vida deste protótipo.

Auto-revisão: escopo fechado, sem placeholders; distinguir acompanhamento
sem obstrução de expansão temporária, protótipo de chat conectado e linhas de
mensagens extensas. Nenhuma alteração na aplicação real.
