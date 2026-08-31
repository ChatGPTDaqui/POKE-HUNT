-- PH-314 (espelho do schema dev): a linha da oferta passa a DESCREVER o POKE.
--
-- O BURACO QUE ISTO FECHA
-- ---------------------------------------------------------------------------
-- `troca_oferta` guardava so o `poke_uid`. Pra desenhar "Bulbasaur Lv 34" a tela
-- teria que ler `pokemon_instances` — e a RLS de la tem uma policy so:
--
--   jogador le os proprios pokemon: auth.uid() = user_id
--
-- Ou seja: cada lado enxergaria a propria oferta e um identificador opaco na do
-- outro. Ver o que voce vai RECEBER e o ponto inteiro da troca, entao sem isto a
-- fatia 4 nao existe.
--
-- POR QUE DENORMALIZAR, E NAO ABRIR A RLS
-- ---------------------------------------------------------------------------
-- A alternativa seria uma policy nova em `pokemon_instances` liberando a leitura
-- do POKE que esta numa mesa de que eu participo. Ela funcionaria, e seria pior:
--
--  - abriria a LINHA INTEIRA (IV cru, natureza, trait, golpes desligados,
--    `locked`), quando a tela precisa de cinco campos. A PH-105 fechou
--    exatamente esse tipo de vazamento;
--  - a condicao teria subconsulta em `troca_oferta` e `troca_sessao` dentro de
--    uma policy que roda em TODA leitura de POKE do jogo, inclusive no boot.
--
-- `market_listings` ja resolveu isto do mesmo jeito, e ha meses: ela carrega
-- `species_id`, `level`, `rarity`, `is_shiny` e `iv_percent` copiados no
-- momento do anuncio. Este arquivo segue o mesmo desenho.
--
-- O RETRATO NAO ENVELHECE ENQUANTO A MESA VIVE. POKE em `location = 'troca'` nao
-- entra em batalha, nao ganha nivel e nao evolui — as RPCs que fazem essas
-- coisas exigem 'bag' ou 'team'. Entao a copia e valida pelo tempo em que
-- alguem a le, que e o tempo da mesa.
--
-- Bonus que nao e bonus: `troca_log` guarda o retrato da oferta em jsonb. Com
-- so o uuid, uma reclamacao de tres semanas depois nao teria como dizer O QUE
-- foi trocado sem cruzar com uma linha que pode ter mudado de dono duas vezes.

alter table dev.troca_oferta
  add column if not exists species_id text references dev.species(id),
  add column if not exists level integer,
  add column if not exists is_shiny boolean,
  add column if not exists rarity dev.rarity_tier,
  add column if not exists iv_percent integer;

comment on column dev.troca_oferta.species_id is
  'PH-314: copia do POKE no momento em que ele entrou na mesa. A RLS de pokemon_instances nao deixa o outro lado ler a linha original.';

-- ---------------------------------------------------------------------------
-- `por_poke_na_mesa` passa a copiar o retrato
-- ---------------------------------------------------------------------------
-- Reescrita inteira e nao remendada: `create or replace` substitui o corpo, e
-- deixar meio corpo aqui faria a definicao vigente depender da ordem dos
-- deploys.
create or replace function dev.por_poke_na_mesa(p_sessao_id uuid, p_poke_id uuid)
returns dev.troca_sessao
language plpgsql
security definer
set search_path to 'dev'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao dev.troca_sessao;
  v_minhas integer;
  v_poke dev.pokemon_instances;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  v_sessao := dev._mesa_aberta_minha(p_sessao_id, v_eu);

  select count(*) into v_minhas from dev.troca_oferta
   where sessao_id = p_sessao_id and dono_id = v_eu;
  if v_minhas >= dev._troca_teto_por_lado() then
    raise exception 'Sua parte da mesa esta cheia (% linhas).', dev._troca_teto_por_lado();
  end if;

  -- A reserva E o update, e ele e a autoridade: quem nao conseguir mover a
  -- linha nao chega a inserir oferta. `location = 'bag'` cobre de uma vez o
  -- POKE em campo, o ja reservado em outra mesa e o anunciado no Mercado.
  --
  -- O `returning` traz o retrato de graca: uma segunda leitura pra copiar os
  -- campos poderia pegar a linha ja mexida por outra transacao.
  update dev.pokemon_instances
     set location = 'troca', team_slot = null, updated_at = now()
   where id = p_poke_id
     and user_id = v_eu
     and location = 'bag'
     and coalesce(locked, false) = false
  returning * into v_poke;
  if not found then
    raise exception 'POKE indisponivel — precisa estar na mochila, destravado e fora de outra troca.';
  end if;

  insert into dev.troca_oferta (
    sessao_id, dono_id, tipo, poke_uid, species_id, level, is_shiny, rarity, iv_percent
  )
  values (
    p_sessao_id, v_eu, 'poke', p_poke_id,
    v_poke.species_id, v_poke.level, v_poke.is_shiny, v_poke.rarity,
    -- Mesma conta de `anunciar_poke`: os seis IVs sobre o maximo de 31 cada.
    round((v_poke.iv_hp + v_poke.iv_atk_fis + v_poke.iv_atk_esp
           + v_poke.iv_def + v_poke.iv_def_esp + v_poke.iv_speed) / (31.0 * 6) * 100)
  );

  -- Rele DEPOIS do insert: o trigger ja subiu a versao, e o cliente precisa da
  -- versao nova pra confirmar.
  select * into v_sessao from dev.troca_sessao where id = p_sessao_id;
  return v_sessao;
end;
$function$;
