#!/usr/bin/env bash
# Test wrapper for a Godot project: one headless boot runs every suite.
#
# Install as tools/test.sh (the hooks, skills and CLAUDE.example.md name it
# there). Point TEST_SCENE at your runner scene. The wrapper exists so that an
# agent has ONE command to run, whose output has ONE grep convention:
#
#   tools/test.sh | grep -E '^\[(FAIL|DONE)'
#
# Never bare `grep FAIL`: grep exits 1 when nothing matches, so an all-pass run
# looks like a failure to the caller. `[DONE]` always prints.
#
# What it does, in order:
#   1. per-project-path lock (worktrees do not serialise against each other)
#   2. throwaway $HOME so `user://` is per-checkout and never the developer's
#   3. pkill of orphaned headless instances from a crashed run, path-scoped and
#      anchored with a trailing space so a main-repo run cannot match a worktree
#   4. optional project-specific pre-run steps (native build, asset bake)
#   5. `--import` only when the checkout changed since the last import
#   6. run the runner scene; `--quiet` by default; exit code propagates
GODOT="${GODOT:-godot}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCENE="${TEST_SCENE:-res://scenes/tests/test_runner.tscn}"
LOCK_PREFIX="${TEST_LOCK_PREFIX:-godot_test}"

verbose=0
import_mode=auto
fail_only=0
extra=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --verbose)   verbose=1 ;;
    --no-import) import_mode=never ;;
    --import)    import_mode=always ;;
    --fail-only) fail_only=1 ;;
    --)          shift; extra=("$@"); break ;;
    *)           extra+=("$1") ;;
  esac
  shift
done

# 1. Lock. Without it, a second run's stale-instance pkill SIGTERMs the first
# run's in-flight import/runner (exit 143). Per-project-path so worktree runs
# do not serialise.
PROJECT_HASH="$(echo "$PROJECT_DIR" | shasum | cut -c1-8)"
LOCK_DIR="${TMPDIR:-/tmp}/${LOCK_PREFIX}_${PROJECT_HASH}.lock"
release_lock() { [[ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" == "$$" ]] && rm -rf "$LOCK_DIR"; }
acquire_lock() {
  local waited=0 holder=""
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    holder="$(cat "$LOCK_DIR/pid" 2>/dev/null)"
    if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
      if (( waited >= 180 )); then
        echo "test.sh: another run (pid $holder) holds the lock; aborting." >&2
        exit 1
      fi
      sleep 1; waited=$((waited + 1))
    else
      rm -rf "$LOCK_DIR"   # holder dead: steal the stale lock
    fi
  done
  echo "$$" >"$LOCK_DIR/pid"
}
trap release_lock EXIT
acquire_lock

# 2. Godot resolves user:// under $HOME. A throwaway HOME per checkout means
# parallel worktree runs and a live game session cannot race on save files,
# and a test run never touches the developer's real profile.
TEST_HOME="${TMPDIR:-/tmp}/${LOCK_PREFIX}_${PROJECT_HASH}.home"
mkdir -p "$TEST_HOME"
# Toolchains that resolve under $HOME (rustup, cargo) need pinning before the override.
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export HOME="$TEST_HOME"

# 3. Orphan cleanup. The trailing space is load-bearing: every invocation below
# has args after the path, and without it a main-repo pattern prefix-matches
# worktree checkouts under $PROJECT_DIR/.claude/worktrees/.
pkill -f "headless --path $PROJECT_DIR " 2>/dev/null || true

# 4. Project-specific pre-run steps go here (native extension build when the
# crate is newer than the library, derived-asset bake, ...). Keep each one
# conditional on staleness so the common path stays fast, and make each one
# print a `[FAIL] ...` plus a `[DONE] 0/1 passed, 1 failed, 0 tests (0.0s)`
# line on error so the grep convention still holds.

# 5. `--import` rewrites the class cache every run, so its mtime is the
# last-import stamp: anything newer outside .godot/ means the import is stale.
# The heuristic is mtime-only; a wrongly-skipped import fails loudly with a
# parse error, fixed with --import.
checkout_changed_since_import() {
  local stamp="$PROJECT_DIR/.godot/global_script_class_cache.cfg"
  [[ -f "$stamp" ]] || return 0
  local newer
  newer="$(find "$PROJECT_DIR" -path "$PROJECT_DIR/.godot" -prune \
    -o -type f -newer "$stamp" -print -quit)"
  [[ -n "$newer" ]]
}

do_import=0
case "$import_mode" in
  always) do_import=1 ;;
  never)  do_import=0 ;;
  auto)   if checkout_changed_since_import; then do_import=1; fi ;;
esac

if [[ $do_import -eq 1 ]]; then
  import_out=/dev/stdout
  [[ $fail_only -eq 1 ]] && import_out=/dev/null
  "$GODOT" --headless --path "$PROJECT_DIR" --import >"$import_out" 2>/dev/null || exit $?
fi

# 6. Run. Godot consumes its own CLI args first; everything after `--` reaches
# OS.get_cmdline_user_args(), which the runner parses.
cmd=("$GODOT" --headless --path "$PROJECT_DIR" --run-scene "$SCENE")
runner_args=()
[[ $verbose -eq 0 ]] && runner_args+=(--quiet)
[[ ${#extra[@]} -gt 0 ]] && runner_args+=("${extra[@]}")
[[ ${#runner_args[@]} -gt 0 ]] && cmd+=(-- "${runner_args[@]}")

if [[ $fail_only -eq 1 ]]; then
  "${cmd[@]}" 2>&1 | grep -E '^\[(FAIL|DONE)'
  exit "${PIPESTATUS[0]}"
fi

"${cmd[@]}"
exit $?
