-- chat_messages: leitura publica (chat de mundo, sem dono), escrita so na propria linha
create policy "chat leitura publica" on dev.chat_messages
  for select to authenticated using (true);

create policy "chat insere propria mensagem" on dev.chat_messages
  for insert to authenticated with check (
    auth.uid() = user_id
    and not exists (
      select 1 from dev.chat_messages m2
      where m2.user_id = auth.uid()
        and m2.created_at > now() - interval '1200 milliseconds'
    )
  );

-- mail_messages: leitura/atualizacao so das proprias mensagens.
-- anexo_coletado_em fica FORA do grant de update -- so a RPC coletar_anexo_correio
-- (passo #10 do plano) pode tocar essa coluna, senao quebra o claim atomico.
create policy "correio leitura propria" on dev.mail_messages
  for select to authenticated using (para_id = auth.uid());

create policy "correio marca lida propria" on dev.mail_messages
  for update to authenticated
  using (para_id = auth.uid())
  with check (para_id = auth.uid());

grant select on dev.mail_messages to authenticated;
grant select, insert on dev.chat_messages to authenticated;
grant update (estado, read_at) on dev.mail_messages to authenticated;
