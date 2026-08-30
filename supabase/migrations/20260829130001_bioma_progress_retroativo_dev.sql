-- PH-284 (dado, espelho do schema dev): credita retroativamente `players.bioma_progress` a quem ja
-- fechou ciclo de 10 salas enquanto a RPC `gravar_progresso` descartava a
-- coluna (ver 20260829120001_gravar_progresso_grava_bioma_progress_dev.sql).
--
-- QUAL E A PROVA DE QUE O JOGADOR FECHOU O CICLO
--
-- `game_sessions.ciclos`. Ele so incrementa em `armarTransicaoDeSala`
-- (src/engine/systems/salaSystem.ts) quando `sala.indice + 1 >= SALAS_POR_HUNT`,
-- e a sala 10 e a unica que `registrarAbate` se RECUSA a avancar por conta
-- propria — quem arma a transicao ali e `resolverProtetorDaSala`, chamado so
-- depois que o Lord cai. Entao `ciclos >= 1` num `map_id` de bioma significa
-- "o Lord daquele bioma foi vencido pelo menos uma vez".
--
-- A coluna sobrevive ao fim da sessao (linha fechada mantem `ciclos`), entao a
-- varredura pega tambem quem fechou o ciclo em sessao ja encerrada — que e a
-- maioria dos casos, ja que sair da hunt fecha a sessao.
--
-- RESSALVA ASSUMIDA: sessoes anteriores a 20260828130000 (PH-202, quando o
-- protetor passou a existir) rolaram ciclo SEM Lord nenhum, porque nao havia
-- Lord. Elas sao creditadas do mesmo jeito. E deliberado: o criterio que o
-- jogador conhecia na epoca era "fechar as 10 salas", e ele fechou. Punir quem
-- jogou antes da feature existir seria pior que liberar um bioma a mais.
--
-- IDEMPOTENTE por construcao: o indice so SOBE, e sobe ate onde a evidencia
-- alcanca. Rodar de novo com os mesmos dados nao muda nada (a condicao do
-- `while` para no mesmo lugar), e o UPDATE so acontece quando o jsonb final
-- difere do atual — entao nem `updated_at` e tocado a toa.
--
-- A ORDEM E A CANONICA de `ORDEM_DOS_BIOMAS` (src/data/biomas.ts), COPIADA e
-- nao derivada — nao existe essa tabela no banco. Ela e conferida contra o TS
-- por src/data/biomaProgressRetroativo.test.ts, que reprova o CI se as duas
-- listas divergirem.
--
-- O avanco e CONTIGUO de proposito: parar no primeiro bioma sem evidencia
-- espelha o gate (PH-227), que nunca deixaria o jogador entrar no bioma N+2
-- sem ter vencido o N+1. Creditar um buraco produziria um estado que o proprio
-- gate considera impossivel.
--
-- Um flush em voo no instante desta migration pode bater 409 no CAS de
-- `gravar_progresso` (o UPDATE aqui avanca `updated_at` pelo trigger
-- `players_set_updated_at`). E o comportamento normal de concorrencia dessa
-- rota e `authority` ja repete a operacao — ver `comCasDoJogador` em
-- authority/src/progresso.ts.
do $$
declare
  v_ordem constant text[] := array[
    'campo_aberto', 'subterraneo', 'marinho', 'industrial', 'mata', 'aguas_interiores',
    'urbano', 'gelido', 'aridos', 'sagrado', 'sombrio', 'igneo'
  ];
  v_faixas constant text[] := array['faixa1', 'faixa2', 'faixa3'];
  v_jogador record;
  v_faixa text;
  v_indice int;
  v_novo jsonb;
begin
  for v_jogador in select user_id, bioma_progress from dev.players loop
    v_novo := coalesce(v_jogador.bioma_progress, '{"faixa1": 0, "faixa2": 0, "faixa3": 0}'::jsonb);

    foreach v_faixa in array v_faixas loop
      v_indice := coalesce((v_novo->>v_faixa)::int, 0);

      while v_indice < array_length(v_ordem, 1) and exists (
        select 1 from dev.game_sessions gs
        where gs.user_id = v_jogador.user_id
          and gs.map_id = v_ordem[v_indice + 1] || '_' || v_faixa
          and gs.ciclos >= 1
      ) loop
        v_indice := v_indice + 1;
      end loop;

      v_novo := jsonb_set(v_novo, array[v_faixa], to_jsonb(v_indice));
    end loop;

    if v_novo is distinct from v_jogador.bioma_progress then
      update dev.players set bioma_progress = v_novo where user_id = v_jogador.user_id;
    end if;
  end loop;
end $$;
