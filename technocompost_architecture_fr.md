# Technocompost — vue d'ensemble de l'architecture

Projet : [`cbicari/technocompost`](https://github.com/cbicari/technocompost)

## Objectif

Technocompost est une installation de traitement d'image multi-agents auto-entretenue, fonctionnant sur une
grappe de cartes Raspberry Pi 4. Chaque Pi exécute un agent IA [OpenClaw](https://github.com/openclaw)
connecté à un serveur d'inférence local partagé, LM Studio. Les agents font passer une image à travers un
cycle continu de décomposition et de repousse, chaque Pi prenant en charge une étape et décidant lui-même
quel script de transformation appliquer, en s'appuyant sur ses propres capteurs système (température CPU,
charge, mémoire, disque, réseau).

Le dépôt contient en réalité **deux modes d'orchestration différents**, construits sur la même infrastructure
partagée :

- **Mode A — pipeline agentique distribué** (`watcher.sh`, `decide.sh`, `install.sh`, `README.md`) : trois Pi
  en relais strict, chacun demandant à son agent IA local de choisir un script pour une image entière.
- **Mode B — canevas concurrent par tuiles** (`tile_init.py`, `tile_worker.py`) : tous les Pi travaillent en
  même temps sur des tuiles différentes d'une même image partagée, sans nécessiter de décision par modèle de
  langage à chaque tuile — le choix du script est pondéré/aléatoire en local et ajusté selon un « niveau de
  stress » basé sur les capteurs.

Les deux modes partagent la même installation physique, le même dossier synchronisé par Syncthing, et le même
sous-système d'affichage en direct (`display_server.py` / `preview.py`).

## Infrastructure partagée

| Composant | Rôle |
|---|---|
| 3× Raspberry Pi 4 (`rpiagent01/02/03`) | Un par étape du pipeline |
| Serveur LM Studio | Moteur d'inférence central (p. ex. `google/gemma-4-e4b`, `nvidia/nemotron-3-nano-4b`), accessible à une adresse LAN fixe, utilisé par l'agent OpenClaw de chaque Pi |
| OpenClaw | Environnement d'exécution de l'agent IA installé sur chaque Pi ; peut aussi communiquer de pair à pair via son propre protocole ACP en mode `lan` |
| Syncthing | Maintient `~/.openclaw/workspace/tmp/` (et son sous-dossier `canvas/`) identique sur tous les Pi |
| `display_server.py` | Visionneuse pygame plein écran (sur un Pi désigné pour l'affichage) qui reçoit des images via TCP et fait un fondu enchaîné entre elles |
| `preview.py` | Petit client utilisé par les scripts de traitement pour transmettre une image à `display_server.py` via `flush()` |

`install.sh` configure un Pi neuf : paquets système (`git`, `curl`, `build-essential`, `feh`,
`python3-pillow`, `inotify-tools`, `btop`), Syncthing, Node.js 22 LTS + npm, et OpenClaw, puis crée un lien
symbolique du dossier `scripts/` vers `~/.openclaw/workspace/scripts`. L'assistant de configuration
`openclaw` (URL de base LM Studio + choix du modèle) et l'unité systemd optionnelle `openclaw.service` sont
ensuite configurés manuellement, comme décrit dans le README.

## Mode A — pipeline agentique distribué

### Déroulement

```
hummus.png → [rpiagent01] → gas.png → [rpiagent02] → liquid.png → [rpiagent03] → hummus.png → ...
```

1. **`watcher.sh <étape>`** interroge le dossier partagé toutes les 3 secondes à la recherche du fichier
   mot-clé de cette étape (`hummus`/`gas`/`liquid`), en suivant les fichiers déjà vus dans
   `/tmp/watcher_seen_stage<N>.txt`. Au premier lancement, il démarre aussi `display_server.py` s'il n'est pas
   déjà actif.
2. Lorsqu'un nouveau fichier apparaît, il appelle **`decide.sh <étape> <fichier_entrée>`**, qui :
   - lit les capteurs locaux pertinents pour cette étape (température/charge CPU pour l'étape 1, CPU/mémoire
     pour l'étape 2, disque/réseau pour l'étape 3) ;
   - mélange son réservoir de scripts candidats et construit un prompt d'une ligne demandant à l'agent
     OpenClaw local de choisir exactement un script et d'en régler les paramètres numériques, en privilégiant
     des valeurs douces sauf si les capteurs indiquent un stress, et en le décourageant de répéter son dernier
     choix ;
   - envoie ce prompt à `openclaw agent --agent main` ;
   - extrait le nom du script et les paires `--option valeur` de la réponse (revenant au premier script du
     réservoir en cas d'échec d'analyse) ;
   - exécute directement `python3 <script> <entrée> <sortie> <arguments supplémentaires>`.
3. Le fichier de sortie (`gas.png`, `liquid.png`, ou `hummus.png`) est réécrit dans le dossier partagé, où
   Syncthing le propage à tous les Pi ; le `watcher.sh` de l'étape suivante le récupère, bouclant ainsi le
   cycle.

### Étape → réservoirs de scripts

| Pi | Étape | Surveille | Produit | Réservoir de scripts |
|---|---|---|---|---|
| rpiagent01 (« Fragmenteur » 🪲) | 1 | `hummus.png` | `gas.png` | `chunk_shuffle`, `conway`, `diffuse`, `erode`, `spore`, `degrade` |
| rpiagent02 (« Hydrolyseur » 🦠) | 2 | `gas.png` | `liquid.png` | `hydrolyse`, `decompose`, `diffuse`, `erode` |
| rpiagent03 (« Lignivore » 🍄) | 3 | `liquid.png` | `hummus.png` | `lignine`, `spore`, `decompose` |

(Le README mentionne également `mushroom`, `wind` et `growth` dans la référence globale des scripts,
utilisés de façon similaire par le pipeline.)

## Mode B — canevas concurrent par tuiles

Ce mode remplace entièrement `watcher.sh` + `decide.sh` par **`tile_worker.py`**, lancé une fois par Pi/étape,
et ne nécessite pas d'appel à un modèle de langage à chaque opération — le choix du script repose plutôt sur
un tirage aléatoire pondéré local et un « niveau de stress » dérivé des capteurs.

### Initialisation

**`tile_init.py <image_source.png> [--rows N] [--cols N] [--reset]`** découpe une image source en une grille
`R×C` (4×4 par défaut) et écrit chaque morceau sous la forme `canvas/tile_<ligne>_<colonne>.png`. `--reset`
permet de réamorcer la grille à partir d'une nouvelle image sans perturber les fichiers déjà présents.

### Boucle de travail (par Pi, par étape)

Chaque instance de `tile_worker.py --stage <1|2|3>` répète, indéfiniment :

1. **Nettoyage des réservations périmées** — tout fichier `.claim` vieux de plus de 30 secondes est supprimé,
   au cas où un worker serait mort en cours de traitement d'une tuile.
2. **Réservation d'une tuile libre** — les tuiles et leurs coordonnées sont mélangées, et la première tuile
   sans fichier `.claim` existant est réservée de façon atomique (création exclusive de fichier, afin que deux
   Pi ne puissent pas saisir la même tuile).
3. **Lecture du stress local** — la température CPU et la charge moyenne sur 1 minute sont converties en un
   niveau 0/1/2 (« froid / tiède / chaud »).
4. **Choix d'un script de persona** — dans le réservoir pondéré de cette étape (le script utilisé la dernière
   fois voit ses chances à peu près divisées par deux, pour encourager la variété) et son préréglage de
   paramètres correspondant au niveau de stress.
5. **Exécution du script** sur la tuile vers un fichier temporaire, puis **fondu alpha** du résultat dans la
   tuile d'origine (`--alpha`, 0.30 par défaut) afin que les changements s'accumulent progressivement plutôt
   que de remplacer la tuile d'un coup.
6. **Libération de la réservation**, **recomposition du canevas complet** à partir de toutes les tuiles
   actuelles, et **diffusion** vers `display_server.py` via `preview.flush()`.
7. Courte pause (`--pause`, 0.3 s par défaut) puis retour à l'étape 1.

### Étape → réservoirs de scripts de persona

| Étape | Persona | Réservoir de scripts |
|---|---|---|
| 1 | insectes | `fault_shift`, `chunk_hoard`, `repetition_smash`, `chunk_shuffle`, `byte_scramble`, `metadata_wipe` |
| 2 | bactéries | `gas_liquid`, `xor_cascade`, `bit_rotate`, `hydrolyse`, `memory_purge`, `activity_log` |
| 3 | champignons | `butterfly_permute`, `hilbert_shatter`, `cat_map_scramble`, `lignin_bore`, `lignine`, `mycelium_spread` |

Chaque script de persona réside dans un sous-dossier nommé selon l'étape (`scripts/insects/`,
`scripts/bacteria/`, `scripts/fungi/`) et accepte un préréglage de paramètres « froid / tiède / chaud »
sélectionné par `tile_worker.py` selon le niveau de stress capté à cet instant.

## Sous-système d'affichage partagé

- **`display_server.py`** s'exécute sur un Pi désigné. Il ouvre une fenêtre pygame plein écran sans bordure et
  un serveur TCP en écoute (port 9876 par défaut). Chaque image reçue (en-tête brut `largeur/hauteur/canaux` +
  octets de pixels) remplace l'image actuellement affichée ; le code inclut une fonction utilitaire
  `smoothstep` destinée à adoucir les transitions entre images.
- **`preview.py`** expose une unique fonction `flush(data)` que n'importe quel script de traitement peut
  appeler pour transmettre une image (tableau NumPy ou image PIL) à `display_server.py` via TCP. Elle ne fait
  rien si la variable d'environnement `TECHNOCOMPOST_SILENT=1` est définie — utilisée par `tile_worker.py`
  pour garder silencieux les nombreux sous-processus éphémères par tuile, tandis que le worker lui-même envoie
  le canevas complet recomposé.
- Les deux scripts se configurent via les variables d'environnement `TECHNOCOMPOST_DISPLAY_IP`,
  `TECHNOCOMPOST_DISPLAY_PORT`, `TECHNOCOMPOST_WIN_W`/`_H`, et `TECHNOCOMPOST_INTERP_SEC`.

## Utilisation typique

**Mode A :**
```bash
./watcher.sh 1   # sur rpiagent01
./watcher.sh 2   # sur rpiagent02
./watcher.sh 3   # sur rpiagent03
```
Déposez une image nommée `hummus.png` dans `~/.openclaw/workspace/tmp/` sur n'importe quel Pi pour démarrer
la boucle.

**Mode B :**
```bash
python3 scripts/tile_init.py seed.png --rows 4 --cols 4
python3 scripts/tile_worker.py --stage 1 --display   # sur le Pi équipé d'un écran
python3 scripts/tile_worker.py --stage 2             # sur les autres Pi
python3 scripts/tile_worker.py --stage 3
```

**Afficher directement une seule image :**
```bash
DISPLAY=:0 feh --fullscreen /chemin/vers/image.png &
killall feh   # fermer
```
