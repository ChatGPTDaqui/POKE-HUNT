# Identidade visual — Jornada do Treinador

Data: 10/10/2026. Projeto: POKE-HUNT. Prioridade: mobile.
Status: especificação consolidada aprovada e navegação revisada pelo usuário em 10/10/2026.
Primeira etapa em protótipo isolado; integração com o jogo ainda não realizada.

## 1. Objetivo e decisões aprovadas

Construir uma identidade visual reconhecível para toda a interface e reorganizar
os menus para leitura, navegação e uso confortável no celular, com composição
adequada também ao PC. Não basta substituir cores do tema atual.

Direção escolhida: Jornada do Treinador. Conceito visual: Equipamento de Jornada.
Menus são ferramentas e espaços da aventura Pokémon, não um dashboard genérico.

Decisões aprovadas:

- Menus claros, levemente quentes e ilustrados; HUD de combate escura e discreta.
- Azul-marinho para texto/contornos; coral como marca; verde para exploração;
  azul para pesquisa; dourado moderado para recompensas.
- Fredoka nos títulos e Manrope no conteúdo, inicialmente preservadas.
- A hunt é o próprio jogo e seu centro permanente, não uma atividade separada.
- Barra principal na ordem existente: Equipe, Mochila, Pokédex, Hunt, Loja,
  Hospital, Mercado e Mais. Sem botão "Voltar à aventura" ou "Voltar ao jogo".
- Coluna superior direita abaixo do treinador: Diário, Especialidades, Tasks,
  Calculadora e PvP, nesta ordem, disponível também com painéis abertos.
- Guia ilustrado com grupos visuais, sem acrescentar níveis de submenu.
- Ações curtas em painéis inferiores; gerenciamento extenso em superfície ampla.
- PC utiliza largura para relacionar lista e detalhe, não apenas ampliar o celular.

Detalhes de acabamento, valores de cor e dimensões são calibrados no protótipo
e verificados antes de se tornarem tokens definitivos. Não há métricas de uso
ou testes com jogadores sustentando a nova hierarquia nesta etapa.

## 2. Diagnóstico e evidências atuais

- `src/index.css` define a identidade Vidro Noturno, fontes e tokens semânticos.
- `MenuScene` e `menu-scene.css` aplicam apresentação específica a parte dos menus.
- O plano `PH-554-menus-rpg.md` contempla Mochila, Loja, Equipe e PvP.
- `ActionDock` organiza oito destinos, controles de combate e acesso a Mais.
- `ColunaDeAtalhos` oferece Especialidades, Tasks e Bestiário separadamente.
- `HudLayer` mede topo/rodapé; `Sheet` usa essas medidas para evitar colisões.
- `useDeviceMode` distingue compacto, deitado e amplo, além de ponteiro coarse.
- Hospital é mudança de cena, não uma `ScreenName`.

A inspeção da versão publicada alcançou apenas a página pública sem autenticação.
Não foi realizada auditoria visual dos menus autenticados nem validação em aparelho.
Comentários históricos não substituem confirmação do comportamento em código/testes.

## 3. Direção artística

### Materiais e linguagem

Superfícies claras lembram fichas de pesquisa e carcaças de equipamentos.
Mapas, divisórias, identificações e pequenos marcadores de expedição formam o
vocabulário comum. Cantos arredondados e recortes discretos, sem molduras pesadas.

Não usar pergaminho envelhecido, madeira medieval, ornamentos de fantasia ou
neon futurista como linguagem principal. Não copiar integralmente outra interface.
Evitar também vermelho/amarelo/azul em todos os elementos simultaneamente.

Ilustração concentra-se em cabeçalhos, destinos e estados vazios. Listas e fichas
densas têm fundo tranquilo. Informações nunca dependem de texto embutido em arte.
Sprites existentes mantêm tratamento pixelado; molduras não devem borrá-las.

### Tokens e tipografia

Evoluir os tokens existentes em camadas: valores de base, intenção e componente.
Separar superfícies de menu das superfícies da HUD; não inverter globalmente
`n900` para claro, pois isso quebraria consumidores e contrastes existentes.

Definir tokens para superfície base/elevada/selecionada, texto principal/secundário,
borda, foco, ação primária, estado desabilitado e acentos das famílias de menu.
Não aplicar uma nova cor literal em cada tela nem introduzir outro tema paralelo.

Preservar significado de HP, EXP, moedas, raridades, shiny e tipos elementais.
Cor de marca não substitui cor de perigo, nem verde decorativo sinaliza sucesso.

Fredoka fica restrita a títulos; Manrope serve leitura e ações. Geist Mono já
existente pode continuar em contadores técnicos, sem adicionar novas famílias.
Preservar escala em `em` e preferência de HUD; dimensionar alvos de toque com
piso físico em CSS px, independentemente de redução da fonte.

### Personalidade por família

| Família | Interpretação visual | Informação prioritária |
|---|---|---|
| Equipe/perfil Pokémon | Preparação da jornada | Integrante em campo, vitais, opções de equipe |
| Mochila | Organizador de suprimentos | Item, quantidade, efeito e ação permitida |
| Hunt | Guia de expedição | Destino, ambiente, dificuldade e requisitos existentes |
| Loja/Hospital | Serviços Pokémon | Preço/estoque ou estado de recuperação/viagem |
| Pokédex/Bestiário | Instrumentos de pesquisa relacionados | Identidade, descoberta e dados de cada sistema |
| Tasks/Especialidades | Progresso do treinador | Objetivo, progresso, requisito e recompensa existentes |
| Social/Troca/Mercado | Comunicação e intercâmbio | Participantes, conteúdo, valores e confirmação |
| PvP/Ranking | Competição | Formação, disponibilidade e resultado/classificação |
| Wiki/Tutoriais/Calculadora/Ajustes | Consulta e ferramentas | Busca, leitura, campos e controles claros |

## 4. Arquitetura de navegação

### Barra principal

| Rótulo | Destino interno | Comportamento |
|---|---|---|
| Equipe | `equipe` | Abre/troca o painel da equipe |
| Mochila | `mochila` | Abre/troca o inventário |
| Pokédex | `pokedex` | Abre a coleção existente |
| Hunt | `hunts` | Abre seleção de hunt; abrir não inicia viagem |
| Loja | `loja` | Abre o serviço existente |
| Hospital | Ação de cena | Preserva viagem/cancelamento e regras atuais |
| Mercado | `mercado` | Abre o mercado existente |
| Mais | Estado de abertura do guia | Abre os demais destinos agrupados |

Rótulos completos visíveis, inclusive Pokédex e Mais; não usar somente Dex ou
hambúrguer. Estado ativo identificável por forma/marcador e texto, além de cor.
Manter ordem e significado nos três regimes. Não renomear chaves de persistência
ou criar rotas por menu. Hunt mantém seu nome. A barra permanece disponível;
fechar um painel usa o X, Esc ou o próprio acesso ativo, sem botão separado de retorno.
Hunt fica no centro geométrico da barra, levemente maior. Equipe/Mochila/Pokédex
formam o grupo esquerdo; Loja/Hospital/Mercado/Mais, o direito. Em mobile, os grupos
laterais usam duas fileiras com Hunt central entre eles; no PC, uma fileira.

### Coluna do treinador

Diário, Especialidades, Tasks, Calculadora e PvP ficam em coluna logo abaixo do
treinador, no canto superior direito, inclusive com gerenciamento aberto. Reservar
largura para a coluna: não sobrepor painéis, ações ou barra inferior. Conforme revisão
seguinte do usuário, apenas ícones visíveis, com nomes acessíveis e tooltip no PC;
alvos de toque amplos, mesma ordem no mobile e PC. Rótulos da barra inferior permanecem.

### Guia ilustrado

| Grupo | Acessos diretos |
|---|---|
| Encontrar outros treinadores | Social, Troca, Ranking |
| Consultar e ajustar | Bestiário, Wiki, Tutoriais, Ajustes |

Cabeçalhos de grupo não abrem outro submenu. Cada destino abre com um toque
após abrir Mais. Não duplicar acessos já fixos na barra ou coluna. Usar pequenas ilustrações consistentes, nome e, quando útil,
uma descrição curta. Conteúdo pode rolar; título/fechar permanecem alcançáveis.

O conjunto cobre todas as `ScreenName` atuais. Hospital permanece ação de cena.
Perfil do treinador, automação, chat e notificações mantêm acessos próprios.
Não remover função existente por não aparecer na barra principal.

### Acessos contextuais e sinais

- Tasks: coluna permanente e faixa de objetivo recolhível com acesso direto.
- Especialidades: coluna permanente, sem depender de objetivo ativo.
- Hospital: barra sempre disponível segundo as regras atuais, mais atalho contextual
  quando houver integrante desmaiado ou viagem pendente; não esperar aviso temporário.
- Hospital preserva iniciar/cancelar viagem, contagem e restrições atuais. Não curar,
  teleportar ou iniciar compra automaticamente ao abrir o guia.
- Pokédex e Bestiário não se fundem; atalhos relacionados mantêm nomes explícitos.
- Badges derivam das fontes atuais. Agregação em Mais conta cada pendência uma vez;
  abrir Mais não marca conteúdo como lido. Não somar cópias do mesmo destino.
- Trancas, explicações de desbloqueio e destaques do tutorial continuam funcionando.
- Até existir objetivo elegível, não exibir objetivo fictício ou espaço vazio reservado.

## 5. Composição mobile

### Compacto em pé

Topo contém Pokémon em campo, vitais e acesso compacto ao treinador/carteira.
Reservas permanecem associadas ao integrante ativo, sem invadir o cenário.
Marca no cabeçalho: somente a Poké Bola, sem texto POKE-HUNT ou subtítulo.
Local/condições aparecem à direita de Companheiros, na mesma faixa; objetivo
mantém sua faixa recolhível. Não repetir Hospital junto de Conversas.

Campo de batalha ocupa a região central. Avisos contextuais não se tornam
atalhos permanentes espalhados pelas bordas. Manter disponíveis informações
relevantes existentes: clima, sala, efeitos, taxas e comunicação, reorganizando
apresentação sem apagar dados ou misturar sinais com significados diferentes.

Rodapé distingue ação (golpes/automação) de navegação (oito destinos).
HUD de golpes possui quatro slots: 2×2 no mobile estreito e quatro lado a lado
quando houver largura útil. Automação permanece separada, com alvo de toque amplo.
Com gerenciamento extenso aberto, controles de combate são recolhidos, sem
pausar o motor nem alterar a automação. Ao fechar, voltam ao estado anterior.
Conteúdo não deve saltar ou ficar fora da tela por causa da nova altura medida.

### Painéis e ações

Equipe, Mochila, Hunt e Pokédex usam a área útil entre cabeçalho e
navegação, reservando a coluna direita. Mantêm contexto compacto no topo; não precisam mostrar golpes ao fundo.
Ações curtas usam sheet dimensionado ao conteúdo. Perfil e demais superfícies
compartilham componentes e se ajustam ao volume de informação.

Uma superfície de gerenciamento por vez, com confirmação contextual quando
necessária. Trocar destino não exige fechar primeiro. Fechar retorna ao cenário.
Voltar/Esc, foco, rolagem e seleção seguem expectativas e regras já existentes.
Sem arrasto obrigatório, hover obrigatório ou tooltip nativo como única explicação.

### Deitado, teclado e toque

Preservar classificação por largura, altura e ponteiro de `useDeviceMode`.
Em deitado, usar cabeçalho reduzido, oito destinos compactos com nome legível
e área de gerenciamento que pode cobrir detalhes da HUD. Priorizar conteúdo
e caminho de saída; não empilhar a composição de retrato em pouca altura.

Respeitar safe areas e viewport útil com teclado aberto. Navegação/fechar não
ficam inacessíveis; campo focado permanece visível. Tablet com dedo não depende
de pequenos puxadores de janela, mesmo que esteja classificado como amplo.

## 6. Composição PC

Mesmos oito destinos, coluna de cinco atalhos, nomes e agrupamentos. Cabeçalho mais informativo sem
espalhar dados por toda a tela. Painéis abrem em posição previsível, utilizáveis
sem arrastar. Arrasto opcional existente pode ser preservado onde não prejudicar.

Listas e detalhes lado a lado em Equipe, Mochila e pesquisa quando houver largura
útil. Conteúdo de leitura recebe largura máxima; cenários não exigem painéis
transparentes. Chat e ferramentas contextuais não cobrem ações primárias.

## 7. Componentização e limites técnicos

- Tokens de Jornada alimentam controles compartilhados e famílias de superfície.
- Estrutura de painel fornece cabeçalho, abas, corpo rolável, rodapé e estados.
- Registro de destinos concentra nome, grupo, arte/ícone, tranca e pendências.
  Barra e guia usam o mesmo registro, sem duplicar listas divergentes.
- `HudLayer`, `ActionDock`, `Sheet`, `GameWindow` e `ScreenOverlay` são pontos de
  integração a revisar; preservar medição de alturas e hierarquia de camadas.
- Componentes de apresentação recebem dados/ações existentes; não criam outro
  controller, cálculo de combate ou persistência remota.
- Selectors estreitos evitam redesenhar menus a cada frame do `worldStore`.
- Canvas continua fora do React. Sem import de stores do navegador na simulação.
- Assets novos ficam na raiz `assets/`, nunca `public/assets`; arte decorativa
  pode ser lazy-loaded e deve ter fallback sem mudança no tamanho do layout.
- Sem biblioteca nova obrigatória nesta especificação. Escolher ferramentas pela
  necessidade real; não instalar skills ou dependências só para aumentar a lista.

## 8. Estados, acessibilidade e desempenho

Toda ação apresenta estado normal, foco, pressionado, pendente e indisponível.
Erros de servidor aparecem junto à ação com opção de repetir onde seguro;
não fechar o formulário nem anunciar sucesso antes da confirmação real.
Loading e vazio são distintos, sem conteúdo fictício apresentado como dado real.

Meta de alvo: pelo menos 44 × 44 CSS px para ações por toque; espaçamento evita
toques no vizinho. Texto normal com contraste mínimo 4,5:1; texto grande e
componentes relevantes conforme WCAG, medidos nos fundos efetivos.

Teclado, foco visível e retorno ao acionador; não prender foco impedindo a
navegação que deve permanecer acessível. Sheets modais e não modais recebem
semântica apropriada. Estado não é comunicado apenas por cor.

Motion funcional e curto, respeitando reduced motion. Sem animação de espera
para trocar menu, blur amplo obrigatório, partículas decorativas contínuas ou
arte pesada em todos os cards. Textos e ações continuam funcionando sem arte.

## 9. Escopo e implantação em etapas

Uma especificação de sistema visual compartilhado, entregue em mudanças
coerentes e reversíveis, não uma refatoração geral dos domínios do jogo.

1. Protótipo visual isolado: aventura, guia, Equipe e Mochila em mobile/PC,
   dados demonstrativos claramente identificados; sem escrita no Supabase.
2. Fundação: tokens, controles, painéis e navegação, cobrindo acessos existentes.
3. Jornada: Equipe/perfis, Mochila, Hunt, Pokédex/Bestiário, Loja/Hospital,
   Tasks e Especialidades.
4. Demais menus: Social, Troca, Mercado, PvP, Ranking e ferramentas de consulta.
5. Consistência completa: entrada/autenticação/inicial, tutorial, configurações,
   mensagens, confirmações, relatórios e estados vazios/de erro.

O protótipo serve para comparar com a direção aprovada; não equivale à entrega
final nem autoriza reduzir o escopo às quatro primeiras telas.
Seguir `docs/PROCESSO.md` para branches, checks, PR, integração e publicação.
Preservar alterações alheias; não incluir diário, vídeo ou migrations sem relação.

Não fazem parte: novos sistemas de progressão, regras de combate/economia,
alteração de sprites/golpes, capturas de lendários, mudança de autenticação,
banco de dados, monetização, nova vila navegável ou redesenho de cada cenário.

## 10. Critérios de aceite

- Os oito destinos inferiores e os cinco atalhos direitos estão legíveis, na ordem
  solicitada, em compacto/deitado/amplo; não existe botão redundante de retorno.
- Todo destino anterior segue alcançável; nenhum exige submenu de grupo adicional.
- Hospital respeita viagem/cancelamento; tutorial e trancas não ficam sem acesso.
- Tasks, Especialidades, chat, automação e perfil do treinador permanecem claros.
- Badges não duplicam contagens nem marcam leitura ao navegar.
- Equipe, Mochila, Hunt e Pokédex têm superfície de gerenciamento confortável.
- Sem conteúdo inacessível, sobreposição de ações ou rolagem horizontal acidental.
- Nome longo, equipe cheia, muitos itens, vazio, loading e erro continuam utilizáveis.
- Foco/teclado/toque funcionam; troca e fechamento de painel preservam comportamento.
- Combate/automação continuam sem alteração ao abrir, trocar ou fechar menus.
- A identidade se aplica também a superfícies auxiliares, não só à barra.
- Arte apoia reconhecimento; dados permanecem legíveis sem a ilustração.

Matriz mínima de inspeção: 320×568, 360×640, 390×844, 430×932, 844×390,
tablet 834×1194 com toque, PC 1366×768 e 1920×1080. Testar preferência de
escala da HUD mínima/padrão/máxima, conteúdo longo e teclado móvel aberto.
Em casos extremos, priorizar acesso por rolagem e ações alcançáveis em vez de
forçar todos os detalhes visíveis simultaneamente.

Verificação: testes de destinos/agrupamento, estado ativo, trancas, notificações,
Hospital, Voltar/Esc, foco e altura medida; testes de seleção e falhas dos menus
tocados; TypeScript e build/checks conforme a política proporcional vigente.
Registrar screenshots dos tamanhos representativos e limitações reais de
teste: emulação não é prova de comportamento em iOS/Android físico.

## 11. Referências e skills utilizadas

- Frontend design, UX/UI, tipografia, design tokens e acessibilidade: direção
  coesa com hierarquia, toque, leitura e componentes reutilizáveis.
- Brainstorming: desenho e revisão antes de implementação global.
- [NN/g — Icon Usability](https://www.nngroup.com/articles/icon-usability/):
  nomes visíveis acompanham ícones de navegação.
- [W3C — Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html):
  meta de 44 px é o critério aprimorado, não o mínimo geral de conformidade.
- [Pokémon — Arc Phone](https://www.pokemon.co.jp/ex/legends_arceus/ja/world/210928_01/):
  referência conceitual para ferramenta de orientação inserida na aventura.
- [Pokémon TCG Pocket](https://tcgpocket.pokemon.com/en-us/): referência de
  apresentação de coleção/ilustração; não é modelo de navegação a copiar.

## 12. Revisão e retomada

Auto-revisão: inventário de destinos coberto; Hospital separado de painel;
menus claros não invertem tokens da HUD; destinos têm nome também em deitado;
sem novas mecânicas ou dependência de arte para uso; protótipo separado de produção.

Primeira etapa implementada em `scripts/harness/identidade-jornada.html`.
Retomada e próximos passos em [sessão local](identidade-jornada/_Session.md).
O Diário, que ganhou entrada fixa em dev na PR #872 durante esta implementação,
agora está na coluna abaixo do treinador conforme revisão explícita do usuário. O protótipo permanece
isolado do jogo; as próximas etapas continuam cobrindo todos os menus.

O vault `E:/Context` não estava disponível. Esta cópia local em `docs/planos`
é a referência da tarefa; não foram criados arquivos paralelos de memória nem
declaradas atualizações em vault inexistente.
