# Vieux Néant — modular drum & texture instrument

A 20-module Eurorack instrument (313 HP across 3 rows), designed as a self-contained percussion and
texture voice for improvised, experimental electronic music.

## Purpose

This system is the result of research into how to build an **improvisation-based drumming instrument** for
experimental electronic music — one where rhythm, pitch, and timbre aren't programmed in advance but shaped
live. Designing it meant working across several overlapping bodies of knowledge at once:

- **Traditional music relationships** — sequencing, pitch, rhythm, and their interdependence, since a
  percussion instrument still needs a coherent relationship between clock, trigger, and pitch/CV even when
  none of it is fixed in advance.
- **Tone and timbre** — synthesis method (digital, modal/physical-modeling, granular), and how each
  contributes a distinct percussive or textural character.
- **Improvisation in "new musics"** — designing for a performer who reacts and shapes the instrument live,
  rather than a fixed compositional structure.
- **Electronic distribution** — the practical signal-routing layer underneath all of the above: buffered
  multiples, utility/multi-function modules, and CV distribution that let one gesture or clock reach several
  destinations reliably.

The result is documented below the way any signal system would be: as a functional signal-flow architecture,
and as a power/space budget across a physically constrained case.

## Instrument signal architecture

Grouping the 20 modules by function (rather than by physical position) shows the actual signal path from
clock to stereo output:

```
Clock, sequencing & CV utility
        │
        ▼
Percussion, drum & tone sources
        │
        ▼
Texture, filtering & processing
        │
        ▼
Mixing & FX
        │
        ▼
Stereo output
```

Performance-control modules (a 4-channel recordable joystick, a CV echo) aren't a fixed stage in this
chain — they can modulate any of the stages above live, which is where the actual improvisation happens.

### Functional groups

| Group | Modules | Role |
|---|---|---|
| **Clock, sequencing & CV utility** | After Later Audio uT_u (Temps Utile clone), After Later Audio uO_C (Ornament & Crime clone), Expert Sleepers Disting mk4, After Later Audio Mult | Generates and distributes clock/trigger timing, quantizes and processes CV, and buffers signals out to multiple destinations |
| **Percussion, drum & tone sources** | Noise Engineering Basimilus Iteritas Alter, After Later Audio Atom (uElements), Mörk Modules Elements, After Later Audio Pique (uPeaks, 1U), After Later Audio Pique (uPeaks, micro), Mutable Instruments Braids, Make Noise 0-Coast | The instrument's sound-generating core: a dedicated digital drum synthesizer, two modal/physical-modeling voices (Elements, in both a micro and full-size build) for struck/plucked timbres, two Peaks-derived function generators for percussive envelope shaping, a macro oscillator, and a self-contained semi-modular voice |
| **Texture, filtering & processing** | After Later Audio Monsoon (Clouds clone), Mosaic Low Pass Filter, After Later Audio Popple (Ripples clone) | Granular texture processing and two filter voices (dedicated low-pass, multimode) for shaping the raw synthesis output |
| **Sample playback** | ADDAC System ADDAC111 Ultra .WAV Player | Introduces recorded material alongside the synthesized voices |
| **Performance & gestural control** | Erica Synths Black Joystick2, Synthrotek Echo | Live, recordable gestural CV control and a CV echo for rhythmic/generative feedback — the instrument's improvisation surface |
| **Mixing & FX** | WMD Performance Mixer, Endorphin.es Milky Way 1U, Mosaic Mono Reverb | Combines all sources and applies stereo FX (16 algorithms) and reverb before output |

## Power and space budget

Eurorack modules are constrained on two axes at once: horizontal space (HP, "horizontal pitch") per row, and
current draw on three DC rails (+12V, −12V, +5V) shared by the whole case. Designing this instrument meant
budgeting both simultaneously across three rows:

| Row | Modules | Width | Max depth | +12V | −12V | +5V |
|---|---|---|---|---|---|---|
| Row 1 | 4 | 72 HP | 42 mm | 279 mA | 42 mA | 0 mA |
| Row 2 | 8 | 124 HP | 50 mm | 1,020 mA | 675 mA | 175 mA |
| Row 3 | 8 | 117 HP | 42 mm | 922 mA | 90 mA | 0 mA |
| **Total** | **20** | **313 HP** | **max 50 mm** | **2,221 mA** | **807 mA** | **175 mA** |

Row 2 alone draws roughly half the case's total +12V and the large majority of its +5V current, mainly from
the performance mixer and the two power-hungry synthesis/utility modules (ADDAC111, Atom/uElements) sharing
that row — a reminder that HP budget and power budget don't scale together, and a case that fits physically
can still be short on current headroom.

## Full module reference

| Module | Manufacturer | Row | Width | Depth | +12V | −12V | +5V |
|---|---|---|---|---|---|---|---|
| Milky Way 1U (black) | Endorphin.es | 1 | 22 HP | 42 mm | 117 mA | 12 mA | 0 mA |
| Pique (uPeaks, Black, 1U Intellijel) | After Later Audio | 1 | 22 HP | — | 60 mA | 2 mA | — |
| Low Pass Filter (Black Panel) | Mosaic | 1 | 14 HP | 38 mm | 20 mA | 20 mA | 0 mA |
| Mono Reverb (Black Panel) | Mosaic | 1 | 14 HP | 28 mm | 82 mA | 8 mA | 0 mA |
| Performance Mixer (black) | WMD | 2 | 40 HP | 45 mm | 450 mA | 430 mA | 0 mA |
| Popple | After Later Audio | 2 | 8 HP | — | 35 mA | 35 mA | 0 mA |
| ADDAC111 Ultra .WAV Player | ADDAC System | 2 | 16 HP | 30 mm | 150 mA | 150 mA | — |
| Atom (uElements) | After Later Audio | 2 | 18 HP | 34 mm | 130 mA | 10 mA | — |
| Braids (old version) | Mutable Instruments | 2 | 16 HP | 20 mm | 15 mA | 15 mA | 85 mA |
| Basimilus Iteritas Alter (Black) | Noise Engineering | 2 | 10 HP | 28 mm | 80 mA | 5 mA | 90 mA |
| Echo | Synthrotek | 2 | 4 HP | 50 mm | 40 mA | 20 mA | 0 mA |
| Monsoon | After Later Audio | 2 | 12 HP | 22 mm | 120 mA | 10 mA | 0 mA |
| 0-Coast (eurorack-modified) | Make Noise | 3 | 45 HP | — | 400 mA | — | — |
| Mult | After Later Audio | 3 | 2 HP | 29 mm | 20 mA | 20 mA | 0 mA |
| uO_C (Black & Gold Panel) | After Later Audio | 3 | 8 HP | 20 mm | 85 mA | 10 mA | 0 mA |
| uT_u | After Later Audio | 3 | 8 HP | 20 mm | 85 mA | 10 mA | — |
| Elements (Black Panel) | Mörk Modules | 3 | 34 HP | 25 mm | 130 mA | 10 mA | 0 mA |
| Black Joystick2 | Erica Synths | 3 | 12 HP | 30 mm | 71 mA | 20 mA | 0 mA |
| Disting mk4 | Expert Sleepers | 3 | 4 HP | 42 mm | 51 mA | 19 mA | 0 mA |
| Pique (uPeaks, micro) | After Later Audio | 3 | 4 HP | 15 mm | 80 mA | 1 mA | — |

*("—" marks a spec not recorded in the source data sheet, not a value of zero.)*

## What this demonstrates

Beyond the musical result, building this instrument required the same discipline as any constrained
hardware system: allocating a fixed physical and electrical budget (HP per row, current per DC rail) across
competing modules, choosing deliberate redundancy where it matters (two percussion-envelope generators, two
modal-synthesis voices, for timbral range rather than backup), and designing a signal path — clock →
quantization → sound source → processing → mix — that stays coherent even when the actual performance is
entirely improvised.
