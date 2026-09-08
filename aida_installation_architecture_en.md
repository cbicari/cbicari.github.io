# Self-observing volumetric installation — architecture overview

A real-time installation combining volumetric capture, spherical projection, generative visuals, and a
vision-language model that watches the installation, describes it, and feeds that description back into
its own imagery. Documented in detail below: **aida-stream-llm-analysis**, the observation and
feedback subsystem.

## Purpose

Spectators stand around a 1-meter sphere. A hidden projector below the table renders a live point cloud of
them onto its surface, reconstructed from three depth cameras. That same point cloud also conditions a
generative visual pipeline, so the spectators' movement is literally shaping the imagery appearing on the
sphere. A separate camera watches the whole installation from outside, and a vision-language model describes
what it sees — in two languages — projecting that description as text over the sphere, while a condensed
version of it is fed back in as a prompt that steers how the generated imagery evolves next. The installation
observes itself, explains itself, and changes because of what it said — while the people around it are doing
the same thing to it from the other direction.

## Volumetric capture and spherical projection

```
3x Orbbec depth cameras
        │
        ▼
Carto (Godot engine)
        │
   ┌────┴────┐
   ▼         ▼
Spherical   Generative visual
projection  pipeline (Stable Diffusion)
```

Three Orbbec depth cameras capture the spectators around the table. **Carto**, a custom volumetric capture
and reconstruction program built on the Godot engine, turns that into a live point cloud. That point cloud
drives two things at once: the image projected onto the 1-meter sphere (via a projector hidden below the
installation table), and the conditioning input to a generative Stable Diffusion visual pipeline — so the
people physically present are, in effect, the model's live input.

## The LLM self-observation loop

```
AIDA fisheye camera (observes the whole installation)
        │
        ▼
LM Studio vision-language model (English + French description)
        │
   ┌────┴──────────────┐
   ▼                    ▼
Text overlay          Keyword extraction
on sphere             (1-3 concrete keywords)
                        │
                        ▼
                  Generative visual pipeline
                  (keywords steer the evolving imagery)
                        │
                        ▼
        ↻ new visuals appear on the sphere, observed again
```

An AIDA N200 camera, mounted to see the whole installation (not just the sphere), streams over SRT. A
vision-language model running locally in LM Studio periodically describes what it sees, once in English and
once in French, each sent out as its own OSC message and projected as text over the sphere — layered on top
of both the volumetric point cloud and the generated visuals. The English description is additionally
reduced to one to three concrete keywords, which are fed back into the generative visual pipeline as a short
prompt, nudging how the imagery evolves. Because the AIDA camera also sees whatever the sphere is currently
displaying, the new visuals it produces get observed, described, and distilled into keywords again on the
next cycle — a closed loop where the installation's own output becomes its own next input, independent of
(but running alongside) the spectators' direct volumetric influence on the same generative pipeline.

## aida-stream-llm-analysis: pipeline internals

The observation-and-feedback subsystem is a small set of scripts orchestrating a periodic capture → analyze
→ summarize → broadcast cycle, all coordinating through a shared image file and OSC messages.

### Capture — `capture_loop_srt.sh`

Runs continuously in the background: connects to the AIDA camera's SRT sub-stream
(`srt://<camera_ip>:<port>?streamid=<id>`), grabs exactly one frame with `ffmpeg`, writes it to a fixed path
(`/tmp/latest_frame.jpg`), disconnects, and sleeps for the configured interval (10 s by default) before
repeating. Each connection is short-lived by design — the analysis side never touches the camera directly,
only the file this script maintains.

### Analysis — `analyze_latest_frame.py`

Reads whatever frame currently sits at that path, base64-encodes it into a chat-completions request to LM
Studio's local OpenAI-compatible API, and sends the model's response out as a single OSC message. It has no
camera dependency at all — everything camera-related is entirely the capture script's job. Notable design
details:
- `--skip-if-unchanged` compares the frame's mtime to avoid re-analyzing a frame that hasn't refreshed yet.
- `--quiet` prints *only* the raw description to stdout (everything else to stderr), specifically so a
  calling shell script can capture it cleanly via command substitution — used to pass the English
  description into the keyword-summary step.
- A generous default timeout (240 s) reflects CPU-only inference on a vision-language model, which is far
  slower than GPU inference.

### Keyword extraction — `summarize_keywords.py`

Pure text-in/text-out, no camera or image involved: takes a description (the English output above), asks the
same LM Studio model to reduce it to one to three concrete, real-world-object keywords — explicitly
instructed to avoid abstract or emotional language — appends a fixed suffix (`"fisheye 250 degrees"`,
naming the AIDA camera's own lens geometry) and sends the combined result out as OSC. The suffix is a plain
string, not model output, so it's always exact regardless of what the model returns.

### Orchestration — `run_pipeline.sh`

Ties the above together into one continuously-running cycle:
1. Confirms LM Studio is ready (via `manage_lmstudio.sh`) before touching the camera at all.
2. Starts the capture loop in the background, tracking its PID for clean shutdown.
3. Loops indefinitely: English description → (pause) → French description → (pause) → keyword summary of
   the English text → (pause) → repeat. With the default 5 s stagger, a full cycle is 15 s plus however long
   the two LM Studio calls themselves take.
4. On Ctrl+C, kills the background capture process (and any ffmpeg child it spawned) but deliberately leaves
   LM Studio running, since it's a persistent local service rather than something owned by this pipeline run.

The English and French prompts are independently tunable "moods" for how the installation talks about what
it sees — the default pipeline uses a *"humble, eutopic and existentialist"* framing, while the lighter
alternating-analysis variant below uses a *"dystopic and nihilist"* one, making the installation's
interpretive stance itself an adjustable artistic parameter rather than a fixed behavior.

### LM Studio process management — `manage_lmstudio.sh`

Ensures the local inference server is running and the target vision-language model is loaded, idempotently
(safe to call every run). Two things worth noting:
- **GPU pinning vs. CPU-only inference.** Because `CUDA_VISIBLE_DEVICES` only takes effect at process
  launch, the script checks whether LM Studio is already running on the intended GPU and restarts it pinned
  correctly if not — but the model itself is then explicitly loaded with `--gpu off`. In other words, LM
  Studio's *process* is kept off the GPUs doing the generative visual rendering, while its *inference* runs
  on CPU entirely — a deliberate trade of latency (CPU inference is much slower) for keeping both GPUs free
  for the generative pipeline and volumetric rendering, which matter more to the installation's real-time
  visual output than the observation loop's exact response time.
- Every step is checked before acting (server status, model list via the API) so re-running the script
  mid-show doesn't interrupt anything already working correctly.

### Operational variant — `run_alternating_analysis.sh`

A lighter-weight mode: just the English/French alternation, 5 s apart, with no capture-loop management and
no keyword-summary step — useful when the capture loop is already running independently (e.g. during
development, or a performance configuration that doesn't need the keyword-driven visual steering).

### Unattended operation — `overnight_monitor.sh`

Runs independently of the analysis pipeline, logging one line every 60 s: per-GPU utilization, memory,
temperature (flagging anything ≥ 85°C, ahead of the card's throttling point), and power draw; whether each
key process (`ossia-score`, `Godot_v4`, the capture `ffmpeg`, and a Node-based process) is still alive;
whether LM Studio's API still responds; and free disk space (flagging under 3 GB free). Each line is tagged
`ALL-OK` or `PROBLEM`, so checking on an overnight run the next morning is a single `grep -c "ALL-OK"` or
`grep -v "ALL-OK"` away.

## OSC reference

| Address | Port | Sent by | Content |
|---|---|---|---|
| `/camera/description` | 9000 | `analyze_latest_frame.py` (English) | English scene description |
| `/camera/description` | 9001 | `analyze_latest_frame.py` (French) | French scene description |
| `/camera/keywords` | 9002 | `summarize_keywords.py` | 1–3 keywords + fixed suffix, feeds the generative visual pipeline |

All three are sent to the same OSC host (the machine running the generative visual pipeline / Ossia Score
patch), just on different ports and, for the two descriptions, the same address distinguished by port.

## Components referenced but not detailed here

- **Carto** (Godot engine) — the volumetric capture and point-cloud reconstruction program. Its own
  internals weren't part of this analysis (a compiled executable was provided, not source).
- **The generative visual pipeline** (an Ossia Score patch, `diffusion_pipeline.score`) — receives the OSC
  messages above and drives the Stable Diffusion imagery. Its patch internals weren't inspected here either;
  this document covers its role and inputs, not its implementation.

## What this demonstrates

Beyond the artistic result, this subsystem required real-time multi-process orchestration across a
GPU-constrained machine (deliberately keeping an LLM off the GPU so rendering and generation aren't starved),
clean process lifecycle management (background capture with proper teardown, an idempotent service-readiness
check safe to re-run mid-show), a small but real multilingual inference pipeline, and unattended-operation
tooling (structured health logging) built specifically so an overnight run can be checked in seconds rather
than by reading raw logs.
