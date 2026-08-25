-- PH-67 — gemeo dev de `20260823010000_lock_na_coleta_de_anexo_public.sql`.
-- `coletar_anexo_correio` passa a pegar o advisory lock por usuario,
-- como as outras RPCs que escrevem em `players`.
--
-- POR QUE ELA FICOU DE FORA
--
-- A varredura original do PH-67 (20260822120100/101) cobriu as RPCs que
-- escreviam em `players` NAQUELE momento. `coletar_anexo_correio` so passou a
-- escrever em `players` HOJE, no PH-87, quando ganhou o credito de ouro —
-- antes ela mexia so em `player_items`. Entrou depois da varredura e por isso
-- nasceu sem o lock.
--
-- O RISCO CONCRETO: o credito de ouro do anexo concorre com o `flush`
-- periodico (30s) do mesmo jogador, que faz CAS em `players.updated_at`. Sem
-- serializar, e a mesma corrida que gerava `CONFLITO_ESCRITA_JOGADOR` — com o
-- agravante de que, aqui, perder a corrida faz a coleta inteira dar rollback e
-- a mensagem voltar a ficar pendente, exatamente o estado do bug que o PH-87
-- corrigiu.
--
-- Um usuario so, entao nao ha risco de deadlock: e o mesmo padrao de
-- `comprar_item`, `vender_item` e as outras 15.
--
-- AINDA FALTANDO, e deliberadamente fora desta migration: as 4 RPCs de mercado
-- (`criar_ordem_mercado`, `comprar_anuncio`, `responder_oferta`,
-- `recusar_ofertas_pendentes`) escrevem em `players` de DOIS jogadores. Travar
-- as duas pontas exige ordem deterministica por uuid, senao duas compras
-- cruzadas se deadlockam. Registrado na PH-67; nao cabe num fix de uma linha.

begin;

create or replace function dev.coletar_anexo_correio(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg dev.mail_messages;
  v_item jsonb;
  v_item_id text;
  v_quantity int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  -- PH-67: serializa contra outras escritas concorrentes em players do MESMO
  -- usuario (inclusive gravar_progresso/flush). Lock de transacao, libera
  -- sozinho no commit/rollback, sem tabela nova.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  update dev.mail_messages
    set anexo_coletado_em = now(), estado = 'lido', read_at = now()
    where id = p_mensagem_id and para_id = v_user_id
      and anexo_coletado_em is null and anexo_itens != '[]'::jsonb
    returning * into v_msg;

  if v_msg is null then
    raise exception 'Nada para coletar nesta mensagem.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_msg.anexo_itens) loop
    v_item_id := v_item->>'itemId';
    v_quantity := floor(coalesce((v_item->>'quantity')::numeric, 0));
    if v_item_id is not null and v_quantity > 0 then
      -- `gold` mora em `players.gold`, nao em `player_items` — mesma divisao
      -- que `enviar_mensagem` usa para DEBITAR. Os dois lados precisam
      -- concordar sobre onde o ouro vive; foi a discordancia que criou o
      -- PH-87.
      if v_item_id = 'gold' then
        update dev.players set gold = gold + v_quantity where user_id = v_user_id;
        -- Sem linha em `players` o credito sumiria em silencio e a coleta
        -- ainda responderia `ok`. Abortar devolve a mensagem ao estado
        -- pendente, que e recuperavel; responder ok seria perder o ouro pela
        -- segunda vez.
        if not found then
          raise exception 'jogador sem linha em players' using errcode = 'P0001';
        end if;
      else
        insert into dev.player_items (user_id, item_id, quantity)
        values (v_user_id, v_item_id, v_quantity)
        on conflict (user_id, item_id) do update
          set quantity = dev.player_items.quantity + excluded.quantity, updated_at = now();
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'itens', v_msg.anexo_itens);
end;
$$;

revoke all on function dev.coletar_anexo_correio(uuid) from public;
revoke execute on function dev.coletar_anexo_correio(uuid) from anon;
grant execute on function dev.coletar_anexo_correio(uuid) to authenticated;

commit;
