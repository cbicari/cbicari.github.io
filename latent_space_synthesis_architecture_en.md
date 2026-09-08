# realtime_latent_space_synthesis — architecture overview

Project: [`cbicari/latent_space_synthesis`](https://github.com/cbicari/latent_space_synthesis)

## Purpose

Realtime latent-space audio synthesis on a Raspberry Pi 5, using [`nn~`](https://github.com/acids-ircam/nn_tilde)
(the IRCAM/ACIDS Pure Data external that runs a neural network, here a [RAVE](https://github.com/acids-ircam/RAVE)
model, inside an audio patch). A person's hand gestures — or, alternately, a small MIDI controller — steer the
model's latent space live, so the neural synthesizer's timbre responds to movement or to knobs/keys in real time.

## Pipeline overview

Two alternative control paths converge on the same Pure Data patch, which drives the neural synthesis engine:

- **Gesture control**: a webcam-based hand-tracking script (`mediapipe_OSC/`) streams landmark data over OSC
  to [Wekinator](http://www.wekinator.org/), which learns a mapping from gesture to control parameters and
  sends its output onward over OSC.
- **MIDI control (alternate)**: an Akai MPK mini keyboard/controller is patched directly into a second Pure
  Data patch, bypassing the camera and Wekinator entirely for a simpler, more predictable manual control
  surface.

Either way, the resulting control values reach a Pure Data patch running under JACK audio, which feeds them
into `nn~` — the loaded RAVE model — for realtime neural audio synthesis, with JACK handling the actual audio
I/O on the Raspberry Pi 5.

## Repository layout

| Path | Role |
|---|---|
| `mediapipe_OSC/` | Hand-tracking script and its Python virtual environment; streams landmarks over OSC |
| `wekinator/` | Bundled `WekiMini.jar` (Wekinator), run under a Java 8 runtime |
| `rave_models/` | Pretrained RAVE model file(s) loaded by `nn~` inside the Pure Data patch |
| `nn_tilde` | Reference to the [`nn~`](https://github.com/acids-ircam/nn_tilde) Pure Data external used for neural audio synthesis |
| `latent_space_synthesis_OSC_control.pd` | Main patch: receives OSC (from Wekinator) and drives `nn~` |
| `latent_space_synthesis_midiController_AkaiMPKmini.pd` | Alternate patch: drives `nn~` directly from Akai MPK mini MIDI input |
| `launch_demo.sh` | Starts JACK, Pure Data, Wekinator, and the hand-tracking script together |
| `kill_all.sh` | Stops everything `launch_demo.sh` started |

## Data pipeline

```
Webcam → hand tracking (mediapipe_OSC) → OSC → Wekinator ─┐
                                                            ├─→ Pure Data patch → nn~ (RAVE model) → JACK audio out
                       Akai MPK mini (MIDI) ────────────────┘
```

- **Hand tracking → Wekinator**: the tracking script streams hand-landmark coordinates over OSC; Wekinator
  maps that live gesture data to whatever control parameters the patch expects, the same
  record/train/run workflow as in the companion
  [`CV_ML_intermedia_pipeline_workshop`](https://github.com/cbicari/CV_ML_intermedia_pipeline_workshop) repo.
- **Pure Data patch**: `latent_space_synthesis_OSC_control.pd` receives Wekinator's OSC output and routes it
  to `nn~`'s control inlets (typically latent dimensions and/or other exposed RAVE parameters).
- **`nn~` (RAVE model)**: loads a pretrained model from `rave_models/` and performs the actual neural audio
  synthesis, decoding the (possibly gesture-steered) latent vector into an audio stream in real time.
- **JACK audio**: `qjackctl` provides the low-latency audio backend Pure Data renders through, on the
  Raspberry Pi 5.
- **MIDI alternate path**: `latent_space_synthesis_midiController_AkaiMPKmini.pd` swaps the camera+Wekinator
  chain for direct MIDI CC/note input from an Akai MPK mini, for quicker or more precise manual control
  without needing the vision pipeline running.

## Launching and stopping the demo

`launch_demo.sh` starts the whole gesture-control pipeline in one shot, in this order:

1. **`qjackctl -s`** — starts JACK audio with automatic play.
2. **`pd -jack ./latent_space_synthesis_OSC_control.pd`** — starts Pure Data under JACK with the OSC control
   patch loaded.
3. **`/opt/java8/bin/java -jar ./wekinator/WekiMini.jar`** — launches Wekinator (Java 8 is required — see
   Setup below).
4. **`source ./mediapipe_OSC/osc_venv/bin/activate` then `python ./mediapipe_OSC/hand_recognition.py`** —
   activates the hand-tracking script's virtual environment and starts it.

Each process's PID is appended to `process_pids.txt`. **`kill_all.sh`** reads that file and kills every PID in
it, then removes the file — the matching teardown for whatever `launch_demo.sh` started.

To use the MIDI-controller path instead, open
`latent_space_synthesis_midiController_AkaiMPKmini.pd` directly in Pure Data (under JACK) rather than running
`launch_demo.sh`, since that path doesn't need Wekinator or the hand-tracking script at all.

## Setup (Raspberry Pi 5)

Condensed from the README; see `install/raspberrypi.sh` in the repo and the upstream
[`nn_tilde`](https://github.com/acids-ircam/nn_tilde) instructions for full detail.

**1. Install [`uv`](https://astral.sh/uv/) (if not already present)**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env   # or restart your shell
```

**2. Create a Python 3.9 virtual environment and install dependencies**
```bash
uv venv nn_venv --python 3.9
uv pip install pip

sudo apt update
sudo apt install -y cmake build-essential git puredata puredata-dev python3 python3-pip
python3 -m pip install torch

LIBTORCH=/home/<user>/.../lib/python3.9/site-packages/torch/
```

**3. Build and install `nn~`, checked out at the last Raspberry Pi–supported release**
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

**4. Work around Wekinator's Java version requirement**

WekiMini needs Java 8 specifically to save projects correctly:
```bash
wget https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u402-b06/OpenJDK8U-jdk_aarch64_linux_hotspot_8u402b06.tar.gz
tar -xzf OpenJDK8U-jdk_aarch64_linux_hotspot_8u402b06.tar.gz
sudo mv jdk8u402-b06 /opt/java8

# Run Wekinator with:
/opt/java8/bin/java -jar /path/to/WekiMini.jar
```

## Built with

- [`nn~`](https://github.com/acids-ircam/nn_tilde) / [RAVE](https://github.com/acids-ircam/RAVE) (IRCAM/ACIDS) — neural audio synthesis inside Pure Data
- [Pure Data](https://puredata.info/) + JACK — patching environment and low-latency audio backend
- [Wekinator](http://www.wekinator.org/) (WekiMini, Java 8) — gesture-to-parameter machine learning
- [MediaPipe](https://developers.google.com/mediapipe) — hand landmark tracking
- [`uv`](https://astral.sh/uv/) — Python environment management on the Raspberry Pi
