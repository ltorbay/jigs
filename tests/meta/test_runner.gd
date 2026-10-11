class_name TestRunner
extends Node
## Runs every TestSuite child sequentially in one Godot boot, structured output.
##
## Usage:
##   godot --headless --path . --run-scene res://tests/meta/test_runner.tscn -- --quiet
##   godot --headless --path . --run-scene res://tests/meta/test_runner.tscn -- --only=SpecIndexSuite
##
## Output contract (what agents grep):
##   [SUITE] Name (N tests)            header, always
##   [PASS] name                       suppressed under --quiet
##   [FAIL] name: detail               always
##   [SUITE] Name: a/b passed, N tests (ms)
##   [DONE] a/b passed[, F failed], T tests (s)   always, last line
## `a/b` counts check() calls; `T` counts registered tests and is the
## completeness signal (it only moves when a test is registered or removed).
## Exit code 0 = all pass, 1 = any fail.
##
## The source project's runner also installs an OS.add_logger sink so any
## engine ERROR during a test is a [FAIL] attributed to that test, flips
## project-wide static gates (animations, pacing, saves) for the run and
## raises Engine.time_scale. Add those for your game; keep the output contract.

const ONLY_FLAG_PREFIX: String = "--only="

static var late_failures: int = 0

var _quiet: bool = false
var _only: PackedStringArray = []
var _registered_tests: int = 0


static func report_late_failure() -> void:
	late_failures += 1


func _ready() -> void:
	_parse_flags()
	late_failures = 0
	await get_tree().process_frame
	await _run_all()


func _parse_flags() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a == "--quiet":
			_quiet = true
		elif a.begins_with(ONLY_FLAG_PREFIX):
			for part: String in a.substr(ONLY_FLAG_PREFIX.length()).split(","):
				var suite_name: String = part.strip_edges()
				if not suite_name.is_empty():
					_only.append(suite_name)


func _suite_selected(suite: Node) -> bool:
	if _only.is_empty():
		return true
	var script: Script = suite.get_script() as Script
	var label: String = String(script.get_global_name()) if script != null else ""
	if label.is_empty():
		label = String(suite.name)
	return _only.has(label)


func _run_all() -> void:
	var total_passed: int = 0
	var total_failed: int = 0
	var start_msec: int = Time.get_ticks_msec()

	for child: Node in get_children():
		if child is TestSuite and _suite_selected(child):
			await _run_suite(child as TestSuite)
			total_passed += (child as TestSuite).passed
			total_failed += (child as TestSuite).failed

	# A suite whose script failed to compile attaches as a bare Node and would
	# otherwise vanish from a green run. Make it loud.
	for child: Node in get_children():
		if not (child is TestSuite):
			var attached: Script = child.get_script() as Script
			var script_path: String = attached.resource_path if attached != null else "no script"
			print("[FAIL] TestRunner: non-suite child '%s' (%s): suite failed to compile or is misregistered" % [child.name, script_path])
			total_failed += 1

	total_failed += late_failures
	var elapsed: float = (Time.get_ticks_msec() - start_msec) / 1000.0
	var total: int = total_passed + total_failed
	print("")
	if total_failed > 0:
		print("[DONE] %d/%d passed, %d failed, %d tests (%.1fs)" % [total_passed, total, total_failed, _registered_tests, elapsed])
	else:
		print("[DONE] %d/%d passed, %d tests (%.1fs)" % [total_passed, total, _registered_tests, elapsed])
	get_tree().quit(0 if total_failed == 0 else 1)


func _run_suite(suite: TestSuite) -> void:
	suite.quiet = _quiet
	var tests: Array[Callable] = suite.get_tests()
	_registered_tests += tests.size()
	print("\n[SUITE] %s (%d tests)" % [suite.name, tests.size()])
	var suite_start: int = Time.get_ticks_msec()
	if tests.is_empty():
		print("[SUITE] %s: 0/0 passed, 0 tests (%d ms)" % [suite.name, Time.get_ticks_msec() - suite_start])
		return
	suite.before_all()
	await get_tree().process_frame
	if suite.is_async():
		for test_fn: Callable in tests:
			await test_fn.call()
	else:
		for test_fn: Callable in tests:
			test_fn.call()
	suite.after_all()
	suite.sealed = true
	await get_tree().process_frame
	print("[SUITE] %s: %d/%d passed, %d tests (%d ms)" % [
		suite.name, suite.passed, suite.tests_run, tests.size(), Time.get_ticks_msec() - suite_start])
