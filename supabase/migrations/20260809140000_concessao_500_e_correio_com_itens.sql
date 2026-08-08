-- 1) Concessao inicial passa a ser 500 Poke Ball, 500 Potion e 50 Revive.
-- 2) O Correio ganha ANEXO DE ITENS, com coleta explicita pelo jogador.
-- 3) Todo jogador que ja existe recebe a mesma concessao por Correio.
--
-- Os tres andam juntos de proposito: o item 3 e a compensacao do item 1 para
-- quem criou a conta antes, e ele so e possivel por causa do item 2.

-- ---------------------------------------------------------------------------
-- 1. Concessao inicial
-- ---------------------------------------------------------------------------
-- So a funcao muda: `handle_new_user` (conta nova), `wipe_todos_os_saves`
-- (reset total) e `wipe_inventario_e_economia` (reset parcial) ja leem daqui.
--
-- Conta que JA existe continua intocada por esta funcao — quem joga ha semanas
-- nao pode ter o inventario regravado. A compensacao dela vem pelo Correio, no
-- passo 3.
create or replace function public.concessao_inicial_de_itens()
returns table (item_id text, quantity int)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('poke_ball', 500),
    ('potion',    500),
    ('revive',     50)
  ) as concessao(item_id, quantity)
$$;

revoke all on function public.concessao_inicial_de_itens() from public;
revoke all on function public.concessao_inicial_de_itens() from anon;
revoke all on function public.concessao_inicial_de_itens() from authenticated;
grant execute on function public.concessao_inicial_de_itens() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Anexo de itens no Correio
-- ---------------------------------------------------------------------------
-- `anexo_itens` guarda `[{"itemId":"potion","quantity":500}, ...]`.
--
-- POR QUE A COLETA E EXPLICITA (e nao um credito automatico como
-- `market_deliveries`): o Mercado credita o vendedor que estava offline, e ali
-- nao existe nada pra ele decidir. Aqui o jogador PRECISA ver o que chegou —
-- uma compensacao que caisse no inventario em silencio seria indistinguivel de
-- bug ("meu save mudou sozinho"). O botao e a mensagem.
--
-- `anexo_coletado_em` (e nao um booleano) porque a coluna e o que torna o claim
-- ATOMICO: `update ... where anexo_coletado_em is null returning` nao encontra
-- linha na segunda vez, entao dois requests simultaneos do mesmo jogador nao
-- coletam o mesmo anexo duas vezes. Mesma tecnica de `market_deliveries`.
alter table public.mail_messages
  add column if not exists anexo_itens jsonb not null default '[]'::jsonb,
  add column if not exists anexo_coletado_em timestamptz;

create index if not exists mail_messages_anexo_pendente_idx
  on public.mail_messages (para_id)
  where anexo_coletado_em is null and anexo_itens <> '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Concessao retroativa por Correio
-- ---------------------------------------------------------------------------
-- Um jogador = uma mensagem. O `not exists` pelo assunto e a trava de
-- reenvio: se esta migration for aplicada de novo (ou alguem rodar o bloco a
-- mao), ninguem recebe em dobro. Uma coluna `motivo` seria mais limpa, mas
-- exigiria indice novo pra uma rotina que roda uma vez.
--
-- `de_id` fica NULL e `de_nome` e o remetente do sistema: nao ha jogador por
-- tras disso, e apontar pra um usuario real faria a mensagem aparecer como se
-- alguem tivesse mandado.
insert into public.mail_messages (para_id, de_id, de_nome, tipo, assunto, corpo, anexo_itens)
select
  p.user_id,
  null,
  'Centro Pokemon',
  'sistema',
  'Reposicao de suprimentos',
  'Todo treinador novo passou a comecar com 500 Poke Ball, 500 Potion e 50 Revive. '
    || 'Como voce comecou antes dessa mudanca, a mesma quantidade esta anexada aqui. Colete abaixo.',
  '[{"itemId":"poke_ball","quantity":500},{"itemId":"potion","quantity":500},{"itemId":"revive","quantity":50}]'::jsonb
from public.players p
where not exists (
  select 1 from public.mail_messages m
  where m.para_id = p.user_id
    and m.tipo = 'sistema'
    and m.assunto = 'Reposicao de suprimentos'
);
