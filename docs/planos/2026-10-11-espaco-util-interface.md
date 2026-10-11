# Varredura de espaço útil — interface Jornada

Pedido: reduzir espaço vazio/repetido em toda a interface, priorizando mobile,
sem descaracterizar a identidade aprovada. Produção permanece sem promoção.

## Critério aplicado

- Compactar padding, gaps, cabeçalhos duplicados e cartões excessivamente verticais.
- Preservar tipografia, dados, explicações necessárias, arte e alvos de toque.
- Painel cresce conforme conteúdo; conteúdo longo continua rolável no limite seguro.
- Não alterar combate, economia, permissões, persistência ou transações.
- Navegação inferior mantém ícones ilustrados, ordem e Hunt central destacado.
  Experimento horizontal foi descartado porque prejudicava o rótulo Mercado.

## Inventário e tratamento

| Superfície | Tratamento |
|---|---|
| Equipe e ficha Pokémon | Estatísticas em linhas; card com menos padding; identidade não disputa com fechar |
| Mochila | Recebe compactação compartilhada; busca, seleção e filtros preservados |
| Pokédex | Espécies em cartões horizontais; navegação anterior/próximo junto à identidade, sem cabeçalho repetido |
| Hunt | Compartilhado: padding/altura; arte e informações das hunts preservadas |
| Loja | Card compacto abre ficha pela identidade, sem segunda linha de botão; confirmação de compra fica na ficha |
| Mercado | Compartilhado; filtros, histórico e transações preservados |
| Mais | Introdução mais curta, destinos e descrições mantidos |
| Especialidades e Tasks | Grade horizontal com ícone, nome e progresso; cadeia completa preservada |
| Calculadora | Removida altura artificial do slot vazio; instrução permanece |
| PvP e Troca | Estado indisponível compacto; não inventa funcionalidade |
| Social e Ranking | Compartilhado; controles e conteúdo preservados |
| Bestiário | Cartões horizontais e filtros com quebra de linha |
| Wiki e Tutoriais | Compartilhado; capítulos e explicações não abreviados |
| Ajustes | Removidos títulos que repetiam o próprio checkbox/botão; avisos e confirmação destrutiva preservados |
| Diário | Altura conforme conteúdo; calendário e metas mantidos |
| Auto | Altura conforme conteúdo e blocos menores; regras desligadas continuam acessíveis |
| Perfis de treinador/Pokémon e Analyzer | Durante consulta, HUD de campo e chat mobile recolhidos, liberando altura |
| Analyzer | Métricas com menos padding/gaps, mesmos valores e explicações |
| Chat | Conceito enxuto existente mantido; no PC continua aberto junto aos menus |
| Login, cadastro, recuperação, redefinição e dispositivo | Espaçamentos menores; campos, textos, validação e ações preservados |
| Criação de personagem | Formulário compacto; iniciais em linhas no mobile e cards no PC |
| Offline/confirmar/derrota e transições de campo | Inspeção de código: herdam Painel quando aplicável; avisos e apresentação narrativa não removidos |

## Evidência local

Bancada `scripts/harness/jornada-completa.html`, componentes reais, dados fictícios,
rede externa bloqueada. Incluído HuntAnalyzer, que faltava nessa montagem isolada.
Não foram feitas compras, coletas, alterações de conta ou ações no servidor.

Em 390×844, escala 1, altura do conteúdo rolável antes/depois, em pixels
(mesmas fixtures; mede conteúdo, não só a moldura):

| Menu | Antes | Depois |
|---|---:|---:|
| Equipe | 396 | 345 |
| Mochila | 255 | 251 |
| Pokédex | 1407 | 1290 |
| Hunt | 1829 | 1142 |
| Loja | 1989 | 1121 |
| Especialidades | 549 | 334 |
| Tasks | 600 | 386 |
| Calculadora | 635 | 567 |
| PvP | 106 | 102 |
| Bestiário | 12656 | 6203 |
| Ajustes | 682 | 607 |

Perfil Charizard: corpo disponível passou de 162 para 419 px ao recolher os
controles concorrentes; os 419 px de conteúdo da fixture ficaram visíveis.
Não extrapolar essas medidas para todas as contas, tamanhos de texto ou aparelhos.
Mercado/Ranking alternaram cache e carregamento: sem percentual comparativo confiável.

Verificação DOM dos 17 destinos principais/secundários em 390×844 e em
320×568 com escala 1,4: sem excesso horizontal na moldura dos painéis observados.
Dez menus principais também conferidos em 844×390 e 1366×768, escala 1.
Altura respeita o limite disponível; listas extensas continuam exigindo rolagem.
Temas Claro/Jornada e Escuro/Dark Glass conferidos na bancada mobile.

Também abertos: cadeia de Tasks, Diário, Auto/Lure, perfil Pokémon e treinador,
Analyzer, seis superfícies de entrada/autenticação. Formulários observados em
390×844 sem excesso horizontal. Não houve submissão real de autenticação.
Escolha dos três iniciais e ação explícita verificadas em teste com controller
mockado; a etapa após confirmação de nome não foi acionada no servidor.
Modais transitórios e estados dependentes de conta não foram todos encenados:
inspeção de código e regressão automatizada não equivalem a teste visual de cada estado.

## Validação

- `npm run build:verificar`: passou (typecheck completo e bundle).
- Suíte completa local: 402 arquivos aprovados, 1 ignorado; 4.389 testes aprovados,
  5 ignorados. Novos testes de Loja e iniciais executados separadamente também passaram.
- Testes direcionados de Painel, navegação, Pokédex, Equipe, Mochila, perfil e
  recolhimento da HUD: 36 aprovados; Loja/faixa de prêmios: 5 aprovados; iniciais: 1 aprovado.
- Build da bancada isolada: passou.
- Verificador documental: orçamento de AGENTS.md já excedido antes da tarefa
  (2.906 > 2.500 caracteres); não reduzir regras nem remover proteção para passar.

Integração e publicação devem ser verificadas pelo processo vigente. Este registro
não declara produção publicada nem substitui o aval visual do dono.
