# Integração completa — Jornada do Treinador

Branch: `codex/identidade-jornada-completa`, base dev `59a6db6`.
Pedido vigente: entregar todos os menus juntos, sem solicitar testes parciais.
Produção permanece suspensa até aval explícito do usuário.

## Implementação

- [x] Papéis semânticos de superfície, texto, linha e ação; neutros da HUD não invertidos.
- [x] Dezessete destinos reais no ScreenOverlay com identidade Jornada e ilustrações vetoriais aprovadas.
- [x] Conteúdo dos domínios e componentes compartilhados migrado para os papéis semânticos.
- [x] Perfis, tutorial, Auto, Diário, seletores, confirmações e relatórios adotam a família visual.
- [x] Autenticação, recuperação, entrada e escolha do inicial com a mesma direção visual.
- [x] Hunt central; nomes também em paisagem; coluna Diário/Especialidades/Tasks/Calculadora/PvP.
- [x] Chat real: faixa única, minimizar/ampliar, histórico e rascunho preservados nas stores.
- [x] Log apresenta também avisos do sistema em ordem de chegada; Mundo continua só de jogadores.
- [x] Quatro slots suportados, arranjo 2×2 na largura estreita; controles de combate ocultos sob gestão.
- [x] Cabeçalhos e resumos compactados; tabelas de golpes com rolagem local.
- [x] Conferência dos 17 destinos reais e amostragem das superfícies auxiliares.
- [x] Correções finais de encaixe; suíte completa e build limpo aprovados.
- [ ] PR/checks/merge dev/deploy e staging verificados; nenhuma promoção main.

## Verificações locais — 11/10/2026

Suíte completa: 397 arquivos aprovados e 1 ignorado; 4361 testes aprovados e 5
ignorados. Build limpo `npm run build:verificar` aprovado, com aviso de tamanho
de chunk já existente. Após a suíte, o ajuste final do chat altera apenas dimensões
e classe CSS; sua regressão dirigida é conferida separadamente. `git diff --check`
aprovado. Verificador documental continua apontando apenas a dívida prévia de
orçamento do AGENTS.md (2906 > 2500 caracteres); regras não foram alteradas.

Todos os destinos percorridos em 320×568, 390×844, 844×390 e 1366×768; sem
overflow horizontal da página. Corpos internos também medidos nos regimes amplo,
paisagem e 320px/escala 1.4. Equipe e Ranking corrigidos após essa última medição:
ações quebram linha e os dois corpos passaram a ter scrollWidth = clientWidth.
Escala 0.7 conferida nos 17 destinos em 360×640. Amostragem adicional em 430×932,
834×1194 e 1920×1080. Hunt geometricamente central e nomes mantidos em paisagem.

Perfis/golpes, Diário, detalhe de especialidade, entrada/cadastro/recuperação,
nova senha/dispositivo e inicial conferidos por componentes reais. Editor de golpes
mantém rolagem horizontal local da tabela; setas têm 44×44px. Chat ampliado/minimizado
verificado por clique e hit-test: reserva 56px para a coluna, limita expansão a 35dvh
no mobile e não encobre o cabeçalho em 320×568/escala 1.4. Testes preservam canal,
histórico/rascunho e avisos de sistema. Diário não fica sob os atalhos; navegação
inferior o fecha no mesmo toque ao abrir outro destino.

Decisão de densidade: cartão de próximo passo, faixa de prêmios, chat mobile e
controles de combate ficam ocultos durante gestão, sem alterar seus dados, recompensas,
motor ou automações. Sala/clima ficam ao lado direito de Companheiros.

Bancada local: `/scripts/harness/jornada-completa.html`, componentes reais com dados
fictícios, persistência do jogo desabilitada antes de aplicar fixtures e fetch externo
bloqueado. Não inicializa o bootstrap, motor ou sessão de jogador. Menus remotos
exibem estados sem conexão quando não houver fixture específica; isso não é prova
de compra/troca/chat no servidor, combate Canvas ou aparelho físico. Emulação de
viewport não prova teclado virtual ou comportamento de dispositivo real. A configuração
isolada inclui crypto-js na otimização
por seu formato CommonJS, necessário para carregar os componentes reais.

Fumaça de staging executada com a conta canônica: login, status, CORS e corpo de
`/estado` aprovados. Nenhuma ação de compra/troca ou abertura de hunt em produção
executada. Publicação completa só será declarada após checks/merge/deploy dev e
verificação de SHA/HTML/hash do cliente. Produção continua bloqueada pelo pedido.

Arquivos alheios preservados: retomada VFX de 03/10 e `promo-video/`.
