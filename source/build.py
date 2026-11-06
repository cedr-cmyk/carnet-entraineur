# Construit les versions du carnet à partir de la source unique source/carnet.html.
#   python3 source/build.py
# Produit : index.html (appli installée, racine du dépôt), build/carnet-claude.html (carnet Claude) et build/carnet-essai.html (copie d'essai Claude).
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(root, 'source/carnet.html'), encoding='utf8').read()
# l'espace archer (archer.js) est intégré à toutes les versions, pour l'aperçu côté entraîneur
ar = open(os.path.join(root, 'archer.js'), encoding='utf8').read()
i = s.index('<script>\n(() => {')
s = s[:i] + '<script>\n' + ar + '\n</script>\n' + s[i:]
# Numéro de version (fichier VERSION à la racine) : celui de cette branche, et celui du site des archers (branche main)
import subprocess, datetime
ver = open(os.path.join(root, 'VERSION'), encoding='utf8').read().strip()
try: site = subprocess.run(['git', '-C', root, 'show', 'main:VERSION'], capture_output=True, text=True, check=True).stdout.strip()
except Exception: site = ''
site = site or '1.7'  # avant le fichier VERSION, le site était en 1.7 (cache carnet-shell-v7)
date = datetime.date.today().isoformat()
# Numéro d'essai : chaque modification de la version de test (commits pas encore sur main) le fait avancer
# (sur la branche d'une version, on ne compte que ses propres commits : pas ceux du site ni de la version de test précédente)
try:
  cur = subprocess.run(['git', '-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
  exclure = [b for b in ('main', 'test') if b != cur]
  essai = int(subprocess.run(['git', '-C', root, 'rev-list', '--count', 'HEAD', '--not'] + exclure, capture_output=True, text=True, check=True).stdout.strip() or 0)
except Exception: essai = 0
vtest = ver + (' · essai n°%d' % essai if essai and ver != site else '')
def vline(test): return '<script>window.CARNET_VERSION = { v: "%s", date: "%s", site: "%s", test: %s };</script>\n' % (vtest if test else ver, date, site if test else ver, 'true' if test else 'false')
s = s.replace('<script>\n' + ar, vline(True) + '<script>\n' + ar, 1)
os.makedirs(os.path.join(root, 'build'), exist_ok=True)
open(os.path.join(root, 'build/carnet-essai.html'), 'w', encoding='utf8').write(s)
main = s.replace(vline(True), vline(False), 1).replace("<title>Carnet d'essai</title>", "<title>Carnet de l'entraîneur</title>", 1)
main = '\n'.join(l for l in main.split('\n') if not l.startswith('.test-band') and 'class="test-band"' not in l and 'window.CARNET_TEST = true' not in l)
open(os.path.join(root, 'build/carnet-claude.html'), 'w', encoding='utf8').write(main)
body = main.replace("<title>Carnet de l'entraîneur</title>\n", "", 1)
head = open(os.path.join(root, 'source/head.html'), encoding='utf8').read()
open(os.path.join(root, 'index.html'), 'w', encoding='utf8').write(head + body + '\n</body>\n</html>\n')
open(os.path.join(root, 'build/essai.txt'), 'w').write(vtest + '\n')
print('ok', vtest)
