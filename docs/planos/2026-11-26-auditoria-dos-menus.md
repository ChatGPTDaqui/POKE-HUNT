# Auditoria dos menus (26/11/2026)

Pedido do dono: menus bonitos, minimalistas e fáceis de navegar, com a informação do momento agradável de ler; o visual como recompensa. Primeiro PC, depois celular.

Método: bancada `scripts/harness/jornada-completa.html` (menus reais, dados fictícios) em 1100×720, 1440×900 e 375×812. A conta de teste não foi usada (leitura da senha bloqueada pela permissão).

## Princípios adotados (pesquisa)

- **Hierarquia deliberada:** cada tela tem uma ordem de leitura; o que importa agora fica onde o olho cai primeiro, e o resto vem por divulgação progressiva.
- **Consistência:** a mesma forma, cor e tipo para a mesma função. A cor de destaque (`--journey-primary`) é de **ação** e de "você está aqui", nunca fundo de controle comum.
- **Navegação:** trilho com item "levantado" (controle segmentado), não caixas soltas; destino ativo inequívoco.
- **Celular:** alvos de 44 px, informação densa em uma linha quando possível, sinal visível quando há conteúdo rolável escondido.
- **Juice contido:** resposta curta a hover/toque (levantar 1–2 px, encolher no clique), desligada com `prefers-reduced-motion`. Celebração rara para não cansar.

## Achados e o que mudou

| Achado | Onde | Mudança |
|---|---|---|
| Painel largo saía pela direita e escondia o X em 1100 px | Hunt, Mercado (qualquer tela aberta depois de uma mais larga) | `GameWindow`: a largura acompanha a tela ao trocar (antes ficava a da primeira tela aberta); centralização por `%` do contêiner |
| Abas com caixa própria cada; ativa cheia de salmão (mesma cor do botão de ação) | 23 menus (`SegmentedTabs`) | Controle segmentado: trilho discreto, aba ativa em cartão com filete na cor de destaque |
| Destino aberto quase invisível no menu inferior (só `bg-n800`) | Menu inferior | Fundo tingido, filete inferior e ícone levantado no ativo; ícone sobe no hover |
| "Mais" no PC ocupava a largura toda para cinco atalhos | Mais | `Sheet larguraNoAmplo`: painel de 30em à direita, acima do botão; atalhos em duas colunas alinhados à esquerda |
| Estado vazio era uma linha cinza solta ("Nenhum aviso.") — lia como "não carregou" | Social, Mochila, Mercado | `EstadoVazio`: ícone em disco, o que falta e o próximo passo |
| Abas cortadas sem aviso no celular | Hunt (3 abas) | Degradê "tem mais" só quando a fileira transborda de fato (medido) |
| Social e Mais escondidos no menu inferior do celular, sem sinal | Menu inferior (375 px) | Mesmo degradê medido nas duas fileiras laterais |
| "Great Ball" e "Na mochila: 12.345" quebravam em 4 linhas | Loja (celular) | Nome em uma linha; preço · ×quantidade na segunda (leitor de tela continua ouvindo "Na mochila") |
| Atalhos sem resposta ao toque | Guia "Mais" | Levanta no hover, encolhe no clique |

## Segunda rodada (mesmo dia)

- Pokédex: abas só `Pokédex · Hunt Atual`; região em `PilulasDeFiltro` (Todas/Kanto/Johto) abaixo; ✨ Shiny é alternância com `aria-pressed`.
- Alternâncias: tema vira `SegmentedTabs`; Conversar (Social) usa `aria-pressed`; Golpes (montador) e Montar equipe (ginásio) usam `aria-expanded`. Estado ligado é tingido por CSS, nunca o primário. Ficaram primários os botões que são ação (Receber contrato, Ligar golpe, Comprar, Entrar).
- Loja no celular: `GradeDeInventario ladoMaxEm` limita o slot da coluna VENDER (antes esticava até a coluna) e ela sobe para 24em.

## Fica para depois

- Revisar com a conta real (dados de verdade: listas longas, ranking, mercado cheio) — a senha da conta de teste não pode ser lida pelo agente.

## Fontes

- Hierarquia e telas densas: https://respawn.outlookindia.com/gaming/gaming-guides/ui-and-ux-in-games-building-menus-huds-and-feedback-systems
- Inventário e consistência: https://medium.com/@brdelfino.work/ux-and-ui-in-game-design-exploring-hud-inventory-and-menus-5d8c189deb65
- Menu intuitivo (indie): https://indieklem.substack.com/p/9-creating-an-intuitive-in-game-menu
- Referência de telas: https://gamefromscratch.com/the-game-ui-database/
- Zona do polegar e alvos de toque: https://dev.epicgames.com/documentation/fortnite/designing-for-mobile-in-fortnite · https://www.smashingmagazine.com/2012/02/finger-friendly-design-ideal-mobile-touchscreen-target-sizes/
- Juice em UI e fadiga de recompensa: https://itch.io/blog/1059831/making-a-game-feel-juicy-with-simple-effects · https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design · https://games.gg/news/the-art-of-rewarding-in-video-games-how-modern-games-master-the-dopamine-loop/
