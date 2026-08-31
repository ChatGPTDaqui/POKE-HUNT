-- PH-314 (PH-120, fatia 4): a mesa de troca entra no Realtime.
--
-- UMA TABELA SO, E ISSO NAO E ECONOMIA — E O DESENHO DA FATIA 2 PAGANDO JUROS
-- ---------------------------------------------------------------------------
-- O instinto seria publicar `troca_sessao` E `troca_oferta`, porque o que muda
-- na tela e a oferta. Nao precisa, e publicar as duas seria pior.
--
-- O trigger `troca_oferta_versao` (PH-310) ja faz um UPDATE em `troca_sessao` a
-- cada insert, update OU delete de linha de oferta — e ele existe por outro
-- motivo (subir a versao pra invalidar confirmacao velha). Ou seja: toda
-- alteracao da oferta ja produz um evento em `troca_sessao`, sem excecao,
-- inclusive a remocao em cascata.
--
-- Publicar `troca_oferta` junto traria um problema de verdade, nao so ruido: com
-- `replica identity` default, o Postgres so manda a CHAVE da linha apagada, e o
-- Realtime nao consegue avaliar a RLS de um DELETE sem o resto da linha — ele
-- descarta o evento. Pra o outro lado ver alguem TIRAR um POKE da mesa seria
-- preciso `replica identity full`, que passa a mandar a linha inteira de toda
-- escrita. Com a sessao carregando o sinal, nada disso e necessario.
--
-- O QUE O CLIENTE FAZ COM O EVENTO: refetch. Ele nao le o payload pra aplicar
-- diff — a mesa e pequena e a leitura ja passa por RLS. Ler o payload
-- significaria confiar num estado que chegou por fora do caminho de leitura
-- normal, e a fatia 3 depende da `versao` estar certa.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'troca_sessao'
  ) then
    alter publication supabase_realtime add table public.troca_sessao;
  end if;
end;
$$;
