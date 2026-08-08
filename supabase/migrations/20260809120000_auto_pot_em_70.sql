-- Auto-pot passa a vir pre-configurado em 70% de vida (era 50%).
--
-- Pedido explicito do usuario: "o bot agora deve vir pre-configurado para
-- curar em 70%".
--
-- Duas coisas acontecem aqui, e a segunda e a delicada:
--
-- 1. O DEFAULT da coluna muda. E ele que vale pra conta nova (handle_new_user
--    nao escreve `auto_pot_rules`, deixa cair no default) e pros dois wipes,
--    que resetam com `auto_pot_rules = default`.
--
-- 2. Jogadores JA existentes so sao atualizados se a regra deles for
--    EXATAMENTE o default antigo. Quem mexeu na configuracao escolheu aquele
--    numero, e sobrescrever escolha de jogador com "novo balanceamento" e o
--    tipo de mudanca que aparece como bug pra quem a sofre. A comparacao e
--    feita sobre o jsonb inteiro (nao sobre `hpPercent`), entao trocar so a
--    pocao tambem conta como personalizado e e preservado.
--
-- O valor equivalente no cliente vive em src/stores/gameStateStore.ts
-- (DEFAULT_AUTO_POT_RULES). Os dois precisam concordar.

alter table public.players alter column auto_pot_rules
  set default '[{"hpPercent":70,"itemId":"potion"}]'::jsonb;

update public.players
   set auto_pot_rules = '[{"hpPercent":70,"itemId":"potion"}]'::jsonb
 where auto_pot_rules = '[{"hpPercent":50,"itemId":"potion"}]'::jsonb;
