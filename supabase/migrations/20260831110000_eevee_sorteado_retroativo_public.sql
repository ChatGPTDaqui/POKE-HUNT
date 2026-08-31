-- PH-330 — quem JA recebeu o Eevee de receita congelada troca por um sorteado.
--
-- Migration de DADO. Ela nao muda schema; muda linha de jogador. Ver
-- CLAUDE.local.md#banco-so-muda-por-migration.
--
-- =========================================================================
-- POR QUE ELA NAO APAGA O POKE DIRETO — a parte que importa
-- =========================================================================
--
-- O caminho obvio seria `delete from pokemon_instances where id = <o Eevee>` e
-- reconceder. Ele NAO funciona, e o motivo esta documentado em
-- `authority/src/progresso.ts#gravarEstado`:
--
--     const gravarPoke = linhasQueMudaram(...).filter((l) => {
--       const atual = porId.get(String(l.id))
--       return atual == null || aindaMeu(atual)   // <-- `atual == null`
--     })
--
-- "Linha sem par no banco e POKE novo (captura, inicial, compra) — grava." Ou
-- seja: um POKE apagado SO no servidor, enquanto o jogador tem sessao viva com
-- ele no estado local, e RESSUSCITADO pelo flush seguinte (30s no maximo). O
-- jogador terminaria com o Eevee antigo de volta E o novo do correio.
--
-- E a mesma familia dos tres bugs de 31/08 (PH-311/312/321/324): escrita feita
-- so no servidor e provisoria enquanto o cliente nao souber dela.
--
-- A SAIDA usada aqui: a exclusao viaja DENTRO da receita do correio
-- (`substituiPokeUid`) e acontece na mesma transacao em que o Eevee novo nasce
-- (`coletar_anexo_correio`, par 20260831100000). Tres coisas caem de graca:
--
--   1. ATOMICIDADE. Nunca existe um instante com zero Eevees nem com dois.
--   2. O CLIENTE FICA SABENDO. `coletarAnexo` (data/remote/correioRealtime.ts)
--      ja chama `refetchEquipeInteira()` depois de coletar, entao o estado local
--      passa a ser o do banco — e o flush nao tem o que ressuscitar.
--   3. TIME CHEIO continua tratado. Se a equipe estiver cheia na hora da coleta,
--      a excecao desfaz TUDO (o delete incluido) e a carta volta a ficar
--      pendente. O jogador nao perde nenhum dos dois.
--
-- O preco: enquanto o jogador nao coletar, ele fica com o Eevee antigo. E o
-- comportamento certo — o presente novo so substitui quando de fato chega.
--
-- =========================================================================
-- IDEMPOTENCIA
-- =========================================================================
--
-- O gatilho e "existe carta do Lance com a receita CONGELADA?". Receita
-- congelada e a que NAO tem a chave `nature` (o sorteio novo sempre a escreve).
-- Depois de rodar, essa carta nao existe mais, entao a segunda execucao nao
-- acha nada e nao faz nada. Nao ha `where not exists` improvisado: o
-- discriminante e o proprio dado.
--
-- =========================================================================
-- GUARDA CONTRA O CASO QUE NAO DA PRA RESOLVER SOZINHO
-- =========================================================================
--
-- Se a carta antiga foi coletada mas o POKE entregue por ela nao for
-- identificavel com certeza (0 candidatos, ou mais de 1), a migration NAO
-- reconcede pra esse jogador — ela avisa e passa. Reconceder ali daria dois
-- Eevees, e dois Eevees e pior que um Eevee velho.
--
-- Estado medido em producao no dia (2026-08-31): DUAS concessoes.
--
--   Vinny    carta 01:18:00, coletada 01:19:21, Eevee `c35abeb0-…`
--   Alfafis  carta 14:09:53, coletada 14:10:05, Eevee `f5b2e141-…`
--
-- Nos dois, `pokemon_instances.created_at` e IDENTICO ao `anexo_coletado_em` da
-- carta — a coleta cria o POKE na mesma transacao do claim, entao os carimbos
-- batem. `dev`: nenhuma concessao.
--
-- A segunda concessao apareceu DEPOIS de esta migration comecar a ser escrita,
-- e ela e a razao de o laco ter sido revisado: com um jogador so, o bug de
-- variavel de laco stale (ver `not found` abaixo) nunca apareceria.
--
-- Achado ao medir, e ele muda o que da pra usar como filtro: os dois POKE tem
-- `nature = 'serious'` no banco, e nao NULL — a RPC nunca gravou natureza, mas
-- o flush do cliente escreveu o default dele por cima depois. Identificar o
-- POKE por `nature is null` NAO funcionaria; `trait is null` funciona (o
-- cliente resolve a habilidade por fallback e nunca a persiste).

begin;

do $$
declare
  v_user_id uuid;
  v_carta public.mail_messages;
  v_poke_id uuid;
  v_candidatos int;
  v_trocados int := 0;
  v_reenviados int := 0;
  v_pulados int := 0;
begin
  for v_user_id in
    select user_id from public.recompensa_concedida where chave = 'eevee_do_lance'
  loop
    -- A carta do Lance com receita congelada deste jogador.
    select * into v_carta
      from public.mail_messages
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
      delete from public.mail_messages where id = v_carta.id;
      delete from public.recompensa_concedida where user_id = v_user_id and chave = 'eevee_do_lance';
      if public._conceder_eevee_do_lance(v_user_id, null::uuid) then
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
      from public.pokemon_instances
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
      from public.pokemon_instances
      where user_id = v_user_id
        and species_id = 'eevee'
        and created_at = v_carta.anexo_coletado_em
        and trait is null
        and level = coalesce((v_carta.anexo_poke->>'level')::int, 25);

    -- A carta velha SAI. Ela diz "colete abaixo" sobre um anexo que ja foi
    -- entregue e cujo POKE esta sendo revogado; deixa-la ao lado da nova, com o
    -- mesmo assunto, e duas cartas em que uma mente.
    delete from public.mail_messages where id = v_carta.id;
    delete from public.recompensa_concedida where user_id = v_user_id and chave = 'eevee_do_lance';
    if public._conceder_eevee_do_lance(v_user_id, v_poke_id) then
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
