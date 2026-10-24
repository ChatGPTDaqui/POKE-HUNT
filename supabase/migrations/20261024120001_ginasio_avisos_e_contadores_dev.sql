-- Espelho de 20261024120000_ginasio_avisos_e_contadores_public.sql no schema `dev`. GERADO por src/data/ginasios.test.ts.
-- Ginasios: aviso ao lider (mensagem de sistema) + contadores das conquistas de
-- insignia e lideranca (24/10/2026, pedido do dono).
--
-- Aviso (`mail_messages`, tipo 'sistema', de "Ginásios"):
--   * lider humano: venceu uma defesa (+ouro), perdeu uma defesa, alguem entrou
--     na disputa do mandato (destronar);
--   * troca de mandato: quem assume, quem perdeu o ginasio, mandato renovado.
-- Contadores (`somar_contadores`, avaliados com as conquistas no flush):
--   insignia_total, insignia_liga:<faixa>, ginasio_mandatos, ginasio_defesas.
-- Os nomes ("Ginásio das Chamas · Liga Regional") repetem titulos.ts e
-- ginasios.ts; `ginasios.test.ts` tranca.

begin;

create or replace function dev._nome_do_ginasio(p_id text)
returns text
language sql
immutable
set search_path = dev, public
as $$
  select 'Ginásio ' || case split_part(p_id, '_', 1)
      when 'NORMAL' then 'da Tradição' when 'FIRE' then 'das Chamas' when 'WATER' then 'das Marés'
      when 'ELECTRIC' then 'dos Trovões' when 'GRASS' then 'da Relva' when 'ICE' then 'do Gelo'
      when 'FIGHTING' then 'do Combate' when 'POISON' then 'do Veneno' when 'GROUND' then 'da Terra'
      when 'FLYING' then 'dos Céus' when 'PSYCHIC' then 'da Mente' when 'BUG' then 'dos Insetos'
      when 'ROCK' then 'das Rochas' when 'GHOST' then 'dos Espectros' when 'DRAGON' then 'dos Dragões'
      when 'DARK' then 'da Escuridão' when 'STEEL' then 'do Aço' when 'FAIRY' then 'das Fadas'
      else split_part(p_id, '_', 1) end
    || ' · ' || case split_part(p_id, '_', 2)
      when '100' then 'Liga Regional' when '200' then 'Liga Elite' when '300' then 'Liga Campeã'
      when '400' then 'Liga Lendária' when '500' then 'Liga Mestra' else split_part(p_id, '_', 2) end
$$;

create or replace function dev._aviso_de_ginasio(p_para uuid, p_assunto text, p_corpo text)
returns void
language sql
security definer
set search_path = dev, public
as $$
  insert into dev.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo)
  values (p_para, null, 'Ginásios', 'sistema', left(p_assunto, 60), left(p_corpo, 1000))
$$;
revoke all on function dev._nome_do_ginasio(text) from public, anon, authenticated;
revoke all on function dev._aviso_de_ginasio(uuid, text, text) from public, anon, authenticated;

create or replace function dev._aplicar_resultado_ginasio(p_desafio uuid, p_resultado text, p_ticks int)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_d dev.ginasio_desafio;
  v_g dev.ginasio;
  v_repasse bigint;
  v_nova boolean := false;
  v_nome text;
  v_humano boolean;
begin
  if p_resultado not in ('vitoria', 'derrota', 'empate') then raise exception 'resultado invalido' using errcode = 'P0001'; end if;
  -- Serializa com o flush do desafiante (PH-67). O repasse ao lider e incremento.
  perform pg_advisory_xact_lock(hashtext(user_id::text)) from dev.ginasio_desafio where id = p_desafio;
  select * into v_d from dev.ginasio_desafio where id = p_desafio for update;
  if v_d.id is null then raise exception 'desafio nao encontrado' using errcode = 'P0001'; end if;
  if v_d.estado <> 'aberto' then
    return jsonb_build_object('estado', v_d.estado, 'ticks', v_d.ticks, 'jaResolvido', true);
  end if;
  select * into v_g from dev.ginasio where id = v_d.ginasio_id;
  v_nome := dev._nome_do_ginasio(v_d.ginasio_id);
  v_humano := v_d.lider_id is not null and v_d.lider_id <> v_d.user_id;

  update dev.ginasio_desafio set estado = p_resultado, ticks = p_ticks, resolvido_em = now() where id = p_desafio;

  if p_resultado = 'vitoria' and v_d.tipo = 'insignia' then
    insert into dev.player_insignias (user_id, ginasio_id) values (v_d.user_id, v_d.ginasio_id)
      on conflict do nothing;
    v_nova := found;
    -- Nivel 10 da Especialidade do tipo pede a insignia (qualquer faixa); as
    -- conquistas contam o total e cada liga.
    if v_nova then
      perform dev.somar_contadores(v_d.user_id, jsonb_build_object(
        'insignia:' || v_g.tipo, 1, 'insignia_total', 1, 'insignia_liga:' || v_g.faixa, 1));
    end if;
    if v_humano then
      perform dev._aviso_de_ginasio(v_d.lider_id, 'Defesa derrotada: ' || v_nome,
        format('%s venceu a sua defesa e levou a insígnia. A taxa de %s de ouro não gera repasse quando o líder perde.',
          v_d.desafiante_nome, v_d.taxa));
    end if;
  elsif p_resultado = 'vitoria' and v_d.tipo = 'destronar' then
    -- Disputa do proximo mandato: vale o MENOR tempo; empate fica com quem veio primeiro.
    update dev.ginasio_lider set
      candidato_id = v_d.user_id, candidato_nome = v_d.desafiante_nome, candidato_ticks = p_ticks,
      candidato_equipe = v_d.equipe_desafiante, candidato_em = now()
    where ginasio_id = v_d.ginasio_id and (candidato_ticks is null or p_ticks < candidato_ticks);
    if v_humano then
      perform dev._aviso_de_ginasio(v_d.lider_id, 'Seu ginásio está em disputa',
        format('%s venceu a sua defesa no duelo para destronar (%s s) no %s. No fim do mandato, assume quem venceu no menor tempo. Ajuste a sua defesa para segurar o ginásio.',
          v_d.desafiante_nome, round(p_ticks / 60.0), v_nome));
    end if;
  elsif p_resultado = 'derrota' and v_humano then
    -- O lider humano recebe 30% quando vence; o resto da taxa sai do jogo.
    v_repasse := floor(v_d.taxa * 0.3);
    update dev.players set gold = gold + v_repasse where user_id = v_d.lider_id;
    update dev.ginasio_lider set ganhos_mandato = ganhos_mandato + v_repasse
      where ginasio_id = v_d.ginasio_id and lider_id = v_d.lider_id;
    perform dev.somar_contadores(v_d.lider_id, jsonb_build_object('ginasio_defesas', 1));
    perform dev._aviso_de_ginasio(v_d.lider_id, 'Defesa vencida: +' || v_repasse || ' de ouro',
      format('Sua equipe venceu %s no %s. Você recebeu %s de ouro (30%% da taxa).', v_d.desafiante_nome, v_nome, v_repasse));
  end if;

  return jsonb_build_object('estado', p_resultado, 'ticks', p_ticks, 'insigniaNova', v_nova);
end;
$$;
revoke all on function dev._aplicar_resultado_ginasio(uuid, text, int) from public, anon, authenticated;
grant execute on function dev._aplicar_resultado_ginasio(uuid, text, int) to service_role;

-- Troca de mandato com aviso e contador. Mesma regra de 20261023160000; agora
-- plpgsql pra avisar cada ginasio vencido antes de virar a pagina.
create or replace function dev._rotacionar_mandatos()
returns void
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_l record;
  v_nome text;
begin
  for v_l in select * from dev.ginasio_lider where mandato_ate < now() for update loop
    v_nome := dev._nome_do_ginasio(v_l.ginasio_id);
    if v_l.candidato_id is not null then
      perform dev._aviso_de_ginasio(v_l.candidato_id, 'Você é o novo líder!',
        format('Você assumiu o %s por 7 dias. A sua equipe da vitória já defende o ginásio; ajuste a defesa no painel.', v_nome));
      if v_l.candidato_id is distinct from v_l.lider_id then
        perform dev.somar_contadores(v_l.candidato_id, jsonb_build_object('ginasio_mandatos', 1));
        if v_l.lider_id is not null then
          perform dev._aviso_de_ginasio(v_l.lider_id, 'Você perdeu o ginásio',
            format('%s assumiu o %s. Os POKEs da sua defesa estão livres de novo.', v_l.candidato_nome, v_nome));
        end if;
      end if;
    elsif v_l.lider_id is not null then
      perform dev._aviso_de_ginasio(v_l.lider_id, 'Mandato renovado',
        format('Ninguém venceu o duelo para destronar no %s. Você continua líder por mais 7 dias.', v_nome));
    end if;
  end loop;

  -- Quem assume: POKEs da defesa nova ficam trancados (cadeado da mochila).
  update dev.pokemon_instances pi set locked = true
  from dev.ginasio_lider l, jsonb_array_elements(l.candidato_equipe) e
  where l.mandato_ate < now() and l.candidato_id is not null
    and pi.user_id = l.candidato_id and pi.id = (e->>'pokemon_id')::uuid;
  update dev.ginasio_lider set
    lider_id = coalesce(candidato_id, lider_id),
    lider_nome = coalesce(candidato_nome, lider_nome),
    equipe = coalesce(candidato_equipe, equipe),
    defesa = case when candidato_id is null then defesa else (
      select jsonb_agg(jsonb_build_object('pokemon_id', e->>'pokemon_id', 'golpes', '[]'::jsonb, 'rotacao', false) order by o)
      from jsonb_array_elements(candidato_equipe) with ordinality as x(e, o)
      where e ? 'pokemon_id'
    ) end,
    ganhos_mandato = 0,
    candidato_id = null, candidato_nome = null, candidato_ticks = null, candidato_equipe = null, candidato_em = null,
    mandato_ate = now() + interval '7 days'
  where mandato_ate < now();
end;
$$;
revoke all on function dev._rotacionar_mandatos() from public, anon, authenticated;

-- Insignias de antes desta migration tambem contam pras conquistas.
insert into dev.player_contador (user_id, chave, valor)
select user_id, chave, count(*) from (
  select pi.user_id, 'insignia_total' as chave from dev.player_insignias pi
  union all
  select pi.user_id, 'insignia_liga:' || g.faixa from dev.player_insignias pi join dev.ginasio g on g.id = pi.ginasio_id
) x group by user_id, chave
on conflict (user_id, chave) do update set valor = greatest(dev.player_contador.valor, excluded.valor);

commit;
