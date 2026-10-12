# Paridade entre protótipo e interface real

Referências: [especificação aprovada](2026-10-10-identidade-jornada-do-treinador-design.md)
e componentes de `scripts/harness/identidade-jornada/`.
Comparação com componentes reais na bancada `scripts/harness/jornada-completa.html`.

## Correção desta entrega

### Revisão após feedback visual

O pedido posterior substitui a decisão horizontal no mobile: reservas verticais
em coluna de 44 px no modo compacto; fila horizontal no PC. Arraste acompanha
o eixo de cada modo. Superfícies de contexto usam vidro escuro discreto nos dois
temas, sem alterar os menus de gerenciamento claros/escuros.
Sala/clima ficam em uma faixa resumida; objetivo/prêmios permanecem montados,
mas recolhidos no controle Objetivos, com fechamento por Escape ou toque externo.
O painel aberto tem altura limitada e rolagem. Avisos de avanço bloqueado são
mantidos, podendo quebrar linha. Esta revisão está em prévia, não publicada.

Verificação desta revisão: 390×844, 320×568 com escala 1,4 e PC 1366×768.
Em 320 px as cinco reservas medem 44 px de largura, sem overflow interno;
o painel Objetivos aberto termina em x=248 e y=323, dentro do viewport.
No PC as cinco reservas compartilham a mesma coordenada Y. Objetivos abre
os dados reais e Escape recolhe sem acionar coleta. Não comprova aparelho físico.
24 testes direcionados passaram; typecheck e build da bancada também passaram.

### Primeira implementação e evidência anterior (superada no mobile)

Revisão seguinte: ativo e reservas têm continuidade de moldura/material, em L
no mobile, sem local/clima entre eles. O rótulo redundante Companheiros saiu da
HUD visual; o grupo mantém nome acessível. Contexto e objetivos
ficam ao lado da coluna no mobile. O placar de duelo mantém seu slot largo
entre o status e as reservas, como exceção contextual já existente.
Foto e nome do treinador ficam permanentes
acima dos atalhos; nomes longos truncam visualmente, com nome completo no botão.
O avatar usa o cache real do perfil, com ícone padrão para quem não tem foto.

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
| Companheiros | Vertical compacto no mobile e horizontal no PC, conforme feedback posterior; contador `6/6` do protótipo ainda ausente nesta faixa. |
| Local e clima | Resumo de sala/abates/clima em faixa discreta no mobile; nome completo e explicação sob demanda. Avisos acionáveis continuam visíveis. |
| Treinador/cabeçalho | Foto e nome agora permanentes na coluna direita também no mobile, carteira no cabeçalho. A composição unificada do protótipo não foi reproduzida. PC mantém trilho largo com área vazia. |
| Objetivo | Objetivo e prêmios recolhidos juntos em Objetivos; não ocupam uma faixa larga permanente na hunt. Conteúdo real e ações de coleta preservados. |
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

1. Impedir que gerenciamento cubra os companheiros no PC. Contexto e objetivo/prêmios
   já foram compactados nesta revisão; dependem de aprovação visual antes de publicar.
2. Completar o contexto dos companheiros com contagem real, sem duplicar ativo.
3. Reconciliar cabeçalho/treinador e apresentação dos quatro golpes com a prévia.
4. Recuperar destaque de expedição na Hunt com arte leve e dados reais.
5. Recuperar reconhecimento por nome na grade de itens sem engrossar cada célula.

Estas pendências não estão implementadas por constarem desta lista. A auditoria
anterior não deveria ter sido apresentada como comprovação de fidelidade completa.
Alterações posteriores de densidade/tema explicam parte das diferenças, não todas.

## Cobertura e limites da inspeção

Revisão de 12/10: foto/nome do treinador movidos da coluna lateral para o mesmo
cabeçalho do Pokémon em campo, também no mobile. Carteira preservada, barra de
HP/XP encurtada no compacto e atalhos abaixo da altura medida. No PC, o card
perde o fundo/borda próprios ao entrar no cabeçalho. Esta decisão substitui a
posição anterior do treinador. Conferência visual desta revisão está pendente:
o navegador recusou o acesso automatizado à bancada por política de segurança.
Não promover antes do teste visual do usuário.

Revisão de Automações: cartões substituídos por linhas com interruptor e resumo;
regras/estoques detalhados recolhíveis sem desmontagem nem alteração do bot.
Avisos de estoque baixo permanecem no resumo e a previsão global continua visível.
Desenho do interruptor menor, alvo real de 44×44 px. Abas Rotinas/Lure evitam
repetir Automações no título e na aba. Lure mantém controles e cuidados visíveis.
Inspecionados 390×844, 320×568 em escala 1,4 e desktop; telas baixas mantêm rolagem.
O fundo dos companheiros foi suavizado e a moldura mobile reduzida para 46 px,
sem reduzir os botões de 44 px nem criar vão entre reservas e ativo.

Comparação de todos os componentes de conteúdo do protótipo: App/Adventure/Chat,
TeamPanel/BagPanel/DexPanel/ExplorePanel/GuidePanel/ServicePanel e primitivos.
Na bancada real foram abertos Equipe, Mochila/Itens, Pokédex, Hunt, Mais,
Loja, Mercado, Social, Troca, Ranking, Bestiário, Wiki, Tutoriais, Ajustes,
Especialidades, Tasks, Calculadora, PvP e Diário, sem compras, coletas ou envios.
Hospital não foi acionado: é viagem real, não um menu de demonstração equivalente.
Equipe também inspecionada no PC. Esta abertura não é auditoria visual de todas
as subabas em todos os tamanhos, nem teste funcional de servidor. Troca/PvP
ficam carregando com a rede externa bloqueada na bancada; não são declarados aprovados.
