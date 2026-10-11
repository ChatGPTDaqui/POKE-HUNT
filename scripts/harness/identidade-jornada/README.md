# Protótipo — Jornada do Treinador

Primeira etapa da [especificação aprovada](../../../docs/planos/2026-10-10-identidade-jornada-do-treinador-design.md).
Não é a aplicação real nem a entrega final da identidade em todos os menus.

## Abrir

Na raiz do projeto: `npm exec vite -- --config scripts/harness/identidade-jornada.vite.mts`.
URL local: `http://127.0.0.1:5176/scripts/harness/identidade-jornada.html`.

## Escopo e segurança

- Hunt ilustrativa; Equipe, Mochila, Hunt, Pokédex e guia Mais interativos.
- Barra original: Equipe, Mochila, Pokédex, Hunt, Loja, Hospital, Mercado e Mais.
- Hunt central levemente maior; grupos laterais em duas fileiras no mobile.
- Quatro slots de golpes; cabeçalho só com Poké Bola; local junto dos companheiros.
- Comunicador Chat: Log/Mundo/Comércio; compacto, expandido e minimizado.
- Mensagens demonstrativas em memória; nenhum envio ao chat real ou servidor.
- Coluna abaixo do treinador: Diário, Especialidades, Tasks, Calculadora e PvP.
- Sem botão de retorno: a hunt é o próprio jogo; X/Esc fecha apenas o painel.
- Fixtures próprias, sem catálogo, stores, autenticação, saves ou clientes remotos.
- Outros destinos têm prévia explicitamente identificada, não implementação funcional.
- Hospital não inicia viagem; itens não são consumidos; não há combate real.
- Ilustrações de equipamento em SVG; cenários e sprites reutilizam assets existentes.
- Entrada/configuração independentes: não entram no build normal do cliente.
- Não copiar CSS global para o jogo: a integração deve separar tokens claros de menus
  dos tokens da HUD e preservar escala, travas, notificações e regras dos destinos.

## Verificação

- `npx tsc -p scripts/harness/identidade-jornada/tsconfig.json`
- `npx vitest run scripts/harness/identidade-jornada/App.test.tsx`
- `npx vitest run scripts/harness/identidade-jornada/Chat.test.tsx`
- `npx vite build --config scripts/harness/identidade-jornada.vite.mts`
- `npm run build:verificar` para verificar o build normal sem publicar assets.

Navegação e painéis inspecionados em 320×568, 360×640, 390×844, 430×932,
844×390, 834×1194, 1366×768 e 1920×1080: sem overflow horizontal ou sobreposição
com a barra de destinos. Selecionar integrante/item/registro revela sua ficha.
Teclado, foco, Esc, filtros/vazio e ações locais cobertos nos testes.

Limites: viewport emulado não testa iOS/Android físico, teclado móvel, safe areas
reais, leitor de tela ou escala da HUD real. Estados conectados/loading/falha e
contagens reais ficam para a integração. O cenário atual ainda é arte pesada;
otimizar carregamento no trabalho de fundação, sem trocar os assets originais.
