# LoRA Captioning and Training — architecture overview

Project: **noukii-training** (per the README's `git clone` example) — a captioning-to-LoRA-training pipeline
built around [Janus-Pro](https://github.com/deepseek-ai/Janus) for automatic image captioning and
[kohya_ss](https://github.com/bmaltais/kohya_ss) for LoRA fine-tuning of Stable Diffusion 1.5.

## Purpose

Turns a folder of raw images into a trained LoRA model with minimal manual work: an image-to-text model
writes captions and extracts key concepts automatically, and a single script (or a small desktop UI) then
copies the resulting dataset into kohya_ss and launches LoRA training with sensible defaults already wired
up.

## Repository layout

| Path | Role |
|---|---|
| `setup.sh` | One-time environment setup: installs a project-local `uv`, sets up both stage's virtual environments, fetches Janus and the Janus-Pro-1B model, clones kohya_ss, downloads the SD1.5 base checkpoint |
| `LoRA_UI_part01_CaptionScript/` | Captioning stage: `janus_pro_caption_core.py`, `utils.py`, its own venv and `requirements.txt` |
| `LoRA_UI_part02_TrainingScript/` | Training stage: wraps `kohya_ss/` (cloned as a subfolder), `config_sat_nouki.toml`, its own `requirements.txt` |
| `LoRA_UI/` | Desktop UI (`main.py`, not shown here) for picking datasets/repeats and launching training, with its own venv |
| `run_captioning.sh` | CLI entry point for the captioning stage |
| `run_training.sh` | CLI entry point for the training stage |
| `training-ui.sh` | Launches the `LoRA_UI` desktop app |
| `image_datasets/` | Where captioned `{repeats}_{keyword}` folders are auto-detected from, if no explicit dataset paths are given |
| `trained_loras/` | Where finished LoRA output folders land |

## Pipeline overview

```
Raw images → Captioning (Janus-Pro) → Training UI or Training CLI → kohya_ss LoRA training → trained_loras/<output_name>/
```

1. **Captioning** (`run_captioning.sh`) runs `janus_pro_caption_core.py` over an input image folder, using the
   Janus-Pro-1B vision-language model to write a caption per image, and TF-IDF to extract the folder's core
   concepts into a `prompt_cue-<keyword>.txt` file. The output is a new folder named after the chosen keyword
   containing the copied images, one `.txt` caption per image, and that prompt-cue file.
2. **Training** can be started either from the **UI** (`training-ui.sh` → `LoRA_UI/main.py`, which lets the
   user pick dataset folders and repeat counts, name the output, and save/load that setup as a config TOML)
   or directly from the **CLI** (`run_training.sh`, which accepts explicit `--dataset`/`--repeats`/
   `--output-name` flags, or auto-detects every `{repeats}_{keyword}` folder under `image_datasets/` if no
   arguments are given).
3. Either path converges on the same **kohya_ss LoRA training** step: the chosen dataset folders are copied
   into `kohya_ss/dataset/images/train/`, a dataset config TOML is generated to match, and
   `accelerate launch .../train_network.py` fine-tunes a LoRA on top of the SD1.5 base checkpoint.
4. The resulting `.safetensors` LoRA weights, along with a copy of each source dataset's `prompt_cue-*.txt`
   file (for reference when writing prompts later), are collected into
   `trained_loras/<output_name>/`.

## Captioning stage internals

`janus_pro_caption_core.py`, for a given `folder_path` and `--keyword` (default `abc`):

1. Loads the Janus-Pro-1B model (`AutoModelForCausalLM`, `trust_remote_code=True`) and its
   `VLChatProcessor`, in `bfloat16` on CUDA where available (falling back to `float16`, then CPU).
2. For every image file in `folder_path`:
   - copies it into a new folder named after `--keyword` (created alongside the input folder);
   - builds a two-turn conversation (`<image_placeholder>\ndescribe this image in detail`) and generates a
     caption via `model.language_model.generate(...)` (sampling, `temperature=0.1`, `top_p=0.95`,
     `max_new_tokens=512`, fixed seed `42`);
   - writes that caption to a matching `.txt` file in the same new folder.
3. Once every image is processed, runs a `TfidfVectorizer` (English stop-words, top 7 features) over the
   concatenation of every generated caption to extract the folder's **core concepts**, and writes them
   (newline-separated) to `prompt_cue-<keyword>.txt` inside the new folder.

`run_captioning.sh` wraps this with environment bookkeeping: creates the venv if missing, sparse-checks-out
just the `janus/` package from the upstream Janus repo if absent, installs `requirements.txt` if `torch`
isn't importable yet, and verifies the Janus-Pro-1B model files are present (erroring out with a pointer to
`setup.sh` / `git lfs pull` if not) before calling the core script.

Repeats aren't chosen here — the caption script's own `--repeats` flag exists but the folder it creates is
just named after the keyword; the `{repeats}_{keyword}` naming convention that `run_training.sh` expects is
applied afterward (manually, or by the UI) when the folder is placed under `image_datasets/`.

## Training stage internals

`run_training.sh` does the heavy lifting for the CLI path (the UI ultimately shells out to the same script):

1. **Resolve dataset folders** — either from explicit `--dataset <path> [--repeats N]` arguments (repeated
   for multiple datasets), or by legacy positional path arguments, or, if none are given, by scanning
   `image_datasets/` for folders matching `{repeats}_{keyword}`. A `num_repeats` default of `30` is used
   whenever a folder's name doesn't start with a number.
2. **Copy each dataset** — image files (`jpg`/`jpeg`/`png`/`bmp`/`gif`/`webp`) and `.txt` caption files are
   copied (not moved) into `kohya_ss/dataset/images/train/<folder_name>`, after clearing out whatever was
   there from a previous run.
3. **Generate `config_sat_nouki.toml`** — a `[general]` section with bucketing enabled (`bucket_no_upscale`,
   64-step buckets between 256–2048 px, `.txt` captions), one `[[datasets]]` block (512 px, batch size 4),
   and one `[[datasets.subsets]]` entry per dataset folder with its resolved `num_repeats`.
4. **Launch training** — activates the `kohya_ss` venv and runs:
   ```bash
   accelerate launch --num_cpu_threads_per_process 1 ./kohya_ss/sd-scripts/train_network.py \
       --pretrained_model_name_or_path='./kohya_ss/models/v1-5-pruned-emaonly.safetensors' \
       --dataset_config='./config_sat_nouki.toml' \
       --output_dir="$OUTPUT_FOLDER" \
       --output_name="$OUTPUT_NAME" \
       --save_model_as=safetensors \
       --prior_loss_weight=1.0 \
       --max_train_steps=400 \
       --learning_rate=1e-4 \
       --sdpa \
       --gradient_checkpointing \
       --cache_latents \
       --mixed_precision="no" \
       --network_module=networks.lora
   ```
   An output name is auto-generated as `nouki_sd1-5_<timestamp>` if none was supplied.
5. **Collect outputs** — moves the `.safetensors` file into `trained_loras/<output_name>/` if it landed
   elsewhere, then copies every `prompt_cue-*.txt` found in each *selected* source dataset folder into that
   same output folder, so the concepts behind the training data travel with the resulting LoRA.

## Setup

`setup.sh` prepares both stages from a clean checkout:

1. **Project-local `uv`** — copies a system `uv` if one exists, otherwise installs it via the official
   installer script, and vendors the binary at `.tools/bin/uv` (also copied into each venv it creates).
2. **Captioning stage (part01)** — creates its venv, installs `requirements.txt`
   (`torch`, `transformers`, `accelerate`, `huggingface_hub`, `pillow`, `attrdict`, `timm`, `scikit-learn`,
   `einops`), sparse-clones the `janus/` package from `deepseek-ai/Janus`, and downloads
   `deepseek-ai/Janus-Pro-1B` via `git lfs`.
3. **Training stage (part02)** — clones `bmaltais/kohya_ss` (recursively, for its submodules) if not already
   present, creates its venv, installs both kohya_ss's own `requirements.txt` and this project's
   `LoRA_UI_part02_TrainingScript/requirements.txt` (`accelerate`, `toml`, `tomlkit`), and downloads the
   `v1-5-pruned-emaonly.safetensors` SD1.5 base checkpoint directly (not via LFS) if missing.
4. **UI environment** — set up separately (not by `setup.sh`), per the README: a venv under `LoRA_UI/` with
   its own `requirements.txt`.

## Running it

**Via the UI:**
```bash
./training-ui.sh
```
Opens the desktop UI, which supports picking datasets with per-dataset repeat counts, naming the output, and
saving/loading that whole setup as a TOML config (`File > Save Config...` / `Ctrl+S`,
`File > Load Config...` / `Ctrl+O`).

**Via the CLI, explicit datasets:**
```bash
./run_training.sh \
  image_datasets/20_KelpAllisonMoore \
  image_datasets/20_nuagesAllison \
  image_datasets/20_paperMountains
```

**Via the CLI, auto-detected datasets:**
```bash
./run_training.sh
```

**Captioning a new folder of images:**
```bash
./run_captioning.sh path/to/image_folder some_keyword
```

## Notes

- The training config's `num_repeats` per subset can come from three places, in priority order: an explicit
  `--repeats` passed alongside `--dataset` on the CLI, a value already tracked for that same path from an
  earlier parse, or a number parsed off the front of the folder's name — falling back to `30` if none apply.
- `LoRA_UI_part02_TrainingScript/README.md` documents the standalone, fully-manual way to drive kohya_ss (its
  own venv, moving the config file by hand, running `accelerate launch` yourself) — useful background if
  `run_training.sh`'s automation needs debugging, but not required for normal use.
- Training hyperparameters (`max_train_steps=400`, `learning_rate=1e-4`, `mixed_precision=no`, `--sdpa`
  attention, gradient checkpointing, latent caching) are currently fixed inside `run_training.sh` rather than
  user-configurable from the CLI or UI.
