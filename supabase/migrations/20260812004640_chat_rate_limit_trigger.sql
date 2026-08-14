
create or replace function dev.chat_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = dev, public
as $$
declare
  v_ultima timestamptz;
begin
  -- Serializa por user_id: SELECT...FOR UPDATE na "ultima mensagem" nao
  -- funciona aqui (trava a linha antiga, nao a nova sendo inserida -- uma
  -- segunda transacao concorrente destrava vendo a MESMA linha antiga, nao a
  -- que acabou de commitar). Advisory lock trava o USUARIO inteiro pela
  -- duracao da transacao: a segunda soh roda depois que a primeira commitou.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select max(created_at) into v_ultima from dev.chat_messages where user_id = new.user_id;
  if v_ultima is not null and now() - v_ultima < interval '1200 milliseconds' then
    raise exception 'Aguarde um instante antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_rate_limit_trigger on dev.chat_messages;
create trigger chat_rate_limit_trigger
  before insert on dev.chat_messages
  for each row execute function dev.chat_rate_limit();
