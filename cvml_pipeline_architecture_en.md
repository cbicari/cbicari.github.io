# Computer Vision + OSC — architecture overview

Project: [`cbicari/CV_ML_intermedia_pipeline_workshop`](https://github.com/cbicari/CV_ML_intermedia_pipeline_workshop)

## Purpose

A starting pipeline for building a **creative digital instrument**: a person moves in front of a webcam,
and that movement ends up controlling sound, visuals, lights, or anything else — through machine learning,
without the artist having to write any ML code. The repo itself only supplies the first, computer-vision
stage; the rest of the pipeline is two other pieces of established creative-coding software talking to it
(and to each other) over OSC on the same machine.

## Pipeline overview

Three separate programs, each doing one job, chained together over the local network via
[OSC](https://en.wikipedia.org/wiki/Open_Sound_Control) (Open Sound Control):

1. **Computer vision (this repo)** — uses [MediaPipe](https://developers.google.com/mediapipe) to track a
   hand or body from the webcam feed, and streams the raw landmark coordinates out as a single OSC message.
2. **[Wekinator](http://www.wekinator.org/)** — a machine-learning tool built for exactly this kind of work:
   you show it examples ("when my hand is *here*, I want the output to be *this*"), it trains a model, and
   from then on maps live input to output in real time, with no code required.
3. **[Ossia Score](https://ossia.io/)** (or Max/MSP, Pure Data, TouchDesigner, or any other OSC-aware
   software) — receives Wekinator's output and patches it into sound, visuals, or anything else it can
   control.

## OSC hops and ports

Because this is three separate programs talking to each other, most setup issues come down to which port
each one is listening on:

| Hop | Sends from | Sends to | Address | Port |
|---|---|---|---|---|
| 1 | This repo's scripts | Wekinator | `/wek/inputs` | `9000` |
| 2 | Wekinator | Ossia Score (or other) | `/wek/outputs` | `12000` |

Two important quirks to know:
- Wekinator's own built-in default input port is `6448`, not `9000` — this repo's scripts always send on
  `9000`, so the Wekinator project's **input port** field must be set to `9000` to match.
- The output port (`12000`) *is* Wekinator's own default, so nothing needs to change on that side unless
  desired.

`127.0.0.1` (a.k.a. `localhost`) always means "this same computer" — even though all three programs run on
one machine, they still talk over the local network stack, just a network of one.

## Computer vision scripts (this repo)

Two interchangeable tracking scripts, both built the same way:

| Script | Tracks | Landmarks sent | OSC input count |
|---|---|---|---|
| `hand_recognition.py` | One hand (`mp_hands.Hands(max_num_hands=1)`) | 21 hand landmarks × (x, y, z) | 63 |
| `mediapipe_body.py` | Full body pose | 22 body landmarks × (x, y, z) | 66 |

Each script's loop:
1. Grabs a frame from the webcam (`cv2.VideoCapture`), converts it to RGB for MediaPipe.
2. Runs the corresponding MediaPipe model (`Hands` or `Pose`) to detect landmarks.
3. Draws the detected landmarks back onto the frame for visual feedback (`mp_draw.draw_landmarks`) and shows
   it in an OpenCV window.
4. Flattens every landmark's `(x, y, z)` into one long list of floats and sends it as a **single** OSC
   message to `/wek/inputs` on `127.0.0.1:9000` (via `osc4py3`).
5. Repeats until **Q** is pressed or the window is closed.

If the wrong camera opens, passing a different `dev_id` to `detection_context()` switches which device
OpenCV captures from.

## Setting up Wekinator (hop 1 → 2)

A tracking script must already be running (Wekinator needs to see live input while being configured). On
Wekinator's project setup screen:

| Setting | Value |
|---|---|
| Input port | `9000` |
| Input message (OSC address) | `/wek/inputs` |
| Number of inputs | `63` for hand tracking, `66` for body tracking |
| Output message (OSC address) | `/wek/outputs` (default) |
| Output host / port | `localhost` / `12000` (default) |
| Number of outputs | however many outputs the artist wants to control |

From there, the record/train/run workflow is standard Wekinator usage (see the
[official instructions](https://doc.gold.ac.uk/~mas01rf/Wekinator/instructions/), also bundled in this repo
as `documentation/wekinator-documentation.pdf`).

## Patching into Ossia Score (hop 2 → 3)

With Wekinator running and producing output:

1. In Ossia Score's **Device Explorer**, add a new device with protocol **OSC**.
2. Configure it: IP `127.0.0.1`, input port `12000` (Wekinator's output port), device name optional.
3. With Wekinator actively running, right-click the new device and choose **Learn** — Ossia auto-discovers
   the `/wek/outputs` address from the live traffic.
4. That discovered node holds a **list** value (Wekinator sends every output together as one message, one
   float per output, in definition order) rather than separate named parameters.
5. To split it back into individually patchable values, drag a **Spread array** process into the nodal view,
   set its output count to the number of Wekinator outputs, and feed `/wek/outputs` into its input pin. It
   then exposes one pin per output (`Output 0` = Wekinator's `outputs-1`, `Output 1` = `outputs-2`, etc.),
   each wireable to a different destination.

## Pipeline diagram

The overall structure, base to tip of the OSC chain:

- Webcam → **computer vision script** (MediaPipe) → OSC `/wek/inputs` @ `9000` → **Wekinator**
  (movement → mapping) → OSC `/wek/outputs` @ `12000` → **Ossia Score / Max / Pure Data / TouchDesigner** →
  sound, visuals, lights, or anything else the artist defines.

## Installation

### Windows

Requires **Git** and **Python** (the latter installed automatically by the install script):

```powershell
git clone https://github.com/cbicari/c-lab-scripts
Set-ExecutionPolicy Bypass -Scope Process
cd c-lab-scripts
.\install\install.ps1
```

`install.ps1` installs Python 3.12 if missing, creates a virtual environment, installs dependencies, and adds
two desktop shortcuts — **Hand Tracking** and **Body Tracking** — for launching either script without a
terminal (launching one auto-closes the other). Install at `C:\` specifically: accented Windows usernames
(e.g. `Étudiant`) break MediaPipe otherwise.

### Linux / Mac

No install script is provided for these platforms — Git and Python 3 must already be present (check with
`git --version` / `python3 --version`; install via `apt`, `dnf`, `xcode-select --install`, or Homebrew as
needed), then:

```bash
git clone https://github.com/cbicari/c-lab-scripts
cd c-lab-scripts
python3 -m venv venv
source venv/bin/activate
pip install -r install/requirements.txt

python scripts/hand_recognition.py
# or
python scripts/mediapipe_body.py
```

Press **Q** or close the window to stop either script.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Camera not opening | Pass a different `dev_id` to `detection_context()`, e.g. `dev_id=1` |
| `ModuleNotFoundError` | The terminal isn't using the venv — run `source venv/bin/activate` (Linux/Mac) or use the desktop shortcuts (Windows) |
| Slow or laggy | MediaPipe runs on CPU — close other heavy applications |
| Wekinator not reacting to movement | Confirm Wekinator's input port is set to `9000`, not its default `6448` |
| Ossia Score receiving nothing | Confirm Ossia's OSC device listens on the same port Wekinator sends output to (`12000` by default), and that Wekinator is actively running, not just trained |
