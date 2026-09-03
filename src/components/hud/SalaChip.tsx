// Onde o jogador esta DENTRO da hunt: qual sala, qual sub-bioma, e quanto
// falta pra limpar.
//
// Some no Hospital e nas hunts sem salas (a inicial, as 11 BOSS e a do Campeao
// Lance) — nelas nao ha sala, e um chip vazio pendurado no HUD leria como bug.
//
// DOIS LUGARES, UM COMPONENTE (PH-272)
// -----------------------------------------------------------------------------
// A pedido do usuario, em tela com largura ele mora DENTRO do trilho de status,
// no vao central que ja existia vazio ali (`StatusRail`). No compacto ele
// continua na linha de chips abaixo do trilho, com o clima e o lure.
//
// Nao ha layout novo pro compacto porque nao cabe, e isso foi medido antes: o
// trilho de 390px ja empurrou o avatar do treinador pra fora da tela uma vez
// (ver o cabecalho de StatusRail.tsx), e este chip sozinho pede ~15em. Enfiar
// ele la significaria tirar outra coisa do trilho — e o que sobra la e HP,
// carteira e treinador, os tres mais urgentes que "qual sala".
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { ABATES_POR_SALA } from '@/data/biomas'
import { quantidadeDeSalas } from '@/data/estagios'
import { janelaDaSala, nomeDaSala, protetorDaSala } from '@/engine/systems/salaSystem'
import { avancarSalaManualmente } from '@/data/remote/autoridade'
import { GameButton } from '@/components/game/controls'
import { Explicacao, BolhaDoVerbete } from '@/components/shared/Explicacao'
import { verbete } from '@/data/glossario'
import type { DeviceMode } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

/**
 * O chip de sala mora no trilho neste regime? (PH-272)
 *
 * Uma funcao exportada, e nao a condicao repetida nos dois lados: `StatusRail` e
 * `HudLayer` precisam concordar, e discordar aqui significa o chip aparecendo
 * DUAS vezes na tela ou nenhuma. Nenhum dos dois casos daria erro.
 */
export function salaNoTrilho(mode: DeviceMode): boolean {
  return mode !== 'compacto'
}

/**
 * `embutido`: versao pro trilho — sem a moldura de vidro (ele ja esta dentro de
 * uma) e sem o arredondamento proprio. O conteudo e o mesmo nos dois lugares de
 * proposito: o jogador que troca de aparelho le a mesma coisa.
 */
export function SalaChip({ embutido = false }: { embutido?: boolean } = {}) {
  const sala = useWorldStore((s) => s.sala)
  const faixa = useWorldStore((s) => s.mapDef?.levelRange)
  // PH-427: quantas salas o estagio tem sai do mapId, nao de uma constante — a
  // `SalaAtiva` nao carrega o estagio dela.
  const mapId = useWorldStore((s) => s.mapDef?.id)
  const salas = quantidadeDeSalas(mapId ?? '')
  const countdown = useWorldStore((s) => s.salaCountdownRemaining)
  // PH-291: a marca vale por SALA e diz que o protetor daquela sala ja caiu.
  // Sem ela a tela nao tem como distinguir "sala pede protetor" de "protetor ja
  // resolvido", e ofereceria o avanco num estado que o servidor recusa.
  const protetorResolvido = useWorldStore((s) => s.protetorResolvido)
  // PH-386: quem decide a sala e o servidor, e o cliente so descobre no flush.
  // Sem este flag a tela nao tem como distinguir "a sala vai trocar em 3s" de
  // "a sala esta esperando resposta" — ver `esperandoAAutoridade` abaixo.
  const salaSobAutoridade = useWorldStore((s) => s.salaSobAutoridade)
  const avancoManualLigado = useGameStateStore((s) => s.autoToggles.avancoManualDeSala)
  if (!sala) return null

  const nome = nomeDaSala(sala)
  // A janela sobe com a sala: a hunt afunda conforme voce limpa. Mostrar so o
  // intervalo da HUNT (Lv1-30) esconderia justamente isso.
  const janela = faixa ? janelaDaSala(faixa, sala.indice, salas) : null
  const restantes = Math.max(0, ABATES_POR_SALA - sala.abates)
  const progresso = Math.min(1, sala.abates / ABATES_POR_SALA)
  // PH-291: a sala pede protetor e ele ainda nao caiu. Enquanto isso for
  // verdade NENHUM caminho avanca — nem o automatico, nem o manual —, e a tela
  // precisa dizer por que 30/30 nao esta avancando. `solicitarAvancoDeSala` faz
  // a mesma pergunta do lado do motor; aqui e so pra o jogador nao clicar num
  // botao que o servidor vai recusar.
  const tipoDeProtetor = protetorDaSala(sala, mapId ?? '')
  const travadaPeloProtetor = tipoDeProtetor != null && !protetorResolvido
  const quotaFechada = sala.abates >= ABATES_POR_SALA
  // PH-180: so aparece com a quota FECHADA, o toggle ligado (senao a sala ja
  // trocou sozinha) e sem transicao em andamento (o clique nao tem o que
  // fazer enquanto o overlay de "Entrando em nova area" ja esta na tela).
  const podeAvancarManual = avancoManualLigado && quotaFechada && countdown == null && !travadaPeloProtetor

  // A ESPERA PARA DE SER SILENCIOSA (PH-386).
  //
  // Este era o unico dos quatro estados de "30/30" sem nada na tela:
  //
  //   1. protetor vivo            -> "Derrote o Guardião" (PH-209/291)
  //   2. avanco manual ligado     -> botao "Próximo Nível" (PH-180)
  //   3. transicao em andamento   -> overlay "Entrando em nova área"
  //   4. esperando o servidor     -> NADA
  //
  // E o (4) nao e raro: e o caso NORMAL de toda troca de sala sob autoridade.
  // Medido em `scripts/harness/troca-de-sala-sob-autoridade.mjs`, 48 trocas em 8
  // sementes: mediana de 33,0s parado com a barra cheia, p90 de 33,0s e pior
  // caso de 243s. O piso de ~30s e o intervalo de flush — o cliente pede a
  // liquidacao na hora em que a quota fecha (`observarQuotaDeSala`), mas nessa
  // hora o servidor tipicamente ainda nao fechou a dele, e a proxima resposta
  // vem um intervalo depois.
  //
  // O jogo NAO para nesse tempo: o respawn de mob comum volta assim que o
  // protetor e resolvido, e o jogador continua matando, ganhando ouro e XP. O
  // que congela e o contador da sala — e uma barra cheia que nao anda, sem
  // explicacao nenhuma, e exatamente o relato "a sala nao esta trocando".
  //
  // `salaSobAutoridade` no predicado: no jogo local a transicao e imediata e
  // este estado nao existe. `!avancoManualLigado` porque ali quem esta sendo
  // esperado e o CLIQUE, nao o servidor — e o botao ao lado ja diz isso.
  const esperandoAAutoridade = quotaFechada
    && salaSobAutoridade
    && !travadaPeloProtetor
    && countdown == null
    && !avancoManualLigado

  // O QUE NAO CABE NO CHIP (PH-272). No trilho, `Lv X-Y` e o numero do ciclo
  // saem de cena pra o NOME do sub-bioma caber inteiro — o nome e a resposta pra
  // "onde estou", e um chip que mostra a faixa de nivel e corta "Vilarej…"
  // respondeu a pergunta errada. Os dois continuam a um passar de mouse OU a um
  // toque, na bolha; e na versao de baixo (compacto) continuam escritos.
  const detalhes = [
    `Sala ${sala.indice + 1} de ${salas}`,
    nome,
    janela ? `selvagens de Lv ${janela[0]} a ${janela[1]}` : null,
    `faltam ${restantes} de ${ABATES_POR_SALA} abates`,
    sala.ciclos > 0 ? `ciclo ${sala.ciclos + 1}` : null,
  ].filter(Boolean).join(' · ')

  return (
    // PH-165: ESTE CHIP NAO TINHA EXPLICACAO NENHUMA — era o exemplo do terceiro
    // padrao que o inventario (docs/19) descreve, "nada", e o `title=` do
    // embutido era o segundo, que nao existe no dedo. Agora ele usa a bolha do
    // projeto, como o clima ao lado (PH-267).
    //
    // A bolha tem DUAS partes, e a ordem importa: primeiro o que o chip nao
    // coube dizer (faixa de nivel, abates que faltam, ciclo), depois o CONCEITO
    // de sala — que e o que um jogador novo nao tem de onde deduzir.
    //
    // O VERBETE DO PROTETOR SO ENTRA COM A QUOTA FECHADA — o MESMO predicado do
    // aviso "Derrote o Guardiao" logo abaixo, e nao por acaso: os dois respondem
    // a mesma pergunta ("por que 30/30 nao avanca").
    //
    // A regra apertou DUAS vezes, e as duas foram medindo em 390px:
    //
    //   1. Com o verbete sempre presente, a bolha passava de 12 linhas e cobria
    //      o campo de jogo inteiro — o risco que a issue nomeia, "a bolha
    //      aparecer onde atrapalha cresce com o volume". Cada verbete respeita o
    //      limite de 1 a 3 frases; o que estoura e a SOMA, e nenhuma regra do
    //      glossario cobre isso.
    //   2. `travadaPeloProtetor` sozinho NAO cortava nada: ele e "protetor
    //      vivo", verdadeiro desde o primeiro segundo da sala. Visto na tela —
    //      sala 9 recem-entrada, 0 de 30 abates, ja ensinando a regra do Lorde.
    //
    // Com a quota fechada a informacao vira acionavel: a barra encheu, a sala
    // parou, e a bolha responde exatamente isso.
    <div
      className={cn(
        'flex items-center gap-[.6em] overflow-hidden',
        // `min-w-0` no embutido: ele vive dentro de um `flex-1` do trilho, e sem
        // isso o nome do sub-bioma nao trunca — ele empurra a carteira e o
        // avatar do treinador pra fora, que e o defeito que o trilho inteiro
        // existe pra nao ter (ver StatusRail.tsx).
        embutido ? 'min-w-0' : 'vidro rounded-full px-[.9em] py-[.35em]',
      )}
    >
    <Explicacao
      envolve="bloco"
      side="bottom"
      rotulo={`Sala ${sala.indice + 1} de ${salas}`}
      conteudo={
        <div className="flex flex-col gap-[.4em] text-left">
          <span className="font-medium text-n100">{detalhes}</span>
          <BolhaDoVerbete v={verbete('sala')} />
          {quotaFechada && travadaPeloProtetor && <BolhaDoVerbete v={verbete('protetorDaSala')} />}
        </div>
      }
    >
    {/* O GATILHO PARA ANTES DO BOTAO, de proposito: `Explicacao` abre no click, e
        com o botao "Próximo Nível" dentro dela o toque que avanca a sala abriria
        a bolha por cima do proprio avanco. O aviso "Derrote o Lorde" fica dentro
        — ele e leitura, nao acao. */}
    <div className="flex min-w-0 items-center gap-[.6em]">
      <span className="shrink-0 text-[.72em] tabular-nums text-n400">
        Sala <b className="font-medium text-n100">{sala.indice + 1}</b>/{salas}
      </span>
      <span className="min-w-0 truncate text-[.78em] font-medium text-n100">{nome}</span>
      {janela && !embutido && (
        <span className="shrink-0 text-[.7em] tabular-nums text-n500">Lv {janela[0]}-{janela[1]}</span>
      )}
      {/* Barra em vez de so o numero: e a informacao que o jogador olha de
          relance pra saber se vale esperar a proxima sala.
          `shrink-0`: no trilho ela e o primeiro item que o flex tentaria
          espremer, e barra de progresso encolhida nao diz mais nada — quem cede
          largura e o nome do sub-bioma, que trunca com reticencia legivel. */}
      <span className="relative h-[.4em] w-[4.5em] shrink-0 overflow-hidden rounded-full bg-n800">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ok transition-[width] duration-300"
          style={{ width: `${progresso * 100}%` }}
        />
      </span>
      <span className="shrink-0 text-[.7em] tabular-nums text-n500">
        {restantes} {embutido ? 'restam' : 'p/ limpar'}
      </span>
      {sala.ciclos > 0 && !embutido && (
        <span className="shrink-0 text-[.7em] tabular-nums text-n500">· ciclo {sala.ciclos + 1}</span>
      )}
      {/* PH-209/291: por que 30/30 nao avanca. Sem esta linha o jogador ve a
          barra cheia, o contador em 0 e a sala parada, sem nada explicando —
          e com o avanco manual ligado ele ainda clicava num botao que o
          servidor recusa. Aparece com ou sem o toggle: o motivo e o mesmo. */}
      {quotaFechada && travadaPeloProtetor && (
        <span className="shrink-0 text-[.7em] font-medium text-warn">
          Derrote o {tipoDeProtetor === 'lord' ? 'Lorde' : 'Guardião'}
        </span>
      )}
      {/* PH-386: ver `esperandoAAutoridade`. Cor neutra e nao `warn`: nada esta
          errado nem pede acao do jogador — a area seguinte esta a caminho, e
          enquanto ela nao chega o farm continua rendendo. */}
      {esperandoAAutoridade && (
        <span className="shrink-0 text-[.7em] font-medium text-n400">
          Preparando a próxima área...
        </span>
      )}
    </div>
    </Explicacao>
      {podeAvancarManual && (
        <GameButton
          variant="ghost"
          className="shrink-0 px-[.5em] py-[.15em] text-[.68em]"
          onClick={() => void avancarSalaManualmente()}
        >
          Próximo Nível
        </GameButton>
      )}
    </div>
  )
}
