# Technocompost — architecture overview

Project: [`cbicari/technocompost`](https://github.com/cbicari/technocompost)

## Purpose

Technocompost is a self-sustaining, multi-agent image processing installation running on a cluster of
Raspberry Pi 4 boards. Each Pi runs an [OpenClaw](https://github.com/openclaw) AI agent connected to a shared
local LM Studio inference server. The agents pass an image through a continuous decay-and-regrowth cycle,
each Pi handling one stage and deciding for itself which transformation script to apply, informed by its own
system sensors (CPU temperature, load, memory, disk, network).

The repository actually contains **two different orchestration modes** built around the same shared
infrastructure:

- **Mode A — distributed agentic pipeline** (`watcher.sh`, `decide.sh`, `install.sh`, `README.md`): three Pis
  in a strict round-robin, each asking its local AI agent to choose a script for a single whole image.
- **Mode B — concurrent tile-based canvas** (`tile_init.py`, `tile_worker.py`): all Pis work at once on
  different tiles of one shared canvas image, without needing a language-model decision per tile — script
  choice is weighted/randomised locally and tuned by sensor "stress level".

Both modes share the same physical setup, the same Syncthing-synced folder, and the same live display
subsystem (`display_server.py` / `preview.py`).

## Shared infrastructure

| Component | Role |
|---|---|
| 3× Raspberry Pi 4 (`rpiagent01/02/03`) | One per pipeline stage |
| LM Studio server | Central inference backend (e.g. `google/gemma-4-e4b`, `nvidia/nemotron-3-nano-4b`), reachable at a fixed LAN address, used by every Pi's OpenClaw agent |
| OpenClaw | AI agent runtime installed on each Pi; can also talk peer-to-peer over its own ACP protocol when bound to `lan` mode |
| Syncthing | Keeps `~/.openclaw/workspace/tmp/` (and its `canvas/` subfolder) identical across all Pis |
| `display_server.py` | A pygame fullscreen viewer (on one designated "display Pi") that receives frames over TCP and cross-fades between them |
| `preview.py` | Tiny client used by processing scripts to stream a frame to `display_server.py` via `flush()` |

`install.sh` sets up a fresh Pi: system packages (`git`, `curl`, `build-essential`, `feh`, `python3-pillow`,
`inotify-tools`, `btop`), Syncthing, Node.js 22 LTS + npm, and OpenClaw, then symlinks the `scripts/` folder
into `~/.openclaw/workspace/scripts`. The `openclaw` setup wizard (LM Studio base URL + model choice) and the
optional `openclaw.service` systemd unit are configured manually afterwards, per the README.

## Mode A — distributed agentic pipeline

### Flow

```
hummus.png → [rpiagent01] → gas.png → [rpiagent02] → liquid.png → [rpiagent03] → hummus.png → ...
```

1. **`watcher.sh <stage>`** polls the shared folder every 3 seconds for that stage's keyword file
   (`hummus`/`gas`/`liquid`), tracking already-seen files in `/tmp/watcher_seen_stage<N>.txt`. On first run it
   also starts `display_server.py` if it isn't already running.
2. On a new file, it calls **`decide.sh <stage> <input_file>`**, which:
   - reads local sensors relevant to that stage (CPU temperature/load for stage 1, CPU/memory for stage 2,
     disk/network for stage 3);
   - shuffles its pool of candidate scripts and builds a one-line prompt asking the local OpenClaw agent to
     pick exactly one script and set its numeric parameters, nudged toward gentler values unless the sensors
     indicate stress, and discouraged from repeating its last choice;
   - sends that prompt to `openclaw agent --agent main`;
   - parses the script name and `--flag value` pairs out of the reply (falling back to the first script in
     the pool if parsing fails);
   - runs `python3 <script> <input> <output> <extra args>` directly.
3. The output file (`gas.png`, `liquid.png`, or `hummus.png`) is written back into the shared folder, where
   Syncthing propagates it to every Pi; the next stage's `watcher.sh` picks it up, closing the loop.

### Stage → script pools

| Pi | Stage | Watches for | Produces | Script pool |
|---|---|---|---|---|
| rpiagent01 ("Fragmenteur" 🪲) | 1 | `hummus.png` | `gas.png` | `chunk_shuffle`, `conway`, `diffuse`, `erode`, `spore`, `degrade` |
| rpiagent02 ("Hydrolyseur" 🦠) | 2 | `gas.png` | `liquid.png` | `hydrolyse`, `decompose`, `diffuse`, `erode` |
| rpiagent03 ("Lignivore" 🍄) | 3 | `liquid.png` | `hummus.png` | `lignine`, `spore`, `decompose` |

(The README additionally lists `mushroom`, `wind`, and `growth` as part of the broader script reference,
used similarly by the pipeline.)

## Mode B — concurrent tile-based canvas

This mode replaces `watcher.sh` + `decide.sh` entirely with **`tile_worker.py`**, run once per Pi/stage, and
does not require a language-model call per operation — script choice is driven by local weighted random
selection and a sensor-derived "stress level" instead.

### Setup

**`tile_init.py <seed.png> [--rows N] [--cols N] [--reset]`** crops a seed image into an `R×C` grid (default
4×4) and writes each piece as `canvas/tile_<row>_<col>.png`. `--reset` lets the grid be reseeded from a new
image without disturbing files that already exist otherwise.

### Worker loop (per Pi, per stage)

Each `tile_worker.py --stage <1|2|3>` instance repeats, indefinitely:

1. **Sweep stale claims** — any `.claim` file older than 30 seconds is removed, in case a worker died mid-tile.
2. **Claim a free tile** — tiles and coordinates are shuffled, and the first tile with no `tile_RR_CC.png`
   missing and no existing `.claim` file is claimed atomically (an exclusive file create, so two Pis can't
   grab the same tile).
3. **Read local sensor stress** — CPU temperature and 1-minute load average are mapped to a 0/1/2 "cool /
   warm / hot" level.
4. **Pick a persona script** — from that stage's weighted pool (the script used last time has its odds
   roughly halved, to encourage variety) and its stress-matched parameter preset.
5. **Run the script** on the tile into a scratch file, then **alpha-blend** the result back onto the tile
   (`--alpha`, default 0.30) so changes accumulate gradually rather than replacing the tile outright.
6. **Release the claim**, **recomposite the full canvas** from all current tiles, and **stream it** to
   `display_server.py` via `preview.flush()`.
7. Pause briefly (`--pause`, default 0.3 s) and repeat from step 1.

### Stage → persona script pools

| Stage | Persona | Script pool |
|---|---|---|
| 1 | insects | `fault_shift`, `chunk_hoard`, `repetition_smash`, `chunk_shuffle`, `byte_scramble`, `metadata_wipe` |
| 2 | bacteria | `gas_liquid`, `xor_cascade`, `bit_rotate`, `hydrolyse`, `memory_purge`, `activity_log` |
| 3 | fungi | `butterfly_permute`, `hilbert_shatter`, `cat_map_scramble`, `lignin_bore`, `lignine`, `mycelium_spread` |

Each persona script lives under a stage-named subfolder (`scripts/insects/`, `scripts/bacteria/`,
`scripts/fungi/`) and accepts a "cool / warm / hot" parameter preset selected by `tile_worker.py` according to
the current sensor stress level.

## Shared display subsystem

- **`display_server.py`** runs on one designated Pi. It opens a fullscreen, borderless pygame window and a
  TCP listener (default port 9876). Each incoming frame (raw `width/height/channels` header + pixel bytes)
  replaces the currently shown frame; the code includes a `smoothstep` helper for blending, intended to ease
  transitions between frames.
- **`preview.py`** exposes a single `flush(data)` function that any processing script can call to push a frame
  (NumPy array or PIL image) to `display_server.py` over TCP. It is a no-op when the environment variable
  `TECHNOCOMPOST_SILENT=1` is set — used by `tile_worker.py` to keep the many short-lived per-tile
  subprocesses quiet, while the worker itself sends the composited full canvas.
- Both scripts are configured via `TECHNOCOMPOST_DISPLAY_IP`, `TECHNOCOMPOST_DISPLAY_PORT`,
  `TECHNOCOMPOST_WIN_W`/`_H`, and `TECHNOCOMPOST_INTERP_SEC` environment variables.

## Typical usage

**Mode A:**
```bash
./watcher.sh 1   # on rpiagent01
./watcher.sh 2   # on rpiagent02
./watcher.sh 3   # on rpiagent03
```
Drop an image named `hummus.png` into `~/.openclaw/workspace/tmp/` on any Pi to start the loop.

**Mode B:**
```bash
python3 scripts/tile_init.py seed.png --rows 4 --cols 4
python3 scripts/tile_worker.py --stage 1 --display   # on the Pi with a screen
python3 scripts/tile_worker.py --stage 2             # on the other Pis
python3 scripts/tile_worker.py --stage 3
```

**Displaying a single image directly:**
```bash
DISPLAY=:0 feh --fullscreen /path/to/image.png &
killall feh   # close
```
