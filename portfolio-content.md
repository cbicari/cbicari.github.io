# Portfolio content bank

Reusable copy for a resume, LinkedIn profile, or cover letter. Two versions of each project are given: a
**short** one-liner (resume bullet) and a **long** version (LinkedIn "Projects" section, portfolio page,
or talking points for an interview). Fill in your name, contact details, and any dates/titles — none of
that is guessed here.

---

## Professional summary

**Short (resume header):**
> Embedded systems engineer working across real-time control, edge AI, and networked devices — from
> closed-loop motor control on microcontrollers to on-device computer vision and distributed multi-agent
> systems. Maintainer of the Puara open-source embedded framework.

**Long (LinkedIn "About" / cover letter opener):**
> I build firmware, drivers, and distributed systems that connect physical hardware — motors, cameras,
> sensors, microcontrollers — to networks, machine learning models, and the software that has to control
> them reliably in real time. My work spans bare-metal closed-loop control on Teensy and ESP32, embedded
> computer vision, real-time neural audio synthesis on edge devices, and distributed orchestration across
> Raspberry Pi clusters. I also co-maintain Puara, an open-source embedded framework for networked musical
> controllers, used and forked by outside researchers and students. Based at SAT / IDMIL (Montréal).

---

## Skills (grouped, literal — for ATS and quick scanning)

- **Languages & build tooling:** C++, C, Python, Bash, CMake, PlatformIO
- **Embedded platforms:** ESP32 (S3 / C3), Teensy 4.1, Raspberry Pi (4 / 5), Arduino, FreeRTOS
- **Protocols & networking:** OSC, BLE advertising, WiFi (STA/AP provisioning), UDP, SLIP-framed serial, mDNS
- **Linux & systems:** udev, V4L2, kernel modules, GStreamer, systemd, distributed process orchestration,
  file-based concurrency/locking
- **ML & edge AI:** PyTorch, vision-language model inference, LoRA fine-tuning (kohya_ss), MediaPipe,
  real-time neural audio synthesis (RAVE / nn~), TF-IDF
- **Tooling & practices:** Git, GitHub Actions (CI), Doxygen / mdBook, Syncthing, mutex-protected
  concurrent state, closed-loop control, crash-safe persistence (EEPROM)

---

## Projects

### 1. Puara — embedded framework (4 repositories maintained)
**Short:** Co-maintain a 4-repo open-source C++ framework (WiFi/web-server/settings core library +
standalone gesture-recognition library + two synchronized PlatformIO/Arduino packagings) for networked
ESP32 controllers; used and forked by external researchers and students.

**Long:** Co-maintain the open-source Puara framework for building networked musical controllers on ESP32.
The core C++ library abstracts WiFi provisioning, a browser-based configuration/settings web server, and
persistent settings storage, so a device can be reconfigured from a browser without reflashing. A separate,
independent library turns raw sensor data into gesture descriptors (motion bursts, shake energy, tilt/roll,
touch, button taps/holds). Two packagings — PlatformIO and Arduino IDE — are kept in sync and cover OSC
send/receive, BLE advertising, and libmapper integration, each with CI via GitHub Actions.
*Links:* github.com/Puara/puara-module, puara-module-templates, puara-arduino, puara-gestures

### 2. Networked kinetic pendulum — control firmware
**Short:** Designed closed-loop control firmware for a multi-segment kinetic installation: four independent
Teensy 4.1 controllers communicating over OSC/SLIP-serial, with encoder feedback, safety interlocks, and
EEPROM-based crash recovery.

**Long:** Firmware for a multi-segment kinetic pendulum installation: four independent Teensy 4.1
microcontrollers — one per arm segment plus an electromagnetic drive stage — communicate over OSC via
SLIP-framed serial and a network bridge (NGIMU). Implemented closed-loop position control with quadrature
encoder feedback, mechanical safety interlocks between adjacent carriages so they can never collide,
EEPROM-based crash recovery that distinguishes a clean stop from an approximate mid-move autosave, and
direction-aware electromagnetic coil commutation for the drive stage. *(Private firmware — available on
request.)*

### 3. snake_differ — on-device motion detection (ESP32-S3)
**Short:** Wrote ESP32-S3 firmware performing real-time frame-difference motion detection and pixel-texture
analysis on-device, broadcasting results as OSC at ~30 Hz from concurrent FreeRTOS tasks.

**Long:** ESP32-S3 firmware performing single-pass frame-difference motion detection and dark-region pixel
analysis directly on-device, broadcasting bounding box, centroid, velocity, spread, and zone-based
texture/density metrics as an OSC bundle over WiFi at roughly 30 Hz. Two concurrent FreeRTOS tasks handle
camera and microphone processing, publishing into mutex-protected shared state read by the main loop.
*(Private firmware — available on request.)*

### 4. Realtime latent-space synthesis (Raspberry Pi 5 + neural audio)
**Short:** Deployed realtime neural audio synthesis (RAVE, via the nn~ Pure Data external) on a Raspberry
Pi 5, steered live by hand-gesture tracking or a MIDI controller.

**Long:** Realtime latent-space audio synthesis on a Raspberry Pi 5, using the nn~ Pure Data external to run
a pretrained RAVE neural audio model. The model's latent space is steered live either by a webcam-based hand
tracking pipeline (MediaPipe → Wekinator → OSC) or, as an alternate control path, a MIDI controller — both
patched into Pure Data running under JACK for low-latency audio I/O.
*Link:* github.com/cbicari/latent_space_synthesis

### 5. LoRA captioning & training pipeline
**Short:** Built an end-to-end automation pipeline that captions images with a vision-language model and
extracts key concepts, then drives a scripted LoRA fine-tuning run — via CLI or desktop UI.

**Long:** End-to-end pipeline turning a folder of raw images into a trained LoRA model. A vision-language
model (Janus-Pro) generates a caption per image and TF-IDF extracts each dataset's core concepts into a
reference file; a second stage copies the resulting dataset into kohya_ss, dynamically generates the
training config, and launches a scripted Stable Diffusion LoRA fine-tuning run via `accelerate` — usable
from either a CLI script or a desktop UI with save/load config support. *(Private pipeline — available on
request.)*

### 6. Computer-vision + ML workshop pipeline
**Short:** Authored a teaching pipeline and cross-platform install docs wiring computer vision, machine
learning, and creative-coding software together over OSC for a technical workshop.

**Long:** Teaching pipeline and workshop material demonstrating how to wire computer vision (MediaPipe),
machine learning (Wekinator), and creative-coding software (Ossia Score, Max/MSP, TouchDesigner) together
over OSC. Includes cross-platform install scripts (Windows, Linux, macOS) and troubleshooting documentation
written for non-technical users.
*Link:* github.com/cbicari/CV_ML_intermedia_pipeline_workshop

### 7. Firefly MV / dc1394 camera integration
**Short:** Built a reproducible Linux setup pipeline for an industrial machine-vision camera: udev rules,
a libdc1394 test harness, and a GStreamer/v4l2loopback bridge exposing it as a standard webcam.

**Long:** Reproducible Linux setup for a Point Grey Firefly MV (IIDC/DCAM) industrial machine-vision camera:
a custom udev rule grants non-root USB access, a compiled libdc1394 test tool verifies raw capture, and a
GStreamer pipeline feeds a v4l2loopback virtual device so the camera appears as an ordinary V4L2 webcam to
any downstream application.
*Link:* github.com/cbicari/firefly-mv-dc1394-setup

### 8. technocompost — distributed multi-agent image pipeline
**Short:** Designed a distributed image-processing installation across a Raspberry Pi cluster, in two
architectures: per-Pi AI agents choosing transformations autonomously, and a concurrent tile-based canvas
with file-locking and live TCP display.

**Long:** Distributed image-processing installation across a Raspberry Pi cluster, implemented as two
architectures sharing the same infrastructure. The first has each Pi run a local AI agent that reads its own
system telemetry (CPU temperature, load) and autonomously chooses a transformation script for a
single shared image, handing off stage-to-stage over Syncthing. The second, higher-throughput design has
every Pi concurrently claim and process tiles of one shared canvas using atomic file-based locking,
alpha-blending results back in and streaming the composited canvas live to a networked display server over
TCP.
*Link:* github.com/cbicari/technocompost
