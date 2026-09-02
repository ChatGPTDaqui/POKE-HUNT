// Qual clima esta em campo AGORA (PH-141).
//
// ---------------------------------------------------------------------------
// POR QUE ISTO PRECISA EXISTIR
// ---------------------------------------------------------------------------
// Granizo e areia tiram 1/16 do HP maximo por TURNO. Sem um lugar que diga
// "esta caindo granizo", o jogador ve o HP descendo sozinho e nao tem como
// saber por que — e a hunt dura 30 abates por sala, entao ele passa muito tempo
// nesse escuro. E a mesma classe de problema que a leitura do combate ja
// registra: dano sem canal de explicacao.
//
// O efeito visual no canvas (`render/climaVisual.ts`) e o canal bonito; ESTE e
// o canal confiavel. Ele nao depende do ajuste "vida no cenario", que desliga
// as particulas por desempenho: quem joga com o cenario limpo continua
// precisando saber que esta perdendo HP pro tempo.
//
// ---------------------------------------------------------------------------
// AMBIENTE E GOLPE SAO MOSTRADOS DIFERENTE, DE PROPOSITO
// ---------------------------------------------------------------------------
// Clima de ambiente vale a sala inteira; clima de golpe dura 10 turnos e some.
// Um jogador que acabou de usar Rain Dance precisa saber que aquilo e
// temporario — senao ele planeja a luta em cima de uma chuva que vai acabar.
import { useWorldStore } from '@/stores/worldStore'
import { Explicacao } from '@/components/shared/Explicacao'
import { cn } from '@/lib/utils'
import { formatarPrazoEmTurnos, TEXTO_DE_RITMO_CONTINUO } from '@/data/textoDeEstagioEPrazo'

import type { ClimaTipo } from '@/engine/types'

interface Aparencia {
  nome: string
  /** Emoji em vez de icone da Phosphor: clima e a unica coisa do HUD em que a
   *  forma exata (gota, floco, sol) importa mais que a consistencia do traco. */
  simbolo: string
  /** Classe de cor do texto. Casa com o filtro que o canvas aplica. */
  cor: string
  /**
   * TUDO o que este clima muda no combate, uma linha por efeito (PH-267).
   *
   * Era uma frase so, no `title` nativo do HTML. Duas coisas estavam erradas
   * ali: o `title` e hover puro (dedo nao faz hover, e o atraso de ~1s do
   * navegador esconde a informacao de quem passa o mouse rapido — e a
   * observacao da PH-165, "o clima usa o pior dos tres padroes de explicacao do
   * jogo"), e a frase cobria so o efeito principal. O granizo, por exemplo, nao
   * dizia que o Blizzard nunca erra debaixo dele.
   *
   * CADA LINHA AQUI SAI DO MOTOR, e o comentario diz de onde. Texto de efeito
   * que o jogo nao aplica e pior que texto nenhum: o jogador planeja a luta em
   * cima dele.
   */
  efeitos: string[]
}

// Fonte de cada numero abaixo, pra conferencia:
//   combatSystem.ts#CLIMA_MULTIPLICADOR_FAVORECIDO      1.5   (Agua na chuva, Fogo no sol)
//   combatSystem.ts#CLIMA_MULTIPLICADOR_DESFAVORECIDO   0.5   (o tipo oposto)
//   combatSystem.ts#NEVE_DEFESA_GELO                    1.5   (so contra golpe FISICO)
//   combatSystem.ts#NEVOA_PRECISAO                      0.6
//   combatSystem.ts#SOLAR_BEAM_SOB_CLIMA_RUIM           0.5   (todo clima que nao e sol)
//   statusSystem.ts#danoDeClimaPorTurno                 1/16 do HP maximo, minimo 1
//   abilities.ts#GOLPE_NUNCA_ERRA_NO_CLIMA / PRECISAO_DO_GOLPE_NO_CLIMA
export const APARENCIA: Record<ClimaTipo, Aparencia> = {
  chuva: {
    nome: 'Chuva', simbolo: '🌧️', cor: 'text-[#8fc4e8]',
    efeitos: [
      'Golpes de Água causam +50% de dano.',
      'Golpes de Fogo causam −50%.',
      'Thunder e Hurricane nunca erram.',
      'Solar Beam cai pela metade.',
    ],
  },
  sol: {
    nome: 'Sol forte', simbolo: '☀️', cor: 'text-[#ffc861]',
    efeitos: [
      'Golpes de Fogo causam +50% de dano.',
      'Golpes de Água causam −50%.',
      'Thunder e Hurricane caem para 50% de precisão.',
    ],
  },
  granizo: {
    nome: 'Granizo', simbolo: '🧊', cor: 'text-[#a8e4f2]',
    efeitos: [
      `Tira 1/16 do HP ${TEXTO_DE_RITMO_CONTINUO} de quem não é do tipo Gelo.`,
      'Blizzard nunca erra.',
      'Solar Beam cai pela metade.',
    ],
  },
  neve: {
    nome: 'Neve', simbolo: '❄️', cor: 'text-[#d7ecff]',
    efeitos: [
      'Não tira HP de ninguém — quem faz isso é o granizo.',
      'POKE do tipo Gelo recebe +50% de Defesa contra golpe físico.',
      'Blizzard nunca erra.',
      'Solar Beam cai pela metade.',
    ],
  },
  areia: {
    nome: 'Tempestade de areia', simbolo: '🌪️', cor: 'text-[#e0c286]',
    efeitos: [
      `Tira 1/16 do HP ${TEXTO_DE_RITMO_CONTINUO} de quem não é Pedra, Terra ou Aço.`,
      'Solar Beam cai pela metade.',
    ],
  },
  nevoa: {
    nome: 'Neblina', simbolo: '🌫️', cor: 'text-[#c3ccd4]',
    efeitos: [
      'A precisão de todos os golpes cai para 60% do normal.',
      'Solar Beam cai pela metade.',
    ],
  },
}

/** Climas que TIRAM HP por turno — os unicos que ganham destaque de alerta. */
const CLIMAS_QUE_MACHUCAM: ReadonlySet<ClimaTipo> = new Set<ClimaTipo>(['granizo', 'areia'])

interface ClimaChipProps {
  /**
   * Versao pro trilho de status (PH-285) — sem a moldura de vidro (ele ja esta
   * dentro de uma) e sem o arredondamento proprio. Mesma convencao do
   * `SalaChip`, e de proposito: os dois passam a morar lado a lado na faixa
   * central, e duas regras de aparencia pro mesmo lugar seriam duas coisas pra
   * divergir.
   */
  embutido?: boolean
  /**
   * So o simbolo, sem o nome escrito (PH-285) — o que entra no trilho de 390px.
   *
   * NAO E ESCOLHA DE ESTILO, E MEDIDA. O vao central do trilho no compacto tem
   * 73px livres (medido no aparelho com a carteira em "1B / 1M"); o chip com o
   * nome pede 88px. Ou o clima entra so como simbolo, ou ele fica de fora do
   * trilho — e ficar de fora era o defeito que esta issue existe pra corrigir:
   * ele sobrava numa fileira propria por cima do campo de jogo.
   *
   * O nome nao some do jogo: ele e a primeira linha do balao, que abre no TOQUE
   * (`Explicacao`), e o `aria-label` continua dizendo o clima por extenso pra
   * quem usa leitor de tela. Emoji sozinho como unico canal seria adivinhacao;
   * emoji com balao e o mesmo padrao dos atalhos e dos golpes.
   */
  soIcone?: boolean
}

/** @see ClimaChipProps */
export function ClimaChip({ embutido = false, soIcone = false }: ClimaChipProps = {}) {
  const clima = useWorldStore((s) => s.clima)
  // Fora de hunt (Hospital) nao ha clima, e um chip vazio pendurado no HUD
  // leria como bug — mesma regra do SalaChip.
  if (!clima) return null

  const aparencia = APARENCIA[clima.tipo]
  if (!aparencia) return null

  const deGolpe = clima.origem === 'golpe'
  const machuca = CLIMAS_QUE_MACHUCAM.has(clima.tipo)
  const turnos = deGolpe && Number.isFinite(clima.turnosRestantes)
    ? Math.max(0, Math.ceil(clima.turnosRestantes))
    : null

  return (
    // PH-267: a explicacao saiu do `title` nativo e virou `Explicacao` — o
    // mesmo mecanismo do painel Auto e das bolhas de golpe/item, que abre no
    // HOVER do mouse e no TOQUE do dedo. O `title` era hover puro (invisivel no
    // celular) e ainda esperava o atraso do navegador; a PH-165 ja registrava
    // que o clima usava o pior dos tres padroes do jogo.
    //
    // `envolve="bloco"` porque o gatilho e o chip inteiro, e nao uma palavra: o
    // `display: contents` deixa o chip com o layout que ele ja tinha.
    <Explicacao
      envolve="bloco"
      side="bottom"
      rotulo={`O que ${aparencia.nome} faz`}
      classeDoConteudo="max-w-[20em]"
      conteudo={
        <div className="flex flex-col gap-[.35em]">
          <span className={cn('font-medium', aparencia.cor)}>
            {aparencia.simbolo} {aparencia.nome}
          </span>
          <ul className="flex list-disc flex-col gap-[.2em] pl-[1.1em]">
            {aparencia.efeitos.map((efeito) => <li key={efeito}>{efeito}</li>)}
          </ul>
          {/* QUANTO AINDA DURA (PH-285), e os dois casos sao de natureza
              diferente — escrever "duracao" sem separa-los mentiria em um deles.
              O clima de AMBIENTE (PH-140) e propriedade da sala: nao tem
              contagem regressiva, e inventar um numero ali seria pior que nao
              dizer nada. O clima de GOLPE tem turnos, e o numero sai do mesmo
              `turnosRestantes` que o chip mostra — nao ha um segundo calculo
              aqui pra divergir daquele. */}
          {deGolpe ? (
            <span className="text-n400">
              {turnos != null
                // PH-422: segundos, nao turnos.
                ? `Dura mais ${formatarPrazoEmTurnos(turnos)}. `
                : ''}
              Quando acabar, o clima do lugar volta.
            </span>
          ) : (
            <span className="text-n400">Vale enquanto você estiver nesta área.</span>
          )}
        </div>
      }
    >
      <div
        className={cn(
          'flex shrink-0 cursor-help items-center gap-[.4em]',
          // No trilho a moldura ja existe em volta; repeti-la daria vidro sobre
          // vidro e um chip com cara de item solto dentro da barra.
          !embutido && 'vidro rounded-full px-[.8em] py-[.35em]',
          // So o clima que TIRA HP ganha borda de alerta. Pintar todos de
          // vermelho ensinaria o jogador a ignorar a borda — e ai o granizo
          // deixaria de avisar. No embutido ela vira so a cor do texto: uma
          // borda solta no meio do trilho leria como campo, nao como aviso.
          machuca && (embutido ? 'text-bad' : 'border border-bad/45'),
        )}
      >
        {/* No `soIcone` o simbolo deixa de ser decoracao e passa a ser o unico
            texto do chip — entao ele PERDE o `aria-hidden` e ganha o nome por
            extenso no rotulo. Sem isso o leitor de tela anunciaria um chip
            vazio no compacto. */}
        <span
          aria-hidden={soIcone ? undefined : true}
          aria-label={soIcone ? aparencia.nome : undefined}
          role={soIcone ? 'img' : undefined}
          className="text-[.85em] leading-none"
        >
          {aparencia.simbolo}
        </span>
        {!soIcone && (
          <span className={cn('text-[.75em] font-medium', aparencia.cor)}>{aparencia.nome}</span>
        )}
        {turnos != null && !soIcone && (
          // A contagem so aparece no clima de golpe. No de ambiente ela seria
          // "infinito", que nao e informacao.
          //
          // No `soIcone` ela sai: o numero sozinho ao lado de uma nuvem nao diz
          // se sao segundos, turnos ou pilhas, e escrever a unidade ali estoura os
          // 73px do vao. Quem carrega a duracao no compacto e o balao, que e
          // exatamente o canal que esta issue criou pra isso.
          //
          // PH-422: a unidade aqui e SEGUNDO. Era "turnos", e o contador do chip
          // foi o ultimo lugar de jogo a mostrar turno como prazo.
          <span className="shrink-0 text-[.68em] tabular-nums text-n500">{formatarPrazoEmTurnos(turnos)}</span>
        )}
      </div>
    </Explicacao>
  )
}
