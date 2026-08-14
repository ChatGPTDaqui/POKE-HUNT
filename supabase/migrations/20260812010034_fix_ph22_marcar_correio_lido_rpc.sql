
create or replace function dev.marcar_correio_lido(p_mensagem_id uuid)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  -- PH-22: mesma exclusao ja aplicada a pedido_amizade (nao marca lido o que
  -- ainda precisa de acao) -- estendida pra anexo de item ainda nao coletado,
  -- senao a mensagem sai da contagem `naoLidas` mas o HUD (usePendenciasDoCorreio,
  -- que soma temAnexoPendente OU pendente) continua contando, badges divergem.
  update dev.mail_messages
    set estado = 'lido', read_at = now()
    where id = p_mensagem_id
      and para_id = v_user_id
      and estado = 'pendente'
      and tipo != 'pedido_amizade'
      and not (anexo_itens <> '[]'::jsonb and anexo_coletado_em is null);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function dev.marcar_correio_lido(uuid) from public;
grant execute on function dev.marcar_correio_lido(uuid) to authenticated;

-- UPDATE direto pelo client nao faz mais sentido pra essa tabela (so a RPC
-- deve escrever `estado`) -- revoga o grant de UPDATE que ativava o caminho
-- inseguro corrigido acima.
revoke update on dev.mail_messages from authenticated;
