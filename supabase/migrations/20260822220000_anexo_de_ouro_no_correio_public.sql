-- PH-87 — anexo de OURO no correio deixa de ser destruido na coleta.
--
-- ===========================================================================
-- O DEFEITO: METADE DO CAMINHO ESTAVA IMPLEMENTADA
-- ===========================================================================
-- `enviar_mensagem` sempre tratou `gold` como caso especial e debitou de
-- `players.gold` (ouro nao e linha de `items`, entao nao cabe em
-- `player_items`). `coletar_anexo_correio` nunca teve o caso simetrico: ela
-- insere TODO anexo em `player_items`, que tem FK para `items`.
--
-- O resultado nao era um erro visivel e recuperavel, era perda de moeda:
--
--   23503: insert or update on table "player_items" violates foreign key
--   constraint "player_items_item_id_fkey"
--   Key (item_id)=(gold) is not present in table "items".
--
-- Como a coleta inteira faz rollback, `anexo_coletado_em` tambem volta atras —
-- a mensagem fica pendente e a coleta falha DE NOVO em toda tentativa, para
-- sempre. Mas o debito do remetente foi commitado numa transacao anterior, uma
-- que nao volta atras. O ouro sai do jogo.
--
-- Medido ao vivo em 2026-08-22 (schema `dev`): 777 de ouro, remetente
-- -777 commitado, destinatario +0, `anexosPendentes: 1` permanente.
--
-- ===========================================================================
-- POR QUE NAO HA BACKFILL AQUI
-- ===========================================================================
-- Contagem exata por `Content-Range` com service role em 2026-08-22, ANTES
-- desta migration: `public` tem ZERO mensagens com anexo por coletar, e `dev`
-- tem UMA — a do teste que encontrou o bug. A tela de compor monta os anexos a
-- partir do inventario e nunca ofereceu ouro, entao nenhum jogador chegou a
-- mandar.
--
-- E como o defeito impedia `anexo_coletado_em` de gravar, a mensagem presa
-- continua PENDENTE e volta a ser coletavel sozinha assim que esta funcao for
-- corrigida: o ouro chega ao destinatario pelo caminho normal, ele clica em
-- coletar. Um UPDATE de moeda dentro de migration seria escrever no saldo de
-- jogador para resolver um caso que o fluxo normal ja resolve — risco sem
-- ganho.

begin;

create or replace function public.coletar_anexo_correio(p_mensagem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_msg public.mail_messages;
  v_item jsonb;
  v_item_id text;
  v_quantity int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  update public.mail_messages
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
      -- concordar sobre onde o ouro vive; foi a discordancia que criou o bug.
      if v_item_id = 'gold' then
        update public.players set gold = gold + v_quantity where user_id = v_user_id;
        -- Sem linha em `players` o credito sumiria em silencio e a coleta
        -- ainda responderia `ok`. Abortar devolve a mensagem ao estado
        -- pendente, que e recuperavel; responder ok seria perder o ouro pela
        -- segunda vez.
        if not found then
          raise exception 'jogador sem linha em players' using errcode = 'P0001';
        end if;
      else
        insert into public.player_items (user_id, item_id, quantity)
        values (v_user_id, v_item_id, v_quantity)
        on conflict (user_id, item_id) do update
          set quantity = public.player_items.quantity + excluded.quantity, updated_at = now();
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'itens', v_msg.anexo_itens);
end;
$$;

revoke all on function public.coletar_anexo_correio(uuid) from public;
revoke execute on function public.coletar_anexo_correio(uuid) from anon;
grant execute on function public.coletar_anexo_correio(uuid) to authenticated;

commit;
