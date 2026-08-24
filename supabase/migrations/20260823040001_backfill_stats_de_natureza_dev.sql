-- PH-89 / PH-92 — recalcula os stats dos POKE gravados sem o efeito da natureza.
--
-- Gemeo dev de `20260823040000_backfill_stats_de_natureza_public.sql`.
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

  -- nidoran_m Lv1 mild: atkEsp 5->6, def 6->5
  update dev.pokemon_instances set stat_atk_esp = 6, stat_def = 5
    where id = '2e8e053c-dc63-4873-bcf5-4f99f199ed7f' and level = 1 and species_id = 'nidoran_m'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 6 and stat_def_esp = 5 and stat_speed = 6;

  -- doduo Lv1 naughty: atkFis 7->8, defEsp 6->5
  update dev.pokemon_instances set stat_atk_fis = 8, stat_def_esp = 5
    where id = 'f054a703-d56c-460b-b91a-f3c2ad2aaac2' and level = 1 and species_id = 'doduo'
      and stat_hp = 13 and stat_atk_fis = 7 and stat_atk_esp = 6 and stat_def = 6 and stat_def_esp = 6 and stat_speed = 7;

  -- doduo Lv1 adamant: atkFis 8->9, atkEsp 7->6
  update dev.pokemon_instances set stat_atk_fis = 9, stat_atk_esp = 6
    where id = '290944ae-0d92-4acb-af78-defb01a8d711' and level = 1 and species_id = 'doduo'
      and stat_hp = 15 and stat_atk_fis = 8 and stat_atk_esp = 7 and stat_def = 8 and stat_def_esp = 7 and stat_speed = 8;

  -- sandshrew Lv1 jolly: speed 6->7
  update dev.pokemon_instances set stat_speed = 7
    where id = '1a29d9b7-1c7d-49d2-a6b5-7d7061dfac36' and level = 1 and species_id = 'sandshrew'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 6 and stat_def_esp = 5 and stat_speed = 6;

  -- sandshrew Lv1 sassy: defEsp 5->6, speed 6->5
  update dev.pokemon_instances set stat_def_esp = 6, stat_speed = 5
    where id = 'cabb48f9-a254-4068-b78e-17d4fdfca53f' and level = 1 and species_id = 'sandshrew'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 6 and stat_def_esp = 5 and stat_speed = 6;

  -- sentret Lv1 mild: atkEsp 5->6
  update dev.pokemon_instances set stat_atk_esp = 6
    where id = '16b12b79-fe57-49a2-89fc-4acd4eb941ef' and level = 1 and species_id = 'sentret'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 5 and stat_speed = 5;

  -- hoothoot Lv1 brave: speed 7->6
  update dev.pokemon_instances set stat_speed = 6
    where id = '67b6fb0d-ea02-433a-9b4b-cc0b978b588c' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 14 and stat_atk_fis = 6 and stat_atk_esp = 6 and stat_def = 6 and stat_def_esp = 7 and stat_speed = 7;

  -- doduo Lv1 naughty: atkFis 6->7
  update dev.pokemon_instances set stat_atk_fis = 7
    where id = '20a7bacf-d6ca-4dbf-9038-801491167317' and level = 1 and species_id = 'doduo'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 6 and stat_def_esp = 5 and stat_speed = 6;

  -- meowth Lv1 hasty: speed 6->7
  update dev.pokemon_instances set stat_speed = 7
    where id = '4dd3f88f-d317-49ba-8b24-10a11a53ab64' and level = 1 and species_id = 'meowth'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 6;

  -- nidoran_m Lv1 impish: def 6->7
  update dev.pokemon_instances set stat_def = 7
    where id = '845db2c8-72fd-4e0a-80f1-0fb6c98b37d0' and level = 1 and species_id = 'nidoran_m'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 6 and stat_def_esp = 6 and stat_speed = 6;

  -- rhyhorn Lv1 relaxed: def 8->9, speed 6->5
  update dev.pokemon_instances set stat_def = 9, stat_speed = 5
    where id = '0e7c3ad3-0f6a-4045-ac02-b765af7a32b9' and level = 1 and species_id = 'rhyhorn'
      and stat_hp = 14 and stat_atk_fis = 7 and stat_atk_esp = 6 and stat_def = 8 and stat_def_esp = 6 and stat_speed = 6;

  -- meowth Lv1 quiet: atkEsp 5->6, speed 6->5
  update dev.pokemon_instances set stat_atk_esp = 6, stat_speed = 5
    where id = '4b69e079-c977-4f1f-8237-d2b0e5aaa46d' and level = 1 and species_id = 'meowth'
      and stat_hp = 11 and stat_atk_fis = 5 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 5 and stat_speed = 6;

  -- sentret Lv1 calm: defEsp 6->7
  update dev.pokemon_instances set stat_def_esp = 7
    where id = '9433445f-3f11-40f9-9c34-3c782783f649' and level = 1 and species_id = 'sentret'
      and stat_hp = 11 and stat_atk_fis = 5 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 5;

  -- spearow Lv1 timid: atkFis 6->5, speed 6->7
  update dev.pokemon_instances set stat_atk_fis = 5, stat_speed = 7
    where id = 'fa8dc779-6e39-4c94-89a9-a0b5c9e2dcfb' and level = 1 and species_id = 'spearow'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 5 and stat_speed = 6;

  -- togepi Lv1 modest: atkEsp 5->6
  update dev.pokemon_instances set stat_atk_esp = 6
    where id = 'b92ef6dc-c868-4364-85e0-58f4b75eb130' and level = 1 and species_id = 'togepi'
      and stat_hp = 11 and stat_atk_fis = 5 and stat_atk_esp = 5 and stat_def = 6 and stat_def_esp = 6 and stat_speed = 5;

  -- diglett Lv1 adamant: atkFis 6->7
  update dev.pokemon_instances set stat_atk_fis = 7
    where id = '6ea3a8e9-5db7-4498-bfa5-7fa567c33539' and level = 1 and species_id = 'diglett'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 6;

  -- diglett Lv1 rash: defEsp 6->5
  update dev.pokemon_instances set stat_def_esp = 5
    where id = '6c201cf0-6f43-4f26-b0f2-1c07956ca33d' and level = 1 and species_id = 'diglett'
      and stat_hp = 13 and stat_atk_fis = 7 and stat_atk_esp = 6 and stat_def = 6 and stat_def_esp = 6 and stat_speed = 7;

  -- cubone Lv1 hasty: def 7->6, speed 5->6
  update dev.pokemon_instances set stat_def = 6, stat_speed = 6
    where id = '859d453d-49ca-407c-a94f-1ba9086316c1' and level = 1 and species_id = 'cubone'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 7 and stat_def_esp = 6 and stat_speed = 5;

  -- diglett Lv1 modest: atkFis 6->5, atkEsp 5->6
  update dev.pokemon_instances set stat_atk_fis = 5, stat_atk_esp = 6
    where id = '64535e74-fdbb-4642-b612-175a4a9b34b9' and level = 1 and species_id = 'diglett'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 5 and stat_speed = 7;

  -- cubone Lv1 modest: atkFis 10->9
  update dev.pokemon_instances set stat_atk_fis = 9
    where id = '8476248f-d006-4424-96e2-50c5010cbd24' and level = 1 and species_id = 'cubone'
      and stat_hp = 20 and stat_atk_fis = 10 and stat_atk_esp = 9 and stat_def = 12 and stat_def_esp = 10 and stat_speed = 9;

  -- cubone Lv1 brave: atkFis 6->7
  update dev.pokemon_instances set stat_atk_fis = 7
    where id = 'b974abc8-1ce1-4d68-932a-4a2a3d335e0c' and level = 1 and species_id = 'cubone'
      and stat_hp = 12 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 7 and stat_def_esp = 6 and stat_speed = 5;

  -- hoothoot Lv1 lax: def 5->6, defEsp 6->5
  update dev.pokemon_instances set stat_def = 6, stat_def_esp = 5
    where id = '673ad1fc-39f2-46ff-bf76-e0345d766f6a' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 12 and stat_atk_fis = 5 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 6;

  -- hoothoot Lv1 impish: def 5->6
  update dev.pokemon_instances set stat_def = 6
    where id = 'a07e814a-4bcc-40c3-b32f-d15240aeff6f' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 12 and stat_atk_fis = 5 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 6;

  -- hoothoot Lv1 jolly: speed 6->7
  update dev.pokemon_instances set stat_speed = 7
    where id = '69b54059-df9b-465b-a960-e2a4abb306f4' and level = 1 and species_id = 'hoothoot'
      and stat_hp = 12 and stat_atk_fis = 5 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 6 and stat_speed = 6;

  -- sentret Lv1 naive: defEsp 8->7
  update dev.pokemon_instances set stat_def_esp = 7
    where id = 'b4bb933b-1fe7-4e07-bdcd-1dcb517e8c7b' and level = 1 and species_id = 'sentret'
      and stat_hp = 15 and stat_atk_fis = 8 and stat_atk_esp = 7 and stat_def = 7 and stat_def_esp = 8 and stat_speed = 7;

  -- rattata Lv1 adamant: atkFis 6->7
  update dev.pokemon_instances set stat_atk_fis = 7
    where id = 'ad804b96-ccee-4d5d-b917-93ba61ee8a2e' and level = 1 and species_id = 'rattata'
      and stat_hp = 11 and stat_atk_fis = 6 and stat_atk_esp = 5 and stat_def = 5 and stat_def_esp = 5 and stat_speed = 6;

commit;
