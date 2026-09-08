# realtime_latent_space_synthesis — vue d'ensemble de l'architecture

Projet : [`cbicari/latent_space_synthesis`](https://github.com/cbicari/latent_space_synthesis)

## Objectif

Synthèse audio en espace latent en temps réel sur un Raspberry Pi 5, utilisant
[`nn~`](https://github.com/acids-ircam/nn_tilde) (l'externe Pure Data d'IRCAM/ACIDS qui exécute un réseau de
neurones, ici un modèle [RAVE](https://github.com/acids-ircam/RAVE), à l'intérieur d'un patch audio). Les
gestes de la main d'une personne — ou, en alternative, un petit contrôleur MIDI — pilotent en direct l'espace
latent du modèle, de sorte que le timbre du synthétiseur neuronal réagit au mouvement ou à des boutons/touches
en temps réel.

## Vue d'ensemble du pipeline

Deux chemins de contrôle alternatifs convergent vers le même patch Pure Data, qui pilote le moteur de
synthèse neuronale :

- **Contrôle gestuel** : un script de suivi de main basé sur webcam (`mediapipe_OSC/`) diffuse les données de
  points de repère via OSC vers [Wekinator](http://www.wekinator.org/), qui apprend une correspondance entre
  le geste et les paramètres de contrôle et envoie sa sortie plus loin via OSC.
- **Contrôle MIDI (alternatif)** : un clavier/contrôleur Akai MPK mini est connecté directement à un second
  patch Pure Data, contournant entièrement la caméra et Wekinator pour une surface de contrôle manuelle plus
  simple et plus prévisible.

Dans les deux cas, les valeurs de contrôle résultantes atteignent un patch Pure Data fonctionnant sous JACK
audio, qui les transmet à `nn~` — le modèle RAVE chargé — pour la synthèse audio neuronale en temps réel,
JACK gérant les entrées/sorties audio proprement dites sur le Raspberry Pi 5.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `mediapipe_OSC/` | Script de suivi de main et son environnement virtuel Python ; diffuse les points de repère via OSC |
| `wekinator/` | `WekiMini.jar` (Wekinator) inclus, exécuté sous un runtime Java 8 |
| `rave_models/` | Fichier(s) de modèle RAVE pré-entraîné chargé(s) par `nn~` dans le patch Pure Data |
| `nn_tilde` | Référence à l'externe Pure Data [`nn~`](https://github.com/acids-ircam/nn_tilde) utilisé pour la synthèse audio neuronale |
| `latent_space_synthesis_OSC_control.pd` | Patch principal : reçoit l'OSC (de Wekinator) et pilote `nn~` |
| `latent_space_synthesis_midiController_AkaiMPKmini.pd` | Patch alternatif : pilote `nn~` directement depuis l'entrée MIDI de l'Akai MPK mini |
| `launch_demo.sh` | Démarre ensemble JACK, Pure Data, Wekinator, et le script de suivi de main |
| `kill_all.sh` | Arrête tout ce que `launch_demo.sh` a démarré |

## Pipeline de données

```
Webcam → suivi de main (mediapipe_OSC) → OSC → Wekinator ─┐
                                                            ├─→ Patch Pure Data → nn~ (modèle RAVE) → sortie audio JACK
                       Akai MPK mini (MIDI) ────────────────┘
```

- **Suivi de main → Wekinator** : le script de suivi diffuse les coordonnées des points de repère de la main
  via OSC ; Wekinator associe ces données gestuelles en direct aux paramètres de contrôle attendus par le
  patch, selon le même flux enregistrement/entraînement/exécution que dans le dépôt compagnon
  [`CV_ML_intermedia_pipeline_workshop`](https://github.com/cbicari/CV_ML_intermedia_pipeline_workshop).
- **Patch Pure Data** : `latent_space_synthesis_OSC_control.pd` reçoit la sortie OSC de Wekinator et la route
  vers les entrées de contrôle de `nn~` (typiquement les dimensions latentes et/ou d'autres paramètres RAVE
  exposés).
- **`nn~` (modèle RAVE)** : charge un modèle pré-entraîné depuis `rave_models/` et effectue la synthèse audio
  neuronale proprement dite, décodant le vecteur latent (potentiellement piloté par le geste) en un flux
  audio en temps réel.
- **Audio JACK** : `qjackctl` fournit le moteur audio à faible latence à travers lequel Pure Data restitue le
  son, sur le Raspberry Pi 5.
- **Chemin MIDI alternatif** : `latent_space_synthesis_midiController_AkaiMPKmini.pd` remplace la chaîne
  caméra+Wekinator par une entrée MIDI CC/note directe depuis un Akai MPK mini, pour un contrôle manuel plus
  rapide ou plus précis sans avoir besoin d'exécuter le pipeline de vision.

## Lancer et arrêter la démo

`launch_demo.sh` démarre l'ensemble du pipeline de contrôle gestuel en une seule fois, dans cet ordre :

1. **`qjackctl -s`** — démarre l'audio JACK avec lecture automatique.
2. **`pd -jack ./latent_space_synthesis_OSC_control.pd`** — démarre Pure Data sous JACK avec le patch de
   contrôle OSC chargé.
3. **`/opt/java8/bin/java -jar ./wekinator/WekiMini.jar`** — lance Wekinator (Java 8 est requis — voir la
   configuration ci-dessous).
4. **`source ./mediapipe_OSC/osc_venv/bin/activate` puis `python ./mediapipe_OSC/hand_recognition.py`** —
   active l'environnement virtuel du script de suivi de main et le démarre.

Le PID de chaque processus est ajouté à `process_pids.txt`. **`kill_all.sh`** lit ce fichier et tue chaque PID
qu'il contient, puis supprime le fichier — l'arrêt correspondant à ce que `launch_demo.sh` a démarré.

Pour utiliser le chemin du contrôleur MIDI à la place, ouvrez directement
`latent_space_synthesis_midiController_AkaiMPKmini.pd` dans Pure Data (sous JACK) plutôt que d'exécuter
`launch_demo.sh`, puisque ce chemin n'a besoin ni de Wekinator ni du script de suivi de main.

## Configuration (Raspberry Pi 5)

Condensé depuis le README ; voir `install/raspberrypi.sh` dans le dépôt et les instructions en amont de
[`nn_tilde`](https://github.com/acids-ircam/nn_tilde) pour tous les détails.

**1. Installer [`uv`](https://astral.sh/uv/) (si pas déjà présent)**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env   # ou redémarrer votre shell
```

**2. Créer un environnement virtuel Python 3.9 et installer les dépendances**
```bash
uv venv nn_venv --python 3.9
uv pip install pip

sudo apt update
sudo apt install -y cmake build-essential git puredata puredata-dev python3 python3-pip
python3 -m pip install torch

LIBTORCH=/home/<utilisateur>/.../lib/python3.9/site-packages/torch/
```

**3. Compiler et installer `nn~`, à la dernière version prise en charge sur Raspberry Pi**
```bash
git clone https://github.com/acids-ircam/nn_tilde.git
cd nn_tilde/
git checkout v1.5.6

mkdir build && cd build
cmake ../src/ -DCMAKE_PREFIX_PATH=$LIBTORCH -DCMAKE_BUILD_TYPE=Release
make
sudo mkdir -p /usr/local/lib/pd-externals/
sudo cp frontend/puredata/nn_tilde/nn~.pd_linux /usr/local/lib/pd-externals/
cd ../../
rm -fr nn_tilde
```

**4. Contourner l'exigence de version Java de Wekinator**

WekiMini a spécifiquement besoin de Java 8 pour sauvegarder correctement les projets :
```bash
wget https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u402-b06/OpenJDK8U-jdk_aarch64_linux_hotspot_8u402b06.tar.gz
tar -xzf OpenJDK8U-jdk_aarch64_linux_hotspot_8u402b06.tar.gz
sudo mv jdk8u402-b06 /opt/java8

# Exécuter Wekinator avec :
/opt/java8/bin/java -jar /chemin/vers/WekiMini.jar
```

## Construit avec

- [`nn~`](https://github.com/acids-ircam/nn_tilde) / [RAVE](https://github.com/acids-ircam/RAVE) (IRCAM/ACIDS) — synthèse audio neuronale au sein de Pure Data
- [Pure Data](https://puredata.info/) + JACK — environnement de patch et moteur audio à faible latence
- [Wekinator](http://www.wekinator.org/) (WekiMini, Java 8) — apprentissage automatique geste → paramètre
- [MediaPipe](https://developers.google.com/mediapipe) — suivi des points de repère de la main
- [`uv`](https://astral.sh/uv/) — gestion de l'environnement Python sur le Raspberry Pi
