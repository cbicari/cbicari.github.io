# snake_differ — vue d'ensemble de l'architecture

Firmware : **snake_differ**, un module Puara pour le Seeed XIAO ESP32-S3 Sense.

## Objectif

Un firmware de détection de mouvement qui observe un flux caméra, calcule les différences de pixels image
par image, et diffuse les résultats sous forme de messages OSC via WiFi — afin qu'un DAW, un synthétiseur, ou
un environnement génératif puisse réagir à la présence, la position et la forme d'objets en mouvement dans le
cadre. Conçu à l'origine pour suivre des formes sombres (sculptures cinétiques en bobines) sur un fond clair,
mais fonctionne pour toute source de mouvement sombre sur fond clair.

## Matériel

| | |
|---|---|
| Carte | Seeed XIAO ESP32-S3 Sense |
| Caméra | OV2640 (intégrée) |
| Microphone | PDM (intégré, GPIO 41/42) |
| Sorties moteur | D2 = GPIO 3, D3 = GPIO 4 (PWM, 1 kHz, 10 bits) |
| Connexion | WiFi 2,4 GHz |
| Alimentation | USB-C |

Aucun câblage requis pour la caméra ou le micro ; les sorties moteur nécessitent un pilote externe pour tout
ce qui dépasse un petit signal.

## Vue d'ensemble du système

La caméra et le microphone alimentent le firmware, qui soit diffuse un paquet OSC vers un logiciel récepteur,
soit sert une petite interface web (avec un aperçu MJPEG en direct) dans un navigateur pour calibrer la
caméra avant un spectacle. Les deux chemins partagent la même connexion WiFi et le même stockage de
paramètres sur l'appareil.

- **Chemin OSC** : caméra + micro → firmware → paquet OSC via UDP → tout récepteur compatible OSC (Protokol,
  Max/MSP, un DAW, etc.), environ 30 fois par seconde.
- **Chemin de calibrage** : l'interface web Puara (port 80) expose les pages Config/Scan/Settings, et un flux
  MJPEG optionnel (port 81) montre la même image en niveaux de gris que celle analysée par le firmware, afin
  de régler visuellement la caméra et les seuils avant de désactiver l'aperçu pour la performance.

## Structure des tâches du firmware

En interne, trois morceaux de code s'exécutant en parallèle — deux tâches FreeRTOS plus la boucle principale
Arduino — partagent leur état via des structures protégées par mutex :

1. **Tâche caméra (~30 fps)** — pour chaque image, un seul passage pixel par pixel calcule deux ensembles de
   métriques indépendants à la fois :
   - **Métriques de différence** : compare l'image actuelle à la précédente ; les pixels dont le changement
     dépasse `diffThreshold` comptent comme « en mouvement ». À partir de ces pixels, elle dérive une boîte
     englobante, un centroïde, une vitesse d'image en image, une dispersion (écart-type autour du centroïde),
     un taux de remplissage (densité de mouvement dans la boîte englobante), et une magnitude globale
     (fraction du cadre en mouvement).
   - **Métriques de pixels** : indépendamment du mouvement, tout pixel plus sombre que `pixThreshold` compte
     comme « matière de bobine sombre ». Cela donne une fraction de couverture globale et un centroïde de la
     masse sombre, plus trois valeurs par zone sur une grille de 6×4 = 24 zones : couverture en pixels
     sombres, densité de gradient/contour (indicateur de la façon dont les bobines sont enroulées serré), et
     variance locale de luminosité (richesse de texture).
2. **Tâche micro (~100 Hz)** — lit 512 échantillons PDM à 16 kHz, calcule le RMS, et applique un gain linéaire
   `micGain` plafonné à 1,0.
3. **Boucle principale (~30 Hz)** — lit les deux ensembles de métriques sous leurs verrous, applique un
   **comportement de maintien (« latch »)** (la plupart des valeurs spatiales conservent leur dernier état
   connu quand la scène s'immobilise, plutôt que de revenir brusquement à zéro ; la vitesse, l'indicateur de
   mouvement et le RMS du micro restent toujours en direct), puis soit :
   - construit et envoie le paquet OSC sortant via UDP, soit
   - analyse tout message OSC entrant et met à jour le seuil de différence ou pilote les sorties PWM des
     moteurs en conséquence.

Le serveur web (port 80, issu du module Puara) et le serveur de capture MJPEG optionnel (port 81)
fonctionnent indépendamment de cette boucle, lisant la dernière image brute et les paramètres actuels au
besoin.

## Référence des paramètres

Tous les paramètres se trouvent sur la page web **Settings**, s'appliquent immédiatement sans reflashage, et
persistent au redémarrage.

| Paramètre | Défaut | Notes |
|---|---|---|
| `oscIP` | `192.168.4.2` | IP de l'ordinateur recevant l'OSC |
| `oscPORT` | `8000` | Port UDP sur lequel le récepteur écoute |
| `localPORT` | `8000` | Port UDP sur lequel l'appareil écoute pour l'OSC entrant |
| `diffThreshold` | `30` | Delta de luminosité de pixel (0–255) comptant comme mouvement ; plus bas = plus sensible |
| `videoStream` | `0` | Mettre à `1` pour activer l'aperçu MJPEG sur le port 81 ; désactiver pendant la performance |
| `camContrast` | `0` | Contraste matériel de l'OV2640, plage -2 à 2 ; plus élevé aide les formes sombres à ressortir |
| `micGain` | `10` | Gain linéaire sur le RMS brut du micro, plafonné à 1,0 ; plage pratique 1–100 |
| `pixThreshold` | `100` | Luminosité absolue (0–255) en dessous de laquelle un pixel compte comme matière de bobine sombre |

## Référence OSC

### Paquet sortant — ~30 Hz

Envoyé comme un seul paquet OSC vers `oscIP:oscPORT` ; contient toujours tous les messages ci-dessous. Le nom
de l'appareil provient de `config.json` (par défaut `snake_differ_0`).

| Adresse | Args | Maintien | Description |
|---|---|---|---|
| `/<device>/motion` | `motion (int), magnitude (float)` | mag seulement | État de mouvement actuel et fraction du cadre en mouvement |
| `/<device>/bbox` | `x_min, y_min, x_max, y_max (float×4)` | oui | Boîte englobante du mouvement, normalisée 0–1 |
| `/<device>/centroid` | `cx, cy (float×2)` | oui | Centre de masse des pixels en mouvement, normalisé |
| `/<device>/velocity` | `vx, vy (float×2)` | **non** | Déplacement du centroïde par image ; zéro à l'arrêt |
| `/<device>/spread` | `sx, sy (float×2)` | oui | Écart-type des pixels en mouvement autour du centroïde |
| `/<device>/fill` | `fill (float)` | oui | Densité de mouvement dans la boîte englobante |
| `/<device>/mic` | `rms (float)` | **non** | RMS du micro intégré, normalisé 0–1, indépendant du mouvement visuel |
| `/<device>/coverage` | `coverage (float)` | **non** | Fraction de l'ensemble du cadre sous `pixThreshold` |
| `/<device>/mass` | `cx, cy (float×2)` | **non** | Centroïde de tous les pixels sombres, suit la masse de bobine même à l'arrêt |
| `/<device>/grid/coverage` | 24 flottants | **non** | Fraction de pixels sombres par zone (6×4, ordre ligne par ligne, ligne 0 = haut) |
| `/<device>/grid/density` | 24 flottants | **non** | Magnitude de gradient/contour par zone — étroitesse des bobines |
| `/<device>/grid/texture` | 24 flottants | **non** | Variance locale par zone — richesse de texture |

### Messages entrants

| Adresse | Arg | Description |
|---|---|---|
| `/snake_differ/threshold` | `fraction (float)` | Met à jour `diffThreshold` en direct ; la valeur est une fraction de 255 |
| `/snake_differ/motor1` | `vitesse (int 0–1000)` | Rapport cyclique PWM sur D2 / GPIO 3 |
| `/snake_differ/motor2` | `vitesse (int 0–1000)` | Rapport cyclique PWM sur D3 / GPIO 4 |

## Première configuration

### 1. Flasher le firmware (PlatformIO)

```bash
pio run --target upload
pio run --target uploadfs
```

Nécessite la plateforme `pioarduino` (ESP32 Arduino 3.x) — la plateforme PlatformIO ESP32 2.x standard a un
plantage connu à la réception UDP ; `platformio.ini` pointe déjà vers la bonne plateforme.

### 2. Se connecter au WiFi de l'appareil

Au premier démarrage (ou sans routeur configuré), l'appareil crée son propre point d'accès (SSID
`snake_differ_0`, mot de passe `garnetwillis`).

### 3. Ouvrir l'interface web

`http://snake_differ_0.local` (repli : l'IP par défaut du point d'accès, `192.168.4.1`, ou celle affichée par
le moniteur série). Les pages Config / Scan / Settings s'y trouvent toutes.

### 4. Rejoindre éventuellement un routeur de studio

Sur la page Config, saisir le SSID/mot de passe du routeur et Enregistrer ; l'appareil se connecte au
prochain redémarrage et le point d'accès reste actif en secours.

## Déroulement du calibrage

1. Positionner l'appareil pour que la caméra voie toute la zone d'intérêt.
2. Régler `videoStream = 1`, ouvrir Config, vérifier le cadrage.
3. Ajuster `camContrast` jusqu'à ce que la forme suivie apparaisse clairement plus sombre que le fond.
4. Scène immobile, surveiller le moniteur série (`pio device monitor`) pour un `[diff] no motion` continu.
5. Bouger la forme — des lignes `[diff] mag=...` devraient apparaître immédiatement.
6. Ajuster `diffThreshold` jusqu'à une détection propre avec un minimum de bruit.
7. Régler `videoStream = 0`, saisir `oscIP`/`oscPORT`, Enregistrer.
8. Confirmer que le paquet arrive à ~30 Hz dans Protokol ou le récepteur visé.

## Réception de l'OSC

- **[Protokol](https://hexler.net/protokol)** — moyen le plus rapide de confirmer que l'appareil émet :
  ajouter un écouteur UDP sur le port 8000 et observer le paquet arriver.
- **Max/MSP** — `udpreceive 8000` → `OSC-route /<device>/motion /<device>/bbox ...` → `unpack` par message.
- **Logic Pro** (pas d'OSC natif) — pont via Max/MSP → IAC Driver → Logic (activer l'IAC Driver, mapper les
  valeurs OSC en CC MIDI dans Max, puis les assigner via MIDI-learn dans les Smart Controls de Logic ou un
  plugin), ou utiliser TouchOSC pour transmettre l'OSC en CC MIDI sans avoir besoin de Max.

## Aperçu caméra

Quand `videoStream = 1`, un flux MJPEG est servi sur `http://<ip_appareil>:81/stream` (aussi intégré
directement dans la page Config) via une seule connexion HTTP multipart persistante — pas de sondage, pas
d'aller-retour par image. L'aperçu est la même image en niveaux de gris utilisée pour le calcul de
différence, et `camContrast` affecte les deux. **Désactiver `videoStream` avant un spectacle** — l'encodage
JPEG tourne en continu tant qu'un client est connecté.

## Notes techniques

- Différence + analyse de pixels + fréquence OSC : ~30 fps / ~30 Hz
- Format d'image : QVGA 320×240 niveaux de gris — 76 800 pixels traités par image, en un seul passage
- Grille d'analyse : 6×4 = 24 zones (~80×60 px chacune) ; index de zone = ligne × 6 + colonne, ligne 0 =
  haut, colonne 0 = gauche
- Micro : PDM 16 kHz, RMS sur 512 échantillons, mise à jour ~100 Hz
- PWM moteur : 1 kHz, 10 bits (plage 0–1023 ; entrée 0–1000 mappée directement)
- PSRAM : 8 Mo utilisés pour les tampons d'image ; le firmware journalise une erreur et saute l'initialisation
  caméra si indisponible
- Port 80 : interface web Puara ; port 81 : flux MJPEG (`/stream`), actif uniquement si `videoStream = 1`
- Plateforme : `pioarduino` (ESP32 Arduino 3.x) requise

## Construit avec

- [Puara Module](https://github.com/Puara/puara-module) — WiFi, serveur web, système de fichiers, gestion des paramètres
- [CNMAT OSC](https://github.com/cnmat/OSC) — encodage/décodage OSC
- ESP32 Arduino / ESP-IDF — pilote caméra, I2S PDM, PWM LEDC

---
*Société des Arts Technologiques (SAT) — Montréal*
*Input Devices and Music Interaction Laboratory (IDMIL), Université McGill*
