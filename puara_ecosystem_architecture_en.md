# Puara framework — ecosystem architecture overview

Projects: [`Puara/puara-module`](https://github.com/Puara/puara-module),
[`Puara/puara-module-templates`](https://github.com/Puara/puara-module-templates),
[`Puara/puara-arduino`](https://github.com/Puara/puara-arduino),
[`Puara/puara-gestures`](https://github.com/Puara/puara-gestures)

Developed by the **Société des Arts Technologiques (SAT)** and the **Input Devices and Music Interaction
Laboratory (IDMIL)**.

## Purpose

Puara is a framework for building networked musical controllers and interactive installations on ESP32
boards. Rather than one repository, it's an ecosystem of four repos with distinct, complementary roles: a
core device library, a sensor-to-gesture library, and two IDE-specific packagings of ready-to-flash example
firmware built on top of both.

## Ecosystem overview

- **[`puara-module`](https://github.com/Puara/puara-module)** — the core C++ library. Manages WiFi
  (station/access-point), a browser-accessible web server, and a filesystem-backed settings store, so a
  device can be configured and reconfigured from a browser without rebuilding or reflashing firmware.
- **[`puara-gestures`](https://github.com/Puara/puara-gestures)** — a separate, independent C++ library that
  turns raw sensor signals (accelerometer/IMU, touch arrays, buttons) into higher-level gesture descriptors
  (jab, shake, tilt/roll, touch brush/swipe, button tap/hold). It has no dependency on `puara-module` and can
  be used standalone in any C++ project.
- **[`puara-module-templates`](https://github.com/Puara/puara-module-templates)** — PlatformIO project
  templates that combine `puara-module` (and, where relevant, `puara-gestures`, CNMAT's OSC library, BLE, or
  libmapper) into eight ready-to-build example devices, for use in VS Code + PlatformIO.
- **[`puara-arduino`](https://github.com/Puara/puara-arduino)** — the same underlying examples, kept
  synchronized with `puara-module-templates`, but packaged as Arduino sketches distributed through the
  `puara-module` Arduino library (`File > Examples > puara-module`) for the Arduino 2.0 IDE. Currently ships
  five of the eight templates (basic, OSC-Send, OSC-Receive, OSC-Duplex, BLE advertising).

## How the repos fit together

`puara-module` and `puara-gestures` are the two core libraries — independent of each other, each usable on
its own. The two template repos both consume them to produce ready-to-flash example projects, one packaging
for each supported toolchain; the projects are kept equivalent across both so a person can follow either the
PlatformIO or the Arduino path and get the same behavior. Either path ends the same way: build and upload
firmware, then separately build and upload the filesystem image (LittleFS by default, SPIFFS optionally),
onto a physical ESP32 board.

## On-device runtime, shared by every template

Regardless of which template or IDE was used to build it, every resulting device follows the same runtime
shape:

1. **WiFi bring-up** — on boot, the module manager reads `config.json` from the filesystem and attempts one
   of three modes: **Station-Access Point (STA-AP)**, the default, where the device both joins an existing
   network and creates its own; **Access Point (AP) only**, where it only creates its own network; or
   **Station (STA) only** (`persistent_AP=0`), where it only joins an existing network and never advertises
   its own, useful for reducing WiFi pollution and improving security.
2. **Web server** — a browser-accessible server exposes Config, Scan, and Settings pages, reachable either by
   IP address (e.g. `http://192.168.4.1` in AP mode, or the address from `puara.staIP()` in STA/STA-AP mode)
   or, if mDNS is enabled (default), by hostname (e.g. `http://puara_001.local`). Through this UI, values
   defined in `/data/settings.json` can be edited and persist across reboots, and are read in code with
   `puara.getVarText("name")` / `puara.getVarNumber("name")`.
3. **User program loop** — the sketch's own logic runs here: reading sensors, optionally running them through
   `puara-gestures` descriptors, and reacting to events.
4. **OSC / BLE output** — depending on the template, this stage sends sensor or gesture data out as OSC
   messages (via CNMAT's OSC library), receives incoming OSC to control outputs, or broadcasts data
   connectionlessly over BLE advertising.

A registered `onSettingsChanged()` callback re-reads updated settings whenever the user saves changes through
the web UI, so parameters like OSC IP/port take effect immediately without a rebuild.

**Firmware and filesystem are two separate uploads.** The firmware is the compiled program logic; the
filesystem (LittleFS/SPIFFS) holds `config.json`, `settings.json`, and the web UI's HTML/CSS — both must be
built and uploaded (PlatformIO: `Upload Filesystem Image` + `Upload`; Arduino IDE: the
[Arduino-LittleFS-Upload](https://github.com/earlephilhower/arduino-littlefs-upload) plugin's
`Upload LittleFS to Pico/ESP8266/ESP32` command, plus the normal sketch upload).

## Available templates / examples

Both `puara-module-templates` (PlatformIO) and `puara-arduino` (Arduino IDE) ship the same underlying
examples; the table below notes which are currently available in each.

| Template | What it demonstrates | In `puara-module-templates` | In `puara-arduino` |
|---|---|---|---|
| **Basic** | Core module functionality: reads settings, prints dummy sensor data to serial | ✅ | ✅ |
| **OSC-Send** | Sends sensor data as OSC to a configurable IP/port | ✅ | ✅ |
| **OSC-Receive** | Receives OSC (e.g. `/led/brightness f 0.34`) and drives an output | ✅ | ✅ |
| **OSC-Duplex** | Combines OSC-Send and OSC-Receive in one sketch | ✅ | ✅ |
| **BLE advertising** | Broadcasts CBOR-encoded sensor data via BLE advertising, no connection needed | ✅ | ✅ |
| **Basic Gestures** | Extends Basic with `puara-gestures` gesture recognition on a pseudo-IMU | ✅ | — |
| **Button OSC** | Button tap/double-tap/hold detection via `puara-gestures`, sent as OSC | ✅ | — |
| **Libmapper OSC** | Registers signals with libmapper alongside OSC messaging | ✅ | — |

## Puara Gestures: descriptors and utilities

`puara-gestures` is intentionally decoupled from networking or hardware specifics — it just turns numeric
sensor streams into gesture-shaped signals:

| Descriptor | Purpose |
|---|---|
| `Jab`, `Jab2D`, `Jab3D` | Simple motion-burst detectors across 1, 2, or 3 axes |
| `Shake`, `Shake2D`, `Shake3D` | Smooth motion-energy tracking for vibration/shaking, with a threshold and decay |
| `Tilt`, `Roll` | Orientation signals from full 9DoF IMU data |
| `Tilt_Roll` | Fast roll/tilt from accelerometer data alone (no gyro/magnetometer needed) |
| `TouchArrayGestureDetector` | Brush/rub and swipe-style features for touch sensor arrays |
| `Button` | Tap, double-tap, hold, and press-count tracking from a digital input |

Supporting `utils/` helpers: `rollingminmax` (sliding min/max), `leakyintegrator` (smooth decay / energy
tracking), `maprange` (range scaling), `smooth` (moving average), `threshold` (clamping), `wrap` (angle
wrapping), `discretizer` (change detection), `circularbuffer` (fixed-size history).

`puara-gestures` builds standalone via CMake, or as a PlatformIO `lib_deps` entry
(`https://github.com/Puara/puara-gestures.git#v0.2.0`), optionally paired with
`https://github.com/malloch/IMU_Sensor_Fusion.git` for full IMU sensor fusion support.

## Example data flow: BLE advertising → OSC

The BLE advertising template is the one example that explicitly crosses into a second, off-repo tool:

1. The ESP32 broadcasts sensor data as CBOR payloads inside BLE manufacturer data, at a configurable
   frequency (default 50 Hz) — no BLE connection is established, so a single receiver can pick up data from
   many devices at once (tested at roughly 120 devices over a 0–150 m range, updating every 500 ms).
2. A separate Python script,
   [`ble-cbor-to-osc.py`](https://gitlab.com/sat-mtl/collaborations/2024-iot/ble-cbor-to-osc) (its own
   GitLab repo, run in its own virtual environment), listens for these BLE advertisements, decodes the CBOR
   payload, and forwards the values as OSC messages to `127.0.0.1:9001` by default (configurable).

This pattern — connectionless BLE broadcast in, OSC out on the receiving computer — is suited to distributed
sensor networks and installations with many simultaneous low-data-rate devices, where per-device BLE
connections wouldn't scale.

## Getting started

**PlatformIO (`puara-module-templates`):**
1. Install VS Code + the PlatformIO extension.
2. `git clone https://github.com/Puara/puara-module-templates.git`
3. In PlatformIO, "Pick a folder" and open one of the template subfolders (e.g. `basic/`).
4. Set the `board` field in `platformio.ini` to match your hardware.
5. Edit the template, then **Build**/**Upload** the firmware and **Build**/**Upload Filesystem Image**
   separately.

**Arduino IDE (`puara-arduino`):**
1. Install the Arduino 2.0 IDE, the ESP32 board package (Boards Manager → search "esp32" → install
   *Espressif Systems*), and the
   [Arduino-LittleFS-Upload](https://github.com/earlephilhower/arduino-littlefs-upload) plugin.
2. Install the `puara-module` library via the Library Manager.
3. `File > Examples > puara-module` → pick a template.
4. Set board/port, and under `Tools > Partition Scheme` pick a minimal-SPIFFS-style option to leave enough
   room for the program.
5. Edit `data/config.json` (WiFi SSID/PSK) and `data/settings.json` (custom variables) via
   `Sketch > Show Sketch Folder`.
6. Upload the sketch normally, then use the LittleFS-Upload plugin's
   `Upload LittleFS to Pico/ESP8266/ESP32` command for the filesystem.

## Tested boards

| Board | Status | PlatformIO ID | Arduino IDE board |
|---|---|---|---|
| M5StickC | ✅ | `m5stick-c` | M5StickC |
| TinyPICO | ✅ | `tinypico` | UM TinyPico |
| ESP32-C3-WROOM-02 / DevKitC-02 | ✅ | `esp32-c3-devkitc-02` | ESP32C3 Dev Module |
| Adafruit ESP32-S3 Feather | ⚠️ manual boot-mode entry, slow serial | `adafruit_feather_esp32s3` | Adafruit Feather ESP32-S3 2MB PSRAM |
| Adafruit ESP32-S3 TFT Feather | ⚠️ same caveats | `adafruit_feather_esp32s3_tft` | Adafruit Feather ESP32-S3 TFT |
| Seeed XIAO S3 | ⚠️ same caveats | `seeed_xiao_esp32s3` | XIAO_ESP32S3 |
| DOIT ESP32 DevKit V1 | ⚠️ no minimal partition option in Arduino IDE (works via PlatformIO) | `esp32doit-devkit-v1` | DOIT ESP32 DEVKIT V1 |

## Licensing

All four repositories are MIT-licensed, unless a specific file states otherwise.
