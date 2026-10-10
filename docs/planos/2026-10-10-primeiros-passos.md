# Primeiros Passos: direção das primeiras horas

Decidido com o dono em 10/10/2026, depois de uma sessão jogando uma conta nova.

## Diagnóstico (ordem de impacto)

1. Três sinais de início que se contradiziam: o tutorial mandava para a Rota 46, a HUD e o selo
   "COMECE AQUI" para o Campo Aberto estágio 1, onde um inicial Lv 1 enfrenta Lv 3-4 e desmaia.
2. O objetivo da HUD era fixo: não andava enquanto o jogador cumpria, não dizia o que fazer nem
   o que ele ganhava.
3. A Jornada abria em cima da lista de Hunts com sete marcos em 0/12, Pesadelo incluso.
4. A primeira mensagem do jogo era "O bot ficou sem Cura de confusão", com o robô piscando em
   vermelho, sobre um item que a conta nova não tem.
5. Tudo liberado no minuto 1 (PvP, Mercado, Troca, Ranking, Treinamento Lv 60).
6. Nível de treinador sem recompensa (só Ranking).
7. Tutoriais em texto corrido, sem apontar o botão.
8. Sem metas de sessão entre "primeiro Lord" e "estágio 5 nos 12 biomas".
9. POKE desmaiado: a tela de Hunt dizia "volte ao Hospital" sem botão, mesmo com o jogador já lá.

## Decisões do dono

- Cadeia de 11 passos, um por vez, com recompensa paga pelo servidor (`reivindicar_passo`).
- Pokébolas generosas (pedido: quintuplicar as da proposta).
- Contas antigas podem reivindicar tudo o que já cumpriram, na ordem.
- Início Rota 46 e depois Campo Aberto: uma única fonte de "por onde começar".
- Menus avançados aparecem com cadeado e o requisito, sem esconder.

## Entrega

1. Cadeia (`src/data/primeirosPassos.ts`), RPC e migration, cartão na HUD, selo único de início,
   Jornada recolhida e no fim da lista, aviso de estoque e cura direta no aviso de desmaio (7.95).
2. Cadeados nos menus avançados ligados aos passos, setas apontando o botão dos passos que pedem
   um menu e tutorial de boas-vindas encurtado.

Regra que vale para as duas: só entra passo que o servidor confere no save. A RPC e o cliente têm
a mesma cadeia; `primeirosPassos.test.ts` lê a migration e reprova se divergirem.
