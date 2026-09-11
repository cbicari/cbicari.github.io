# Antenne — vue d'ensemble de l'architecture

Firmware pour une carte **Olimex ESP32-PoE** connectée à un capteur de mouvement 9DoF **Olimex MOD-MPU9150**
via UEXT, diffusant l'orientation fusionnée et les données brutes des capteurs en OSC via une connexion
Ethernet filaire alimentée en PoE.

## Objectif

Une « antenne » de capteur de mouvement autonome : branchez le module MPU9150 directement dans le connecteur
UEXT de l'ESP32-PoE, alimentez la carte via un seul câble Ethernet (PoE — pas d'alimentation séparée), et
elle diffuse les données d'accéléromètre, de gyroscope, de magnétomètre et d'orientation fusionnée en OSC
vers n'importe quel logiciel récepteur (Max/MSP, Pure Data, TouchDesigner, etc.) à 50 Hz. Le calibrage du
gyroscope s'exécute automatiquement au démarrage, et un calibrage du magnétomètre (ponctuel ou au besoin) —
déclenché par un appui bouton ou un message OSC distant — est conservé en mémoire flash afin de survivre
aux redémarrages.

## Matériel

| Pièce | Référence |
|---|---|
| Carte MCU | Olimex ESP32-PoE (16 Mo de flash) |
| Capteur de mouvement | Olimex MOD-MPU9150 (accéléromètre/gyroscope MPU-6050 + magnétomètre AK8975, dans un seul boîtier) |
| Connexion | Connecteur UEXT — se branche directement, sans câblage |
| Réseau | Ethernet RJ45, alimenté par PoE |
| Broches I2C (UEXT) | SDA = GPIO13, SCL = GPIO16 |
| LED intégrée | GPIO33, actif à l'état haut |
| BTN1 | GPIO34, actif à l'état bas, pull-up externe |

## Vue d'ensemble du système

```
MOD-MPU9150 (UEXT, I2C)
        │
        ▼
Firmware Olimex ESP32-PoE
        │
        ▼
Paquet OSC sortant, Ethernet PoE (50 Hz)
        │
        ▼
Logiciel récepteur (Max/MSP, Pure Data, TouchDesigner, …)
```

L'OSC entrant sur le port 8888 (`/mpu/calibrate`) peut déclencher une session de calibrage du magnétomètre
sur la carte à tout moment, indépendamment du flux de données sortant.

## Boucle principale du firmware

La carte exécute une boucle à fréquence fixe de 50 Hz (`LOOP_MS = 20`) :

```
Démarrage : établir l'Ethernet, charger le biais magnétomètre sauvegardé, calibrer le gyroscope (1 s, capteur immobile)
        │
        ▼
Lire le MPU9150 + AK8975 via I2C (une rafale de 14 octets + registres du magnétomètre)
        │
        ▼
Appliquer le biais du magnétomètre (si calibré), normaliser, fusion Kalman 9 axes (puara-gestures)
        │
        ▼
Envoyer le paquet OSC via Ethernet
        │
        ▼
Mettre à jour la LED, vérifier l'appui de BTN1 et l'OSC entrant (peut déclencher un calibrage)
        │
        ▼
        ↻ se répète toutes les 20 ms
```

1. **Démarrage** — établit la liaison Ethernet (IP statique, jusqu'à 8 s d'attente), charge tout biais de
   magnétomètre précédemment sauvegardé depuis la flash (NVS), initialise le MPU9150 via I2C, et exécute un
   calibrage de biais du gyroscope d'1 seconde (200 échantillons, le capteur devant rester immobile).
2. **Lecture des capteurs** — une rafale de lecture I2C de 14 octets couvre ensemble les registres de
   l'accéléromètre et du gyroscope ; le magnétomètre est lu séparément (via le mode bypass I2C du MPU9150
   donnant un accès direct à l'AK8975 intégré) chaque fois que son bit de données prêtes est activé.
3. **Fusion d'orientation** — si un calibrage du magnétomètre a été effectué, le biais correspondant par
   axe est soustrait avant que le vecteur soit normalisé à une longueur unitaire. Le résultat alimente un
   filtre de Kalman 9 axes (issu de `puara-gestures`) qui fusionne accéléromètre, gyroscope et magnétomètre
   en roulis, tangage, et lacet compensé en inclinaison.
4. **Envoi OSC** — un paquet par itération de boucle, conditionné à ce que la liaison Ethernet soit active.
5. **Gestion LED / entrées** — la machine à états de la LED et le détecteur d'appui long de BTN1 s'exécutent
   à chaque cycle, et toute demande de calibrage OSC entrante est également traitée ici.

## Calibrage du magnétomètre

Les interférences ferromagnétiques (métal à proximité, haut-parleurs, alimentations) décalent le point zéro
du magnétomètre, ce qui fausse le lacet. Le calibrage supprime ce décalage constant — nécessaire une fois
lors de la première installation, et à nouveau chaque fois que la configuration physique de l'instrument
change.

```
Déclencher le calibrage (maintenir BTN1 5s, ou envoyer l'OSC /mpu/calibrate)
        │
        ▼
Fenêtre de rotation de 30 secondes — LED clignotement rapide (4 Hz), suit le min/max par axe
        │
        ▼
Calculer le biais ferromagnétique : biais = (min + max) / 2, par axe
        │
        ▼
Sauvegarder en flash (NVS) — LED fixe pendant 1 seconde confirme la fin
        │
        ▼
Chargé automatiquement à chaque démarrage futur
```

Le calibrage peut être démarré de deux façons — en maintenant le bouton physique, ou en envoyant un message
OSC depuis le même réseau vers lequel la carte diffuse — afin de pouvoir être déclenché soit directement sur
l'instrument, soit à distance depuis le logiciel qui reçoit déjà ses données. Pendant la fenêtre de 30
secondes, faire tourner le capteur à travers toutes les orientations (un mouvement en huit couvrant tous les
axes fonctionne bien) permet au firmware d'enregistrer le minimum et le maximum réels sur chaque axe du
magnétomètre ; le point médian du min/max de chaque axe devient le biais de cet axe. Le résultat est écrit
en mémoire non volatile et survit aux coupures de courant et aux reflashages du firmware.

## États de la LED

| Comportement LED | Signification |
|---|---|
| Éteinte | Pas de liaison Ethernet |
| Clignotement lent (1 Hz) | Connectée et en diffusion |
| Fixe (allumée) | BTN1 est maintenu enfoncé — continuer à maintenir pour démarrer le calibrage |
| Clignotement rapide (4 Hz) | Calibrage du magnétomètre en cours |
| Fixe pendant 1 seconde | Calibrage venant de se terminer avec succès |

## Référence OSC

### Sortant (carte → ordinateur), un paquet toutes les 20 ms

| Adresse | Type | Unité | Description |
|---|---|---|---|
| `/mpu/accel/x` `/mpu/accel/y` `/mpu/accel/z` | float | g | Accéléromètre brut |
| `/mpu/gyro/x` `/mpu/gyro/y` `/mpu/gyro/z` | float | °/s | Gyroscope, corrigé du biais |
| `/mpu/mag/x` `/mpu/mag/y` `/mpu/mag/z` | float | sphère unitaire | Magnétomètre, normalisé ; décalé avant calibrage, centré sur l'origine après |
| `/mpu/euler/roll` | float | ° (0–360) | Rotation autour de X |
| `/mpu/euler/pitch` | float | ° (−90–+90) | Rotation autour de Y |
| `/mpu/euler/yaw` | float | ° (0–360) | Cap, compensé en inclinaison |
| `/mpu/tilt` | float | ° (0–180) | Magnitude d'inclinaison combinée, `sqrt(roll² + pitch²)`, plafonnée |
| `/mpu/btn1` | int | — | 1 tant que BTN1 est maintenu, sinon 0 |
| `/mpu/cal/status` | int | — | 0 = non calibré, 1 = calibrage en cours, 2 = calibré |

### Entrant (ordinateur → carte), port 8888

| Adresse | Arguments | Description |
|---|---|---|
| `/mpu/calibrate` | *(aucun)* | Démarre une session de calibrage du magnétomètre de 30 secondes |

## Paramètres ajustables

| Paramètre | Emplacement | Défaut | Effet |
|---|---|---|---|
| Fréquence d'envoi | `LOOP_MS` | `20` (50 Hz) | Plus bas = mises à jour plus rapides ; ne pas descendre sous `10` (100 Hz) |
| Bruit de processus Kalman (Q) | `kalman(Q, R)` | `0,001` | À quel point le filtre fait confiance à l'intégration du gyroscope ; plus bas = plus lisse mais plus lent à réagir |
| Bruit de mesure Kalman (R) | `kalman(Q, R)` | `0,01` | À quel point le filtre fait confiance aux corrections accéléromètre/magnétomètre ; plus haut = plus lisse mais dérive davantage en cas de perturbation |
| Bande passante DLPF du gyroscope | Écriture registre `R_CONFIG` | `0x04` (~21 Hz) | `0x02`=98 Hz (mouvement rapide) … `0x05`=10 Hz (quasi statique) ; le réglage actuel convient aux mouvements lents et délibérés |

## Structure du projet

```
├── boards/
│   └── esp32-poe-16mb.json     définition de carte PlatformIO personnalisée
├── examples/
│   ├── ESP32_PoE_Ethernet_SD_Card_Arduino.ino
│   ├── ESP32_PoE_WebServer_Demo.ino
│   └── MagnetometreCalibrationDemo.cpp
├── mpu9150_demo/                démo brute originale du capteur
├── src/
│   └── main.cpp                 firmware (à modifier)
└── platformio.ini
```

Les dossiers `examples/` et `mpu9150_demo/` sont du matériel de référence inclus, ne faisant pas partie du
firmware réellement exécuté — chacun provient d'une origine différente et est conservé pour référence
plutôt qu'exécuté :

- **`mpu9150_demo.ino`** — la démo originale des registres I2C bruts du MPU-9150 (domaine public, par
  l'utilisateur Arduino « frtrobotik » / Tobias Hübner, édition Olimexino par Chris B.) dont dérive la
  logique des registres de capteur de ce projet.
- **`MagnetometreCalibrationDemo.cpp`** — un exemple de référence de calibrage du magnétomètre issu d'un
  autre projet de l'IDMIL (GuitarAMI, Edu Meneses, construit sur les modèles Puara), conservé ici comme point
  de comparaison pour l'expérience de calibrage sur une pile IMU plus complète (LSM9DS1/BNO080).
- **`ESP32_PoE_WebServer_Demo.ino`** — une démo de serveur web générique pour la carte Olimex ESP32-PoE
  (contrôle divers modules UEXT Olimex), originellement par David Bird, adaptée pour cette carte — sans
  rapport avec le MPU9150 mais utile comme référence de périphériques ESP32-PoE.
- **`ESP32_PoE_Ethernet_SD_Card_Arduino.ino`** — une démo combinée de mise en route carte SD + Ethernet pour
  la même carte.

## Définition de carte PlatformIO personnalisée

`boards/esp32-poe-16mb.json` définit la variante 16 Mo de flash de l'Olimex ESP32-PoE pour PlatformIO,
puisqu'elle ne fait pas partie des cartes intégrées par défaut : table de partitions et script de l'éditeur
de liens corrects pour 16 Mo de flash, câblage du PHY Ethernet spécifique à cette carte (LAN8720 via RMII,
broches MDC/MDIO, broche d'alimentation, mode d'horloge), et paramètres de téléversement (921 600 bauds,
esptool/espota).

## Dépendances

Gérées automatiquement par PlatformIO :

- [CNMAT OSC](https://github.com/CNMAT/OSC) — bibliothèque de messages/paquets OSC
- [puara-gestures](https://github.com/Puara/puara-gestures) — filtre de Kalman 9 axes pour l'orientation
- Framework Arduino ESP32 (Espressif32, via PlatformIO)
