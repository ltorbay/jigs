class_name TestRegistrationSuite
extends TestSuite
## Source-scan tripwire: every `func test_*` defined in a suite file must be
## named in that file's `get_tests()`, or it never executes and the run stays
## green while the test is dead.
##
## This is the canonical meta-test: it does not test the game, it tests that
## the tests are wired. The parser is pure and self-tested below, so a parser
## regression cannot silently turn the scan vacuous.

## Directory scanned for `*_suite.gd`. Point it at your suites folder.
const SUITE_DIR: String = "res://tests/meta"

## path -> reason. A `test_`-prefixed method that is not a test is a naming
## defect: rename it instead of adding a row here. Growing this dictionary is
## a Drift Protocol trigger (see hooks/protocols/apply.md).
const ALLOWLIST: Dictionary = {}


func get_tests() -> Array[Callable]:
	return [
		test_every_defined_test_is_registered,
		test_parser_reports_unregistered,
		test_parser_ignores_commented_registration,
		test_parser_flags_missing_get_tests,
	]


## Pure: names of `func test_*` methods the source defines but its
## `get_tests()` body does not name. A file with no `get_tests()` reports all.
static func unregistered_tests(source: String) -> Array[String]:
	var defined: Array[String] = defined_test_names(source)
	if defined.is_empty():
		return []
	var body: String = get_tests_body(source)
	var out: Array[String] = []
	for test_name: String in defined:
		if not _names_whole_word(body, test_name):
			out.append(test_name)
	return out


static func defined_test_names(source: String) -> Array[String]:
	var out: Array[String] = []
	for line: String in source.split("\n"):
		if not line.begins_with("func test_"):
			continue
		var open_paren: int = line.find("(")
		if open_paren < 0:
			continue
		var method: String = line.substr(5, open_paren - 5).strip_edges()
		if not method.is_empty() and not out.has(method):
			out.append(method)
	return out


static func get_tests_body(source: String) -> String:
	var collecting: bool = false
	var body: String = ""
	for line: String in source.split("\n"):
		var top_level_func: bool = line.begins_with("func ") or line.begins_with("static func ")
		if collecting and top_level_func:
			break
		if top_level_func and line.begins_with("func get_tests("):
			collecting = true
			continue
		if collecting:
			body += _strip_comment(line) + "\n"
	return body


static func _strip_comment(line: String) -> String:
	var hash_at: int = line.find("#")
	return line if hash_at < 0 else line.substr(0, hash_at)


static func _names_whole_word(haystack: String, needle: String) -> bool:
	var at: int = haystack.find(needle)
	while at >= 0:
		var before_ok: bool = at == 0 or not _is_identifier_char(haystack[at - 1])
		var after: int = at + needle.length()
		var after_ok: bool = after >= haystack.length() or not _is_identifier_char(haystack[after])
		if before_ok and after_ok:
			return true
		at = haystack.find(needle, at + 1)
	return false


static func _is_identifier_char(c: String) -> bool:
	return c == "_" or (c >= "0" and c <= "9") or (c >= "a" and c <= "z") or (c >= "A" and c <= "Z")


static func suite_files(dir_path: String) -> Array[String]:
	var out: Array[String] = []
	var dir: DirAccess = DirAccess.open(dir_path)
	if dir == null:
		return out
	dir.list_dir_begin()
	var entry: String = dir.get_next()
	while not entry.is_empty():
		var full: String = dir_path.path_join(entry)
		if dir.current_is_dir():
			if not entry.begins_with("."):
				out.append_array(suite_files(full))
		elif entry.ends_with("_suite.gd"):
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()
	out.sort()
	return out


func test_every_defined_test_is_registered() -> void:
	var paths: Array[String] = suite_files(SUITE_DIR)
	# Guard against a path break making the scan vacuously green.
	check("registration_scan_found_suites", paths.size() > 0, "found %d under %s" % [paths.size(), SUITE_DIR])
	for path: String in paths:
		if ALLOWLIST.has(path):
			continue
		var file: FileAccess = FileAccess.open(path, FileAccess.READ)
		if file == null:
			check("registration_readable:%s" % path.get_file(), false, "could not open %s" % path)
			continue
		var source: String = file.get_as_text()
		file.close()
		var orphans: Array[String] = unregistered_tests(source)
		check("registration:%s" % path.get_file(), orphans.is_empty(), "unregistered tests: %s" % ", ".join(orphans))


func test_parser_reports_unregistered() -> void:
	var source: String = "\n".join([
		"func get_tests() -> Array[Callable]:",
		"\treturn [",
		"\t\ttest_alpha,",
		"\t]",
		"",
		"func test_alpha() -> void:",
		"\tpass",
		"",
		"func test_beta() -> void:",
		"\tpass",
	] as PackedStringArray)
	check_eq("parser_reports_only_unregistered", unregistered_tests(source), ["test_beta"] as Array[String])


func test_parser_ignores_commented_registration() -> void:
	var source: String = "\n".join([
		"func get_tests() -> Array[Callable]:",
		"\treturn [",
		"\t\t# test_alpha,",
		"\t]",
		"",
		"func test_alpha() -> void:",
		"\tpass",
	] as PackedStringArray)
	check_eq("parser_ignores_comment", unregistered_tests(source), ["test_alpha"] as Array[String])


func test_parser_flags_missing_get_tests() -> void:
	var source: String = "\n".join([
		"func test_alpha() -> void:",
		"\tpass",
	] as PackedStringArray)
	check_eq("parser_flags_missing_get_tests", unregistered_tests(source), ["test_alpha"] as Array[String])
	check_eq("parser_empty_source_reports_nothing", unregistered_tests(""), [] as Array[String])
