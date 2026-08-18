# Quantiza tira de efeito pra PNG-8 com alpha, no lugar.
#
# Por que existe: a tira sai do banco de sprites em RGBA de 32 bits, e o lote de
# 23 golpes somava 3,7 MB. Arte de efeito e feita de poucas cores saturadas com
# muita transparencia — o histograma real cabe folgado em 255 cores, e o corte
# de byte nao aparece no tamanho de jogo (o desenho tem 46px de altura).
#
# FASTOCTREE e nao MEDIANCUT porque e o unico dos dois que o Pillow aceita com
# canal alpha: MEDIANCUT descarta a transparencia, e uma tira sem alpha vira um
# retangulo opaco em cima do alvo.
#
# Idempotente: rodar de novo numa tira ja quantizada nao degrada mais (a
# paleta ja esta dentro do limite).
#
#   py scripts/quantizar-tiras-vfx.py assets/move-vfx/golpes
#   py scripts/quantizar-tiras-vfx.py assets/move-vfx/golpes --conferir
import argparse
import pathlib
import sys

from PIL import Image

CORES = 255  # 256 menos o indice reservado pra transparencia total


def quantizar(caminho: pathlib.Path, apenas_medir: bool) -> tuple[int, int]:
    antes = caminho.stat().st_size
    img = Image.open(caminho).convert("RGBA")
    saida = img.quantize(colors=CORES, method=Image.Quantize.FASTOCTREE)

    if apenas_medir:
        import io
        buf = io.BytesIO()
        saida.save(buf, format="PNG", optimize=True)
        return antes, buf.tell()

    saida.save(caminho, format="PNG", optimize=True)
    return antes, caminho.stat().st_size


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("pasta")
    p.add_argument("--conferir", action="store_true", help="so mede, nao escreve")
    args = p.parse_args()

    pasta = pathlib.Path(args.pasta)
    if not pasta.is_dir():
        print(f"pasta nao encontrada: {pasta}", file=sys.stderr)
        return 1

    total_antes = total_depois = 0
    for arq in sorted(pasta.glob("*.png")):
        antes, depois = quantizar(arq, args.conferir)
        total_antes += antes
        total_depois += depois
        corte = (1 - depois / antes) * 100 if antes else 0
        print(f"  {arq.name:22} {antes:>8} -> {depois:>8}  ({corte:5.1f}%)")

    corte = (1 - total_depois / total_antes) * 100 if total_antes else 0
    verbo = "cortaria" if args.conferir else "cortou"
    print(f"\n{verbo} {corte:.1f}%: {total_antes / 1024:.0f} KB -> {total_depois / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
