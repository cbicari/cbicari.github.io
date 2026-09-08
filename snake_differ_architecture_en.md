# snake_differ — architecture overview

Firmware: **snake_differ**, a Puara module for the Seeed XIAO ESP32-S3 Sense.

## Purpose

A motion-detection firmware that watches a camera feed, computes frame-by-frame pixel differences, and
broadcasts the results as OSC messages over WiFi — so a DAW, synthesizer, or generative environment can react
to the presence, position, and shape of moving objects in the frame. It was built for tracking dark shapes
(kinetic coil sculptures) on a light background, but works for any dark-on-light motion source.

## Hardware

| | |
|---|---|
| Board | Seeed XIAO ESP32-S3 Sense |
| Camera | OV2640 (onboard) |
| Microphone | PDM (onboard, GPIO 41/42) |
| Motor outputs | D2 = GPIO 3, D3 = GPIO 4 (PWM, 1 kHz, 10-bit) |
| Connection | WiFi 2.4 GHz |
| Power | USB-C |

No wiring is required for the camera or mic; motor outputs need an external driver for anything beyond a
small signal.

## System overview

The camera and microphone feed the firmware, which either streams an OSC bundle out to receiving software,
or serves a small web interface (with a live MJPEG preview) in a browser for calibrating the camera before a
show. Both paths share the same WiFi connection and the same on-device settings store.

- **OSC path**: camera + mic → firmware → OSC bundle over UDP → any OSC-aware receiver (Protokol, Max/MSP, a
  DAW, etc.), roughly 30 times per second.
- **Calibration path**: the Puara web interface (port 80) exposes Config/Scan/Settings pages, and an optional
  MJPEG stream (port 81) shows the same grayscale frame the firmware analyses, so the camera and thresholds
  can be tuned visually before disabling the preview for performance.

## Firmware task structure

Internally, three concurrent pieces of code — two FreeRTOS tasks plus the Arduino main loop — share state
through mutex-protected structs:

1. **Camera task (~30 fps)** — for every frame, a single pixel-by-pixel pass computes two independent sets
   of metrics at once:
   - **Diff metrics**: compares the current frame to the previous one; pixels changed by more than
     `diffThreshold` count as "in motion." From those pixels it derives a bounding box, centroid, frame-to-
     frame velocity, spread (standard deviation around the centroid), fill ratio (motion density inside the
     bounding box), and overall magnitude (fraction of the frame moving).
   - **Pixel metrics**: independent of motion, any pixel darker than `pixThreshold` counts as "dark coil
     material." This gives a global coverage fraction and centroid of dark mass, plus three values per zone
     across a 6×4 grid of 24 zones: dark-pixel coverage, edge/gradient density (a proxy for how tightly the
     coils are wound), and local brightness variance (texture richness).
2. **Mic task (~100 Hz)** — reads 512 PDM samples at 16 kHz, computes RMS, and applies a linear `micGain`
   clamped to 1.0.
3. **Main loop (~30 Hz)** — reads both metric sets under their locks, applies **latch behaviour** (most
   spatial values hold their last known state when the scene goes still, rather than snapping to zero;
   velocity, motion flag, and microphone RMS are always live), then either:
   - builds and sends the outgoing OSC bundle over UDP, or
   - parses any incoming OSC message and updates the diff threshold or drives the motor PWM outputs
     accordingly.

The web server (port 80, from the Puara module) and the optional MJPEG snapshot server (port 81) run
independently of this loop, reading the latest raw frame and current settings as needed.

## Settings reference

All settings live on the **Settings** web page, apply immediately without reflashing, and persist across
reboots.

| Parameter | Default | Notes |
|---|---|---|
| `oscIP` | `192.168.4.2` | IP of the computer receiving OSC |
| `oscPORT` | `8000` | UDP port the receiver listens on |
| `localPORT` | `8000` | UDP port the device listens on for incoming OSC |
| `diffThreshold` | `30` | Pixel brightness delta (0–255) that counts as motion; lower = more sensitive |
| `videoStream` | `0` | Set to `1` to enable the MJPEG preview on port 81; disable during performance |
| `camContrast` | `0` | OV2640 hardware contrast, range -2 to 2; higher helps dark shapes stand out |
| `micGain` | `10` | Linear gain on raw mic RMS, clamped to 1.0; practical range 1–100 |
| `pixThreshold` | `100` | Absolute brightness (0–255) below which a pixel counts as dark coil material |

## OSC reference

### Outgoing bundle — ~30 Hz

Sent as a single OSC bundle to `oscIP:oscPORT`; always contains all messages below. Device name comes from
`config.json` (default `snake_differ_0`).

| Address | Args | Latch | Description |
|---|---|---|---|
| `/<device>/motion` | `motion (int), magnitude (float)` | mag only | Current motion state and fraction of frame moving |
| `/<device>/bbox` | `x_min, y_min, x_max, y_max (float×4)` | yes | Bounding box of motion, normalised 0–1 |
| `/<device>/centroid` | `cx, cy (float×2)` | yes | Centre of mass of moving pixels, normalised |
| `/<device>/velocity` | `vx, vy (float×2)` | **no** | Centroid displacement per frame; zero when still |
| `/<device>/spread` | `sx, sy (float×2)` | yes | Std deviation of motion pixels around centroid |
| `/<device>/fill` | `fill (float)` | yes | Motion density inside the bounding box |
| `/<device>/mic` | `rms (float)` | **no** | Onboard mic RMS, normalised 0–1, independent of visual motion |
| `/<device>/coverage` | `coverage (float)` | **no** | Fraction of the whole frame below `pixThreshold` |
| `/<device>/mass` | `cx, cy (float×2)` | **no** | Centroid of all dark pixels, tracks coil mass even at rest |
| `/<device>/grid/coverage` | 24 floats | **no** | Dark-pixel fraction per zone (6×4, row-major, row 0 = top) |
| `/<device>/grid/density` | 24 floats | **no** | Edge/gradient magnitude per zone — coil tightness |
| `/<device>/grid/texture` | 24 floats | **no** | Local variance per zone — texture richness |

### Incoming messages

| Address | Arg | Description |
|---|---|---|
| `/snake_differ/threshold` | `fraction (float)` | Updates `diffThreshold` live; value is a fraction of 255 |
| `/snake_differ/motor1` | `speed (int 0–1000)` | PWM duty on D2 / GPIO 3 |
| `/snake_differ/motor2` | `speed (int 0–1000)` | PWM duty on D3 / GPIO 4 |

## First-time setup

### 1. Flash the firmware (PlatformIO)

```bash
pio run --target upload
pio run --target uploadfs
```

Requires the `pioarduino` platform (ESP32 Arduino 3.x) — the standard PlatformIO ESP32 2.x platform has a
known crash in UDP receive; `platformio.ini` already points at the correct platform.

### 2. Connect to the device's WiFi

On first boot (or with no router configured), the device creates its own access point (SSID
`snake_differ_0`, password `garnetwillis`).

### 3. Open the web interface

`http://snake_differ_0.local` (fallback: the AP's default IP, `192.168.4.1`, or whatever the serial monitor
shows). Config / Scan / Settings pages are all there.

### 4. Optionally join a studio router

On the Config page, enter router SSID/password and Save; the device connects on next reboot and the AP stays
active as a fallback.

## Calibration workflow

1. Position the device so the camera sees the full area of interest.
2. Set `videoStream = 1`, open Config, check framing.
3. Adjust `camContrast` until the tracked shape reads clearly darker than the background.
4. With the scene still, watch the serial monitor (`pio device monitor`) for continuous `[diff] no motion`.
5. Move the shape — `[diff] mag=...` lines should appear immediately.
6. Tune `diffThreshold` until detection is clean with minimal noise.
7. Set `videoStream = 0`, enter `oscIP`/`oscPORT`, Save.
8. Confirm the bundle arrives at ~30 Hz in Protokol or the intended receiver.

## Receiving OSC

- **[Protokol](https://hexler.net/protokol)** — fastest way to confirm the device is sending: add a UDP
  listener on port 8000 and watch the bundle arrive.
- **Max/MSP** — `udpreceive 8000` → `OSC-route /<device>/motion /<device>/bbox ...` → `unpack` per message.
- **Logic Pro** (no native OSC) — bridge via Max/MSP → IAC Driver → Logic (enable IAC Driver, map OSC values
  to MIDI CC in Max, then MIDI-learn them in Logic's Smart Controls or a plugin), or use TouchOSC to forward
  OSC as MIDI CC without needing Max.

## Camera preview

When `videoStream = 1`, an MJPEG stream is served at `http://<device_ip>:81/stream` (also embedded directly
in the Config page) using a single persistent multipart HTTP connection — no polling, no per-frame
round-trip. Preview is the same grayscale frame used for diff computation, and `camContrast` affects both.
**Turn `videoStream` off before a show** — JPEG encoding runs continuously while a client is connected.

## Technical notes

- Diff + pixel analysis + OSC rate: ~30 fps / ~30 Hz
- Frame format: QVGA 320×240 grayscale — 76,800 pixels processed per frame, single pass
- Analysis grid: 6×4 = 24 zones (~80×60 px each); zone index = row × 6 + col, row 0 = top, col 0 = left
- Mic: PDM 16 kHz, RMS over 512 samples, ~100 Hz update
- Motor PWM: 1 kHz, 10-bit (0–1023 range; 0–1000 input maps directly)
- PSRAM: 8 MB used for frame buffers; firmware logs an error and skips camera init if unavailable
- Port 80: Puara web interface; port 81: MJPEG stream (`/stream`), only active when `videoStream = 1`
- Platform: `pioarduino` (ESP32 Arduino 3.x) required

## Built with

- [Puara Module](https://github.com/Puara/puara-module) — WiFi, webserver, filesystem, settings management
- [CNMAT OSC](https://github.com/cnmat/OSC) — OSC encode/decode
- ESP32 Arduino / ESP-IDF — camera driver, I2S PDM, LEDC PWM

---
*Société des Arts Technologiques (SAT) — Montréal*
*Input Devices and Music Interaction Laboratory (IDMIL), McGill University*
