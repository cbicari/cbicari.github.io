# Installation volumétrique auto-observante — vue d'ensemble de l'architecture

Une installation en temps réel combinant capture volumétrique, projection sphérique, visuels génératifs, et
un modèle vision-langage qui observe l'installation, la décrit, et renvoie cette description dans sa propre
imagerie. Documenté en détail ci-dessous : **aida-stream-llm-analysis**, le sous-système d'observation et de
rétroaction.

## Objectif

Les spectateurs se tiennent autour d'une sphère d'un mètre. Un projecteur caché sous la table restitue en
direct sur sa surface un nuage de points les représentant, reconstruit à partir de trois caméras de
profondeur. Ce même nuage de points conditionne aussi un pipeline visuel génératif, de sorte que le
mouvement des spectateurs façonne littéralement l'imagerie apparaissant sur la sphère. Une caméra séparée
observe l'ensemble de l'installation depuis l'extérieur, et un modèle vision-langage décrit ce qu'il voit —
en deux langues — projetant cette description sous forme de texte sur la sphère, tandis qu'une version
condensée de celle-ci est réinjectée comme un prompt qui oriente l'évolution suivante de l'imagerie générée.
L'installation s'observe elle-même, s'explique elle-même, et change à cause de ce qu'elle a dit — pendant
que les personnes autour d'elle lui font subir la même chose depuis l'autre direction.

## Capture volumétrique et projection sphérique

```
3 caméras de profondeur Orbbec
        │
        ▼
Carto (moteur Godot)
        │
   ┌────┴────┐
   ▼         ▼
Projection   Pipeline visuel génératif
sphérique    (Stable Diffusion)
```

Trois caméras de profondeur Orbbec capturent les spectateurs autour de la table. **Carto**, un programme
personnalisé de capture volumétrique et de reconstruction construit sur le moteur Godot, transforme cela en
un nuage de points en direct. Ce nuage de points pilote deux choses à la fois : l'image projetée sur la
sphère d'un mètre (via un projecteur caché sous la table de l'installation), et l'entrée de conditionnement
d'un pipeline visuel génératif Stable Diffusion — de sorte que les personnes physiquement présentes
constituent, en effet, l'entrée en direct du modèle.

## La boucle d'auto-observation par LLM

```
Caméra fisheye AIDA (observe toute l'installation)
        │
        ▼
Modèle vision-langage LM Studio (description en anglais et en français)
        │
   ┌────┴──────────────┐
   ▼                    ▼
Superposition de       Extraction de
texte sur la sphère    mots-clés
                        │
                        ▼
                  Pipeline visuel génératif
                  (les mots-clés orientent l'imagerie évolutive)
                        │
                        ▼
     ↻ de nouveaux visuels apparaissent sur la sphère, observés à nouveau
```

Une caméra AIDA N200, montée pour voir l'ensemble de l'installation (pas seulement la sphère), diffuse via
SRT. Un modèle vision-langage exécuté localement dans LM Studio décrit périodiquement ce qu'il voit, une
fois en anglais et une fois en français, chacune envoyée comme son propre message OSC et projetée en texte
par-dessus la sphère — superposée à la fois au nuage de points volumétrique et aux visuels générés. La
description anglaise est en outre réduite à un à trois mots-clés concrets, qui sont réinjectés dans le
pipeline visuel génératif comme un court prompt, infléchissant la façon dont l'imagerie évolue. Comme la
caméra AIDA voit aussi ce que la sphère affiche actuellement, les nouveaux visuels qu'elle produit sont
observés, décrits, et à nouveau distillés en mots-clés au cycle suivant — une boucle fermée où la propre
sortie de l'installation devient sa propre entrée suivante, indépendamment de (mais en parallèle avec)
l'influence volumétrique directe des spectateurs sur ce même pipeline génératif.

## aida-stream-llm-analysis : fonctionnement interne du pipeline

Le sous-système d'observation et de rétroaction est un petit ensemble de scripts orchestrant un cycle
périodique capture → analyse → résumé → diffusion, tous coordonnés via un fichier image partagé et des
messages OSC.

### Capture — `capture_loop_srt.sh`

S'exécute en continu en arrière-plan : se connecte au sous-flux SRT de la caméra AIDA
(`srt://<ip_camera>:<port>?streamid=<id>`), capture exactement une image avec `ffmpeg`, l'écrit à un chemin
fixe (`/tmp/latest_frame.jpg`), se déconnecte, et attend l'intervalle configuré (10 s par défaut) avant de
recommencer. Chaque connexion est volontairement de courte durée — le côté analyse ne touche jamais la
caméra directement, seulement le fichier que ce script maintient.

### Analyse — `analyze_latest_frame.py`

Lit l'image actuellement présente à ce chemin, l'encode en base64 dans une requête chat-completions vers
l'API locale compatible OpenAI de LM Studio, et envoie la réponse du modèle en un seul message OSC. Il n'a
aucune dépendance caméra — tout ce qui concerne la caméra relève entièrement du script de capture. Détails
de conception notables :
- `--skip-if-unchanged` compare l'horodatage de modification (mtime) de l'image pour éviter de ré-analyser
  une image qui n'a pas encore été rafraîchie.
- `--quiet` n'affiche *que* la description brute sur stdout (tout le reste va sur stderr), spécifiquement
  pour qu'un script appelant puisse la capturer proprement via une substitution de commande — utilisé pour
  transmettre la description anglaise à l'étape de résumé de mots-clés.
- Un délai d'expiration par défaut généreux (240 s) reflète l'inférence CPU seule sur un modèle
  vision-langage, bien plus lente que l'inférence GPU.

### Extraction de mots-clés — `summarize_keywords.py`

Purement texte-entrée/texte-sortie, sans caméra ni image impliquée : prend une description (la sortie
anglaise ci-dessus), demande au même modèle LM Studio de la réduire à un à trois mots-clés concrets d'objets
réels — avec instruction explicite d'éviter le langage abstrait ou émotionnel — ajoute un suffixe fixe
(`"fisheye 250 degrees"`, nommant la géométrie de l'objectif de la caméra AIDA elle-même) et envoie le
résultat combiné en OSC. Le suffixe est une chaîne fixe, pas une sortie du modèle, donc il est toujours exact
quoi que retourne le modèle.

### Orchestration — `run_pipeline.sh`

Relie tout ce qui précède en un cycle unique qui tourne en continu :
1. Confirme que LM Studio est prêt (via `manage_lmstudio.sh`) avant de toucher la caméra de quelque façon
   que ce soit.
2. Démarre la boucle de capture en arrière-plan, en suivant son PID pour un arrêt propre.
3. Boucle indéfiniment : description anglaise → (pause) → description française → (pause) → résumé de
   mots-clés du texte anglais → (pause) → recommence. Avec le décalage par défaut de 5 s, un cycle complet
   dure 15 s plus le temps que prennent les deux appels LM Studio eux-mêmes.
4. Sur Ctrl+C, tue le processus de capture en arrière-plan (et tout enfant ffmpeg qu'il a engendré) mais
   laisse volontairement LM Studio en cours d'exécution, puisque c'est un service local persistant plutôt
   que quelque chose appartenant à cette exécution du pipeline.

Les prompts anglais et français sont des « humeurs » réglables indépendamment pour la façon dont
l'installation parle de ce qu'elle voit — le pipeline par défaut utilise un cadrage *« humble, eutopique et
existentialiste »*, tandis que la variante allégée d'analyse alternée ci-dessous en utilise un
*« dystopique et nihiliste »*, faisant de la posture interprétative de l'installation elle-même un paramètre
artistique ajustable plutôt qu'un comportement fixe.

### Gestion du processus LM Studio — `manage_lmstudio.sh`

Assure que le serveur d'inférence local est en cours d'exécution et que le modèle vision-langage cible est
chargé, de façon idempotente (sûr à appeler à chaque exécution). Deux points à noter :
- **Épinglage GPU contre inférence CPU seule.** Comme `CUDA_VISIBLE_DEVICES` ne prend effet qu'au lancement
  du processus, le script vérifie si LM Studio tourne déjà sur le GPU voulu et le redémarre correctement
  épinglé sinon — mais le modèle lui-même est ensuite explicitement chargé avec `--gpu off`. Autrement dit,
  le *processus* de LM Studio est maintenu hors des GPU qui font le rendu visuel génératif, tandis que son
  *inférence* tourne entièrement sur CPU — un compromis délibéré de latence (l'inférence CPU est bien plus
  lente) pour garder les deux GPU libres pour le pipeline génératif et le rendu volumétrique, qui comptent
  davantage pour la sortie visuelle en temps réel de l'installation que le temps de réponse exact de la
  boucle d'observation.
- Chaque étape est vérifiée avant d'agir (statut du serveur, liste des modèles via l'API) afin que
  relancer le script en plein spectacle n'interrompe rien qui fonctionne déjà correctement.

### Variante opérationnelle — `run_alternating_analysis.sh`

Un mode plus léger : seulement l'alternance anglais/français, à 5 s d'intervalle, sans gestion de la boucle
de capture ni étape de résumé de mots-clés — utile quand la boucle de capture tourne déjà indépendamment
(par exemple en développement, ou pour une configuration de performance qui n'a pas besoin du pilotage
visuel par mots-clés).

### Fonctionnement sans surveillance — `overnight_monitor.sh`

S'exécute indépendamment du pipeline d'analyse, journalisant une ligne toutes les 60 s : utilisation,
mémoire, température par GPU (signalant tout ce qui atteint ≥ 85 °C, en amont du seuil de limitation
thermique de la carte), et consommation électrique ; si chaque processus clé (`ossia-score`, `Godot_v4`, le
`ffmpeg` de capture, et un processus basé sur Node) est toujours vivant ; si l'API de LM Studio répond
toujours ; et l'espace disque libre (signalant moins de 3 Go libres). Chaque ligne est étiquetée `ALL-OK` ou
`PROBLEM`, de sorte que vérifier une exécution de nuit le lendemain matin se résume à un simple
`grep -c "ALL-OK"` ou `grep -v "ALL-OK"`.

## Référence OSC

| Adresse | Port | Envoyé par | Contenu |
|---|---|---|---|
| `/camera/description` | 9000 | `analyze_latest_frame.py` (anglais) | Description de la scène en anglais |
| `/camera/description` | 9001 | `analyze_latest_frame.py` (français) | Description de la scène en français |
| `/camera/keywords` | 9002 | `summarize_keywords.py` | 1 à 3 mots-clés + suffixe fixe, alimente le pipeline visuel génératif |

Les trois sont envoyés au même hôte OSC (la machine exécutant le pipeline visuel génératif / le patch Ossia
Score), simplement sur des ports différents et, pour les deux descriptions, la même adresse distinguée par
le port.

## Composants mentionnés mais non détaillés ici

- **Carto** (moteur Godot) — le programme de capture volumétrique et de reconstruction en nuage de points.
  Son fonctionnement interne ne fait pas partie de cette analyse (un exécutable compilé a été fourni, pas
  le code source).
- **Le pipeline visuel génératif** (un patch Ossia Score, `diffusion_pipeline.score`) — reçoit les messages
  OSC ci-dessus et pilote l'imagerie Stable Diffusion. Son fonctionnement interne n'a pas non plus été
  examiné ici ; ce document couvre son rôle et ses entrées, pas son implémentation.

## Ce que cela démontre

Au-delà du résultat artistique, ce sous-système a demandé une orchestration multi-processus en temps réel
sur une machine contrainte en GPU (en maintenant délibérément un LLM hors du GPU pour que le rendu et la
génération ne soient pas privés de ressources), une gestion propre du cycle de vie des processus (capture en
arrière-plan avec arrêt correct, une vérification idempotente de disponibilité du service sûre à relancer en
plein spectacle), un pipeline d'inférence multilingue petit mais réel, et des outils de fonctionnement sans
surveillance (journalisation structurée de l'état de santé) construits spécifiquement pour qu'une exécution
de nuit puisse être vérifiée en quelques secondes plutôt qu'en lisant des journaux bruts.
