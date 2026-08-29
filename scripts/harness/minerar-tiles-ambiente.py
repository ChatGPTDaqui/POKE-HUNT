"""Garimpa PECAS DE MAPA animadas (fogo, agua, fumaca) do acervo (PH-254).

POR QUE OLHAR TILE E NAO SO EFEITO

`minerar-props-ambiente.py` varre a categoria `effect` do .dat — o que o cliente
dispara em cima de alguem. Quase tudo ali e GOLPE: nasce, estoura e some. Chama
de fogueira que fica acesa pra sempre nao mora nessa categoria; mora no TILESET,
como objeto de mapa animado (a tocha da parede, a fogueira do chao, a agua que
ondula). Sao ~5.100 pecas animadas ja exportadas em PNG por `export_tiles.py`,
com matiz/saturacao/luz medidos em `mapas/indice_tiles.json`.

Ler PNG ja exportado e MUITO mais barato que remontar quadro do .dat: esta
varredura nao abre o banco nenhuma vez.

FORMATO DA PECA EXPORTADA
    Uma grade: uma LINHA por variacao de pattern, uma COLUNA por quadro de
    animacao. O nome diz a grade — `rubinot_i012345_32x32_v4_f8.png` e 4
    variacoes de 8 quadros. Este script le a primeira variacao nao vazia.

USO
    py scripts/harness/minerar-tiles-ambiente.py --alvo fogo
    py scripts/harness/minerar-tiles-ambiente.py --alvo agua --limite 60
"""
import argparse
import json
import os
import re

from PIL import Image, ImageDraw

PADRAO_MAPAS = r'C:\Users\Mark2\Documents\POKE\PXG_2026\objectbuilder\mapas'

# (hue_min, hue_max, sat_min, luz_min, luz_max) — hue em graus, faixa que cruza
# o zero e escrita com min > max.
ALVOS = {
    'fogo':   (10, 45, 0.45, 0.30, 1.01),
    'lava':   (0, 30, 0.55, 0.20, 0.75),
    'agua':   (170, 235, 0.20, 0.20, 1.01),
    'fumaca': (0, 360, 0.00, 0.35, 0.85),   # sat baixa e filtrada abaixo
    'verde':  (70, 160, 0.25, 0.20, 1.01),
}

ap = argparse.ArgumentParser()
ap.add_argument('--mapas', default=PADRAO_MAPAS)
ap.add_argument('--alvo', choices=sorted(ALVOS), required=True)
ap.add_argument('--quadros-min', type=int, default=4)
ap.add_argument('--classes', default='chao,topo,parede,borda')
ap.add_argument('--cob-max', type=float, default=1.01,
                help='cobertura maxima; 1.0 e piso cheio, objeto solto fica bem abaixo')
ap.add_argument('--cob-min', type=float, default=0.0)
ap.add_argument('--limite', type=int, default=64)
ap.add_argument('--out', default='scripts/harness/props-ambiente')
a = ap.parse_args()

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SAIDA = os.path.normpath(os.path.join(RAIZ, a.out))
os.makedirs(SAIDA, exist_ok=True)

indice = json.load(open(os.path.join(a.mapas, 'indice_tiles.json')))
h0, h1, smin, lmin, lmax = ALVOS[a.alvo]
classes = set(a.classes.split(','))


def no_arco(h):
    if h is None:
        return False
    if h0 <= h1:
        return h0 <= h <= h1
    return h >= h0 or h <= h1


escolhidos = []
for t in indice:
    if t['f'] < a.quadros_min or t['c'] not in classes:
        continue
    if not no_arco(t['hue']) or t['sat'] < smin:
        continue
    if not (lmin <= t['luz'] <= lmax):
        continue
    if a.alvo == 'fumaca' and t['sat'] > 0.28:
        continue
    if not (a.cob_min <= t.get('cob', 1.0) <= a.cob_max):
        continue
    escolhidos.append(t)

# Mais quadros = animacao mais rica; empate por cobertura (peca cheia antes de
# peca quase vazia, que costuma ser detalhe solto de canto).
escolhidos.sort(key=lambda t: (-t['f'], -t.get('cob', 0)))
print('pecas que passaram:', len(escolhidos))
escolhidos = escolhidos[:a.limite]

CEL = 64
COLS = 6
QUADROS_MOSTRA = 4
linhas = (len(escolhidos) + COLS - 1) // COLS
folha = Image.new('RGB', (COLS * CEL * QUADROS_MOSTRA, max(1, linhas) * (CEL + 14)), (26, 26, 32))
desenho = ImageDraw.Draw(folha)
for i, t in enumerate(escolhidos):
    img = Image.open(os.path.join(a.mapas, t['arq'].replace('/', os.sep))).convert('RGBA')
    m = re.search(r'_v(\d+)_f(\d+)\.png$', t['arq'])
    nv, nf = int(m.group(1)), int(m.group(2))
    lc, ac = img.width // nf, img.height // nv
    # Primeira variacao nao vazia: a variacao 0 as vezes e o canto transparente.
    linha = 0
    for v in range(nv):
        if img.crop((0, v * ac, img.width, (v + 1) * ac)).getbbox():
            linha = v
            break
    cx = (i % COLS) * CEL * QUADROS_MOSTRA
    cy = (i // COLS) * (CEL + 14)
    passo = max(1, nf // QUADROS_MOSTRA)
    for k in range(QUADROS_MOSTRA):
        f = min(nf - 1, k * passo)
        q = img.crop((f * lc, linha * ac, (f + 1) * lc, (linha + 1) * ac))
        q = q.resize((CEL, int(CEL * q.height / q.width)), Image.NEAREST)
        folha.paste(q, (cx + k * CEL, cy + max(0, (CEL - q.height) // 2)), q)
    desenho.text((cx + 3, cy + CEL + 1),
                 '%d %s %s %s f%d' % (i, t['p'][:6], t['id'], t['c'][:4], t['f']),
                 fill=(210, 210, 220))
nome = 'tiles-' + a.alvo
folha.save(os.path.join(SAIDA, nome + '.png'))
json.dump(escolhidos, open(os.path.join(SAIDA, nome + '.json'), 'w'), indent=1)
print('folha:', os.path.join(SAIDA, nome + '.png'))
