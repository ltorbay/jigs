class_name ClaudeMdBudgetSuite
extends TestSuite
## The sensor the source project lacked: root CLAUDE.md has a budget, and
## nothing measured it, so it grew from 30 KB to 162 KB in five months
## (PLAYBOOK.md § 4). This suite is the `wc -c` check, run on every push.
##
## A failure here means "schedule a graduation pass", not "condense prose
## until it fits": move rules down the ladder (test, spec, skill, per-folder
## CLAUDE.md), then delete them from root. Raising the constants below is a
## Drift Protocol trigger (see hooks/protocols/apply.md), like widening an
## allowlist.
##
## The measurement is pure and self-tested, so a broken counter cannot turn
## the check vacuous.

const ROOT_PATH: String = "res://CLAUDE.md"
const MAX_BYTES: int = 30 * 1024
const MAX_LINES: int = 200


func get_tests() -> Array[Callable]:
	return [
		test_root_claude_md_within_budget,
		test_measure_counts_bytes_not_characters,
		test_measure_counts_lines_like_wc,
	]


## Pure: [bytes, lines] as `wc -c` / `wc -l` would report them.
static func measure(text: String) -> Array[int]:
	return [text.to_utf8_buffer().size(), text.count("\n")]


func test_root_claude_md_within_budget() -> void:
	var exists: bool = FileAccess.file_exists(ROOT_PATH)
	check("root CLAUDE.md exists", exists,
		"no %s; start one from CLAUDE.example.md" % ROOT_PATH)
	if not exists:
		return
	var size: Array[int] = measure(FileAccess.get_file_as_string(ROOT_PATH))
	check("root CLAUDE.md within byte budget", size[0] <= MAX_BYTES,
		"%d bytes > %d: schedule a graduation pass (PLAYBOOK.md § 4), do not condense prose to pass" % [size[0], MAX_BYTES])
	check("root CLAUDE.md within line budget", size[1] <= MAX_LINES,
		"%d lines > %d: schedule a graduation pass (PLAYBOOK.md § 4), do not condense prose to pass" % [size[1], MAX_LINES])


func test_measure_counts_bytes_not_characters() -> void:
	check_eq("multi-byte characters count as bytes", measure("é")[0], 2)


func test_measure_counts_lines_like_wc() -> void:
	check_eq("newline-terminated lines", measure("a\nb\n")[1], 2)
	check_eq("unterminated last line not counted", measure("a\nb")[1], 1)
	check_eq("empty file", measure(""), [0, 0] as Array[int])
