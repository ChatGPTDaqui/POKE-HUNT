"""Confere CADA ancora de prop em cima da propria arte (PH-254).

POR QUE ISTO EXISTE

`ancorasDeAmbiente.ts` guarda 200+ pares (u, v) escritos a mao. Nenhum teste
consegue dizer se o par esta CERTO: o teste garante que a arte existe, que a
fracao esta em [0,1] e que a conversao pro mundo cai dentro do retangulo — e
nada disso distingue "a fumaca sai da chamine" de "a fumaca sai do telhado ao
lado". Isso e uma pergunta de imagem, e so imagem responde.

Esta bancada desenha, sobre a arte, o que cada ancora vai virar: a chama no
tamanho de jogo pras de fogo, um circulo de brilho pras de luz, uma seta de
subida pras plumas, um anel pras de agua. Um par errado aparece na hora.

O tamanho e o do JOGO (mesma conta de `provar-props-no-fundo.py`): unidade de
mundo = pixel da arte * 0,8, e o que se ve na tela e isso vezes o zoom de 1,5.
Marcador desenhado maior que o prop mentiria justamente onde a duvida esta.

SAIDA
    scripts/harness/ancoras-mapa/<arte>.png — nao commitada, e material de
    conferencia.

USO
    py scripts/harness/mapa-de-ancoras.py
    py scripts/harness/mapa-de-ancoras.py --artes volcano,slum --largura 1400
"""
import argparse
import os
import re

from PIL import Image, ImageDraw

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
FUNDOS = os.path.join(RAIZ, 'assets', 'hunt-backgrounds')
TABELA = os.path.join(RAIZ, 'src', 'data', 'ancorasDeAmbiente.ts')
CHAMA = os.path.join(RAIZ, 'assets', 'ambiente-props', 'chama.png')
QUADROS_DA_CHAMA = 9

ESCALA_ARTE = 0.8
ALTURA_DE_POKE = 40

# Espelha `TAMANHO` de `src/render/ambienteProps.ts`, em unidades de mundo. Duas
# copias do mesmo numero e ruim, e a alternativa (fazer o script importar TS)
# e pior; o que segura e o teste `ambienteProps.test.ts` afirmar a lista de
# tipos — tipo novo sem entrada aqui aparece como marcador cinza padrao.
TAMANHO = {
    'fogueira': 0.70, 'tocha': 0.38, 'chamine': 1.50, 'fumarola': 1.25, 'gas': 0.85,
    'orbe': 0.45, 'cascata': 0.75, 'correnteza': 0.45, 'quebraMar': 1.10,
    'eletrica': 0.50, 'vagalume': 1.15, 'petala': 1.50,
}
COR = {
    'fogueira': (255, 176, 87), 'tocha': (255, 192, 106), 'chamine': (141, 139, 134),
    'fumarola': (232, 240, 244), 'gas': (169, 208, 106), 'orbe': (255, 213, 138),
    'cascata': (242, 251, 255), 'correnteza': (234, 248, 255), 'quebraMar': (255, 255, 255),
    'eletrica': (255, 242, 168), 'vagalume': (255, 226, 122), 'petala': (255, 194, 221),
}

ap = argparse.ArgumentParser()
ap.add_argument('--artes', default='')
ap.add_argument('--largura', type=int, default=1200)
ap.add_argument('--out', default='scripts/harness/ancoras-mapa')
a = ap.parse_args()

SAIDA = os.path.join(RAIZ, a.out)
os.makedirs(SAIDA, exist_ok=True)

fonte = open(TABELA, encoding='utf-8').read()
# Um bloco por arte: a chave e o caminho, o corpo vai ate o `],` daquele nivel.
blocos = re.findall(r"'(assets/hunt-backgrounds/[^']+)':\s*\[(.*?)\n  \],", fonte, re.S)
if not blocos:
    raise SystemExit('nao achei ancora nenhuma — o formato da tabela mudou?')

chama = Image.open(CHAMA).convert('RGBA')
lq = chama.width // QUADROS_DA_CHAMA
quadro_da_chama = chama.crop((lq * 4, 0, lq * 5, chama.height))

pedidas = set(x for x in a.artes.split(',') if x)
for caminho, corpo in blocos:
    base = os.path.splitext(os.path.basename(caminho))[0]
    if pedidas and base not in pedidas:
        continue
    arq = os.path.join(RAIZ, caminho)
    if not os.path.exists(arq):
        print('SEM ARTE:', caminho)
        continue
    img = Image.open(arq).convert('RGB')
    fator = a.largura / img.width
    img = img.resize((a.largura, int(img.height * fator)), Image.LANCZOS)
    d = ImageDraw.Draw(img, 'RGBA')

    ancoras = re.findall(r'\{\s*u:\s*([\d.]+),\s*v:\s*([\d.]+),\s*tipo:\s*\'(\w+)\'([^}]*)\}', corpo)
    for u, v, tipo, resto in ancoras:
        u, v = float(u), float(v)
        m = re.search(r'escala:\s*([\d.]+)', resto)
        escala = float(m.group(1)) if m else 1.0
        # unidade de mundo -> pixel da arte -> pixel desta imagem reduzida
        px_de_prop = TAMANHO.get(tipo, 0.5) * ALTURA_DE_POKE / ESCALA_ARTE * escala * fator
        x = u * img.width
        y = v * img.height
        cor = COR.get(tipo, (200, 200, 200))
        if tipo in ('fogueira', 'tocha'):
            alt = max(4, int(px_de_prop))
            larg = max(3, int(alt * quadro_da_chama.width / quadro_da_chama.height))
            q = quadro_da_chama.resize((larg, alt), Image.LANCZOS)
            img.paste(q, (int(x - larg / 2), int(y - alt)), q)
        elif tipo in ('chamine', 'fumarola', 'gas'):
            # A pluma sobe: a barra mostra ATE onde, que e o que decide se ela
            # some atras do telhado ou passa por cima dele.
            d.line([(x, y), (x, y - px_de_prop)], fill=cor + (200,), width=3)
            d.ellipse([x - 5, y - px_de_prop - 5, x + 5, y - px_de_prop + 5], fill=cor + (160,))
        elif tipo == 'orbe':
            r = max(3, px_de_prop)
            d.ellipse([x - r, y - r, x + r, y + r], outline=cor + (230,), width=3)
        else:
            r = max(3, px_de_prop)
            d.ellipse([x - r, y - r * 0.4, x + r, y + r * 0.4], outline=cor + (230,), width=3)
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 0, 255, 255))
        d.text((x + 4, y + 3), tipo, fill=cor + (255,))

    # Silhueta de POKE: o marcador so significa alguma coisa comparado com ela.
    poke = int(ALTURA_DE_POKE / ESCALA_ARTE * fator)
    d.rectangle([10, img.height - 10 - poke, 10 + poke, img.height - 10], outline=(255, 255, 0, 230), width=2)
    d.text((13, img.height - 8 - poke), 'POKE', fill=(255, 255, 0, 255))
    img.save(os.path.join(SAIDA, base + '.png'))
    print('%-22s %d ancoras' % (base, len(ancoras)))
print('saida:', SAIDA)
