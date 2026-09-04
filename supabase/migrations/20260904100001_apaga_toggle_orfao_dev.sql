-- PH-494: apaga a chave ORFA `avancoManualDeSala` de `auto_toggles`.
--
-- O QUE ACONTECEU. A PH-493 tirou o toggle do cliente e da lista branca de
-- `configurar_auto`, e o comentario daquela migration afirmou, com todas as
-- letras, que NAO precisava de migration de dado: "a chave que sobrar fica la,
-- orfa: o cliente nao a le e a RPC nunca mais a recebe, porque o cliente nao a
-- manda".
--
-- AS DUAS METADES DAQUELA FRASE ESTAVAM ERRADAS, e o caminho de volta fechava o
-- circulo sozinho: `playerMapper` espalhava o jsonb INTEIRO dentro de
-- `autoToggles` (`{ ...defaults, ...fromJson(...) }`), a chave orfa entrava no
-- store, e `sincronizarAuto` mandava o objeto CRU de volta. A RPC recusava com
-- `raise`, que derruba a TRANSACAO INTEIRA — e nenhuma configuracao de auto era
-- gravada. Exatamente o dano da PH-492, pela porta oposta: la faltava a chave no
-- SQL, aqui sobrava a chave no cliente.
--
-- MEDIDO NO LOG DE PRODUCAO, nas ~9h entre a promocao e este arquivo:
-- **1.079 chamadas de `configurar_auto` reprovadas**, todas com
-- `toggle desconhecido: avancoManualDeSala`. Nenhum deadlock e nenhum erro de
-- flush no mesmo intervalo.
--
-- O CONSERTO DE VERDADE E NO CLIENTE (`sanearAutoToggles`, que filtra na leitura
-- e nas duas escritas). Este arquivo e a outra metade: sem ele, um cliente
-- antigo ainda em memoria continua mandando a chave ate recarregar a pagina, e
-- a linha do banco segue carregando lixo que a proxima pessoa a ler vai tentar
-- entender.
--
-- IDEMPOTENTE pelo `where ... ?`: rodar duas vezes nao toca em linha nenhuma na
-- segunda. O `-` de jsonb remove a chave e devolve o objeto sem ela.
--
-- A ESCRITA EM MASSA em `players` (a linha mais quente do banco) era o custo que
-- a PH-493 usou pra justificar nao fazer isto. O custo continua real; o que
-- mudou e o outro lado da balanca, que deixou de ser "um byte que ninguem
-- consulta" e virou toda a configuracao de automacao do jogo.

update dev.players
set auto_toggles = auto_toggles - 'avancoManualDeSala'
where auto_toggles ? 'avancoManualDeSala';
