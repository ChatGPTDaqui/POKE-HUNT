# Paridade entre protótipo e interface real

Referências: [especificação aprovada](2026-10-10-identidade-jornada-do-treinador-design.md)
e componentes de `scripts/harness/identidade-jornada/`.
Comparação com componentes reais na bancada `scripts/harness/jornada-completa.html`.

## Correção desta entrega

`ReservasRail` ainda era uma coluna vertical e seu arraste usava o eixo Y.
Agora mostra até cinco reservas em uma fila horizontal sob o ativo, antes do
objetivo e dos prêmios. Retratos, barra de HP e KO continuam visíveis; nome,
nível e atributos ficam acessíveis pelo botão e pelo resumo. Arraste no eixo X,
setas esquerda/direita e clique/Enter preservam as ações existentes.
Não muda a equipe, a regra do ativo, a autoridade nem dados persistidos.

A bancada passa a conter seis integrantes fictícios, não apenas quatro.
Medição efetiva em 320×568 e 1366×768, escalas 0,7/1/1,4: cinco reservas
na mesma coordenada Y, largura/altura de pelo menos 44 px; em 320 px a última
termina no máximo em x=260, antes da coluna direita. Inspeção adicional a 390×844.
Emulação não comprova toque ou safe area de aparelho físico.

## Inventário do protótipo, sem confundir acesso com paridade visual

| Parte | Resultado da comparação |
|---|---|
| Marca | Poké Bola sem nome do jogo presente. |
| Companheiros | Horizontal corrigido aqui; contador `6/6` do protótipo ainda ausente nesta faixa. |
| Local e clima | À direita de Companheiros, mas sala/progresso/clima quebram em várias linhas no mobile; o volume visual não corresponde ao chip enxuto da prévia. |
| Treinador/cabeçalho | Acesso e carteira preservados. No mobile, avatar está na coluna direita e carteira no cabeçalho; a composição unificada do protótipo não foi reproduzida. PC mantém trilho largo com área vazia. |
| Objetivo | Existe objetivo real, recolhível. Agora fica depois dos companheiros; apresentação ainda diferente do cartão ilustrado. A faixa larga e prêmios competem visualmente com a coluna no mobile em escala alta. |
| Golpes/Auto | Quatro slots e Auto existentes, com 2×2 na tela estreita. Permanecem ícones, siglas e potência da HUD anterior; não são os botões com nomes e indicação Ligado/Pausado apresentados na prévia. |
| Chat | Canais, recolhimento e expansão presentes; não há título redundante aberto. Estado recolhido e mensagens vêm do sistema real, não dos exemplos. |
| Barra inferior | Oito destinos na ordem, Hunt central, desenhos de equipamento presentes. Duas fileiras laterais no mobile e uma no PC. |
| Coluna direita | Diário, Especialidades, Tasks, Calculadora e PvP presentes como ícones na ordem. |
| Equipe | Seleção e ficha única presentes; lista/detalhe lado a lado no PC. Grade mobile e ficha condensada substituem lista vertical e palco grande da prévia, em atendimento à redução posterior de espaço. Tipos continuam abreviados, diferente das pílulas por extenso. |
| Mochila | Busca, categorias, grade e detalhe ilustrado presentes na aba Itens. Células reais mostram ícone e quantidade, sem os nomes visíveis da prévia; seleção inicial vazia em vez de primeira ficha aberta. Abas Pokémon/TMs são conteúdo real adicional. |
| Pokédex | Busca, grade e ficha única presentes, PC em colunas. Retratos compactos substituem sprites animados de cada célula; ficha acrescenta dados reais. Tipos abreviados e densidade não são reprodução literal. |
| Hunt | Capas dos biomas presentes na grade. Falta o destaque ilustrado do destino selecionado e a composição de capa/lista/encontros do `ExplorePanel`; usar WebP leve não impede esse destaque. Regras/12 biomas/estágios devem permanecer. |
| Mais | Dois grupos, descrições, arte de guia e destinos presentes. Introdução ilustrada grande e selo do clube não foram reproduzidos; redução é compatível com prioridade de espaço, mas não foi uma cópia integral. |
| Outros destinos | `ServicePanel` era uma prévia genérica com aviso de não integração; não existia desenho funcional específico para copiar. Moldura temática não comprova conclusão do redesign interno de cada sistema. |
| Painéis sobre a HUD | No PC, Equipe abre abaixo do trilho de status, mas cobre parte da faixa dos companheiros; o protótipo preservava essa faixa acima do painel. Falta separar a altura reservada para gerenciamento da âncora dos atalhos do treinador. |
| Superfícies auxiliares | Login/início/perfis/Auto/confirmar não tinham equivalentes funcionais no protótipo; não é possível afirmar paridade por comparação direta com ele. Devem ser avaliados pela especificação geral. |

## Lacunas prioritárias restantes

1. Compactar a faixa local/clima e conter objetivo/prêmios antes da coluna direita,
   especialmente em 320 px com escala alta; impedir que gerenciamento cubra os companheiros.
2. Completar o contexto dos companheiros com contagem real, sem duplicar ativo.
3. Reconciliar cabeçalho/treinador e apresentação dos quatro golpes com a prévia.
4. Recuperar destaque de expedição na Hunt com arte leve e dados reais.
5. Recuperar reconhecimento por nome na grade de itens sem engrossar cada célula.

Estas pendências não estão implementadas por constarem desta lista. A auditoria
anterior não deveria ter sido apresentada como comprovação de fidelidade completa.
Alterações posteriores de densidade/tema explicam parte das diferenças, não todas.

## Cobertura e limites da inspeção

Comparação de todos os componentes de conteúdo do protótipo: App/Adventure/Chat,
TeamPanel/BagPanel/DexPanel/ExplorePanel/GuidePanel/ServicePanel e primitivos.
Na bancada real foram abertos Equipe, Mochila/Itens, Pokédex, Hunt, Mais,
Loja, Mercado, Social, Troca, Ranking, Bestiário, Wiki, Tutoriais, Ajustes,
Especialidades, Tasks, Calculadora, PvP e Diário, sem compras, coletas ou envios.
Hospital não foi acionado: é viagem real, não um menu de demonstração equivalente.
Equipe também inspecionada no PC. Esta abertura não é auditoria visual de todas
as subabas em todos os tamanhos, nem teste funcional de servidor. Troca/PvP
ficam carregando com a rede externa bloqueada na bancada; não são declarados aprovados.
