"""Prova cada arte de prop SOBRE O FUNDO REAL, no tamanho de jogo (PH-254).

POR QUE ESTE PASSO NAO PODE SER PULADO

Folha de contato ja aprovou arte invisivel em jogo duas vezes neste projeto (ver
o cabecalho de `src/data/vfxTiras.ts`). Ela mostra o desenho isolado, ampliado e
sobre fundo neutro — tres condicoes que o jogo nao oferece. O que decide e o
recorte do fundo REAL, na escala REAL:

    unidade de mundo = pixel da arte * 0.8   (`COLISAO_POR_ARTE[..].arte.escala`)
    pixel de tela    = unidade de mundo * 1.5 (`DEFAULT_ZOOM` do renderer)

ou seja: 1 pixel da arte de fundo = 1,2 pixel de tela. Um POKE tem 40 unidades
de mundo, 60 pixels de tela. Uma chama de 26 unidades sai com 39 pixels de
altura. E nesse tamanho que ela precisa ler como chama.

SAIDA
    Um PNG por arte de prop: tres quadros da animacao colados no fundo pedido,
    lado a lado com a silhueta de um POKE pra escala, e a mesma tira desenhada
    grande no rodape pra comparar o que se perde na reducao.

USO
    py scripts/harness/provar-props-no-fundo.py --fundo cave-volcanic
    py scripts/harness/provar-props-no-fundo.py --fundo town --u 0.30 --v 0.46
"""
import argparse
import json
import os
import re

from PIL import Image, ImageDraw

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
FUNDOS = os.path.join(RAIZ, 'assets', 'hunt-backgrounds')

ESCALA_ARTE = 0.8      # pixel da arte -> unidade de mundo
ZOOM = 1.5             # unidade de mundo -> pixel de tela
ALTURA_DE_POKE = 40    # unidades de mundo (src/render/escalaDoMundo.ts)

ap = argparse.ArgumentParser()
ap.add_argument('--tiras', default=r'C:\Users\Mark2\.claude\jobs\6a2897ce\tmp\tiras',
                help='pasta com as tiras candidatas')
ap.add_argument('--fundo', default='cave-volcanic')
ap.add_argument('--u', type=float, default=0.5, help='onde no fundo colar, fracao da largura')
ap.add_argument('--v', type=float, default=0.5)
ap.add_argument('--recorte', type=int, default=420, help='lado do recorte do fundo, em pixels da arte')
ap.add_argument('--out', default='scripts/harness/props-ambiente/prova')
a = ap.parse_args()

SAIDA = os.path.join(RAIZ, a.out)
os.makedirs(SAIDA, exist_ok=True)

# Altura pretendida de cada prop, em unidades de mundo. E o numero que este
# script existe pra conferir — nao um detalhe de implementacao.
ALTURA_MUNDO = {
    'chama-pilar': 26, 'chama-parede': 34, 'chama-jato': 30,
    'fumaca-densa': 46, 'fumaca-fina': 52, 'fumaca-clara': 40,
    'vapor-pluma': 38, 'vapor-redemoinho': 44,
    'agua-jorro': 34, 'agua-anel': 14, 'agua-estouro': 20,
    'brilho-estrela': 16, 'redemoinho': 50, 'gas-roxo': 30,
    'faisca-eletrica': 22,
}

fundo_arq = None
for ext in ('.jpg', '.png'):
    p = os.path.join(FUNDOS, a.fundo + ext)
    if os.path.exists(p):
        fundo_arq = p
if not fundo_arq:
    raise SystemExit('fundo nao encontrado: ' + a.fundo)
fundo = Image.open(fundo_arq).convert('RGB')

for arq in sorted(os.listdir(a.tiras)):
    if not arq.endswith('.png'):
        continue
    nome = arq[:-4]
    m_quadros = re.search(r'_f(\d+)$', nome)
    tira = Image.open(os.path.join(a.tiras, arq)).convert('RGBA')
    # A tira e uma fileira de quadros de largura igual: a contagem sai da razao
    # com a altura so quando a arte e quadrada, entao ela vem do nome do arquivo
    # em `tira_efeito.py`... que nao carrega. Deduz pelo divisor inteiro mais
    # provavel: quadro nunca e mais largo que 2x a altura nem mais estreito que
    # 1/3 dela.
    quadros = int(m_quadros.group(1)) if m_quadros else None
    if m_quadros:
        nome = nome[:m_quadros.start()]
    for n in ([] if quadros else range(1, 65)):
        if tira.width % n:
            continue
        larg = tira.width // n
        if tira.height / 3.0 <= larg <= tira.height * 2.0:
            quadros = n
            break
    if not quadros:
        print('pulei (nao deduzi quadros):', nome)
        continue
    lq = tira.width // quadros

    alturaMundo = ALTURA_MUNDO.get(nome, 30)
    # Da unidade de mundo pro pixel do RECORTE: o recorte esta em pixel da arte
    # de fundo, e 1 unidade de mundo = 1/0.8 pixel de arte.
    alturaEmPixelDeArte = alturaMundo / ESCALA_ARTE
    fator = alturaEmPixelDeArte / tira.height

    lado = a.recorte
    px = int(fundo.width * a.u) - lado // 2
    py = int(fundo.height * a.v) - lado // 2
    px = max(0, min(fundo.width - lado, px))
    py = max(0, min(fundo.height - lado, py))
    cena = fundo.crop((px, py, px + lado, py + lado)).copy()

    idx = [0, quadros // 2, quadros - 1]
    for k, f in enumerate(idx):
        q = tira.crop((f * lq, 0, (f + 1) * lq, tira.height))
        q = q.resize((max(1, int(lq * fator)), max(1, int(tira.height * fator))), Image.LANCZOS)
        x = int(lado * (k + 1) / 4.0) - q.width // 2
        y = lado // 2 - q.height // 2
        cena.paste(q, (x, y), q)

    # Silhueta de POKE pra escala: 40 unidades de mundo = 50 pixels de arte.
    d = ImageDraw.Draw(cena, 'RGBA')
    poke = int(ALTURA_DE_POKE / ESCALA_ARTE)
    d.rectangle([8, lado - 8 - poke, 8 + poke, lado - 8], outline=(255, 255, 0, 220), width=2)
    d.text((11, lado - 6 - poke), 'POKE', fill=(255, 255, 0, 255))

    # Tudo sai no ZOOM do jogo: e nesse tamanho que o jogador ve.
    cena = cena.resize((int(lado * ESCALA_ARTE * ZOOM), int(lado * ESCALA_ARTE * ZOOM)), Image.LANCZOS)

    # Rodape com a tira inteira ampliada 2x: serve pra saber SE o que sumiu no
    # tamanho de jogo estava la, ou se a arte ja era fraca.
    rodape = tira.resize((tira.width * 2, tira.height * 2), Image.NEAREST)
    folha = Image.new('RGB', (max(cena.width, rodape.width), cena.height + rodape.height + 18), (24, 24, 28))
    folha.paste(cena, (0, 0))
    folha.paste(rodape, (0, cena.height + 16), rodape)
    ImageDraw.Draw(folha).text((4, cena.height + 2), '%s  %dq  %du de mundo' % (nome, quadros, alturaMundo),
                               fill=(230, 230, 240))
    folha.save(os.path.join(SAIDA, '%s--%s.png' % (a.fundo, nome)))
    print(nome, quadros, 'quadros')
print('saida:', SAIDA)
