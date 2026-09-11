# Antenne — architecture overview

Firmware for an **Olimex ESP32-PoE** board connected to an **Olimex MOD-MPU9150** 9DoF motion sensor via
UEXT, streaming fused orientation and raw sensor data as OSC over a wired, PoE-powered Ethernet connection.

## Purpose

A self-contained motion sensor "antenna": plug the MPU9150 module directly into the ESP32-PoE's UEXT
connector, power the board over a single Ethernet cable (PoE — no separate power supply), and it streams
accelerometer, gyroscope, magnetometer, and fused orientation data as OSC to any receiving software (Max/MSP,
Pure Data, TouchDesigner, etc.) at 50 Hz. Onboard gyroscope calibration runs automatically at boot, and a
one-time (or as-needed) magnetometer calibration — triggered by a button hold or a remote OSC message — is
persisted to flash so it survives reboots.

## Hardware

| Part | Reference |
|---|---|
| MCU board | Olimex ESP32-PoE (16 MB flash) |
| Motion sensor | Olimex MOD-MPU9150 (MPU-6050 accel/gyro + AK8975 magnetometer, in one package) |
| Connection | UEXT connector — plugs directly, no wiring |
| Network | RJ45 Ethernet, powered over PoE |
| I2C pins (UEXT) | SDA = GPIO13, SCL = GPIO16 |
| Onboard LED | GPIO33, active-high |
| BTN1 | GPIO34, active-low, external pull-up |

## System overview

```
MOD-MPU9150 (UEXT, I2C)
        │
        ▼
Olimex ESP32-PoE firmware
        │
        ▼
OSC bundle out, PoE Ethernet (50 Hz)
        │
        ▼
Receiving software (Max/MSP, Pure Data, TouchDesigner, …)
```

Incoming OSC on port 8888 (`/mpu/calibrate`) can trigger a magnetometer calibration session on the board at
any time, independent of the outgoing data stream.

## Firmware main loop

The board runs a fixed 50 Hz loop (`LOOP_MS = 20`):

```
Boot: bring up Ethernet, load saved magnetometer bias, calibrate gyro (1 s, sensor held still)
        │
        ▼
Read MPU9150 + AK8975 over I2C (one 14-byte burst + magnetometer registers)
        │
        ▼
Apply magnetometer bias (if calibrated), normalize, 9-axis Kalman fusion (puara-gestures)
        │
        ▼
Send OSC bundle over Ethernet
        │
        ▼
Update LED, check BTN1 hold and incoming OSC (may trigger calibration)
        │
        ▼
        ↻ repeats every 20 ms
```

1. **Boot** — brings up the Ethernet link (static IP, up to 8 s wait), loads any previously saved
   magnetometer bias from flash (NVS), initializes the MPU9150 over I2C, and runs a 1-second gyroscope
   bias calibration (200 samples while the sensor must stay still).
2. **Sensor read** — one 14-byte I2C burst read covers accelerometer and gyroscope registers together;
   the magnetometer is read separately (via the MPU9150's I2C bypass mode giving direct access to the
   onboard AK8975) whenever its data-ready bit is set.
3. **Orientation fusion** — if a magnetometer calibration has been completed, the corresponding per-axis
   bias is subtracted before the vector is normalized to unit length. The result feeds a 9-axis Kalman
   filter (from `puara-gestures`) that fuses accelerometer, gyroscope, and magnetometer into roll, pitch,
   and tilt-compensated yaw.
4. **OSC send** — one bundle per loop iteration, gated on the Ethernet link being up.
5. **LED / input handling** — the LED state machine and the BTN1 long-press detector run every cycle, and
   any incoming OSC calibration request is dispatched here too.

## Magnetometer calibration

Hard-iron interference (nearby metal, speakers, power supplies) shifts the magnetometer's zero point, which
throws off yaw. Calibration removes that constant offset — needed once at first setup, and again whenever
the instrument's physical configuration changes.

```
Trigger calibration (hold BTN1 5s, or send OSC /mpu/calibrate)
        │
        ▼
30-second rotation window — LED fast blink (4 Hz), tracks min/max per axis
        │
        ▼
Compute hard-iron bias: bias = (min + max) / 2, per axis
        │
        ▼
Save to flash (NVS) — solid LED for 1 second confirms completion
        │
        ▼
Loaded automatically on every future boot
```

Calibration can be started two ways — holding the physical button, or sending an OSC message from the same
network the board streams to — so it can be triggered either at the instrument itself or remotely from
whatever software is already receiving its data. During the 30-second window, rotating the sensor through
every orientation (a figure-8 motion covering all axes works well) lets the firmware record the true minimum
and maximum reading on each magnetometer axis; the midpoint of each axis's min/max becomes that axis's bias.
The result is written to non-volatile storage and survives power cuts and firmware re-flashes.

## LED states

| LED behaviour | Meaning |
|---|---|
| Off | No Ethernet link |
| Slow blink (1 Hz) | Connected and streaming |
| Solid ON | BTN1 is being held — keep holding to start calibration |
| Fast blink (4 Hz) | Magnetometer calibration in progress |
| Solid for 1 second | Calibration just completed successfully |

## OSC reference

### Outgoing (board → computer), one bundle per 20 ms

| Address | Type | Unit | Description |
|---|---|---|---|
| `/mpu/accel/x` `/mpu/accel/y` `/mpu/accel/z` | float | g | Raw accelerometer |
| `/mpu/gyro/x` `/mpu/gyro/y` `/mpu/gyro/z` | float | °/s | Gyroscope, bias-corrected |
| `/mpu/mag/x` `/mpu/mag/y` `/mpu/mag/z` | float | unit sphere | Magnetometer, normalized; offset before calibration, centered on origin after |
| `/mpu/euler/roll` | float | ° (0–360) | Rotation around X |
| `/mpu/euler/pitch` | float | ° (−90–+90) | Rotation around Y |
| `/mpu/euler/yaw` | float | ° (0–360) | Heading, tilt-compensated |
| `/mpu/tilt` | float | ° (0–180) | Combined tilt magnitude, `sqrt(roll² + pitch²)`, clamped |
| `/mpu/btn1` | int | — | 1 while BTN1 is held, else 0 |
| `/mpu/cal/status` | int | — | 0 = uncalibrated, 1 = calibrating, 2 = calibrated |

### Incoming (computer → board), port 8888

| Address | Arguments | Description |
|---|---|---|
| `/mpu/calibrate` | *(none)* | Starts a 30-second magnetometer calibration session |

## Adjustable parameters

| Parameter | Location | Default | Effect |
|---|---|---|---|
| Send rate | `LOOP_MS` | `20` (50 Hz) | Lower = faster updates; don't go below `10` (100 Hz) |
| Kalman process noise (Q) | `kalman(Q, R)` | `0.001` | How much the filter trusts gyroscope integration; lower = smoother but slower to respond |
| Kalman measurement noise (R) | `kalman(Q, R)` | `0.01` | How much the filter trusts accel/mag corrections; higher = smoother but drifts more under disturbance |
| Gyroscope DLPF bandwidth | `R_CONFIG` register write | `0x04` (~21 Hz) | `0x02`=98 Hz (fast movement) … `0x05`=10 Hz (near-static); current setting suits slow, deliberate movement |

## Project structure

```
├── boards/
│   └── esp32-poe-16mb.json     custom PlatformIO board definition
├── examples/
│   ├── ESP32_PoE_Ethernet_SD_Card_Arduino.ino
│   ├── ESP32_PoE_WebServer_Demo.ino
│   └── MagnetometreCalibrationDemo.cpp
├── mpu9150_demo/                original bare sensor demo
├── src/
│   └── main.cpp                 firmware (edit this)
└── platformio.ini
```

The `examples/` and `mpu9150_demo/` folders are bundled reference material, not part of the firmware that
actually runs — each comes from a different origin and is kept for reference rather than executed:

- **`mpu9150_demo.ino`** — the original bare-metal MPU-9150 I2C register demo (public domain, by Arduino
  user "frtrobotik" / Tobias Hübner, Olimexino edition by Chris B.) that the sensor-register logic in this
  project traces back to.
- **`MagnetometreCalibrationDemo.cpp`** — a magnetometer-calibration reference example from a different
  IDMIL project (GuitarAMI, Edu Meneses, built on the Puara templates), kept here as a comparison point for
  calibration UX on a fuller IMU stack (LSM9DS1/BNO080).
- **`ESP32_PoE_WebServer_Demo.ino`** — a general-purpose webserver demo for the Olimex ESP32-PoE board
  (controls various Olimex UEXT modules), originally by David Bird, adapted for this board — unrelated to
  the MPU9150 but useful as an ESP32-PoE peripheral reference.
- **`ESP32_PoE_Ethernet_SD_Card_Arduino.ino`** — a combined SD-card + Ethernet bring-up demo for the same
  board.

## Custom PlatformIO board definition

`boards/esp32-poe-16mb.json` defines the Olimex ESP32-PoE's 16 MB-flash variant for PlatformIO, since it
isn't one of the built-ins: correct partition table and linker script for 16 MB flash, the Ethernet PHY wiring
specific to this board (LAN8720 over RMII, MDC/MDIO pins, power pin, clock mode), and upload parameters
(921,600 baud, esptool/espota).

## Dependencies

Managed automatically by PlatformIO:

- [CNMAT OSC](https://github.com/CNMAT/OSC) — OSC message/bundle library
- [puara-gestures](https://github.com/Puara/puara-gestures) — 9-axis Kalman filter for orientation
- ESP32 Arduino framework (Espressif32, via PlatformIO)
