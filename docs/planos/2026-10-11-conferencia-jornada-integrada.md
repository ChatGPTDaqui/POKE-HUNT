# Conferência da Jornada integrada

Referência: [design aprovado](2026-10-10-identidade-jornada-do-treinador-design.md),
componentes do protótipo em `scripts/harness/identidade-jornada/` e bancada com
componentes reais em `scripts/harness/jornada-completa.html`.

## Lacunas encontradas e corrigidas nesta entrega

| Área | Diferença encontrada | Implementação real |
|---|---|---|
| Barra inferior | Ícones genéricos no lugar do equipamento ilustrado | `EquipmentArt` nos oito destinos; arte adicional para Loja, Hospital e Mercado |
| Mais | Grade sem os grupos do guia | Duas seções, descrições curtas, ilustração do guia; notificações e trancas preservadas |
| Equipe | Cards completos repetidos, sem ficha focada | Seleção por UID, ficha com sprite, vitais, seis atributos e ações reais; lista/ficha lado a lado no PC |
| Pokédex | Lista de acordeões em vez de pesquisa em grade | Grade selecionável e ficha única; seleção acompanha filtros; perfil, navegação, abates e dados preservados |
| Mochila | Faltavam categorias e destaque ilustrado da ficha | Categorias derivadas de `AnyItem.kind`, arte destacada, seleção/quantidade/efeito/trava/uso/TMs preservados |
| Hunt | Arte quase invisível no seletor de biomas | Capas compactas com as miniaturas existentes; trilha e fundo do ambiente preservados |
| Moldura e vazios | Decoração cartográfica e equipamento ausentes | Cabeçalho compacto com rota decorativa; ilustrações nos estados sem seleção da Mochila e equipe vazia |
| Altura mobile | Painéis curtos esticados com grande área vazia | `ScreenOverlay` usa snap por conteúdo; menus longos continuam limitados ao espaço disponível e roláveis |

## Inventário conferido

- Barra: Equipe, Mochila, Pokédex, Hunt, Loja, Hospital, Mercado, Mais, na ordem
  aprovada; Hunt central, nomes visíveis, sem botão de retorno à aventura.
- Coluna: Diário, Especialidades, Tasks, Calculadora, PvP, apenas ícones com
  nomes acessíveis; largura reservada pelo painel principal.
- Mais: Social, Troca, Ranking; Bestiário, Wiki, Tutoriais, Ajustes. Sem duplicar
  destinos fixos. Hospital continua sendo cena e viagem, não menu fictício.
- Os 17 destinos de `ScreenOverlay` compartilham a moldura Jornada e ilustração
  de família. Perfil Pokémon, treinador, Auto, Diário, confirmações e entrada
  continuam nas superfícies temáticas existentes da integração anterior.
- Chat conserva canais e controles na mesma faixa, recolhimento/expansão e
  título Chat quando recolhido; não voltou o cabeçalho redundante Conversas.
- Os quatro slots de golpes e ocultação somente visual sob gerenciamento
  permanecem; esta entrega não modifica motor, save, saldo, autoridade ou banco.
- Claro/Jornada e Escuro/Dark Glass continuam selecionáveis em Ajustes/Geral.

## Diferenças deliberadas em relação à demonstração

Não foram copiados nomes, níveis, quantidades, chances ou três destinos fictícios
do protótipo. Hunt mantém os 12 biomas, estágios e bloqueios existentes. O seletor
usa miniaturas WebP, não carrega simultaneamente as 12 artes originais de 39 MB.
Mochila usa seletor compacto de categoria em vez de outra fileira de abas;
mantém a prioridade posterior do usuário de economizar espaço vertical.
Cabeçalhos não recuperam subtítulos altos ou rodapés de demonstração. Os demais
destinos do protótipo eram `ServicePanel`, uma prévia informativa, não layouts
funcionais aprovados para substituir suas implementações reais.

## Evidência e limites

Revisão posterior: este inventário não demonstrou paridade visual completa.
O usuário identificou a fila horizontal ausente. A comparação complementar,
com lacunas ainda abertas, está em
[auditoria de paridade](2026-10-11-paridade-prototipo-jornada.md).

Abertura dos 17 menus reais na bancada isolada a 390×844: moldura Jornada,
largura contida e acessos preservados. Equipe medida em 320×568, 360×640,
390×844, 430×932, 844×390, 834×1194, 1366×768 e 1920×1080, nas escalas
0,7/1/1,4: sem excesso horizontal no corpo e sem botões inferiores abaixo de
44 px. Inspeções visuais de Equipe e Pokédex no escuro, guia e Equipe no claro.

Esta bancada não prova operações de servidor, teclado físico, safe areas de
aparelhos reais ou todas as combinações de subabas/conta. Social/Troca/PvP sem
servidor podem exibir vazio/carregamento; isso não é evidência de sucesso de rede.
Validação automatizada e publicação em dev devem ser registradas na PR.
Produção permanece retida até o aval do usuário.
