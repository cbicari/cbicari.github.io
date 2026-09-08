# LoRA Captioning and Training — vue d'ensemble de l'architecture

Projet : **noukii-training** (d'après l'exemple `git clone` du README) — un pipeline de légendage vers
entraînement LoRA construit autour de [Janus-Pro](https://github.com/deepseek-ai/Janus) pour le légendage
automatique d'images et de [kohya_ss](https://github.com/bmaltais/kohya_ss) pour le fine-tuning LoRA de
Stable Diffusion 1.5.

## Objectif

Transforme un dossier d'images brutes en un modèle LoRA entraîné avec un minimum de travail manuel : un
modèle image-vers-texte rédige les légendes et extrait automatiquement les concepts clés, puis un simple
script (ou une petite interface de bureau) copie le jeu de données résultant dans kohya_ss et lance
l'entraînement LoRA avec des valeurs par défaut déjà en place.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `setup.sh` | Configuration unique de l'environnement : installe un `uv` local au projet, configure les environnements virtuels des deux étapes, récupère Janus et le modèle Janus-Pro-1B, clone kohya_ss, télécharge le point de contrôle de base SD1.5 |
| `LoRA_UI_part01_CaptionScript/` | Étape de légendage : `janus_pro_caption_core.py`, `utils.py`, son propre venv et `requirements.txt` |
| `LoRA_UI_part02_TrainingScript/` | Étape d'entraînement : enveloppe `kohya_ss/` (cloné en tant que sous-dossier), `config_sat_nouki.toml`, son propre `requirements.txt` |
| `LoRA_UI/` | Interface de bureau (`main.py`, non fournie ici) pour choisir les jeux de données/répétitions et lancer l'entraînement, avec son propre venv |
| `run_captioning.sh` | Point d'entrée CLI pour l'étape de légendage |
| `run_training.sh` | Point d'entrée CLI pour l'étape d'entraînement |
| `training-ui.sh` | Lance l'application de bureau `LoRA_UI` |
| `image_datasets/` | D'où les dossiers légendés `{répétitions}_{mot-clé}` sont auto-détectés, si aucun chemin de jeu de données explicite n'est fourni |
| `trained_loras/` | Où atterrissent les dossiers de sortie LoRA terminés |

## Vue d'ensemble du pipeline

```
Images brutes → Légendage (Janus-Pro) → UI ou CLI d'entraînement → Entraînement LoRA kohya_ss → trained_loras/<nom_sortie>/
```

1. **Légendage** (`run_captioning.sh`) exécute `janus_pro_caption_core.py` sur un dossier d'images d'entrée,
   en utilisant le modèle vision-langage Janus-Pro-1B pour rédiger une légende par image, et le TF-IDF pour
   extraire les concepts clés du dossier dans un fichier `prompt_cue-<mot-clé>.txt`. Le résultat est un
   nouveau dossier nommé d'après le mot-clé choisi, contenant les images copiées, une légende `.txt` par
   image, et ce fichier de concepts.
2. **L'entraînement** peut être lancé soit depuis l'**UI** (`training-ui.sh` → `LoRA_UI/main.py`, qui permet
   de choisir des dossiers de jeux de données et leurs nombres de répétitions, de nommer la sortie, et de
   sauvegarder/charger cette configuration en TOML) soit directement depuis la **CLI**
   (`run_training.sh`, qui accepte des indicateurs explicites `--dataset`/`--repeats`/`--output-name`, ou
   auto-détecte chaque dossier `{répétitions}_{mot-clé}` sous `image_datasets/` si aucun argument n'est
   donné).
3. Les deux chemins convergent vers la même étape d'**entraînement LoRA kohya_ss** : les dossiers de jeux de
   données choisis sont copiés dans `kohya_ss/dataset/images/train/`, un fichier de configuration TOML est
   généré en conséquence, et `accelerate launch .../train_network.py` effectue le fine-tuning LoRA sur le
   point de contrôle de base SD1.5.
4. Les poids LoRA `.safetensors` résultants, ainsi qu'une copie du fichier `prompt_cue-*.txt` de chaque jeu
   de données source (pour référence lors de la rédaction de prompts par la suite), sont rassemblés dans
   `trained_loras/<nom_sortie>/`.

## Fonctionnement interne de l'étape de légendage

`janus_pro_caption_core.py`, pour un `folder_path` et un `--keyword` donnés (par défaut `abc`) :

1. Charge le modèle Janus-Pro-1B (`AutoModelForCausalLM`, `trust_remote_code=True`) et son
   `VLChatProcessor`, en `bfloat16` sur CUDA si disponible (repli sur `float16`, puis CPU).
2. Pour chaque fichier image dans `folder_path` :
   - le copie dans un nouveau dossier nommé d'après `--keyword` (créé à côté du dossier d'entrée) ;
   - construit une conversation à deux tours (`<image_placeholder>\ndescribe this image in detail`) et génère
     une légende via `model.language_model.generate(...)` (échantillonnage, `temperature=0.1`, `top_p=0.95`,
     `max_new_tokens=512`, graine fixe `42`) ;
   - écrit cette légende dans un fichier `.txt` correspondant dans le même nouveau dossier.
3. Une fois toutes les images traitées, exécute un `TfidfVectorizer` (mots vides anglais, 7 caractéristiques
   principales) sur la concaténation de toutes les légendes générées pour extraire les **concepts clés** du
   dossier, et les écrit (séparés par des sauts de ligne) dans `prompt_cue-<mot-clé>.txt` à l'intérieur du
   nouveau dossier.

`run_captioning.sh` enveloppe cela avec la gestion de l'environnement : crée le venv s'il est absent,
effectue un sparse checkout du seul package `janus/` depuis le dépôt Janus en amont s'il est absent, installe
`requirements.txt` si `torch` n'est pas encore importable, et vérifie que les fichiers du modèle Janus-Pro-1B
sont présents (en s'arrêtant avec un renvoi vers `setup.sh` / `git lfs pull` sinon) avant d'appeler le script
principal.

Les répétitions ne sont pas choisies ici — le propre indicateur `--repeats` du script de légendage existe
mais le dossier qu'il crée est simplement nommé d'après le mot-clé ; la convention de nommage
`{répétitions}_{mot-clé}` attendue par `run_training.sh` est appliquée ensuite (manuellement, ou par l'UI)
lorsque le dossier est placé sous `image_datasets/`.

## Fonctionnement interne de l'étape d'entraînement

`run_training.sh` fait le gros du travail pour le chemin CLI (l'UI finit par appeler ce même script) :

1. **Résolution des dossiers de jeux de données** — soit à partir d'arguments explicites
   `--dataset <chemin> [--repeats N]` (répétés pour plusieurs jeux de données), soit par des arguments de
   chemin positionnels hérités, soit, si aucun n'est donné, en scannant `image_datasets/` à la recherche de
   dossiers correspondant à `{répétitions}_{mot-clé}`. Une valeur `num_repeats` par défaut de `30` est
   utilisée chaque fois que le nom d'un dossier ne commence pas par un nombre.
2. **Copie de chaque jeu de données** — les fichiers image (`jpg`/`jpeg`/`png`/`bmp`/`gif`/`webp`) et les
   fichiers de légende `.txt` sont copiés (pas déplacés) dans
   `kohya_ss/dataset/images/train/<nom_dossier>`, après avoir vidé ce qui s'y trouvait d'une exécution
   précédente.
3. **Génération de `config_sat_nouki.toml`** — une section `[general]` avec le bucketing activé
   (`bucket_no_upscale`, buckets par pas de 64 entre 256 et 2048 px, légendes `.txt`), un bloc `[[datasets]]`
   (512 px, taille de lot 4), et une entrée `[[datasets.subsets]]` par dossier de jeu de données avec son
   `num_repeats` résolu.
4. **Lancement de l'entraînement** — active le venv de `kohya_ss` et exécute :
   ```bash
   accelerate launch --num_cpu_threads_per_process 1 ./kohya_ss/sd-scripts/train_network.py \
       --pretrained_model_name_or_path='./kohya_ss/models/v1-5-pruned-emaonly.safetensors' \
       --dataset_config='./config_sat_nouki.toml' \
       --output_dir="$OUTPUT_FOLDER" \
       --output_name="$OUTPUT_NAME" \
       --save_model_as=safetensors \
       --prior_loss_weight=1.0 \
       --max_train_steps=400 \
       --learning_rate=1e-4 \
       --sdpa \
       --gradient_checkpointing \
       --cache_latents \
       --mixed_precision="no" \
       --network_module=networks.lora
   ```
   Un nom de sortie est généré automatiquement sous la forme `nouki_sd1-5_<horodatage>` si aucun n'a été
   fourni.
5. **Collecte des sorties** — déplace le fichier `.safetensors` vers `trained_loras/<nom_sortie>/` s'il a
   atterri ailleurs, puis copie chaque `prompt_cue-*.txt` trouvé dans chaque dossier de jeu de données source
   *sélectionné* vers ce même dossier de sortie, afin que les concepts derrière les données d'entraînement
   accompagnent le LoRA résultant.

## Configuration

`setup.sh` prépare les deux étapes à partir d'un clone propre :

1. **`uv` local au projet** — copie un `uv` système s'il en existe un, sinon l'installe via le script
   d'installation officiel, et vendorise le binaire dans `.tools/bin/uv` (également copié dans chaque venv
   qu'il crée).
2. **Étape de légendage (part01)** — crée son venv, installe `requirements.txt` (`torch`, `transformers`,
   `accelerate`, `huggingface_hub`, `pillow`, `attrdict`, `timm`, `scikit-learn`, `einops`), effectue un
   sparse clone du package `janus/` depuis `deepseek-ai/Janus`, et télécharge `deepseek-ai/Janus-Pro-1B` via
   `git lfs`.
3. **Étape d'entraînement (part02)** — clone `bmaltais/kohya_ss` (récursivement, pour ses sous-modules) s'il
   n'est pas déjà présent, crée son venv, installe à la fois le `requirements.txt` propre à kohya_ss et celui
   de ce projet, `LoRA_UI_part02_TrainingScript/requirements.txt` (`accelerate`, `toml`, `tomlkit`), et
   télécharge le point de contrôle de base SD1.5 `v1-5-pruned-emaonly.safetensors` directement (pas via LFS)
   s'il est absent.
4. **Environnement de l'UI** — configuré séparément (pas par `setup.sh`), selon le README : un venv sous
   `LoRA_UI/` avec son propre `requirements.txt`.

## Utilisation

**Via l'UI :**
```bash
./training-ui.sh
```
Ouvre l'interface de bureau, qui permet de choisir des jeux de données avec des nombres de répétitions par
jeu de données, de nommer la sortie, et de sauvegarder/charger toute cette configuration en TOML
(`File > Save Config...` / `Ctrl+S`, `File > Load Config...` / `Ctrl+O`).

**Via la CLI, jeux de données explicites :**
```bash
./run_training.sh \
  image_datasets/20_KelpAllisonMoore \
  image_datasets/20_nuagesAllison \
  image_datasets/20_paperMountains
```

**Via la CLI, jeux de données auto-détectés :**
```bash
./run_training.sh
```

**Légender un nouveau dossier d'images :**
```bash
./run_captioning.sh chemin/vers/dossier_images mot_cle
```

## Remarques

- Le `num_repeats` par sous-ensemble dans la configuration d'entraînement peut provenir de trois sources, par
  ordre de priorité : un `--repeats` explicite passé avec `--dataset` sur la CLI, une valeur déjà suivie pour
  ce même chemin lors d'une analyse antérieure, ou un nombre extrait du début du nom du dossier — avec un
  repli sur `30` si aucun ne s'applique.
- `LoRA_UI_part02_TrainingScript/README.md` documente la façon autonome et entièrement manuelle de piloter
  kohya_ss (son propre venv, déplacement du fichier de configuration à la main, exécution soi-même de
  `accelerate launch`) — utile comme contexte si l'automatisation de `run_training.sh` doit être déboguée,
  mais non requise pour un usage normal.
- Les hyperparamètres d'entraînement (`max_train_steps=400`, `learning_rate=1e-4`, `mixed_precision=no`,
  attention `--sdpa`, gradient checkpointing, mise en cache des latents) sont actuellement fixés dans
  `run_training.sh` plutôt que configurables par l'utilisateur depuis la CLI ou l'UI.
