# Installation du pendule — vue d'ensemble de l'architecture firmware

Firmware d'une grande installation cinétique en forme de pendule, construite à partir d'une chaîne de
segments de bras motorisés et d'un propulseur électromagnétique rotatif à la base. Quatre projets
[PlatformIO](https://platformio.org/) indépendants ciblent des cartes Teensy 4.1 — un par segment de bras
(petit, moyen, long) plus un pour le propulseur — partageant la même couche de communication OSC mais chacun
avec sa propre géométrie physique, son nombre de moteurs, et son espace de noms d'adresses OSC.

## Topologie matérielle

Les commandes arrivent sur le réseau sous forme de messages OSC, qui atteignent une unité **NGIMU de x-io
Technologies** faisant office de pont OSC-vers-série. Chaque contrôleur Teensy 4.1 reçoit l'OSC à la fois
directement via son port série USB et via le NGIMU sur son port série auxiliaire (`Serial1`), décodé par une
couche OSC encadrée en SLIP (`Receive.cpp`/`Send.cpp`, basée sur la bibliothèque OSC99 de Seb Madgwick avec
une couche `EventScheduler`/`EventTrigger` pour les envois périodiques ou déclenchés par événement).

Chaque Teensy pilote son propre matériel d'actionnement :
- Les trois **contrôleurs de bras** (petit, moyen, long) pilotent chacun 2 à 3 moteurs de chariot linéaire via
  une **carte de commande moteur Cytron**, dont l'alimentation est contrôlée par une broche MOSFET, à l'aide
  d'une broche PWM de vitesse et d'une broche numérique de direction par moteur, avec un `Encoder` en
  quadrature par moteur pour la rétroaction de position en boucle fermée et des interrupteurs de fin de course
  mécaniques pour le calibrage et les arrêts d'urgence.
- Le **contrôleur du propulseur** pilote directement un anneau de **bobines électromagnétiques** via une
  broche PWM de puissance et une broche de polarité/direction, à l'aide d'un unique `Encoder` rotatif pour
  synchroniser les impulsions des bobines avec la position du pendule en balancement.

## Boucle firmware partagée

Les quatre variantes de firmware partagent la même structure de boucle globale, construite à partir de la
même paire générique `Receive.cpp` / `Send.cpp` :

1. **Entrée OSC (SLIP)** — `ReceiveDoTasks()` récupère des octets à la fois depuis le port série USB et le
   port série auxiliaire du NGIMU, alimentant deux décodeurs SLIP indépendants.
2. **Répartition par adresse** — chaque message OSC décodé est comparé à un motif d'adresse littéral (p. ex.
   `/smallArm/destinationM1`, `/booster/activeZone`) et met à jour l'état pertinent du contrôleur : la
   `destination` d'un moteur, un indicateur comme `brakeState` ou `broadcast`, ou déclenche une action comme
   `calibrate()`.
3. **Boucle de contrôle** — les contrôleurs de bras vérifient les interrupteurs de fin de course
   (anti-rebond via `Bounce`), exécutent la machine à états de calibrage si active, et sinon pilotent les
   moteurs vers leurs destinations ; le contrôleur du propulseur lit son encodeur rotatif, détermine la
   direction du balancement, et évalue quelle « zone » d'électroaimants est active.
4. **Entrées/sorties matérielles** — les signaux PWM/direction sortent vers le pilote Cytron ou le pilote de
   bobines ; l'état des encodeurs et interrupteurs de fin de course revient en entrée.
5. **Télémétrie planifiée** — `SendDoTasks()` exécute un `EventScheduler` qui empaquette périodiquement
   l'état (positions des moteurs, statut de calibrage, déclenchements de fin de course, erreurs, etc.) en
   messages OSC renvoyés via `Serial1` vers le NGIMU, sous réserve de l'indicateur `broadcast`/`broadcastState`
   propre à chaque contrôleur.

Cette boucle se répète indéfiniment dans le `loop()` de chaque `.ino`.

## Chaîne des segments de bras

Les trois firmwares de bras partagent la même mécanique sous-jacente de `motor`/interrupteurs de fin de
course/calibrage, mais décrivent des points différents d'une même chaîne mécanique, de la base rotative
jusqu'à l'extrémité :

| Segment | Moteurs | Rôle de chaque moteur |
|---|---|---|
| **Propulseur** (base) | — (anneau de bobines) | Entraîne électromagnétiquement le balancement rotatif du pendule |
| **Bras long** | M1, M2, M3 | M1 = chariot amortisseur ; M2 = récepteur, se connecte à l'axe du propulseur/de la base ; M3 = émetteur, se connecte au récepteur du bras moyen |
| **Bras moyen** | M1, M2, M3 | M1 = chariot amortisseur ; M2 = récepteur, se connecte à l'émetteur du bras long ; M3 = émetteur, se connecte au récepteur du petit bras |
| **Petit bras** (extrémité) | M1, M2 | M1 = chariot amortisseur ; M2 = récepteur, se connecte à l'émetteur du bras moyen |

À l'intérieur de chaque bras, des constantes `SAFE_DISTANCE_*` imposent un écart minimal (en tics d'encodeur)
entre chariots adjacents afin qu'ils ne puissent jamais entrer en collision physique, et les `min_pos`/`max_pos`
de chaque chariot sont recalculés en continu par rapport à ses voisins dans `update_motor_positions()`.

### Spécificités par bras

| | Petit bras | Bras moyen | Bras long |
|---|---|---|---|
| Moteurs | 2 | 3 | 3 |
| Interrupteurs de fin de course | 3 (haut, mi-haut, bas) | 4 (haut, mi-haut, mi-bas, bas) | 4 (haut, mi-haut, mi-bas, bas) |
| Frein | Oui (`brakeControlPin`, `checkBrakeState()`) | Non — gestionnaire OSC de frein commenté, aucune vérification de frein dans la boucle | Oui (`brakeState` rétabli, vérifié via OSC et `checkBrakeState()`) |
| Tics pleine échelle | 300 000 (`CALIBRATE_MAX_SMALL_ARM`) | 800 000 (`CALIBRATE_MAX_MIDDLE_ARM`) | 6 791 754 (`CALIBRATE_MAX_LONG_ARM`), ≈137 cm du haut au bas |
| Espace de noms OSC | `/smallArm/...` | `/middleArm/...` | `/longArm/...` |
| Type de structure | `pendulum_small_arm` | `pendulum_mid_long_arms` (instance `middleArm`) | `pendulum_mid_long_arms` (instance `longArm`) |

La routine de calibrage de chaque bras pilote ses moteurs extrêmes jusqu'à leurs interrupteurs de fin de
course pour remettre les encodeurs à zéro, puis enregistre `min_pos`/`max_pos` pour le reste de l'exécution.
Une étape `move_motors()` réduit la vitesse PWM par paliers de distance fixes à mesure qu'un chariot approche
de sa destination (`motor_movement()`), et donne un court « boost » PWM si un moteur semble bloqué (position
inchangée pendant environ 5000 itérations de boucle).

### Reprise après coupure d'alimentation (petit bras / bras moyen / bras long)

Les trois firmwares de bras conservent les dernières positions connues des moteurs en EEPROM (structure à
nombre magique, `saveLastKnownPositions()` / `loadLastKnownPositions()`) :
- Enregistrées avec `EEPROM_RELIABILITY_CLEAN` dès que tous les moteurs se stabilisent dans leurs bornes.
- Sauvegardées périodiquement avec `EEPROM_RELIABILITY_APPROX` pendant que les moteurs sont activement en
  mouvement (toutes les `AUTOSAVE_INTERVAL_MS`), au cas où l'alimentation serait coupée en plein mouvement.
- Au démarrage, une position sauvegardée valide permet au bras de reprendre sans passer par un calibrage
  complet ; le niveau de fiabilité est diffusé via OSC (`/*/resumeReliability`) afin que l'opérateur sache si
  la position reprise est exacte ou approximative.

## Propulseur : entraînement rotatif électromagnétique

Le propulseur est architecturalement différent des trois bras — au lieu de faire avancer des chariots le long
d'un rail, il pulse un anneau de bobines électromagnétiques pour ajouter de l'énergie au balancement rotatif
du pendule, synchronisé avec un unique encodeur rotatif :

- **Détection de direction** : comparer la nouvelle position de l'encodeur à la précédente (dans une bande de
  garde autour du passage à zéro de l'encodeur, `LIMIT_Z_ORIGIN_NEGATIVE`/`_POSITIVE`) détermine si le
  pendule se balance actuellement dans le sens horaire ou antihoraire.
- **Zones de position** : la plage de balancement de l'encodeur est divisée en bandes « sur bobine »,
  « entre bobines » et « mortes » (structures `Bound`/`Zone`, tables de positions précalculées). Selon la
  **zone active** sélectionnée (0 à 3), un ensemble progressivement plus grand de paires d'électroaimants est
  considéré actif — la zone 0 utilise les 3 paires les plus internes, jusqu'à la zone 3 qui utilise toutes les
  paires sur toute la plage de balancement.
- **Activation des bobines** : lorsque la position actuelle tombe dans une bande active « sur bobine » ou
  « entre bobines », la bobine est activée à `pwm_strength` avec une polarité choisie selon la direction du
  balancement et le type de bande, de sorte que le champ pousse toujours le pendule vers l'avant plutôt que de
  le freiner ; les positions dans la bande « morte » reçoivent un PWM nul.
- **Contrôles exposés via OSC** : `/booster/on` (activer/désactiver), `/booster/strength` (amplitude PWM),
  `/booster/activeZone` (0–3), `/booster/brakeState`, et `/rotary/broadcast` (télémétrie activée/désactivée).
  La télémétrie (`/rotary/value`) rapporte la position brute de l'encodeur à un intervalle lent de 60 secondes.

## Référence OSC

### Contrôleurs de bras (`smallArm` / `middleArm` / `longArm`)

| Adresse | Sens | Fonction |
|---|---|---|
| `/*/destinationM1`, `/*/destinationM2`, `/*/destinationM3`* | entrée | Définit la position cible d'un moteur (échelle 0–1000, convertie en tics d'encodeur) |
| `/*/calibrate` | entrée | Démarre (ou redémarre) la routine de calibrage |
| `/*/stopAllMotors` | entrée | Met à zéro toutes les sorties PWM et fige la position actuelle comme destination |
| `/*/brakeState` | entrée | Engage/relâche le solénoïde de frein (petit bras et bras long uniquement) |
| `/*/broadcast` | entrée | Active/désactive la télémétrie de ce contrôleur |
| `/*/positionM1`, `/*/positionM2`, `/*/positionM3`* | sortie | Position actuelle du moteur |
| `/*/calibrationStatus` | sortie | Indique si le calibrage est terminé |
| `/*/resumeReliability` | sortie | État de reprise EEPROM : aucune / propre / approximative |
| `/*/maxPossiblePositionM1`, `/*/minPossiblePositionM2`, etc. | sortie | Bornes de plage sûre en direct, dérivées des chariots voisins |
| `/*/limitSwitch0N Triggered` | sortie | Notification ponctuelle qu'un interrupteur de fin de course s'est déclenché |
| `/teensy/error` | sortie | Chaîne d'erreur générique (adresse OSC invalide, échec de décodage, etc.) |

\* `destinationM3`/`positionM3` n'existent que sur le firmware du bras moyen et du bras long (3 moteurs).

### Contrôleur du propulseur

| Adresse | Sens | Fonction |
|---|---|---|
| `/booster/on` | entrée | Active/désactive l'activation des bobines (met aussi le PWM à zéro immédiatement si désactivé) |
| `/booster/strength` | entrée | Amplitude PWM appliquée à une bobine active |
| `/booster/activeZone` | entrée | Sélectionne combien de paires d'électroaimants sont actives (0–3) |
| `/booster/brakeState` | entrée | Engage/relâche le frein du propulseur |
| `/rotary/broadcast` | entrée | Active/désactive la télémétrie |
| `/rotary/value` | sortie | Position brute de l'encodeur rotatif (envoyée toutes les 60 s) |
| `/teensy/error` | sortie | Chaîne d'erreur générique |

## Compilation

Chaque variante est son propre projet PlatformIO ciblant un Teensy 4.1 :

```ini
[env:teensy41]
platform = teensy
board = teensy41
framework = arduino

monitor_port = /dev/ttyACM0
monitor_speed = 9600
```
