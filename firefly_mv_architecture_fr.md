# Firefly MV / dc1394 setup — vue d'ensemble de l'architecture

Projet : [`cbicari/firefly-mv-dc1394-setup`](https://github.com/cbicari/firefly-mv-dc1394-setup)

## Objectif

Ce projet configure une caméra de vision industrielle Point Grey **Firefly MV (série FMVU)**, protocole IIDC/DCAM, sur Ubuntu (24.04/26.04), afin qu'elle puisse être :

- utilisée par un utilisateur normal (sans droits root), et
- exploitée comme une webcam V4L2 ordinaire par des applications courantes (Cheese, un navigateur, VLC, etc.), même si elle parle nativement le protocole IIDC/DCAM et non V4L2.

Tout est piloté par un unique script idempotent, `install.sh`, qui peut être relancé sans risque.

## Structure du dépôt

| Chemin | Rôle |
|---|---|
| `install.sh` | Orchestre l'ensemble de l'installation : paquets, règle udev, appartenance au groupe, module noyau, compilation de l'outil de test |
| `udev/99-pointgrey-dc1394.rules` | Règle udev accordant un accès USB non-root à la caméra |
| `config/v4l2loopback.conf` | Options du module `v4l2loopback` (nom du périphérique, index, etc.) |
| `config/v4l2loopback-load.conf` | Assure le chargement automatique du module au démarrage |
| `tools/dc1394_grab_test.c` | Petit programme C utilisant `libdc1394` pour énumérer/capturer des images directement, à des fins de test |
| `tools/start_virtual_cam.sh` | Démarre le pont GStreamer qui alimente le périphérique de caméra virtuelle |
| `camera_hardware.md` | Notes sur le matériel physique de la caméra |

## Architecture

Une fois la caméra branchée et la règle udev active, l'installation crée **deux chemins parallèles** :

```
                    Caméra Firefly MV
                   (IIDC/DCAM via USB)
                            │
                            ▼
                       Règle udev
            (accorde l'accès au groupe plugdev)
                    ┌───────┴───────┐
                    ▼               ▼
              libdc1394         Pont GStreamer
        (API C, accès direct)  (start_virtual_cam.sh)
                    │               │
                    ▼               ▼
           dc1394_grab_test     v4l2loopback
        (test de capture brute) (module noyau, dkms)
                                    │
                                    ▼
                              /dev/video10
                     « Firefly MV Virtual Camera »
                                    │
                                    ▼
                          Applications clientes
                       (Cheese, navigateur, VLC, …)
```

### 1. Couche d'accès matériel

La caméra s'énumère comme un périphérique USB. La règle udev (`99-pointgrey-dc1394.rules`) définit les permissions afin que tout utilisateur membre du groupe `plugdev` puisse ouvrir le périphérique sans `sudo`. `install.sh` copie cette règle dans `/etc/udev/rules.d/`, recharge udev, et ajoute l'utilisateur courant au groupe `plugdev`.

### 2. Chemin direct / test (libdc1394)

`dc1394_grab_test.c` est compilé avec `libdc1394-2` et permet de vérifier que la caméra est visible et capable de fournir des images, indépendamment de toute la mécanique de caméra virtuelle. C'est le moyen le plus rapide de valider le matériel et la configuration udev.

### 3. Chemin webcam virtuelle (GStreamer + v4l2loopback)

- `v4l2loopback` est un module noyau (compilé via DKMS) qui crée un faux périphérique V4L2, ici exposé en tant que `/dev/video10` et nommé « Firefly MV Virtual Camera ». Son comportement (nom/index du périphérique) est défini via `config/v4l2loopback.conf`, et `config/v4l2loopback-load.conf` garantit son chargement au démarrage.
- `tools/start_virtual_cam.sh` exécute un pipeline GStreamer qui lit les images de la caméra physique et les écrit dans le périphérique `v4l2loopback`.
- Une fois actif, `/dev/video10` se comporte comme une webcam standard : les applications compatibles V4L2 peuvent la sélectionner et l'utiliser sans rien connaître du protocole IIDC/DCAM ni de `libdc1394`.

## Déroulement de l'installation (`install.sh`)

1. Installer les paquets requis (`libdc1394-dev`, `libusb-1.0-0-dev`, `v4l2loopback-dkms`, greffons GStreamer, etc.).
2. Installer la règle udev, puis recharger/déclencher udev.
3. Ajouter l'utilisateur courant au groupe `plugdev`.
4. Installer les fichiers de configuration du module `v4l2loopback`.
5. Compiler `v4l2loopback` pour le noyau en cours via `dkms autoinstall`.
6. Charger le module `v4l2loopback`.
7. Compiler `dc1394_grab_test`.
8. Vérifier la présence de `/dev/video10` (« Firefly MV Virtual Camera »).

## Utilisation typique après installation

```bash
# Test de capture brute via libdc1394
./tools/dc1394_grab_test 5

# Démarrer le pont webcam virtuelle (Ctrl+C pour arrêter)
./tools/start_virtual_cam.sh
```

Ouvrez ensuite Cheese, le sélecteur de caméra d'un navigateur, ou `vlc v4l2:///dev/video10`, et choisissez « Firefly MV Virtual Camera ».

## Remarques

- Un redémarrage ou un débranchement/rebranchement peut être nécessaire la première fois, pour que la règle udev et l'appartenance au groupe `plugdev` prennent pleinement effet.
- Si `dkms autoinstall` échoue (par exemple, absence des `linux-headers` correspondants sur un noyau personnalisé), il faut installer manuellement les en-têtes correspondants et réinstaller `v4l2loopback` pour cette version de noyau.
