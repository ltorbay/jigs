---
name: device-drive
description: Drive a USB-connected Android phone over adb for a Godot game, and attribute device-side stalls with throwaway probes. Install a dev APK, launch cold, navigate by screenshot and tap, read the engine's prints from logcat, protect and restore the player's saves, build a "before" APK from HEAD in a throwaway worktree for A/B runs, bisect a stall with deferred-queue shadow marks, and record every number in a perf doc. Use when the user says the phone is connected, asks to test, measure, screenshot or check something on the device, reports a hitch or a slow first open on the phone, or when the verify skill needs an on-device pass.
metadata:
  version: "1.0"
---

Desktop headless runs use a dummy renderer and have no first-use GPU, driver or font costs, so a device stall is attributed ON THE DEVICE. With the phone USB-connected a round is near-free; without it every round costs the user an install and a few launches. Either way, make each probe answer one partition question, and state beforehand what each outcome would mean.

Start by reading the project's perf doc (`docs/DEVICE_PERF.md` in this kit's convention): it records what is already measured and ruled out.

## 0. Preflight

Set once per session:

```bash
PKG="<your dev package id>"                 # read it from export_presets.cfg, do not hardcode it in prose
ACTIVITY="<launcher activity>"             # Godot's export template ships one; check the template's manifest
```

- `adb devices -l` must list the phone as `device` (not `unauthorised`).
- Some vendors gate injected input behind a second developer toggle ("USB debugging (Security settings)" or similar) that applies at boot; if `adb shell input tap` is refused, the user flips it and reboots once.
- `adb shell input keyevent KEYCODE_WAKEUP`, then `adb shell svc power stayon usb` so it stays awake plugged in. **Set `stayon false` again when done.**
- **Lock screen: stop and ask the user to unlock.** A swipe reaches the secure keyguard, whose screenshots come back solid black (`dumpsys window | grep isKeyguardShowing` says `true`). Never type a PIN or pattern.

## 1. Packages and builds

- Build the dev APK with your own target (`make apk DEV=1` in the source project: a debug export with the `dist` custom feature stripped so dev tools and traces exist). Keep the dev package id distinct from the store package so both install side by side.
- Install: `adb install -r builds/<app>.apk` (keeps app data).
- Launch cold: `adb shell am force-stop $PKG; adb logcat -c; adb shell am start -n $PKG/$ACTIVITY`. Allow several seconds to the main menu.
- Godot `print()` lands in logcat under tag `godot`: `adb logcat -d -s godot | grep '<tag>'`. Prefer a tagged print over reading numbers off screenshots.

## 2. Navigate by screenshot, never by memory

`adb exec-out screencap -p > shot.png`, read the image, tap with `adb shell input tap X Y` in PHYSICAL pixels (the image tool displays scaled; multiply by the factor it reports). Menu layout shifts with state (a "Continue" button exists only with a save, pushing everything below it), so re-screenshot after any state change. Once a positions list is proven in a session, script it (see §5) but still take one screenshot per run to confirm the right board loaded. Map or level layout is seed-dependent: never blind fixed coordinates past the main menu.

Useful keys: `adb shell input keyevent KEYCODE_BACK`, `input swipe x1 y1 x2 y2 ms`.

## 3. Protect the player's saves

Measurement runs start new games, which overwrite the passive save. Before the first launch, copy out every file under `files/` you might touch:

```bash
adb exec-out run-as $PKG cat files/<save>.json > backup/<save>.json
```

(`adb shell run-as $PKG ls files/` lists them). Restore after the last run; `run-as` cannot read `/sdcard`, so stage through `/data/local/tmp`:

```bash
adb push backup/$f /data/local/tmp/$f
adb shell "run-as $PKG sh -c 'cat /data/local/tmp/$f > files/$f'"
adb shell rm /data/local/tmp/$f
adb exec-out run-as $PKG cat files/$f | cmp - backup/$f
```

Leave `files/shader_cache/` alone unless the question is driver-cold (then say so in the results).

## 4. A/B: a "before" APK from HEAD

The working tree carries the change; build the baseline in a detached worktree in the scratchpad:

```bash
git worktree add --detach "$WT" HEAD
# copy gitignored inputs the export needs (native libs, gradle template) into "$WT"
cd "$WT" && godot --headless --path . --import
godot --headless --path . --export-debug "<Dev preset>" builds/<app>_before.apk
```

Copy the same probe and any new scenario into the worktree so both builds measure the same thing. Reusing prebuilt native libs is only valid when `git diff HEAD -- native/` is empty. Remove with `git worktree remove --force "$WT"` when done.

## 5. Scripted runs

Script the proven path so a run needs no attention:

```bash
adb shell am force-stop $PKG; adb logcat -c
adb shell am start -n $PKG/$ACTIVITY >/dev/null; sleep 8
adb shell input tap $X_SCENARIOS $Y_SCENARIOS; sleep 2
adb shell input tap $X_ROW $Y_ROW; sleep 20            # board settled
adb exec-out screencap -p > shot_$LABEL.png            # proves the board
sleep 55; adb logcat -d -s godot | grep PerfProbe > probe_$LABEL.txt
```

For steady-state GPU, a throwaway `# PROBE` block in a perf overlay's `_process` printing per-second FPS and average GPU time (`RenderingServer.viewport_get_measured_render_time_gpu`) and cycling an ablation on a wall-clock schedule gives OFF-vs-ablated rows with no taps. Discard the first seconds and the seconds right after each switch. At least two launches per cell.

## 6. Attributing a stall (the probing method)

**Read what the build already prints first.** Ship a trace that partitions the first frame of a heavy transition into named phases (`[Enter] #N total | phase ... | deferred | process | draw`). `#1` is the first occurrence in the process (cold), `#2+` warm. A cost present only in `#1` is a first-use cost (loading, shader or pipeline compile, glyph rasterisation, driver); a cost in every occurrence is steady-state work.

**Bisect the deferred queue with shadow marks.** Godot's message queue is FIFO. A mark queued with `call_deferred` at the end of a phase runs after every deferred call that phase queued, so its elapsed time is exactly that phase's deferred work. Throwaway version inside the trace's `mark()`:

```gdscript
if not phase.begins_with("~"):  # PROBE
	mark.bind("~" + phase).call_deferred()  # PROBE
```

**Split tree entry with `_enter_tree` marks.** Engine work for nodes entering the tree (redraw requests, theme propagation, material assignment, Control layout) is queued in the top-down enter pass, before any `_ready`; a mark in a subtree root's `_enter_tree` closes the previous subtree's enter work. Engine nodes without scripts cannot be marked: use a removal test.

**Confirm with a removal test.** When a bucket is narrowed to a few nodes, detach the suspect before tree entry (`parent.remove_child(node); node.free()` right after `instantiate()`), guarding every consumer with `get_node_or_null`. A collapse of the bucket is the confirmation; no collapse clears the suspect. In the source project this pinned a ~1 s first-combat stall on a debug overlay instanced in every build; removing it brought the cold first-combat total from 920 to 1773 ms down to ~605 to 630 ms across three cold launches.

**Cold has two depths.** Kill-and-relaunch is process-cold, not driver-cold: the shader cache persists across processes. For a driver-cold row, delete `files/shader_cache/` via `run-as` before the launch, and say which depth a table's rows measured.

## Rules

- **Tag every probe line `# PROBE`** and touch only files that are clean at HEAD, so the revert is one `git checkout --` of exactly those files. Never revert a file holding the user's edits.
- **Three cold launches minimum** before trusting a cold number; over adb prefer five, cycles are free: first-launch costs varied 3x on the reference phone. Compare against at least one warm occurrence.
- **Do not fix inside the probe.** Once attributed, revert, record the numbers in the perf doc (device, build, commit, depth of cold, table of launches), and propose the fix as its own change.
- **Perceptual verdicts (does it look right, is there a flash) stay the user's.** `adb shell screenrecord` plus injected taps screens for a hitch; the user's eyeball on one final launch is the verdict. Hand them the screenshots.

## 7. Clean up

Restore saves (§3), `svc power stayon false`, revert probes, remove worktrees and throwaway scenes, write the numbers down.
