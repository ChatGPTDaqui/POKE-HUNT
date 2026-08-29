"""Garimpa o acervo .dat/.spr atras de arte que sirva de PROP DE AMBIENTE (PH-254).

POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE MEDE EM VEZ DE LISTAR

O acervo tem 14.132 efeitos catalogados em 9 projetos, e NENHUM deles tem nome:
o .dat guarda ID e geometria, nunca "chama" ou "respingo". O catalogo que ja
existe (`catalogo/catalogo.json`, feito por `catalog_effects.py`) classifica por
MATIZ, o que reduz 14 mil a ~1.800 candidatos de fogo — ainda longe do que uma
pessoa confere de olho, e matiz sozinho nao separa as duas coisas que este
trabalho precisa distinguir:

    LOOP   fonte continua — chama de fogueira, coluna de fumaca, vapor subindo.
           Serve de prop ancorado, porque pode ficar na tela pra sempre.
    PULSO  evento — respingo, bolha estourando, faisca. Serve de prop que
           dispara de tempos em tempos, e fica invisivel entre um e outro.

A diferenca entre as duas nao esta na cor: esta em COMO A COBERTURA DE PIXEL
ANDA AO LONGO DOS QUADROS. Loop tem cobertura quase constante e termina cheio
(da pra emendar o ultimo quadro no primeiro sem salto). Pulso sobe ate um pico
e termina perto de zero. Isso e mensuravel, e e o que este script mede.

Uma explosao de golpe usada como prop ancorado piscaria a cena inteira a cada
ciclo; uma chama usada como pulso ficaria ligando e desligando. Escolher errado
aqui nao da erro nenhum — so fica feio, e so aparece depois de a arte ja estar
no repo. Por isso a triagem e por medida.

SAIDA
    Uma folha de contato por familia, com tres quadros de cada candidato
    (primeiro / meio / ultimo) sobre fundo escuro e o rotulo projeto+id, mais um
    JSON com as medidas. A ESCOLHA FINAL NAO E DAQUI: folha de contato ja
    aprovou arte invisivel em jogo duas vezes (ver o cabecalho de
    `src/data/vfxTiras.ts`). Ela e so o filtro que leva ~1.800 a ~40 pra
    conferir sobre o fundo real da hunt.

USO
    py scripts/harness/minerar-props-ambiente.py --familia loop --classes fire
    py scripts/harness/minerar-props-ambiente.py --familia pulso --classes water

O acervo NAO esta no repo (bancos .dat/.spr de terceiros, ~1GB). O caminho
padrao e o desta maquina; passe --objectbuilder pra apontar pra outro lugar.
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

PADRAO_OB = r'C:\Users\Mark2\Documents\POKE\PXG_2026\objectbuilder'

ap = argparse.ArgumentParser()
ap.add_argument('--objectbuilder', default=PADRAO_OB)
ap.add_argument('--familia', choices=['loop', 'pulso'], required=True)
ap.add_argument('--classes', default='fire')
ap.add_argument('--projetos', default='')
ap.add_argument('--quadros-min', type=int, default=6)
ap.add_argument('--px-min', type=int, default=150)
ap.add_argument('--px-max', type=int, default=20000)
ap.add_argument('--alto', action='store_true', help='so o que e mais alto que largo (chama, fumaca, vapor)')
ap.add_argument('--movimento-min', type=float, default=0.008,
                help='diferenca media minima entre quadros; abaixo disso a arte esta parada')
ap.add_argument('--razao-min', type=float, default=0.0,
                help='altura/largura MEDIDA da caixa; chama e fumaca sao mais altas que largas')
ap.add_argument('--razao-max', type=float, default=99.0)
ap.add_argument('--limite', type=int, default=48, help='quantos entram na folha de contato')
ap.add_argument('--amostra', type=int, default=400, help='teto de candidatos RENDERIZADOS (a medida custa)')
ap.add_argument('--rotulo', default='', help='nome do arquivo de saida; padrao e familia-classes')
ap.add_argument('--out', default='scripts/harness/props-ambiente')
a = ap.parse_args()

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SAIDA = os.path.normpath(os.path.join(RAIZ, a.out))
os.makedirs(SAIDA, exist_ok=True)

sys.path.insert(0, a.objectbuilder)
os.chdir(a.objectbuilder)  # projetos.py resolve caminho relativo ao proprio dir
import projetos  # noqa: E402
from export_sprites import DatReader, SpriteFile, render  # noqa: E402

catalogo = json.load(open(os.path.join(a.objectbuilder, 'catalogo', 'catalogo.json')))
classes = set(a.classes.split(','))
projs = set(p for p in a.projetos.split(',') if p)

candidatos = [
    c for c in catalogo
    if c['class'] in classes
    and c['frames'] >= a.quadros_min
    and a.px_min <= c['pixels'] <= a.px_max
    and (not projs or c['projeto'] in projs)
    and (not a.alto or c['tiles'][1] >= c['tiles'][0])
]
# Ordem estavel e espalhada entre projetos: sem isso a amostra vira 400 efeitos
# seguidos do mesmo banco, que costumam ser variacoes do mesmo desenho.
candidatos.sort(key=lambda c: (c['id'] % 97, c['projeto'], c['id']))
candidatos = candidatos[:a.amostra]
print('candidatos apos filtro:', len(candidatos))

ALPHA_VISIVEL = 16


def medir(quadros):
    """Cobertura por quadro, MOVIMENTO entre quadros, e a caixa de todos eles.

    O movimento existe porque a nota de loop sozinha promove arte PARADA: um
    icone estatico de 16 quadros iguais tem cobertura perfeitamente constante e
    tira nota 1,00. A primeira varredura de fogo devolveu emoji, sino e ovelha
    nos oito primeiros lugares por exatamente isso. Fonte continua de verdade
    (chama, fumaca) muda de um quadro pro outro; icone repetido nao muda nada.
    """
    cobs = []
    caixa = None
    anterior = None
    difs = []
    for q in quadros:
        alpha = q.getchannel('A')
        dados = list(alpha.getdata())
        pontos = sum(1 for p in dados if p > ALPHA_VISIVEL)
        cobs.append(pontos / float(q.width * q.height))
        if anterior is not None and len(anterior) == len(dados):
            difs.append(sum(abs(x - y) for x, y in zip(dados, anterior)) / (255.0 * len(dados)))
        anterior = dados
        bb = q.getbbox()
        if bb:
            caixa = bb if caixa is None else (
                min(caixa[0], bb[0]), min(caixa[1], bb[1]),
                max(caixa[2], bb[2]), max(caixa[3], bb[3]))
    movimento = sum(difs) / len(difs) if difs else 0.0
    return cobs, caixa, movimento


def nota_loop(cobs):
    """1 = cobertura constante e final cheio; 0 = nada parecido com fonte continua."""
    pico = max(cobs)
    if pico <= 0:
        return 0.0
    media = sum(cobs) / len(cobs)
    desvio = (sum((c - media) ** 2 for c in cobs) / len(cobs)) ** 0.5
    estabilidade = max(0.0, 1.0 - (desvio / media) / 0.6) if media > 0 else 0.0
    # Emenda: o ultimo quadro precisa parecer com o primeiro, senao o loop salta.
    emenda = 1.0 - min(1.0, abs(cobs[-1] - cobs[0]) / pico)
    # Nenhum quadro pode apagar no meio (isso e piscada, nao fonte).
    fundo = min(cobs) / pico
    return estabilidade * 0.4 + emenda * 0.35 + min(1.0, fundo / 0.5) * 0.25


def nota_pulso(cobs):
    """1 = nasce, cresce ate um pico e some; 0 = fonte continua."""
    pico = max(cobs)
    if pico <= 0:
        return 0.0
    i = cobs.index(pico)
    subida = 1.0 if i > 0 else 0.0            # o pico nao pode ser o quadro 0
    saida = 1.0 - min(1.0, cobs[-1] / pico)   # tem que terminar apagando
    meio = 1.0 - min(1.0, abs(i - (len(cobs) - 1) * 0.4) / (len(cobs) * 0.5))
    return subida * 0.3 + saida * 0.45 + meio * 0.25


nota = nota_loop if a.familia == 'loop' else nota_pulso

medidos = []
cache_proj = {}
for n, c in enumerate(candidatos):
    if c['projeto'] not in cache_proj:
        p = projetos.get(c['projeto'])
        cache_proj[c['projeto']] = (DatReader(p), SpriteFile(p))
    dat, spr = cache_proj[c['projeto']]
    try:
        t = dat.things[c['category']][c['id']]
        quadros = [render(t, spr, 0, 0, 0, f).convert('RGBA') for f in range(t.frames)]
    except Exception as e:  # banco de terceiro: id quebrado acontece, nao para a varredura
        print('  pulei %s %s: %s' % (c['projeto'], c['id'], e))
        continue
    while quadros and quadros[-1].getbbox() is None:
        quadros.pop()
    if len(quadros) < a.quadros_min:
        continue
    cobs, caixa, movimento = medir(quadros)
    if caixa is None:
        continue
    larg, alt = caixa[2] - caixa[0], caixa[3] - caixa[1]
    if larg < 8 or alt < 8:
        continue
    if movimento < a.movimento_min:
        continue
    if not (a.razao_min <= alt / float(larg) <= a.razao_max):
        continue
    medidos.append({
        'projeto': c['projeto'], 'categoria': c['category'], 'id': c['id'],
        'classe': c['class'], 'quadros': len(quadros),
        'caixa': [larg, alt], 'razao': round(alt / float(larg), 2),
        'movimento': round(movimento, 4),
        'nota': round(nota(cobs), 3),
        'cobertura': [round(x, 4) for x in cobs],
    })
    if n % 50 == 0:
        print('  medidos %d/%d' % (n, len(candidatos)))

# Nota primeiro, movimento como desempate COM PESO: entre duas artes que se
# comportam igual ao longo dos quadros, a que se mexe mais e a que le como fonte
# viva. O teto de 0,3 impede que movimento sozinho promova arte epileptica.
medidos.sort(key=lambda m: -(m['nota'] + min(0.3, m['movimento'] * 6)))
escolhidos = medidos[:a.limite]

nome = '%s-%s' % (a.familia, a.classes.replace(',', '_'))
if a.rotulo:
    nome = a.rotulo
json.dump(medidos, open(os.path.join(SAIDA, nome + '.json'), 'w'), indent=1)

# Folha de contato: 3 quadros por candidato, fundo escuro (a arte e luminosa e
# some em folha branca), rotulo com projeto/id/nota pra a escolha ser rastreavel.
CEL = 96
COLS = 8
linhas = (len(escolhidos) + COLS - 1) // COLS
folha = Image.new('RGB', (COLS * CEL * 3, max(1, linhas) * (CEL + 14)), (26, 26, 32))
desenho = ImageDraw.Draw(folha)
for i, m in enumerate(escolhidos):
    dat, spr = cache_proj[m['projeto']]
    t = dat.things[m['categoria']][m['id']]
    quadros = [render(t, spr, 0, 0, 0, f).convert('RGBA') for f in range(t.frames)]
    while quadros and quadros[-1].getbbox() is None:
        quadros.pop()
    idx = [0, len(quadros) // 2, len(quadros) - 1]
    cx = (i % COLS) * CEL * 3
    cy = (i // COLS) * (CEL + 14)
    for k, f in enumerate(idx):
        q = quadros[f]
        bb = q.getbbox()
        if bb:
            q = q.crop(bb)
        q.thumbnail((CEL, CEL))
        folha.paste(q, (cx + k * CEL + (CEL - q.width) // 2, cy + (CEL - q.height) // 2), q)
    desenho.text((cx + 3, cy + CEL + 1),
                 '%d %s %s n%.2f m%.3f %dq' % (i, m['projeto'][:6], m['id'], m['nota'], m['movimento'], m['quadros']),
                 fill=(210, 210, 220))
folha.save(os.path.join(SAIDA, nome + '.png'))
print('folha: %s  (%d de %d medidos)' % (os.path.join(SAIDA, nome + '.png'), len(escolhidos), len(medidos)))
