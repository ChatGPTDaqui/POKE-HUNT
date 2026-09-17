# PH-554 — Menus RPG

Direção aprovada em 16/09/2026: RPG moderno sobre Vidro Noturno. Fontes atuais,
sprites reais, superfícies com profundidade e dados com hierarquia clara.

## Escopo

- Mochila: busca, grade e ficha lado a lado no amplo; empilhadas no compacto.
- Loja: balcões de compra/venda em todos os regimes, com preço e estoque explícitos.
- Equipe: posições numeradas, tipos e destaque do integrante em campo.
- PvP: formação de seis posições estáveis, seletor separado com busca e paginação,
  ações pendentes bloqueadas e erros de leitura/salvamento visíveis.
- Tokens locais em MenuScene; Canvas, economia e autoridade preservados.

## Aceite e verificação

Desktop, compacto e deitado: sem overflow horizontal, ações acessíveis, nomes e
quantidades legíveis. Teclado e toque; motion reduzido. Testes de seleção,
salvamento com falha, mochila e equipe; suíte completa por componente compartilhado.
Build limpo. Inspeção visual documentada na entrega.

## Decisões

Manter os regimes de useDeviceMode, unidades em em e compra/venda simultâneas.
Não criar limite de inventário nem reordenação por arrasto. Preservar gate temporário
do ranqueado da PH-539. A ficha nunca escolhe automaticamente um item pelo jogador.
O seletor PvP preenche a próxima posição disponível para não enviar arrays esparsos.
