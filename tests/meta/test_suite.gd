class_name TestSuite
extends Node
## Minimal base class for a suite: explicit registration, structured output,
## no crash on failure. Extend it and override get_tests().
##
## Tests MUST use check()/check_eq() instead of assert(): assert aborts the
## process and takes every later suite's result with it.
##
## This is the smallest base that the meta-suites in this folder need. The
## source project's base also carries fixture factories (grid, entities,
## terrain), async helpers (`await_signal_or_timeout`) and tracked-node
## teardown; add those for your own game, keep this contract.

var passed: int = 0
var failed: int = 0
var tests_run: int = 0

## Runner-injected: suppress [PASS] lines.
var quiet: bool = false
## Set by the runner after teardown; a check() after that is a defect
## (usually an un-awaited coroutine test) and is reported, not swallowed.
var sealed: bool = false


## Return the ordered list of test callables. Explicit registration is the
## contract that TestRegistrationSuite enforces by scanning the source.
func get_tests() -> Array[Callable]:
	return []


## Override to return true if tests use `await`. A coroutine test in a sync
## suite never gets awaited: its checks land after the suite is tallied.
func is_async() -> bool:
	return false


func before_all() -> void:
	pass


func after_all() -> void:
	pass


## Record a pass/fail. Never crashes. Under quiet, [PASS] is suppressed;
## [FAIL] always prints with the detail text, which is the review surface.
func check(test_name: String, condition: bool, detail: String = "") -> void:
	if sealed:
		print("[FAIL] %s.%s: check after suite tally (un-awaited coroutine test?)" % [name, test_name])
		TestRunner.report_late_failure()
		return
	tests_run += 1
	if condition:
		passed += 1
		if not quiet:
			print("[PASS] %s" % test_name)
	else:
		failed += 1
		if detail.is_empty():
			print("[FAIL] %s" % test_name)
		else:
			print("[FAIL] %s: %s" % [test_name, detail])


func check_eq(test_name: String, actual: Variant, expected: Variant) -> void:
	if actual == expected:
		check(test_name, true)
	else:
		check(test_name, false, "expected %s, got %s" % [str(expected), str(actual)])
