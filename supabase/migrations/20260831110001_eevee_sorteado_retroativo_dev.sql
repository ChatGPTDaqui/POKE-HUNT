-- PH-330 — espelho de 20260831110000_eevee_sorteado_retroativo_public.sql no schema dev.
-- O raciocinio completo esta na migration irma em public.
--
-- Em `dev` nao ha concessao nenhuma na data desta migration (medido), entao
-- ela e no-op ali. Existe pelo mesmo motivo que todo par existe: o gate de CI
-- compara os dois schemas, e um lado sem o arquivo do outro reprova.
begin;

do $$
declare
  v_user_id uuid;
  v_carta dev.mail_messages;
  v_poke_id uuid;
  v_candidatos int;
  v_trocados int := 0;
  v_reenviados int := 0;
  v_pulados int := 0;
begin
  for v_user_id in
    select user_id from dev.recompensa_concedida where chave = 'eevee_do_lance'
  loop
    -- A carta do Lance com receita congelada deste jogador.
    select * into v_carta
      from dev.mail_messages
      where para_id = v_user_id
        and de_id is null
        and anexo_poke is not null
        and anexo_poke->>'speciesId' = 'eevee'
        and anexo_poke->'nature' is null
      order by created_at
      limit 1;

    -- `not found`, e NAO `v_carta is null`: quando o SELECT INTO nao acha linha,
    -- o PL/pgSQL deixa a variavel COMO ESTAVA — na segunda volta do laco ela
    -- ainda teria a carta do jogador anterior, e este jogador levaria a troca
    -- do outro. `FOUND` e o unico sinal que nao carrega estado de iteracao.
    -- (E, de quebra, `record IS NULL` tem a armadilha de exigir TODOS os campos
    -- nulos — a mesma que quebrou o escrow do Mercado.)
    if not found then
      -- Nada congelado pra este jogador: ou ja foi trocado (segunda execucao),
      -- ou a concessao dele nunca chegou a virar carta.
      continue;
    end if;

    if v_carta.anexo_coletado_em is null then
      -- NAO COLETADA. Nao ha POKE pra substituir: apaga a carta velha (a receita
      -- dentro dela esta obsoleta) e reconcede sem substituicao.
      delete from dev.mail_messages where id = v_carta.id;
      delete from dev.recompensa_concedida where user_id = v_user_id and chave = 'eevee_do_lance';
      if dev._conceder_eevee_do_lance(v_user_id, null::uuid) then
        v_reenviados := v_reenviados + 1;
      end if;
      continue;
    end if;

    -- COLETADA: achar o POKE que ela entregou. A coleta insere na MESMA
    -- transacao do claim, entao `created_at` do POKE e `anexo_coletado_em` da
    -- carta sao o mesmo instante — e o casamento mais preciso que existe aqui.
    -- Os outros filtros (especie, nivel, IVs da receita, `trait is null`)
    -- entram como cinto de seguranca, nao como identificacao principal.
    select count(*) into v_candidatos
      from dev.pokemon_instances
      where user_id = v_user_id
        and species_id = 'eevee'
        and created_at = v_carta.anexo_coletado_em
        and trait is null
        and level = coalesce((v_carta.anexo_poke->>'level')::int, 25);

    if v_candidatos <> 1 then
      -- Zero: o jogador ja se livrou do Eevee (vendeu, transferiu, evoluiu).
      -- Mais de um: nao da pra dizer qual e. Nos dois casos, nao reconcede.
      raise notice
        'PH-330: jogador % tem % candidato(s) a Eevee do Lance — nao reconcedido, o antigo fica.',
        v_user_id, v_candidatos;
      v_pulados := v_pulados + 1;
      continue;
    end if;

    -- Zerado antes do select pelo mesmo motivo do `not found` acima: variavel de
    -- laco que o SELECT INTO nao alcanca guarda o valor da volta anterior.
    v_poke_id := null;
    select id into v_poke_id
      from dev.pokemon_instances
      where user_id = v_user_id
        and species_id = 'eevee'
        and created_at = v_carta.anexo_coletado_em
        and trait is null
        and level = coalesce((v_carta.anexo_poke->>'level')::int, 25);

    -- A carta velha SAI. Ela diz "colete abaixo" sobre um anexo que ja foi
    -- entregue e cujo POKE esta sendo revogado; deixa-la ao lado da nova, com o
    -- mesmo assunto, e duas cartas em que uma mente.
    delete from dev.mail_messages where id = v_carta.id;
    delete from dev.recompensa_concedida where user_id = v_user_id and chave = 'eevee_do_lance';
    if dev._conceder_eevee_do_lance(v_user_id, v_poke_id) then
      v_trocados := v_trocados + 1;
    end if;
  end loop;

  -- `%` sozinho, e nao `%s`: no RAISE do PL/pgSQL o especificador e o `%`, e o
  -- `s` de `%s` sairia literal na mensagem.
  raise notice
    'PH-330: % carta(s) de troca enviada(s), % reenvio(s) sem POKE a substituir, % jogador(es) pulado(s).',
    v_trocados, v_reenviados, v_pulados;
end $$;

commit;
