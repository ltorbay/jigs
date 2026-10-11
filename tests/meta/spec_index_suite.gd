class_name SpecIndexSuite
extends TestSuite
## Every spec's Purpose line is the discoverability metadata agents grep to
## target the right spec; INDEX.md is the generated one-file view of all of
## them (tools/spec_index.sh). Archiving a change with a TBD Purpose, or
## without regenerating the index, fails here. The archive_spec_check hook
## reminds the agent right after the archive; this suite is the backstop
## that fails CI if the reminder was ignored.

const SPECS_ROOT: String = "res://openspec/specs"
const INDEX_PATH: String = "res://openspec/specs/INDEX.md"
const ENTRY_PREFIX: String = "- **"
const ENTRY_SEPARATOR: String = "** — "


func get_tests() -> Array[Callable]:
	return [
		test_every_spec_has_authored_purpose,
		test_index_matches_spec_purposes,
	]


func test_every_spec_has_authored_purpose() -> void:
	var offenders: Array[String] = []
	for spec_name: String in _spec_names():
		var purpose: String = _purpose_line(spec_name)
		if purpose.is_empty() or purpose.begins_with("TBD"):
			offenders.append(spec_name)
	check("every spec has an authored Purpose line", offenders.is_empty(),
		"specs with missing/TBD Purpose (author a one-liner, then run tools/spec_index.sh): %s" % str(offenders))


func test_index_matches_spec_purposes() -> void:
	var index: Dictionary = _parse_index()
	check("INDEX.md exists and parses", not index.is_empty(),
		"missing or empty %s; run tools/spec_index.sh" % INDEX_PATH)
	var spec_names: Array[String] = _spec_names()
	var missing: Array[String] = []
	var drifted: Array[String] = []
	for spec_name: String in spec_names:
		if not index.has(spec_name):
			missing.append(spec_name)
		elif index[spec_name] != _purpose_line(spec_name):
			drifted.append(spec_name)
	var stale: Array[String] = []
	for indexed_name: String in index:
		if not spec_names.has(indexed_name):
			stale.append(indexed_name)
	check("every spec is indexed", missing.is_empty(),
		"specs absent from INDEX.md; run tools/spec_index.sh: %s" % str(missing))
	check("index purposes match spec purposes", drifted.is_empty(),
		"INDEX.md entries drifted from spec.md Purpose lines; run tools/spec_index.sh: %s" % str(drifted))
	check("no stale index entries", stale.is_empty(),
		"INDEX.md entries with no spec dir; run tools/spec_index.sh: %s" % str(stale))


func _spec_names() -> Array[String]:
	var names: Array[String] = []
	var dir: DirAccess = DirAccess.open(SPECS_ROOT)
	if dir == null:
		return names
	for sub: String in dir.get_directories():
		if FileAccess.file_exists("%s/%s/spec.md" % [SPECS_ROOT, sub]):
			names.append(sub)
	names.sort()
	return names


func _purpose_line(spec_name: String) -> String:
	var f: FileAccess = FileAccess.open("%s/%s/spec.md" % [SPECS_ROOT, spec_name], FileAccess.READ)
	if f == null:
		return ""
	var in_purpose: bool = false
	while not f.eof_reached():
		var line: String = f.get_line()
		if in_purpose:
			if line.begins_with("## "):
				return ""
			if not line.strip_edges().is_empty():
				return line
		elif line.begins_with("## Purpose"):
			in_purpose = true
	return ""


func _parse_index() -> Dictionary:
	var index: Dictionary = {}
	var f: FileAccess = FileAccess.open(INDEX_PATH, FileAccess.READ)
	if f == null:
		return index
	while not f.eof_reached():
		var line: String = f.get_line()
		if not line.begins_with(ENTRY_PREFIX):
			continue
		var sep: int = line.find(ENTRY_SEPARATOR)
		if sep < 0:
			continue
		var spec_name: String = line.substr(ENTRY_PREFIX.length(), sep - ENTRY_PREFIX.length())
		index[spec_name] = line.substr(sep + ENTRY_SEPARATOR.length())
	return index
