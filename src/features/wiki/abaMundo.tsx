// A aba "Mundo" da Wiki (PH-507) — o bloco que NAO EXISTIA.
//
// ---------------------------------------------------------------------------
// POR QUE ELA E O CONSERTO MAIS URGENTE DA WIKI
// ---------------------------------------------------------------------------
// O redesenho de progressao entrou em producao em 02/09 (PH-425 a PH-442) e a
// Wiki continuou descrevendo o mundo ANTERIOR a ele. O verbete "Progredindo nas
// Hunts" falava de "faixa de nivel recomendada" (as faixas morreram na PH-425)
// e de "Novo Continente (Kanto) liberado depois do Lance" (a separacao por
// regiao acabou antes disso). O jogador que lesse a Wiki para entender a trilha
// de estagios que estava vendo na tela recebia a explicacao de outro jogo.
//
// ---------------------------------------------------------------------------
// TODO NUMERO AQUI VEM POR `import`, E ISSO E A REGRA CENTRAL DESTE ARQUIVO
// ---------------------------------------------------------------------------
// Nenhuma quantidade abaixo esta digitada no texto: `ESTAGIOS_POR_BIOMA`,
// `NIVEIS_POR_ESTAGIO`, `TETO_DO_MODO_NORMAL`, `SALAS_POR_ESTAGIO`,
// `ABATES_POR_SALA`, `ABATES_COMUNS_POR_SALA`, `ESTAGIOS_PARA_O_LANCE` e a
// contagem de `BIOMAS` sao lidas do mesmo lugar que o motor le.
//
// A Wiki JA fazia isso para `RARITIES` e `TYPE_CHART`, e foi justamente o texto
// digitado a mao que apodreceu. Rebalancear a regua agora muda a Wiki junto, de
// graca — e um numero que o `tsc` deixa de encontrar vira erro de build em vez
// de mentira em producao.
//
// O clima segue o mesmo principio por um caminho um pouco diferente: `APARENCIA`
// (de `components/hud/ClimaChip.tsx`) e a fonte da tabela de efeitos que o
// jogador ja ve no HUD, com cada linha rastreada a uma constante do
// `combatSystem`. Reescrever aqueles efeitos aqui criaria a terceira copia do
// mesmo texto.
import {
  BIOMAS, ABATES_POR_SALA, ABATES_COMUNS_POR_SALA, ESTAGIOS_PARA_O_LANCE,
} from '@/data/biomas'
import {
  ESTAGIOS_POR_BIOMA, NIVEIS_POR_ESTAGIO, TETO_DO_MODO_NORMAL,
  SALAS_POR_ESTAGIO, SALAS_POR_BIOMA, niveisDoEstagio,
} from '@/data/estagios'
import { BOSS_LEVEL, LEVEL_OFFSET, NIGHTMARE_MIN_LEVEL } from '@/data/nightmareMaps'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import { APARENCIA } from '@/components/hud/ClimaChip'
import { colorForType } from '@/data/typeColors'
import { WikiCard } from './WikiCard'

const PRIMEIRO_ESTAGIO = niveisDoEstagio(1)
const ULTIMO_ESTAGIO = niveisDoEstagio(ESTAGIOS_POR_BIOMA)
const SALAS_NO_PRIMEIRO = SALAS_POR_ESTAGIO[0]
const SALAS_NO_ULTIMO = SALAS_POR_ESTAGIO[ESTAGIOS_POR_BIOMA - 1]
const ABATES_POR_BIOMA = SALAS_POR_BIOMA * ABATES_POR_SALA

const fmt = new Intl.NumberFormat('pt-BR')

/** A regua do bioma, um degrau por linha. Dado, nao prosa. */
function TabelaDeEstagios() {
  return (
    <div className="overflow-hidden rounded-md border text-[.8em]">
      <div className="grid grid-cols-3 gap-1 border-b bg-muted/50 px-2 py-1 font-medium">
        <span>Estágio</span><span>Níveis</span><span>Salas</span>
      </div>
      {SALAS_POR_ESTAGIO.map((salas, i) => {
        const [de, ate] = niveisDoEstagio(i + 1)
        return (
          <div key={i} className="grid grid-cols-3 gap-1 border-b px-2 py-1 last:border-b-0">
            <span className="font-semibold">{i + 1}</span>
            <span>Lv {de}–{ate}</span>
            <span>{salas}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Os 12 biomas com a cor do tipo que cada um representa. */
function ListaDeBiomas() {
  return (
    <div className="flex flex-wrap gap-[.35em]">
      {BIOMAS.map((b) => (
        <span
          key={b.chave}
          className="rounded px-[.5em] py-[.15em] text-[.8em] font-medium text-white"
          style={{ background: colorForType(b.tipo) }}
        >
          {b.nome}
        </span>
      ))}
    </div>
  )
}

/** Os seis climas e TODOS os efeitos de cada um, direto do HUD. */
function TabelaDeClima() {
  return (
    <div className="flex flex-col gap-[.4em]">
      {Object.entries(APARENCIA).map(([tipo, ap]) => (
        <div key={tipo} className="rounded-md border px-2 py-1.5">
          <div className={`text-[.85em] font-medium ${ap.cor}`}>
            {ap.simbolo} {ap.nome}
          </div>
          <ul className="mt-[.2em] list-disc pl-[1.1em] text-[.8em] text-n400">
            {ap.efeitos.map((efeito) => (
              <li key={efeito}>{efeito}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function MundoTab() {
  return (
    <div className="space-y-2">
      <WikiCard title={`Os ${BIOMAS.length} biomas nascem todos abertos`}>
        O mundo são <b>{BIOMAS.length} biomas</b>, e nenhum deles é trancado atrás de outro. Você escolhe onde
        entrar desde o primeiro minuto — o que decide onde você <i>consegue</i> caçar é o nível do seu POKE,
        não uma permissão. Cada bioma é temático e concentra um tipo elemental, e é essa a razão pra ir num em
        vez de noutro: você caça onde vive a espécie que você quer.
        <div className="mt-[.5em]">
          <ListaDeBiomas />
        </div>
        <div className="mt-[.5em]">
          Dentro de cada bioma existem <b>sub-biomas</b> (Planície, Mato Alto, Leito Oceânico, Vulcão...), e é
          o sub-bioma que decide o elenco de espécies e o clima do lugar. Quanto mais fundo você vai no bioma,
          mais peso os sub-biomas raros ganham no sorteio.
        </div>
      </WikiCard>

      <WikiCard title={`Cada bioma tem ${ESTAGIOS_POR_BIOMA} estágios de ${NIVEIS_POR_ESTAGIO} níveis`}>
        A trilha de um bioma são <b>{ESTAGIOS_POR_BIOMA} estágios</b>, cada um cobrindo{' '}
        <b>{NIVEIS_POR_ESTAGIO} níveis</b>: o estágio 1 é Lv {PRIMEIRO_ESTAGIO[0]}–{PRIMEIRO_ESTAGIO[1]} e o
        estágio {ESTAGIOS_POR_BIOMA} é Lv {ULTIMO_ESTAGIO[0]}–{ULTIMO_ESTAGIO[1]}. Os dez juntos fecham o modo
        normal, que vai até o <b>Lv {TETO_DO_MODO_NORMAL}</b>.
        <br />
        <br />
        <b>Seu progresso é separado por bioma.</b> Você pode estar no estágio 7 do Marinho e no 2 do Ígneo ao
        mesmo tempo — não existe um número único de "onde eu estou no jogo". Isso é de propósito: cada bioma é
        uma trilha própria, e abandonar uma pela metade não custa nada.
        <div className="mt-[.55em]">
          <TabelaDeEstagios />
        </div>
        <div className="mt-[.5em] text-[.95em]">
          O estágio fica mais longo conforme você avança — {SALAS_NO_PRIMEIRO} salas no primeiro,{' '}
          {SALAS_NO_ULTIMO} no último. Fechar um bioma inteiro são <b>{SALAS_POR_BIOMA} salas</b> e{' '}
          <b>{fmt.format(ABATES_POR_BIOMA)} abates</b>.
        </div>
      </WikiCard>

      <WikiCard title={`A sala, e por que a barra para em ${ABATES_COMUNS_POR_SALA} de ${ABATES_POR_SALA}`}>
        Um estágio é uma sequência de <b>salas</b>, e cada sala pede <b>{ABATES_POR_SALA} abates</b> pra ser
        limpa. Mas os <b>{ABATES_COMUNS_POR_SALA} primeiros</b> são de selvagens comuns: o último é o{' '}
        <b>chefe da sala</b>.
        <br />
        <br />
        É por isso que a barra trava em {ABATES_COMUNS_POR_SALA}/{ABATES_POR_SALA} e o campo deixa de repovoar
        — não é bug nem sala travada. A cota de comuns fechou e o que falta é o chefe aparecer. Depois que ele
        cai, os selvagens comuns voltam a nascer (a sala já está decidida, e deixar o campo vazio esperando a
        troca só tiraria farm de você); abates extras não contam.
      </WikiCard>

      <WikiCard title="Guardião e Lord — os dois chefes de sala">
        Toda sala tem um chefe, e ele é de um dos dois tipos:
        <ul className="mt-[.4em] flex flex-col gap-[.3em] pl-[1.1em]" style={{ listStyleType: 'disc' }}>
          <li>
            <b>Guardião</b> — fecha as salas do meio do estágio. É a espécie incomum daquele sub-bioma.
          </li>
          <li>
            <b>Lord</b> — fecha a <b>última</b> sala do estágio, e é sorteado de um grupo mais raro que o do
            Guardião: no mesmo lugar, o Lord costuma ser um bicho diferente e mais forte.
          </li>
        </ul>
        <div className="mt-[.5em]">
          Os dois têm barra de vida grande no topo da tela — ela é do chefe de sala, e não de qualquer
          selvagem. Nos estágios mais baixos o chefe pode ser um POKE comum do lugar: uma forma final não cabe
          nos níveis do começo, e o Guardião <i>vira</i> um chefe de verdade conforme você sobe de estágio.
        </div>
      </WikiCard>

      <WikiCard title="O Lord é a chave do estágio seguinte">
        <b>Vencer o Lord fecha o estágio e libera o próximo daquele bioma.</b> É o único jeito de avançar na
        trilha — não existe atalho por nível nem por ouro.
        <br />
        <br />
        Estágio já limpo você pode repetir quando quiser, e ele <b>não repõe chefe</b>: a sala avança direto ao
        fechar a cota, o que torna estágio antigo o lugar certo pra farmar uma espécie específica sem parar num
        chefe a cada sala.
        <br />
        <br />
        Por padrão o jogo <b>repete</b> o estágio em que você está em vez de avançar sozinho ao vencer o Lord.
        Isso é escolha de desenho, não esquecimento: num jogo idle o normal é você deixar rodando no lugar que
        escolheu pela espécie que caça ali, e avançar sozinho te tiraria de lá. O interruptor{' '}
        <b>"avançar de estágio"</b> fica no painel de Automações, junto do avanço manual de sala.
      </WikiCard>

      <WikiCard title="O clima da sala">
        Cada sala tem um clima próprio, decidido pelo sub-bioma dela — e ele não é enfeite: dois dos seis{' '}
        <b>tiram vida por turno</b>, e todos mexem em dano ou precisão. O clima aparece no trilho de status,
        no topo da tela, e a mesma sala tem sempre o mesmo clima (inclusive na simulação do servidor enquanto
        você está fora).
        <div className="mt-[.55em]">
          <TabelaDeClima />
        </div>
        <div className="mt-[.5em]">
          Golpes como Rain Dance e Sunny Day também criam clima, mas o deles é <b>temporário</b> — passado o
          prazo, o clima do lugar volta. Céu limpo é um resultado como outro qualquer, e em alguns sub-biomas é
          o mais provável.
        </div>
      </WikiCard>

      <WikiCard title="O Hospital cura de graça — e desmaiar custa EXP">
        Dentro de uma caçada, o botão <b>Hospital</b> leva você à enfermeira. Clique nela e o time inteiro é
        curado por completo, <b>de graça e sem limite de vezes</b>. Não existe motivo pra gastar poção pra
        recuperar entre caçadas.
        <br />
        <br />
        O que desmaiar custa é <b>5% da EXP do nível atual</b> — não do total acumulado. Pode fazer o POKE
        perder um nível, mas ele <b>nunca de-evolui</b>: um POKE evoluído tem um piso de nível e para nele.
      </WikiCard>

      <WikiCard title="O Campeão Lance é o gate de meio de jogo">
        O Lance não é conteúdo de começo, e o critério dele é do mundo inteiro e não de um bioma: é preciso ter{' '}
        <b>limpado o estágio {ESTAGIOS_PARA_O_LANCE} de todos os {BIOMAS.length} biomas</b> pra poder
        desafiá-lo. O cartão dele na lista de hunts diz quais biomas ainda faltam.
        <br />
        <br />
        Vencê-lo entra no <b>Hall da Fama</b> (a data da primeira vitória fica registrada no ranking) e libera
        o conteúdo que estava atrás dele. Captura é desabilitada nessa luta.
      </WikiCard>

      <WikiCard title="Modo Pesadelo — o espelho de nível alto">
        Toda caçada normal tem um espelho no <b>Modo Pesadelo</b>, disponível desde o começo e sem custo. Os
        níveis são os da hunt original <b>+{LEVEL_OFFSET}</b>, com piso de <b>Lv {NIGHTMARE_MIN_LEVEL}</b> —
        então até o espelho da Rota 46 chega a {NIGHTMARE_MIN_LEVEL}. É onde o modo normal continua depois do
        Lv {TETO_DO_MODO_NORMAL}.
        <br />
        <br />
        O Pesadelo também é a única casa das <b>hunts BOSS</b>: os <b>{LEGENDARY_SPECIES_IDS.length} POKEs
        lendários</b> não aparecem em nenhuma caçada normal. Cada um é um confronto único de{' '}
        <b>Lv {BOSS_LEVEL}</b>, sem respawn, e em campo eles são desenhados maiores que o normal pra refletir
        o tamanho da luta. Morrer numa hunt BOSS é definitivo — você volta pro Hospital — e{' '}
        <b>as automações de poção e revive não agem lá</b>, qualquer que seja sua configuração.
      </WikiCard>

      <WikiCard title="O jogo continua sem você">
        Fechar a aba não pausa nada: o servidor continua simulando a caçada no lugar onde você parou e credita
        o resultado — EXP, ouro, itens, capturas — quando você voltar, num relatório. É a razão pra escolher
        bem <i>onde</i> deixar rodando antes de sair.
        <br />
        <br />
        O combate ausente é um pouco mais lento que o ao vivo, de propósito: jogar acordado sempre rende mais
        por minuto.
      </WikiCard>
    </div>
  )
}
