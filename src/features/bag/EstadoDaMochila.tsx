import { useMochilaStore } from '@/stores/mochilaStore'

/**
 * O que aparece no lugar da lista enquanto a mochila nao chegou — ou quando ela
 * falhou.
 *
 * Existe como componente unico porque sao TRES telas lendo a mesma lista
 * (Mochila, Loja, Mercado) e a mensagem errada aqui e uma mentira silenciosa:
 * "Nenhum POKE na mochila" numa conta de 5 mil POKEs faria o jogador achar que
 * perdeu tudo. Devolve `null` quando ha lista pra mostrar.
 */
export function EstadoDaMochila(): React.ReactElement | null {
  const carregada = useMochilaStore((s) => s.carregada)
  const carregando = useMochilaStore((s) => s.carregando)
  const erro = useMochilaStore((s) => s.erro)
  const carregar = useMochilaStore((s) => s.carregar)

  if (carregada) return null

  if (erro) {
    return (
      <div className="flex flex-col items-start gap-[.4em] text-[.8em] text-red-300">
        <p>Não foi possível carregar a mochila: {erro}</p>
        <button
          type="button"
          className="underline"
          onClick={() => { useMochilaStore.setState({ erro: null }); void carregar() }}
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  return <p className="text-n500">{carregando ? 'Carregando a mochila…' : 'Mochila não carregada.'}</p>
}
