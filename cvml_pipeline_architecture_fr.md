# Vision par ordinateur + OSC — vue d'ensemble de l'architecture

Projet : [`cbicari/CV_ML_intermedia_pipeline_workshop`](https://github.com/cbicari/CV_ML_intermedia_pipeline_workshop)

## Objectif

Un pipeline de départ pour construire un **instrument numérique créatif** : une personne bouge devant une
webcam, et ce mouvement finit par contrôler du son, des visuels, des lumières, ou n'importe quoi d'autre —
grâce à l'apprentissage automatique, sans que l'artiste ait à écrire le moindre code de ML. Le dépôt lui-même
ne fournit que la première étape, celle de la vision par ordinateur ; le reste du pipeline repose sur deux
autres logiciels établis du monde du code créatif, qui lui parlent (et se parlent entre eux) via OSC sur la
même machine.

## Vue d'ensemble du pipeline

Trois programmes distincts, chacun faisant un travail précis, enchaînés sur le réseau local via
[OSC](https://en.wikipedia.org/wiki/Open_Sound_Control) (Open Sound Control) :

1. **Vision par ordinateur (ce dépôt)** — utilise [MediaPipe](https://developers.google.com/mediapipe) pour
   suivre une main ou un corps à partir du flux webcam, et diffuse les coordonnées brutes des points de repère
   sous forme d'un seul message OSC.
2. **[Wekinator](http://www.wekinator.org/)** — un outil d'apprentissage automatique conçu exactement pour ce
   type de travail : on lui montre des exemples (« quand ma main est *ici*, je veux que la sortie soit
   *ceci* »), il entraîne un modèle, puis associe l'entrée en direct à une sortie en temps réel, sans code
   requis.
3. **[Ossia Score](https://ossia.io/)** (ou Max/MSP, Pure Data, TouchDesigner, ou tout autre logiciel
   compatible OSC) — reçoit la sortie de Wekinator et la connecte au son, aux visuels, ou à tout ce qu'il
   peut contrôler.

## Sauts OSC et ports

Comme il s'agit de trois programmes distincts qui se parlent, la plupart des problèmes de configuration
viennent du port sur lequel chacun écoute :

| Saut | Envoie depuis | Envoie vers | Adresse | Port |
|---|---|---|---|---|
| 1 | Les scripts de ce dépôt | Wekinator | `/wek/inputs` | `9000` |
| 2 | Wekinator | Ossia Score (ou autre) | `/wek/outputs` | `12000` |

Deux particularités importantes à connaître :
- Le port d'entrée par défaut intégré à Wekinator est `6448`, pas `9000` — les scripts de ce dépôt envoient
  toujours sur `9000`, donc le champ **port d'entrée** du projet Wekinator doit être réglé sur `9000` pour
  correspondre.
- Le port de sortie (`12000`) *est* bien le défaut de Wekinator, donc rien à changer de ce côté sauf
  souhait contraire.

`127.0.0.1` (alias `localhost`) signifie toujours « cette même machine » — même si les trois programmes
tournent sur un seul ordinateur, ils communiquent quand même via la pile réseau locale, simplement un réseau
d'un seul poste.

## Scripts de vision par ordinateur (ce dépôt)

Deux scripts de suivi interchangeables, construits de la même façon :

| Script | Suit | Points de repère envoyés | Nombre d'entrées OSC |
|---|---|---|---|
| `hand_recognition.py` | Une main (`mp_hands.Hands(max_num_hands=1)`) | 21 points de repère de la main × (x, y, z) | 63 |
| `mediapipe_body.py` | Pose du corps entier | 22 points de repère du corps × (x, y, z) | 66 |

Boucle de chaque script :
1. Capture une image de la webcam (`cv2.VideoCapture`), la convertit en RGB pour MediaPipe.
2. Exécute le modèle MediaPipe correspondant (`Hands` ou `Pose`) pour détecter les points de repère.
3. Redessine les points de repère détectés sur l'image pour un retour visuel (`mp_draw.draw_landmarks`) et
   l'affiche dans une fenêtre OpenCV.
4. Aplatit les `(x, y, z)` de chaque point de repère en une longue liste de flottants et l'envoie comme
   **un seul** message OSC vers `/wek/inputs` sur `127.0.0.1:9000` (via `osc4py3`).
5. Se répète jusqu'à ce que **Q** soit pressé ou que la fenêtre soit fermée.

Si la mauvaise caméra s'ouvre, passer un `dev_id` différent à `detection_context()` change le périphérique
capturé par OpenCV.

## Configuration de Wekinator (saut 1 → 2)

Un script de suivi doit déjà être en cours d'exécution (Wekinator a besoin de voir une entrée en direct
pendant sa configuration). Sur l'écran de configuration de projet de Wekinator :

| Paramètre | Valeur |
|---|---|
| Port d'entrée | `9000` |
| Message d'entrée (adresse OSC) | `/wek/inputs` |
| Nombre d'entrées | `63` pour le suivi de la main, `66` pour le suivi du corps |
| Message de sortie (adresse OSC) | `/wek/outputs` (par défaut) |
| Hôte / port de sortie | `localhost` / `12000` (par défaut) |
| Nombre de sorties | selon le nombre de sorties que l'artiste veut contrôler |

À partir de là, le flux d'enregistrement/entraînement/exécution est l'usage standard de Wekinator (voir les
[instructions officielles](https://doc.gold.ac.uk/~mas01rf/Wekinator/instructions/), également incluses dans
ce dépôt sous `documentation/wekinator-documentation.pdf`).

## Connexion à Ossia Score (saut 2 → 3)

Avec Wekinator en cours d'exécution et produisant une sortie :

1. Dans l'**Explorateur de périphériques** d'Ossia Score, ajouter un nouveau périphérique avec le protocole
   **OSC**.
2. Le configurer : IP `127.0.0.1`, port d'entrée `12000` (le port de sortie de Wekinator), nom de
   périphérique optionnel.
3. Avec Wekinator activement en cours d'exécution, faire un clic droit sur le nouveau périphérique et choisir
   **Learn** — Ossia découvre automatiquement l'adresse `/wek/outputs` à partir du trafic en direct.
4. Ce nœud découvert contient une valeur de type **liste** (Wekinator envoie toutes les sorties ensemble en
   un seul message, un flottant par sortie, dans l'ordre de définition) plutôt que des paramètres nommés
   séparément.
5. Pour la scinder à nouveau en valeurs individuellement connectables, glisser un processus **Spread array**
   dans la vue nodale, régler son nombre de sorties sur le nombre de sorties Wekinator, et brancher
   `/wek/outputs` sur sa broche d'entrée. Il expose alors une broche par sortie (`Output 0` = `outputs-1` de
   Wekinator, `Output 1` = `outputs-2`, etc.), chacune câblable vers une destination différente.

## Schéma du pipeline

La structure globale, de la base à l'extrémité de la chaîne OSC :

- Webcam → **script de vision par ordinateur** (MediaPipe) → OSC `/wek/inputs` @ `9000` → **Wekinator**
  (mouvement → mapping) → OSC `/wek/outputs` @ `12000` → **Ossia Score / Max / Pure Data / TouchDesigner** →
  son, visuels, lumières, ou tout ce que l'artiste définit.

## Installation

### Windows

Nécessite **Git** et **Python** (ce dernier installé automatiquement par le script d'installation) :

```powershell
git clone https://github.com/cbicari/c-lab-scripts
Set-ExecutionPolicy Bypass -Scope Process
cd c-lab-scripts
.\install\install.ps1
```

`install.ps1` installe Python 3.12 si absent, crée un environnement virtuel, installe les dépendances, et
ajoute deux raccourcis sur le bureau — **Hand Tracking** et **Body Tracking** — pour lancer l'un ou l'autre
script sans terminal (lancer l'un ferme automatiquement l'autre). Installer spécifiquement à `C:\` : les noms
d'utilisateur Windows accentués (p. ex. `Étudiant`) cassent MediaPipe sinon.

### Linux / Mac

Aucun script d'installation n'est fourni pour ces plateformes — Git et Python 3 doivent déjà être présents
(vérifier avec `git --version` / `python3 --version` ; installer via `apt`, `dnf`,
`xcode-select --install`, ou Homebrew au besoin), puis :

```bash
git clone https://github.com/cbicari/c-lab-scripts
cd c-lab-scripts
python3 -m venv venv
source venv/bin/activate
pip install -r install/requirements.txt

python scripts/hand_recognition.py
# ou
python scripts/mediapipe_body.py
```

Appuyer sur **Q** ou fermer la fenêtre pour arrêter l'un ou l'autre script.

## Dépannage

| Symptôme | Solution |
|---|---|
| La caméra ne s'ouvre pas | Passer un `dev_id` différent à `detection_context()`, p. ex. `dev_id=1` |
| `ModuleNotFoundError` | Le terminal n'utilise pas le venv — exécuter `source venv/bin/activate` (Linux/Mac) ou utiliser les raccourcis du bureau (Windows) |
| Lent ou saccadé | MediaPipe tourne sur le CPU — fermer les autres applications lourdes |
| Wekinator ne réagit pas au mouvement | Vérifier que le port d'entrée de Wekinator est bien réglé sur `9000`, pas son défaut `6448` |
| Ossia Score ne reçoit rien | Vérifier que le périphérique OSC d'Ossia écoute sur le même port que celui vers lequel Wekinator envoie sa sortie (`12000` par défaut), et que Wekinator est activement en cours d'exécution, pas seulement entraîné |
