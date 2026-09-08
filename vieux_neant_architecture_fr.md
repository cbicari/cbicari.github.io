# Vieux Néant — instrument modulaire de percussion et de texture

Un instrument Eurorack de 20 modules (313 HP répartis sur 3 rangées), conçu comme une voix autonome de
percussion et de texture pour la musique électronique expérimentale improvisée.

## Objectif

Ce système est le fruit d'une recherche sur la façon de construire un **instrument de batterie basé sur
l'improvisation** pour la musique électronique expérimentale — un instrument où le rythme, la hauteur et le
timbre ne sont pas programmés à l'avance mais façonnés en direct. Le concevoir a demandé de travailler
simultanément sur plusieurs corps de connaissances qui se recoupent :

- **Relations musicales traditionnelles** — le séquencement, la hauteur, le rythme, et leur
  interdépendance, puisqu'un instrument de percussion a quand même besoin d'une relation cohérente entre
  horloge, déclenchement et hauteur/CV, même quand rien n'est fixé à l'avance.
- **Timbre et tonalité** — la méthode de synthèse (numérique, modale/modélisation physique, granulaire), et
  la façon dont chacune apporte un caractère percussif ou textural distinct.
- **L'improvisation dans les « musiques nouvelles »** — concevoir pour un interprète qui réagit et façonne
  l'instrument en direct, plutôt que pour une structure compositionnelle fixe.
- **Distribution électronique** — la couche pratique de routage de signal sous tout ce qui précède :
  multiples tamponnés, modules utilitaires/multifonctions, et distribution de CV permettant à un même geste
  ou à une même horloge d'atteindre plusieurs destinations de façon fiable.

Le résultat est documenté ci-dessous comme le serait n'importe quel système de signal : sous forme
d'architecture fonctionnelle de flux de signal, et de budget de puissance/espace dans un boîtier
physiquement contraint.

## Architecture du signal de l'instrument

Regrouper les 20 modules par fonction (plutôt que par position physique) révèle le véritable chemin du
signal, de l'horloge jusqu'à la sortie stéréo :

```
Horloge, séquencement et utilitaires CV
        │
        ▼
Sources de percussion, de batterie et de tonalité
        │
        ▼
Texture, filtrage et traitement
        │
        ▼
Mixage et effets
        │
        ▼
Sortie stéréo
```

Les modules de contrôle de performance (un joystick enregistrable à 4 canaux, un écho CV) ne constituent pas
une étape fixe dans cette chaîne — ils peuvent moduler en direct n'importe laquelle des étapes ci-dessus, et
c'est précisément là que se joue l'improvisation.

### Groupes fonctionnels

| Groupe | Modules | Rôle |
|---|---|---|
| **Horloge, séquencement et utilitaires CV** | After Later Audio uT_u (clone de Temps Utile), After Later Audio uO_C (clone d'Ornament & Crime), Expert Sleepers Disting mk4, After Later Audio Mult | Génère et distribue le timing d'horloge/déclenchement, quantifie et traite le CV, et tamponne les signaux vers plusieurs destinations |
| **Sources de percussion, de batterie et de tonalité** | Noise Engineering Basimilus Iteritas Alter, After Later Audio Atom (uElements), Mörk Modules Elements, After Later Audio Pique (uPeaks, 1U), After Later Audio Pique (uPeaks, micro), Mutable Instruments Braids, Make Noise 0-Coast | Le cœur sonore de l'instrument : un synthétiseur de batterie numérique dédié, deux voix modales/de modélisation physique (Elements, en version micro et pleine taille) pour des timbres percutés/pincés, deux générateurs de fonction dérivés de Peaks pour la mise en forme d'enveloppes percussives, un oscillateur macro, et une voix semi-modulaire autonome |
| **Texture, filtrage et traitement** | After Later Audio Monsoon (clone de Clouds), Mosaic Low Pass Filter, After Later Audio Popple (clone de Ripples) | Traitement de texture granulaire et deux voix de filtrage (passe-bas dédié, multimode) pour façonner la sortie brute de synthèse |
| **Lecture d'échantillons** | ADDAC System ADDAC111 Ultra .WAV Player | Introduit du matériel enregistré aux côtés des voix synthétisées |
| **Contrôle de performance et gestuel** | Erica Synths Black Joystick2, Synthrotek Echo | Contrôle CV gestuel en direct et enregistrable, et un écho CV pour la rétroaction rythmique/générative — la surface d'improvisation de l'instrument |
| **Mixage et effets** | WMD Performance Mixer, Endorphin.es Milky Way 1U, Mosaic Mono Reverb | Combine toutes les sources et applique des effets stéréo (16 algorithmes) et de la réverbération avant la sortie |

## Budget de puissance et d'espace

Les modules Eurorack sont contraints sur deux axes à la fois : l'espace horizontal (HP, « horizontal pitch »)
par rangée, et le courant tiré sur trois rails CC (+12V, −12V, +5V) partagés par tout le boîtier. Concevoir
cet instrument a demandé de budgétiser les deux simultanément sur trois rangées :

| Rangée | Modules | Largeur | Profondeur max | +12V | −12V | +5V |
|---|---|---|---|---|---|---|
| Rangée 1 | 4 | 72 HP | 42 mm | 279 mA | 42 mA | 0 mA |
| Rangée 2 | 8 | 124 HP | 50 mm | 1 020 mA | 675 mA | 175 mA |
| Rangée 3 | 8 | 117 HP | 42 mm | 922 mA | 90 mA | 0 mA |
| **Total** | **20** | **313 HP** | **max 50 mm** | **2 221 mA** | **807 mA** | **175 mA** |

La rangée 2 à elle seule tire environ la moitié du +12V total du boîtier et la grande majorité de son +5V,
principalement à cause du mixeur de performance et des deux modules gourmands en courant (ADDAC111,
Atom/uElements) partageant cette rangée — un rappel que le budget HP et le budget de puissance n'évoluent pas
ensemble, et qu'un boîtier qui tient physiquement peut quand même manquer de marge de courant.

## Référence complète des modules

| Module | Fabricant | Rangée | Largeur | Profondeur | +12V | −12V | +5V |
|---|---|---|---|---|---|---|---|
| Milky Way 1U (noir) | Endorphin.es | 1 | 22 HP | 42 mm | 117 mA | 12 mA | 0 mA |
| Pique (uPeaks, noir, 1U Intellijel) | After Later Audio | 1 | 22 HP | — | 60 mA | 2 mA | — |
| Low Pass Filter (panneau noir) | Mosaic | 1 | 14 HP | 38 mm | 20 mA | 20 mA | 0 mA |
| Mono Reverb (panneau noir) | Mosaic | 1 | 14 HP | 28 mm | 82 mA | 8 mA | 0 mA |
| Performance Mixer (noir) | WMD | 2 | 40 HP | 45 mm | 450 mA | 430 mA | 0 mA |
| Popple | After Later Audio | 2 | 8 HP | — | 35 mA | 35 mA | 0 mA |
| ADDAC111 Ultra .WAV Player | ADDAC System | 2 | 16 HP | 30 mm | 150 mA | 150 mA | — |
| Atom (uElements) | After Later Audio | 2 | 18 HP | 34 mm | 130 mA | 10 mA | — |
| Braids (ancienne version) | Mutable Instruments | 2 | 16 HP | 20 mm | 15 mA | 15 mA | 85 mA |
| Basimilus Iteritas Alter (noir) | Noise Engineering | 2 | 10 HP | 28 mm | 80 mA | 5 mA | 90 mA |
| Echo | Synthrotek | 2 | 4 HP | 50 mm | 40 mA | 20 mA | 0 mA |
| Monsoon | After Later Audio | 2 | 12 HP | 22 mm | 120 mA | 10 mA | 0 mA |
| 0-Coast (modifié eurorack) | Make Noise | 3 | 45 HP | — | 400 mA | — | — |
| Mult | After Later Audio | 3 | 2 HP | 29 mm | 20 mA | 20 mA | 0 mA |
| uO_C (panneau noir et or) | After Later Audio | 3 | 8 HP | 20 mm | 85 mA | 10 mA | 0 mA |
| uT_u | After Later Audio | 3 | 8 HP | 20 mm | 85 mA | 10 mA | — |
| Elements (panneau noir) | Mörk Modules | 3 | 34 HP | 25 mm | 130 mA | 10 mA | 0 mA |
| Black Joystick2 | Erica Synths | 3 | 12 HP | 30 mm | 71 mA | 20 mA | 0 mA |
| Disting mk4 | Expert Sleepers | 3 | 4 HP | 42 mm | 51 mA | 19 mA | 0 mA |
| Pique (uPeaks, micro) | After Later Audio | 3 | 4 HP | 15 mm | 80 mA | 1 mA | — |

*(« — » signale une caractéristique non renseignée dans la fiche technique source, pas une valeur nulle.)*

## Ce que cela démontre

Au-delà du résultat musical, construire cet instrument a demandé la même rigueur que n'importe quel système
matériel contraint : répartir un budget physique et électrique fixe (HP par rangée, courant par rail CC)
entre des modules en concurrence, choisir une redondance délibérée là où elle compte (deux générateurs
d'enveloppe de percussion, deux voix de synthèse modale, pour l'étendue timbrale plutôt que par sécurité), et
concevoir un chemin de signal — horloge → quantification → source sonore → traitement → mixage — qui reste
cohérent même quand la performance réelle est entièrement improvisée.
