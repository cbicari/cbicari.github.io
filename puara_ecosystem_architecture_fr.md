# Framework Puara — vue d'ensemble de l'architecture de l'écosystème

Projets : [`Puara/puara-module`](https://github.com/Puara/puara-module),
[`Puara/puara-module-templates`](https://github.com/Puara/puara-module-templates),
[`Puara/puara-arduino`](https://github.com/Puara/puara-arduino),
[`Puara/puara-gestures`](https://github.com/Puara/puara-gestures)

Développé par la **Société des Arts Technologiques (SAT)** et le **Input Devices and Music Interaction
Laboratory (IDMIL)**.

## Objectif

Puara est un framework pour construire des contrôleurs musicaux en réseau et des installations interactives
sur des cartes ESP32. Plutôt qu'un seul dépôt, c'est un écosystème de quatre dépôts aux rôles distincts et
complémentaires : une bibliothèque centrale pour l'appareil, une bibliothèque de capteurs vers gestes, et deux
conditionnements spécifiques à l'IDE de firmwares d'exemple prêts à flasher, construits par-dessus les deux.

## Vue d'ensemble de l'écosystème

- **[`puara-module`](https://github.com/Puara/puara-module)** — la bibliothèque C++ centrale. Gère le WiFi
  (station/point d'accès), un serveur web accessible par navigateur, et un stockage de paramètres appuyé sur
  le système de fichiers, afin qu'un appareil puisse être configuré et reconfiguré depuis un navigateur sans
  recompiler ni reflasher le firmware.
- **[`puara-gestures`](https://github.com/Puara/puara-gestures)** — une bibliothèque C++ séparée et
  indépendante qui transforme les signaux de capteurs bruts (accéléromètre/IMU, matrices tactiles, boutons)
  en descripteurs de gestes de plus haut niveau (jab, secousse, inclinaison/roulis, glissement/balayage
  tactile, appui/maintien de bouton). Elle ne dépend pas de `puara-module` et peut être utilisée seule dans
  n'importe quel projet C++.
- **[`puara-module-templates`](https://github.com/Puara/puara-module-templates)** — des modèles de projet
  PlatformIO qui combinent `puara-module` (et, le cas échéant, `puara-gestures`, la bibliothèque OSC de
  CNMAT, le BLE, ou libmapper) en huit appareils d'exemple prêts à compiler, pour VS Code + PlatformIO.
- **[`puara-arduino`](https://github.com/Puara/puara-arduino)** — les mêmes exemples sous-jacents, tenus
  synchronisés avec `puara-module-templates`, mais conditionnés en tant que sketchs Arduino distribués via la
  bibliothèque Arduino `puara-module` (`File > Examples > puara-module`) pour l'IDE Arduino 2.0. Propose
  actuellement cinq des huit modèles (basic, OSC-Send, OSC-Receive, OSC-Duplex, BLE advertising).

## Comment les dépôts s'articulent

`puara-module` et `puara-gestures` sont les deux bibliothèques centrales — indépendantes l'une de l'autre,
chacune utilisable seule. Les deux dépôts de modèles consomment toutes deux ces bibliothèques pour produire
des projets d'exemple prêts à flasher, un conditionnement pour chaque chaîne d'outils prise en charge ; les
projets sont maintenus équivalents entre les deux afin qu'une personne puisse suivre soit le chemin
PlatformIO soit le chemin Arduino et obtenir le même comportement. Les deux chemins se terminent de la même
façon : compiler et téléverser le firmware, puis séparément compiler et téléverser l'image du système de
fichiers (LittleFS par défaut, SPIFFS en option), sur une carte ESP32 physique.

## Fonctionnement en direct sur l'appareil, commun à chaque modèle

Quel que soit le modèle ou l'IDE utilisé pour le construire, chaque appareil résultant suit la même forme
d'exécution :

1. **Démarrage WiFi** — au démarrage, le gestionnaire de module lit `config.json` depuis le système de
   fichiers et tente l'un des trois modes : **Station-Point d'accès (STA-AP)**, le défaut, où l'appareil
   rejoint à la fois un réseau existant et crée le sien ; **Point d'accès (AP) seul**, où il ne crée que son
   propre réseau ; ou **Station (STA) seule** (`persistent_AP=0`), où il ne rejoint qu'un réseau existant et
   n'annonce jamais le sien, utile pour réduire la pollution WiFi et renforcer la sécurité.
2. **Serveur web** — un serveur accessible par navigateur expose les pages Config, Scan et Settings,
   accessibles soit par adresse IP (p. ex. `http://192.168.4.1` en mode AP, ou l'adresse issue de
   `puara.staIP()` en mode STA/STA-AP), soit, si le mDNS est activé (par défaut), par nom d'hôte (p. ex.
   `http://puara_001.local`). Via cette interface, les valeurs définies dans `/data/settings.json` peuvent
   être modifiées et persistent au redémarrage, et sont lues dans le code avec
   `puara.getVarText("nom")` / `puara.getVarNumber("nom")`.
3. **Boucle du programme utilisateur** — la propre logique du sketch s'exécute ici : lecture des capteurs,
   passage optionnel par les descripteurs `puara-gestures`, et réaction aux événements.
4. **Sortie OSC / BLE** — selon le modèle, cette étape envoie les données de capteurs ou de gestes sous
   forme de messages OSC (via la bibliothèque OSC de CNMAT), reçoit de l'OSC entrant pour contrôler des
   sorties, ou diffuse des données sans connexion via l'advertising BLE.

Un callback `onSettingsChanged()` enregistré relit les paramètres mis à jour chaque fois que l'utilisateur
enregistre des modifications via l'interface web, de sorte que des paramètres comme l'IP/port OSC prennent
effet immédiatement sans recompilation.

**Le firmware et le système de fichiers sont deux téléversements distincts.** Le firmware est la logique de
programme compilée ; le système de fichiers (LittleFS/SPIFFS) contient `config.json`, `settings.json`, et le
HTML/CSS de l'interface web — les deux doivent être compilés et téléversés (PlatformIO :
`Upload Filesystem Image` + `Upload` ; IDE Arduino : la commande
`Upload LittleFS to Pico/ESP8266/ESP32` du plugin
[Arduino-LittleFS-Upload](https://github.com/earlephilhower/arduino-littlefs-upload), plus le téléversement
normal du sketch).

## Modèles / exemples disponibles

`puara-module-templates` (PlatformIO) et `puara-arduino` (IDE Arduino) proposent tous deux les mêmes exemples
sous-jacents ; le tableau ci-dessous indique lesquels sont actuellement disponibles dans chacun.

| Modèle | Ce qu'il démontre | Dans `puara-module-templates` | Dans `puara-arduino` |
|---|---|---|---|
| **Basic** | Fonctionnalité de base du module : lit les paramètres, affiche des données de capteur factices sur le port série | ✅ | ✅ |
| **OSC-Send** | Envoie des données de capteur en OSC vers une IP/port configurable | ✅ | ✅ |
| **OSC-Receive** | Reçoit de l'OSC (p. ex. `/led/brightness f 0.34`) et pilote une sortie | ✅ | ✅ |
| **OSC-Duplex** | Combine OSC-Send et OSC-Receive dans un seul sketch | ✅ | ✅ |
| **BLE advertising** | Diffuse des données de capteur encodées en CBOR via l'advertising BLE, sans connexion nécessaire | ✅ | ✅ |
| **Basic Gestures** | Étend Basic avec la reconnaissance de gestes `puara-gestures` sur un pseudo-IMU | ✅ | — |
| **Button OSC** | Détection d'appui/double-appui/maintien de bouton via `puara-gestures`, envoyée en OSC | ✅ | — |
| **Libmapper OSC** | Enregistre des signaux auprès de libmapper en parallèle de la messagerie OSC | ✅ | — |

## Puara Gestures : descripteurs et utilitaires

`puara-gestures` est volontairement découplé du réseau ou des spécificités matérielles — il transforme
simplement des flux numériques de capteurs en signaux en forme de geste :

| Descripteur | Fonction |
|---|---|
| `Jab`, `Jab2D`, `Jab3D` | Détecteurs simples de rafale de mouvement sur 1, 2 ou 3 axes |
| `Shake`, `Shake2D`, `Shake3D` | Suivi lissé de l'énergie de mouvement pour vibration/secousse, avec seuil et décroissance |
| `Tilt`, `Roll` | Signaux d'orientation à partir de données IMU 9DoF complètes |
| `Tilt_Roll` | Roulis/inclinaison rapide à partir de l'accéléromètre seul (pas besoin de gyro/magnétomètre) |
| `TouchArrayGestureDetector` | Fonctionnalités de type glissement/frottement et balayage pour matrices tactiles |
| `Button` | Suivi d'appui, double-appui, maintien et comptage d'appuis depuis une entrée numérique |

Utilitaires `utils/` en support : `rollingminmax` (min/max glissant), `leakyintegrator` (décroissance
lissée / suivi d'énergie), `maprange` (mise à l'échelle de plage), `smooth` (moyenne mobile), `threshold`
(écrêtage), `wrap` (enroulement d'angle), `discretizer` (détection de changement),
`circularbuffer` (historique de taille fixe).

`puara-gestures` se compile de façon autonome via CMake, ou comme entrée `lib_deps` PlatformIO
(`https://github.com/Puara/puara-gestures.git#v0.2.0`), optionnellement associé à
`https://github.com/malloch/IMU_Sensor_Fusion.git` pour un support complet de fusion de capteurs IMU.

## Exemple de flux de données : advertising BLE → OSC

Le modèle d'advertising BLE est le seul exemple qui traverse explicitement vers un second outil, hors dépôt :

1. L'ESP32 diffuse les données de capteur sous forme de charges utiles CBOR à l'intérieur des données
   constructeur BLE, à une fréquence configurable (50 Hz par défaut) — aucune connexion BLE n'est établie,
   de sorte qu'un seul récepteur peut capter les données de nombreux appareils à la fois (testé avec environ
   120 appareils sur une portée de 0 à 150 m, avec des mises à jour toutes les 500 ms).
2. Un script Python séparé,
   [`ble-cbor-to-osc.py`](https://gitlab.com/sat-mtl/collaborations/2024-iot/ble-cbor-to-osc) (son propre
   dépôt GitLab, exécuté dans son propre environnement virtuel), écoute ces annonces BLE, décode la charge
   utile CBOR, et transmet les valeurs sous forme de messages OSC vers `127.0.0.1:9001` par défaut
   (configurable).

Ce motif — diffusion BLE sans connexion en entrée, OSC en sortie sur l'ordinateur récepteur — convient aux
réseaux de capteurs distribués et aux installations avec de nombreux appareils simultanés à faible débit de
données, où des connexions BLE par appareil ne passeraient pas à l'échelle.

## Pour commencer

**PlatformIO (`puara-module-templates`) :**
1. Installer VS Code + l'extension PlatformIO.
2. `git clone https://github.com/Puara/puara-module-templates.git`
3. Dans PlatformIO, « Pick a folder » et ouvrir l'un des sous-dossiers de modèles (p. ex. `basic/`).
4. Régler le champ `board` dans `platformio.ini` pour correspondre à votre matériel.
5. Modifier le modèle, puis **Build**/**Upload** le firmware et **Build**/**Upload Filesystem Image**
   séparément.

**IDE Arduino (`puara-arduino`) :**
1. Installer l'IDE Arduino 2.0, le paquet de cartes ESP32 (Boards Manager → rechercher « esp32 » → installer
   *Espressif Systems*), et le plugin
   [Arduino-LittleFS-Upload](https://github.com/earlephilhower/arduino-littlefs-upload).
2. Installer la bibliothèque `puara-module` via le gestionnaire de bibliothèques.
3. `File > Examples > puara-module` → choisir un modèle.
4. Régler la carte/le port, et sous `Tools > Partition Scheme` choisir une option de type SPIFFS minimal
   pour laisser assez de place au programme.
5. Modifier `data/config.json` (SSID/PSK WiFi) et `data/settings.json` (variables personnalisées) via
   `Sketch > Show Sketch Folder`.
6. Téléverser le sketch normalement, puis utiliser la commande `Upload LittleFS to Pico/ESP8266/ESP32` du
   plugin LittleFS-Upload pour le système de fichiers.

## Cartes testées

| Carte | Statut | ID PlatformIO | Carte IDE Arduino |
|---|---|---|---|
| M5StickC | ✅ | `m5stick-c` | M5StickC |
| TinyPICO | ✅ | `tinypico` | UM TinyPico |
| ESP32-C3-WROOM-02 / DevKitC-02 | ✅ | `esp32-c3-devkitc-02` | ESP32C3 Dev Module |
| Adafruit ESP32-S3 Feather | ⚠️ entrée manuelle en mode boot, série lent | `adafruit_feather_esp32s3` | Adafruit Feather ESP32-S3 2MB PSRAM |
| Adafruit ESP32-S3 TFT Feather | ⚠️ mêmes réserves | `adafruit_feather_esp32s3_tft` | Adafruit Feather ESP32-S3 TFT |
| Seeed XIAO S3 | ⚠️ mêmes réserves | `seeed_xiao_esp32s3` | XIAO_ESP32S3 |
| DOIT ESP32 DevKit V1 | ⚠️ aucune option de partition minimale dans l'IDE Arduino (fonctionne via PlatformIO) | `esp32doit-devkit-v1` | DOIT ESP32 DEVKIT V1 |

## Licence

Les quatre dépôts sont sous licence MIT, sauf indication contraire dans un fichier spécifique.
