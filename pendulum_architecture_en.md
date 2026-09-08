# Pendulum installation — firmware architecture overview

Firmware for a large kinetic pendulum installation, built from a chain of motorised arm segments and a
rotary electromagnetic booster at the base. Four independent [PlatformIO](https://platformio.org/) firmware
projects target Teensy 4.1 boards — one per arm segment (small, middle, long) plus one for the booster —
sharing the same OSC communication layer but each with its own physical geometry, motor count, and OSC
address namespace.

## Hardware topology

Commands arrive over the network as OSC messages, which reach an **x-io Technologies NGIMU** unit acting as
an OSC-over-serial bridge. Each Teensy 4.1 controller receives OSC both directly over its USB serial port and
via the NGIMU on its auxiliary serial port (`Serial1`), decoded through a SLIP-framed OSC layer
(`Receive.cpp`/`Send.cpp`, based on Seb Madgwick's OSC99 library with an `EventScheduler`/`EventTrigger`
layer for periodic/edge-triggered sends).

Each Teensy drives its own actuator hardware:
- The three **arm controllers** (small, middle, long) each drive 2–3 linear carriage motors through a
  **Cytron motor driver board**, whose power is gated by a MOSFET control pin, using a PWM speed pin and a
  digital direction pin per motor, with a quadrature `Encoder` per motor for closed-loop position feedback
  and mechanical limit switches for calibration and hard stops.
- The **booster controller** drives a ring of **electromagnetic coils** directly via a PWM strength pin and a
  polarity/direction pin, using a single rotary `Encoder` to time coil pulses against the swinging pendulum's
  position.

## Shared firmware loop

All four firmware variants share the same overall loop shape, built from the same generic `Receive.cpp` /
`Send.cpp` pair:

1. **OSC input (SLIP)** — `ReceiveDoTasks()` pulls bytes from both the USB serial port and the NGIMU
   auxiliary serial port, feeding two independent SLIP decoders.
2. **Dispatch by address** — each decoded OSC message is matched against a literal address pattern (e.g.
   `/smallArm/destinationM1`, `/booster/activeZone`) and updates the relevant controller's state: a motor's
   `destination`, a flag like `brakeState` or `broadcast`, or triggers an action like `calibrate()`.
3. **Control loop** — the arm controllers check limit switches (debounced via `Bounce`), run the calibration
   state machine if active, and otherwise drive motors toward their destinations; the booster controller reads
   its rotary encoder, determines swing direction, and evaluates which electromagnet "zone" is active.
4. **Hardware I/O** — PWM/direction signals go out to the Cytron driver or coil driver; encoder and
   limit-switch state comes back in.
5. **Scheduled telemetry** — `SendDoTasks()` runs an `EventScheduler` that periodically packages state
   (motor positions, calibration status, limit-switch triggers, errors, etc.) into OSC messages sent back out
   over `Serial1` to the NGIMU, gated by each controller's own `broadcast`/`broadcastState` flag.

This loop repeats indefinitely inside each `.ino`'s `loop()`.

## Arm segment chain

The three arm firmwares share the same underlying `motor`/limit-switch/calibration machinery, but describe
different points along one mechanical chain, from the rotary base to the tip:

| Segment | Motors | Role of each motor |
|---|---|---|
| **Booster** (base) | — (coil ring) | Electromagnetically drives the pendulum's rotary swing |
| **Long arm** | M1, M2, M3 | M1 = damper carriage; M2 = receiver, connects to the booster/base axle; M3 = transmitter, connects to the middle arm's receiver |
| **Middle arm** | M1, M2, M3 | M1 = damper carriage; M2 = receiver, connects to the long arm's transmitter; M3 = transmitter, connects to the small arm's receiver |
| **Small arm** (tip) | M1, M2 | M1 = damper carriage; M2 = receiver, connects to the middle arm's transmitter |

Within each arm, `SAFE_DISTANCE_*` constants enforce a minimum encoder-tick gap between adjacent carriages so
they can never physically collide, and each carriage's `min_pos`/`max_pos` is continuously recomputed
relative to its neighbours in `update_motor_positions()`.

### Per-arm specifics

| | Small arm | Middle arm | Long arm |
|---|---|---|---|
| Motors | 2 | 3 | 3 |
| Limit switches | 3 (top, top-mid, bottom) | 4 (top, top-mid, mid-bottom, bottom) | 4 (top, top-mid, mid-bottom, bottom) |
| Brake | Yes (`brakeControlPin`, `checkBrakeState()`) | No — brake OSC handler commented out, no brake check in the loop | Yes (`brakeState` restored, checked via OSC and `checkBrakeState()`) |
| Full-scale ticks | 300,000 (`CALIBRATE_MAX_SMALL_ARM`) | 800,000 (`CALIBRATE_MAX_MIDDLE_ARM`) | 6,791,754 (`CALIBRATE_MAX_LONG_ARM`), ≈137 cm top to bottom |
| OSC namespace | `/smallArm/...` | `/middleArm/...` | `/longArm/...` |
| Struct type | `pendulum_small_arm` | `pendulum_mid_long_arms` (instance `middleArm`) | `pendulum_mid_long_arms` (instance `longArm`) |

Each arm's calibration routine drives its extreme motors to their limit switches to zero the encoders, then
records `min_pos`/`max_pos` for the rest of the run. A `move_motors()` step reduces PWM speed in fixed
distance bands as a carriage nears its destination (`motor_movement()`), and gives a short PWM "boost" if a
motor appears stuck (position unchanged over ~5000 loop iterations).

### Power-loss recovery (small/middle/long arm)

All three arm firmwares persist the last known motor positions to EEPROM (magic-numbered struct,
`saveLastKnownPositions()` / `loadLastKnownPositions()`):
- Saved with `EEPROM_RELIABILITY_CLEAN` right when all motors settle within bounds.
- Periodically autosaved with `EEPROM_RELIABILITY_APPROX` while motors are actively moving (every
  `AUTOSAVE_INTERVAL_MS`), in case power is lost mid-move.
- On boot, a valid saved position lets the arm resume without a full calibration pass; the reliability level
  is broadcast over OSC (`/*/resumeReliability`) so the operator knows whether the resumed position is exact
  or approximate.

## Booster: electromagnetic rotary drive

The booster is architecturally different from the three arms — instead of driving carriages along a track,
it pulses a ring of electromagnetic coils to add energy to the pendulum's rotary swing, timed against a
single rotary encoder:

- **Direction detection**: comparing the new encoder position to the last one (within a guard band around
  the encoder's zero-crossing, `LIMIT_Z_ORIGIN_NEGATIVE`/`_POSITIVE`) determines whether the pendulum is
  currently swinging clockwise or counter-clockwise.
- **Position zones**: the encoder's swing range is divided into "over coil", "between coil", and "dead"
  bands (`Bound`/`Zone` structs, precomputed position tables). Depending on the selected **active zone**
  (0–3), a progressively larger set of electromagnet pairs is considered live — zone 0 uses the innermost 3
  pairs, up to zone 3 which uses all pairs across the swing range.
- **Coil firing**: when the current position falls in an active "over coil" or "between coil" band, the coil
  is fired at `pwm_strength` with a polarity chosen from swing direction and band type, so the field always
  pushes the pendulum forward rather than braking it; positions in the "dead" band get zero PWM.
- **Controls exposed over OSC**: `/booster/on` (enable/disable), `/booster/strength` (PWM magnitude),
  `/booster/activeZone` (0–3), `/booster/brakeState`, and `/rotary/broadcast` (telemetry on/off). Telemetry
  (`/rotary/value`) reports the raw encoder position at a slow 60-second interval.

## OSC reference

### Arm controllers (`smallArm` / `middleArm` / `longArm`)

| Address | Direction | Purpose |
|---|---|---|
| `/*/destinationM1`, `/*/destinationM2`, `/*/destinationM3`* | in | Set a motor's target position (scaled 0–1000, converted to encoder ticks) |
| `/*/calibrate` | in | Start (or restart) the calibration routine |
| `/*/stopAllMotors` | in | Zero all PWM outputs and freeze current position as the destination |
| `/*/brakeState` | in | Engage/release the brake solenoid (small arm and long arm only) |
| `/*/broadcast` | in | Enable/disable this controller's telemetry |
| `/*/positionM1`, `/*/positionM2`, `/*/positionM3`* | out | Current motor position |
| `/*/calibrationStatus` | out | Whether calibration has completed |
| `/*/resumeReliability` | out | EEPROM resume state: none / clean / approximate |
| `/*/maxPossiblePositionM1`, `/*/minPossiblePositionM2`, etc. | out | Live safe-range bounds derived from neighbouring carriages |
| `/*/limitSwitch0N Triggered` | out | One-shot notification that a limit switch fired |
| `/teensy/error` | out | Generic error string (bad OSC address, decode failure, etc.) |

\* `destinationM3`/`positionM3` only exist on the middle and long arm (3-motor) firmware.

### Booster controller

| Address | Direction | Purpose |
|---|---|---|
| `/booster/on` | in | Enable/disable coil firing (also zeroes PWM immediately when disabled) |
| `/booster/strength` | in | PWM magnitude applied to an active coil |
| `/booster/activeZone` | in | Selects how many electromagnet pairs are live (0–3) |
| `/booster/brakeState` | in | Engage/release the booster's brake |
| `/rotary/broadcast` | in | Enable/disable telemetry |
| `/rotary/value` | out | Raw rotary encoder position (sent every 60 s) |
| `/teensy/error` | out | Generic error string |

## Build

Each variant is its own PlatformIO project targeting a Teensy 4.1:

```ini
[env:teensy41]
platform = teensy
board = teensy41
framework = arduino

monitor_port = /dev/ttyACM0
monitor_speed = 9600
```
