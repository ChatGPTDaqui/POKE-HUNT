-- PH-89 / PH-92 — recalcula os stats dos POKE gravados sem o efeito da natureza.
--
-- POR QUE ESTE BACKFILL EXISTE
--
-- Dois defeitos gravaram POKE com natureza na ficha e stats que a ignoram:
-- PH-92 (a captura nao passava a natureza pro calculo) e PH-89 (o calculo do
-- servidor nao conhecia natureza, afetando a evolucao). Os dois estao
-- corrigidos; isto conserta o dado que ficou para tras.
--
-- Auditoria de 2026-08-23 comparando cada POKE contra `computeStatsAtLevel`:
--   public : 40 divergentes de 54
--   dev    : 26 divergentes de 48
--
-- POR QUE OS VALORES ESTAO ESCRITOS A MAO, E NAO CALCULADOS AQUI
--
-- Daria pra chamar `_calcular_stats` e deixar o banco recalcular. Nao foi o
-- caminho: a paridade entre a funcao SQL e o motor TS so foi verificada num
-- caso (PH-89), e este arquivo escreve no time de jogador vivo. Os numeros
-- abaixo saem de `computeStatsAtLevel`, que e a implementacao de referencia —
-- a mesma que o jogo usa pra mostrar os stats na tela.
--
-- Efeito colateral bom: o valor antigo e o novo ficam registrados no diff.
-- Quem revisar ve exatamente o que mudou em cada POKE.
--
-- HP NAO MUDA EM NENHUM CASO. Natureza nunca afeta HP (`NATURE_STATS` nao
-- inclui hp), entao `stat_hp` e o `hp` atual ficam intactos e nao ha risco de
-- POKE acordar com vida acima do maximo. Conferido: 0 casos de HP divergente.
--
-- CADA UPDATE TEM GUARDA. O `where` exige que a linha ainda esteja exatamente
-- como estava na auditoria — mesmo nivel, mesma especie, mesmos seis stats. Se
-- o POKE subiu de nivel, evoluiu ou foi recalculado entre a auditoria e a
-- aplicacao, o update simplesmente nao acha a linha. Perder o backfill de um
-- POKE e melhor do que sobrescrever um valor legitimo mais novo.
--
-- Idempotente pelo mesmo motivo: rodar duas vezes nao faz nada na segunda.

begin;

  -- exeggcute Lv1 impish: atkEsp 10->9, def 10->11
  update public.pokemon_instances set stat_atk_esp = 9, stat_def = 11
    where id = 'fc30ec4e-e54c-4fea-98e8-99b4ac132e66' and level = 1 and species_id = 'exeggcute'
      and stat_hp = 20 and stat_atk_fis = 10 and stat_atk_esp = 10 and stat_def = 10 and stat_def_esp = 10 and stat_speed = 9;

  -- hoothoot Lv1 impish: atkEsp 8->7
  update public.pokemon_instances set stat_atk_esp = 7
    where id = '3767e888-7abc-4d3e-8a1a-601b7d15f132' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 18 and stat_atk_fis = 8 and stat_atk_esp = 8 and stat_def = 8 and stat_def_esp = 9 and stat_speed = 9;

  -- natu Lv1 timid: atkFis 9->8, speed 9->10
  update public.pokemon_instances set stat_atk_fis = 8, stat_speed = 10
    where id = 'fe18843a-bd5b-43c7-8892-0bc7e29169ed' and level = 1 and species_id = 'natu'
      and stat_hp = 17 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- spearow Lv1 careful: atkEsp 7->6
  update public.pokemon_instances set stat_atk_esp = 6
    where id = 'c1e48dbd-dcb8-4e70-a07a-f0cc2c584abb' and level = 1 and species_id = 'spearow'
      and stat_hp = 16 and stat_atk_fis = 8 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 7 and stat_speed = 8;

  -- exeggcute Lv1 gentle: def 9->8, defEsp 9->10
  update public.pokemon_instances set stat_def = 8, stat_def_esp = 10
    where id = 'd6767b2c-7801-4d36-8d36-d2227cb3c173' and level = 1 and species_id = 'exeggcute'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 8;

  -- rattata Lv1 calm: atkFis 10->9
  update public.pokemon_instances set stat_atk_fis = 9
    where id = 'bbdd1d1f-a8b7-45b1-9814-5e66aa39f9ed' and level = 1 and species_id = 'rattata'
      and stat_hp = 19 and stat_atk_fis = 10 and stat_atk_esp = 9 and stat_def = 10 and stat_def_esp = 9 and stat_speed = 10;

  -- sentret Lv1 hasty: speed 5->6
  update public.pokemon_instances set stat_speed = 6
    where id = '6c4de849-782d-417a-818c-d7c0c585bb40' and level = 1 and species_id = 'sentret'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 5;

  -- rattata Lv1 relaxed: def 5->6, speed 6->5
  update public.pokemon_instances set stat_def = 6, stat_speed = 5
    where id = 'c943d44b-e52e-4dd2-adf5-90dd7d28c01f' and level = 1 and species_id = 'rattata'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 5 and stat_speed = 6;

  -- sunkern Lv1 lonely: def 7->6
  update public.pokemon_instances set stat_def = 6
    where id = 'cdec9e2f-4a53-4acf-9f34-0697ae0631a4' and level = 1 and species_id = 'sunkern'
      and stat_hp = 15 and stat_atk_fis = 7 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 7 and stat_speed = 7;

  -- rattata Lv1 gentle: def 7->6
  update public.pokemon_instances set stat_def = 6
    where id = '5cc4bf75-47a8-40e6-98f1-f4d7a2c212b8' and level = 1 and species_id = 'rattata'
      and stat_hp = 15 and stat_atk_fis = 8 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 7 and stat_speed = 8;

  -- sentret Lv1 bold: atkFis 8->7
  update public.pokemon_instances set stat_atk_fis = 7
    where id = 'd31ab05f-8819-4431-b119-0df0cb034d22' and level = 1 and species_id = 'sentret'
      and stat_hp = 16 and stat_atk_fis = 8 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 8 and stat_speed = 7;

  -- sunkern Lv1 lonely: def 7->6
  update public.pokemon_instances set stat_def = 6
    where id = 'a3ce3a24-2b5f-4367-94a2-7eef7fe797cf' and level = 1 and species_id = 'sunkern'
      and stat_hp = 15 and stat_atk_fis = 7 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 7 and stat_speed = 7;

  -- rattata Lv1 timid: atkFis 8->7, speed 8->9
  update public.pokemon_instances set stat_atk_fis = 7, stat_speed = 9
    where id = '7f6ad6e7-5c37-4c6b-9cf0-a032b8d21045' and level = 1 and species_id = 'rattata'
      and stat_hp = 15 and stat_atk_fis = 8 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 7 and stat_speed = 8;

  -- hoothoot Lv1 brave: speed 8->7
  update public.pokemon_instances set stat_speed = 7
    where id = '7350cf7d-11ad-4246-ab6a-2cd6de36bc24' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 16 and stat_atk_fis = 7 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 8 and stat_speed = 8;

  -- hoothoot Lv1 timid: atkFis 8->7, speed 9->10
  update public.pokemon_instances set stat_atk_fis = 7, stat_speed = 10
    where id = 'af060eb0-d26d-4149-95c0-47b29fd08c1d' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 18 and stat_atk_fis = 8 and stat_atk_esp = 8 and stat_def = 8 and stat_def_esp = 9 and stat_speed = 9;

  -- natu Lv1 lax: defEsp 8->7
  update public.pokemon_instances set stat_def_esp = 7
    where id = 'a8b321ea-a21c-4091-aaa5-b3b5424ced4f' and level = 1 and species_id = 'natu'
      and stat_hp = 17 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 8 and stat_def_esp = 8 and stat_speed = 9;

  -- unown Lv1 sassy: defEsp 13->15, speed 13->12
  update public.pokemon_instances set stat_def_esp = 15, stat_speed = 12
    where id = '5ab9b73e-bd05-459c-bd3e-9e12f3b16cd3' and level = 1 and species_id = 'unown'
      and stat_hp = 26 and stat_atk_fis = 13 and stat_atk_esp = 13 and stat_def = 13 and stat_def_esp = 13 and stat_speed = 13;

  -- cubone Lv1 calm: atkFis 9->8, defEsp 9->10
  update public.pokemon_instances set stat_atk_fis = 8, stat_def_esp = 10
    where id = '858eb811-8461-4f13-9018-58688522038f' and level = 1 and species_id = 'cubone'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 11 and stat_def_esp = 9 and stat_speed = 8;

  -- venonat Lv1 bold: atkFis 10->9, def 10->11
  update public.pokemon_instances set stat_atk_fis = 9, stat_def = 11
    where id = 'c284bb0d-d82f-4a5b-9ef5-6c438ddc28a4' and level = 1 and species_id = 'venonat'
      and stat_hp = 21 and stat_atk_fis = 10 and stat_atk_esp = 10 and stat_def = 10 and stat_def_esp = 10 and stat_speed = 9;

  -- gastly Lv1 modest: atkFis 8->7, atkEsp 11->12
  update public.pokemon_instances set stat_atk_fis = 7, stat_atk_esp = 12
    where id = '7a29a223-d500-48ce-81d8-35270c7a93df' and level = 1 and species_id = 'gastly'
      and stat_hp = 17 and stat_atk_fis = 8 and stat_atk_esp = 11 and stat_def = 8 and stat_def_esp = 8 and stat_speed = 9;

  -- drowzee Lv1 naughty: atkFis 9->10, defEsp 9->8
  update public.pokemon_instances set stat_atk_fis = 10, stat_def_esp = 8
    where id = '2d68b52e-269a-43bf-9ab2-3f512ef7faeb' and level = 1 and species_id = 'drowzee'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 8 and stat_def_esp = 9 and stat_speed = 8;

  -- unown Lv1 naughty: atkFis 9->10, defEsp 9->8
  update public.pokemon_instances set stat_atk_fis = 10, stat_def_esp = 8
    where id = 'e7e7a90c-18b1-4d65-a3db-550e99ead8c5' and level = 1 and species_id = 'unown'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- cubone Lv1 timid: atkFis 9->8
  update public.pokemon_instances set stat_atk_fis = 8
    where id = '4e37688b-dee0-4725-a749-75b02d639f90' and level = 1 and species_id = 'cubone'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 8 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 8;

  -- cubone Lv1 sassy: defEsp 13->15, speed 11->10
  update public.pokemon_instances set stat_def_esp = 15, stat_speed = 10
    where id = 'a6158a6f-4216-4cd9-b490-0495edbbf8d2' and level = 1 and species_id = 'cubone'
      and stat_hp = 26 and stat_atk_fis = 13 and stat_atk_esp = 13 and stat_def = 15 and stat_def_esp = 13 and stat_speed = 11;

  -- natu Lv1 bold: atkFis 9->8, def 9->10
  update public.pokemon_instances set stat_atk_fis = 8, stat_def = 10
    where id = '5d319bc0-4d9b-4756-b992-600b79c55fb9' and level = 1 and species_id = 'natu'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- natu Lv1 timid: atkFis 9->8, speed 9->10
  update public.pokemon_instances set stat_atk_fis = 8, stat_speed = 10
    where id = '30894e3b-458c-4b5a-8f9f-41abcb438357' and level = 1 and species_id = 'natu'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- natu Lv1 lonely: atkFis 9->10, def 9->8
  update public.pokemon_instances set stat_atk_fis = 10, stat_def = 8
    where id = '21108d06-0e4f-47f6-becb-6aa5a57676a8' and level = 1 and species_id = 'natu'
      and stat_hp = 17 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- cubone Lv1 mild: atkEsp 10->11, def 12->11
  update public.pokemon_instances set stat_atk_esp = 11, stat_def = 11
    where id = '1e128cc2-65cd-495a-b47b-8af4a672c6c9' and level = 1 and species_id = 'cubone'
      and stat_hp = 21 and stat_atk_fis = 10 and stat_atk_esp = 10 and stat_def = 12 and stat_def_esp = 10 and stat_speed = 9;

  -- unown Lv1 jolly: atkEsp 13->12, speed 13->15
  update public.pokemon_instances set stat_atk_esp = 12, stat_speed = 15
    where id = '1906d005-2045-400e-b68f-c1b22faebcbe' and level = 1 and species_id = 'unown'
      and stat_hp = 26 and stat_atk_fis = 13 and stat_atk_esp = 13 and stat_def = 13 and stat_def_esp = 13 and stat_speed = 13;

  -- natu Lv1 careful: atkEsp 18->16, defEsp 15->17
  update public.pokemon_instances set stat_atk_esp = 16, stat_def_esp = 17
    where id = '218da36a-7a62-4ff7-9913-597a9b4b9882' and level = 1 and species_id = 'natu'
      and stat_hp = 33 and stat_atk_fis = 18 and stat_atk_esp = 18 and stat_def = 18 and stat_def_esp = 15 and stat_speed = 18;

  -- marill Lv1 sassy: defEsp 9->10, speed 8->7
  update public.pokemon_instances set stat_def_esp = 10, stat_speed = 7
    where id = 'b4dcee7e-4300-4f38-98f4-d4efa7c367b1' and level = 1 and species_id = 'marill'
      and stat_hp = 18 and stat_atk_fis = 8 and stat_atk_esp = 8 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 8;

  -- natu Lv1 naive: defEsp 13->12, speed 13->15
  update public.pokemon_instances set stat_def_esp = 12, stat_speed = 15
    where id = 'e7d93ea1-5537-4d47-974b-aed87c318030' and level = 1 and species_id = 'natu'
      and stat_hp = 24 and stat_atk_fis = 13 and stat_atk_esp = 13 and stat_def = 11 and stat_def_esp = 13 and stat_speed = 13;

  -- unown Lv1 naive: defEsp 9->8, speed 9->10
  update public.pokemon_instances set stat_def_esp = 8, stat_speed = 10
    where id = '16b05389-97f3-4433-99fb-75c659ccae1d' and level = 1 and species_id = 'unown'
      and stat_hp = 17 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- rattata Lv1 careful: atkEsp 8->7
  update public.pokemon_instances set stat_atk_esp = 7
    where id = 'e271f448-4e0f-40d6-b466-836f9112b1e5' and level = 1 and species_id = 'rattata'
      and stat_hp = 17 and stat_atk_fis = 9 and stat_atk_esp = 8 and stat_def = 8 and stat_def_esp = 8 and stat_speed = 9;

  -- nidorino Lv1 mild: atkEsp 10->11, def 10->9
  update public.pokemon_instances set stat_atk_esp = 11, stat_def = 9
    where id = '7207191d-230f-44ec-965e-5ed73c5d7d89' and level = 1 and species_id = 'nidorino'
      and stat_hp = 20 and stat_atk_fis = 10 and stat_atk_esp = 10 and stat_def = 10 and stat_def_esp = 10 and stat_speed = 10;

  -- natu Lv1 lonely: atkFis 9->10, def 9->8
  update public.pokemon_instances set stat_atk_fis = 10, stat_def = 8
    where id = 'dc3f7321-a434-4b94-8d6d-1ec876377fa3' and level = 1 and species_id = 'natu'
      and stat_hp = 17 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 8 and stat_speed = 9;

  -- drowzee Lv1 lonely: def 9->8
  update public.pokemon_instances set stat_def = 8
    where id = 'a113c9e4-6fa1-4a56-90ce-e23b777fab6a' and level = 1 and species_id = 'drowzee'
      and stat_hp = 18 and stat_atk_fis = 8 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- gastly Lv1 impish: atkEsp 15->14, def 11->12
  update public.pokemon_instances set stat_atk_esp = 14, stat_def = 12
    where id = 'c3cca946-c27f-4d77-8128-4eac1d219497' and level = 1 and species_id = 'gastly'
      and stat_hp = 24 and stat_atk_fis = 11 and stat_atk_esp = 15 and stat_def = 11 and stat_def_esp = 11 and stat_speed = 13;

  -- unown Lv1 bold: atkFis 9->8, def 9->10
  update public.pokemon_instances set stat_atk_fis = 8, stat_def = 10
    where id = '3a1d59f9-f832-40e8-988d-eafd66808dfa' and level = 1 and species_id = 'unown'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 9 and stat_def = 9 and stat_def_esp = 9 and stat_speed = 9;

  -- cubone Lv1 lonely: atkFis 9->10, def 11->9
  update public.pokemon_instances set stat_atk_fis = 10, stat_def = 9
    where id = '29fa60c1-3322-4a30-9d01-ab57b1f43335' and level = 1 and species_id = 'cubone'
      and stat_hp = 18 and stat_atk_fis = 9 and stat_atk_esp = 8 and stat_def = 11 and stat_def_esp = 9 and stat_speed = 8;

commit;
