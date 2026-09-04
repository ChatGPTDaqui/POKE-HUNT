// A aba "Jogadores" da Wiki (PH-507) — tudo que envolve outra pessoa.
//
// COBERTURA QUE NAO EXISTIA. Mercado, Troca, Social, amizades, chat, Ranking e
// Hall da Fama nao tinham uma linha na Wiki. O Mercado e a MAIOR superficie de
// UI do jogo (11 arquivos, medido em `docs/19`) e a unica mencao a ele em toda a
// Wiki era uma linha na lista de icones do menu.
//
// ISSO IMPORTA MAIS AQUI QUE NAS OUTRAS ABAS, e por um motivo que nao e de
// completude: as regras do mercado envolvem o OURO DO JOGADOR saindo do bolso
// dele antes de a negociacao fechar (escrow). Quem nao sabe disso ve o saldo
// cair ao criar uma ordem e conclui que perdeu dinheiro. Explicar escrow nao e
// enfeite — e a diferenca entre uma mecanica e um bug aparente.
//
// SEM NUMERO DE ANTI-ABUSO AQUI. `docs/` e privado de proposito e documenta os
// limiares do servidor (janela de claim, amostra minima do piso); a Wiki e
// PUBLICA — ela vai no bundle do cliente. O que entra aqui e a regra que o
// jogador precisa pra jogar, nunca o numero que ele precisaria pra burlar.
import { WikiCard } from './WikiCard'

export function JogadoresTab() {
  return (
    <div className="space-y-2">
      <WikiCard title="O Mercado tem dois modelos, e a diferença é o que se negocia">
        Item e POKE não são a mesma coisa, então o Mercado trata os dois de formas diferentes:
        <ul className="mt-[.4em] flex flex-col gap-[.35em] pl-[1.1em]" style={{ listStyleType: 'disc' }}>
          <li>
            <b>Item — livro de ofertas.</b> Uma Poke Ball é igual a outra, então existe "melhor preço" e as
            filas de compra e venda se cruzam. <b>Quem executa paga o preço da ordem que já estava no
            livro</b>, nunca o seu: se você compra com limite alto e existe venda mais barata, você paga a mais
            barata e recebe o troco na hora.
          </li>
          <li>
            <b>POKE — anúncio de preço fixo.</b> Cada POKE é único (IV, raridade, shiny, nível), e não existe
            "melhor preço" entre coisas diferentes. Você anuncia por um valor, em ouro ou diamante, e quem
            quiser paga aquilo.
          </li>
        </ul>
      </WikiCard>

      <WikiCard title="Anunciar tira do seu inventário AGORA — e isso não é bug">
        Criar ordem de venda tira o item da sua Mochila na hora. Criar ordem de compra tira o ouro na hora.
        Anunciar um POKE faz ele <b>sair da Mochila e da Equipe</b> — ele não aparece mais na Loja e não pode
        ser vendido pro sistema enquanto está anunciado.
        <br />
        <br />
        Isso se chama <b>escrow</b>, e é o que impede duas ordens de venda do mesmo estoque venderem o dobro do
        que existe — ou dez ofertas com o mesmo ouro serem todas aceitas. <b>Cancelar devolve tudo</b>, por
        qualquer caminho de saída: cancelamento, recusa, expiração.
      </WikiCard>

      <WikiCard title="Modo Somente Lance">
        Um anúncio de POKE pode subir <b>sem preço</b>, aceitando só lances. Quem se interessa manda uma
        oferta, e o valor dela sai do bolso do ofertante <b>na hora</b> — mesmo escrow do resto.
        <br />
        <br />
        Você pode ter <b>uma oferta pendente por anúncio</b>: mandar outra <b>substitui</b> a anterior em vez
        de empilhar. Se você tentar e receber um aviso, é isso — não é falha.
      </WikiCard>

      <WikiCard title="Troca — cara a cara, com confirmação dos dois lados">
        Além do Mercado existe a <b>Troca direta</b>: você convida outro jogador (pelo Ranking, pelo perfil ou
        pelo chat), os dois põem o que vão dar na mesa, e a troca só acontece quando <b>os dois confirmam</b>.
        Mexer na mesa depois de confirmar derruba a confirmação — de propósito, pra ninguém trocar o conteúdo
        no último segundo.
      </WikiCard>

      <WikiCard title="Social — mensagens e amizades">
        A tela <b>Social</b> é o lugar único pra olhar quando alguém interage com você: um fio de conversa por
        contato, com quem está online e o painel de amigos. Pedido de amizade chega como{' '}
        <b>mensagem com dois botões</b>, e não numa tela separada de pedidos.
        <br />
        <br />
        Mensagem pode vir com <b>item anexado</b>, e a coleta é <b>explícita</b>: você clica pra receber. Não é
        esquecimento — item caindo no inventário em silêncio é indistinguível de save mudando sozinho. E
        mensagem com anexo não coletado <b>não deixa ser excluída</b> antes de você pegar o que veio.
      </WikiCard>

      <WikiCard title="Chat Mundo">
        Um canal só, para todos os jogadores, em tempo real. Dá pra <b>anexar um POKE seu</b> na mensagem, e o
        que vai é um <b>retrato</b> dele — os atributos do momento em que você postou. Se ele evoluir, subir de
        nível ou for vendido depois, a mensagem antiga continua mostrando como ele era, e isso é intencional:
        um link vivo mostraria outro bicho para quem rolasse o histórico.
      </WikiCard>

      <WikiCard title="Ranking, Perfil e Hall da Fama">
        <b>Ranking</b> tem três frentes: <b>Treinadores</b>, <b>Pokémon</b> (por vários critérios, não só um
        placar geral) e o <b>Hall da Fama</b>. Tudo vem do servidor — seu jogo só enxerga o próprio save, e é
        por isso que a tela precisa de conexão pra mostrar algo.
        <br />
        <br />
        Do Ranking você chega ao <b>perfil público</b> de qualquer jogador, e de lá pode <b>pedir amizade</b> ou{' '}
        <b>convidar pra trocar</b> — é o caminho normal de achar com quem negociar.
        <br />
        <br />
        <b>Hall da Fama</b> registra quem venceu o Campeão Lance e <b>quando</b>. A data guardada é sempre a da
        primeira vitória: vencer de novo não reescreve nada.
      </WikiCard>

      <WikiCard title="Seu nome de treinador é único">
        Não existem dois treinadores com o mesmo nome no jogo. Ele é o que aparece no Ranking, no chat, no
        Social e nos seus anúncios do Mercado — é sua identidade pública, e é por ela que outro jogador te
        acha.
      </WikiCard>
    </div>
  )
}
