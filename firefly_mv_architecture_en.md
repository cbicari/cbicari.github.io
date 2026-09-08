# Firefly MV / dc1394 setup — architecture overview

Project: [`cbicari/firefly-mv-dc1394-setup`](https://github.com/cbicari/firefly-mv-dc1394-setup)

## Purpose

This project sets up a Point Grey **Firefly MV (FMVU series)** IIDC/DCAM machine-vision camera on Ubuntu (24.04/26.04), so it can be:

- accessed as a normal (non-root) user, and
- used like an ordinary V4L2 webcam by regular applications (Cheese, a browser, VLC, etc.), even though it natively speaks the IIDC/DCAM protocol rather than V4L2.

Everything is driven by a single idempotent script, `install.sh`, which can be safely re-run.

## Repository layout

| Path | Role |
|---|---|
| `install.sh` | Orchestrates the whole setup: packages, udev rule, group membership, kernel module, build of the test tool |
| `udev/99-pointgrey-dc1394.rules` | udev rule granting non-root USB access to the camera |
| `config/v4l2loopback.conf` | Module options for `v4l2loopback` (device name, index, etc.) |
| `config/v4l2loopback-load.conf` | Ensures the module loads automatically at boot |
| `tools/dc1394_grab_test.c` | Small C program using `libdc1394` to enumerate/grab frames directly, for testing |
| `tools/start_virtual_cam.sh` | Starts the GStreamer bridge that feeds frames into the virtual camera device |
| `camera_hardware.md` | Notes on the physical camera hardware |

## Architecture

The setup creates **two parallel paths** once the camera is plugged in and the udev rule is active:

```
                    Firefly MV camera
                    (IIDC/DCAM over USB)
                            │
                            ▼
                       udev rule
              (grants plugdev group access)
                    ┌───────┴───────┐
                    ▼               ▼
              libdc1394        GStreamer bridge
           (C API, direct)   (start_virtual_cam.sh)
                    │               │
                    ▼               ▼
           dc1394_grab_test    v4l2loopback
         (raw capture test)  (kernel module, dkms)
                                    │
                                    ▼
                              /dev/video10
                       "Firefly MV Virtual Camera"
                                    │
                                    ▼
                             Consumer apps
                       (Cheese, browser, VLC, …)
```

### 1. Hardware access layer

The camera enumerates as a USB device. The udev rule (`99-pointgrey-dc1394.rules`) sets permissions so that any user in the `plugdev` group can open the device without `sudo`. `install.sh` copies this rule into `/etc/udev/rules.d/`, reloads udev, and adds the invoking user to `plugdev`.

### 2. Direct/test path (libdc1394)

`dc1394_grab_test.c` is compiled against `libdc1394-2` and used to confirm the camera is visible and can deliver frames, independent of any virtual-camera machinery. This is the quickest way to sanity-check the hardware and udev setup.

### 3. Virtual webcam path (GStreamer + v4l2loopback)

- `v4l2loopback` is a kernel module (built via DKMS) that creates a fake V4L2 device, here exposed as `/dev/video10` and named "Firefly MV Virtual Camera". Its behavior (device name/index) is set through `config/v4l2loopback.conf`, and `config/v4l2loopback-load.conf` makes sure it is loaded at boot.
- `tools/start_virtual_cam.sh` runs a GStreamer pipeline that reads frames from the physical camera and writes them into the `v4l2loopback` device.
- Once running, `/dev/video10` behaves like any standard webcam, so ordinary V4L2-aware applications can select and use it without knowing anything about IIDC/DCAM or `libdc1394`.

## Installation flow (`install.sh`)

1. Install required packages (`libdc1394-dev`, `libusb-1.0-0-dev`, `v4l2loopback-dkms`, GStreamer plugins, etc.).
2. Install the udev rule and reload/trigger udev.
3. Add the current user to the `plugdev` group.
4. Install `v4l2loopback` module configuration files.
5. Build `v4l2loopback` for the running kernel via `dkms autoinstall`.
6. Load the `v4l2loopback` module.
7. Compile `dc1394_grab_test`.
8. Verify that `/dev/video10` ("Firefly MV Virtual Camera") is present.

## Typical usage after install

```bash
# Raw capture test via libdc1394
./tools/dc1394_grab_test 5

# Start the virtual webcam bridge (Ctrl+C to stop)
./tools/start_virtual_cam.sh
```

Then open Cheese, a browser's camera picker, or `vlc v4l2:///dev/video10`, and select "Firefly MV Virtual Camera".

## Notes

- A reboot or unplug/replug may be required the first time, for the udev rule and `plugdev` group membership to take full effect.
- If `dkms autoinstall` fails (e.g. missing matching `linux-headers` on a custom kernel), matching headers must be installed manually and `v4l2loopback` re-installed for that kernel version.
