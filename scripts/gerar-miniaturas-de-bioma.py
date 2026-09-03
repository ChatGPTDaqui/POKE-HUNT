# Miniatura quadrada da arte de cada bioma, para o seletor de biomas (PH-469).
#
# POR QUE ISTO EXISTE. `assets/biome-selector/<chave>.jpg` sao 12 fotos de 2048px,
# 2,8 a 4,0 MB cada, 39 MB no total. Elas foram trazidas na PH-441 para ser o
# FUNDO da trilha, onde uma delas por vez ocupa a tela inteira e o peso se paga.
# O seletor de bioma desenha as DOZE ao mesmo tempo, num icone de ~2em: apontar
# o `<img>` para a arte original faria a tela de 12 cartoes baixar 39 MB para
# preencher 12 quadradinhos de 32px. Isso nao e "arte na tela", e regressao de
# carga.
#
# 256px de lado cobre 32px em tela com folga de 4x para monitor de alta densidade
# e para o cartao crescer. WebP porque a economia contra JPEG na mesma qualidade
# percebida e de ~30% e todo navegador que roda o jogo o suporta.
#
# RECORTE CENTRAL, e nao redimensionamento simples: as 12 artes sao 1:1 ou
# proximas disso, mas nao identicas, e esticar cada uma para o quadrado do icone
# deformaria o horizonte de umas e nao de outras. O recorte central pega o
# assunto da foto em todas.
#
# Uso:  py scripts/gerar-miniaturas-de-bioma.py
#
# Idempotente: rodar duas vezes reescreve os mesmos 12 arquivos com os mesmos
# bytes (PIL e deterministico para este caminho). Ver a nota de
# `quantizar-tiras-vfx.py`, que se declarava idempotente e nao era — aqui a
# entrada nunca e a propria saida, entao nao ha reprocessamento em cascata.
import sys
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / 'assets' / 'biome-selector'
DESTINO = ORIGEM / 'mini'
LADO = 256
QUALIDADE = 82


def recorte_central_quadrado(img: Image.Image) -> Image.Image:
    lado = min(img.width, img.height)
    esq = (img.width - lado) // 2
    topo = (img.height - lado) // 2
    return img.crop((esq, topo, esq + lado, topo + lado))


def main() -> int:
    if not ORIGEM.is_dir():
        print(f'ERRO: {ORIGEM} nao existe', file=sys.stderr)
        return 1
    DESTINO.mkdir(parents=True, exist_ok=True)

    origens = sorted(ORIGEM.glob('*.jpg'))
    if not origens:
        print(f'ERRO: nenhum .jpg em {ORIGEM}', file=sys.stderr)
        return 1

    total_entrada = 0
    total_saida = 0
    for caminho in origens:
        destino = DESTINO / f'{caminho.stem}.webp'
        with Image.open(caminho) as img:
            quadrado = recorte_central_quadrado(img.convert('RGB'))
            mini = quadrado.resize((LADO, LADO), Image.LANCZOS)
            mini.save(destino, 'WEBP', quality=QUALIDADE, method=6)
        entrada = caminho.stat().st_size
        saida = destino.stat().st_size
        total_entrada += entrada
        total_saida += saida
        print(f'{caminho.name:>24} {entrada / 1024:>8.0f} KB  ->  {destino.name:<24} {saida / 1024:>6.1f} KB')

    print(f'\n{len(origens)} miniaturas: {total_entrada / 1024 / 1024:.1f} MB -> {total_saida / 1024:.0f} KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
