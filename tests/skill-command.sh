#!/usr/bin/env bash
# Fills the SKILL.md workflow command with text the way an agent does (the text
# replaces the `<the Mongolian text>` placeholder verbatim) and runs it with stub
# `python3` / `node`, so nothing is sent to spellcheck.mn.
#
#   bash tests/skill-command.sh
#
# Text to proofread often comes from files, so it can hold backticks, `$(...)`,
# quotes or `$VARS`. None of it may be run or expanded by the shell, and the
# helper must receive it byte for byte.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/scripts"

for tool in python3 node; do
  cat > "$WORK/bin/$tool" <<'STUB'
#!/usr/bin/env bash
# Record what the helper would have received: arguments after the script path, else stdin.
shift
if [ "$#" -gt 0 ]; then printf '%s' "$*" > "$RECEIVED"; else cat > "$RECEIVED"; fi
echo '{"text":"","misspelled":[],"suggestions":{}}'
STUB
  chmod +x "$WORK/bin/$tool"
done

# The first ```bash block of the workflow, with the placeholder replaced literally.
render() {
  TEXT="$1" awk '
    # A fence inside a list item is indented; like Markdown, drop that indent from the code.
    /^ *```bash[[:space:]]*$/ && !done { inblock = 1; match($0, /^ */); indent = RLENGTH; next }
    /^ *```[[:space:]]*$/ && inblock   { inblock = 0; done = 1; next }
    inblock {
      line = $0
      for (k = 0; k < indent && substr(line, 1, 1) == " "; k++) line = substr(line, 2)
      if (line ~ /^[[:space:]]*#/) next
      out = ""; t = ENVIRON["TEXT"]
      while ((i = index(line, "<the Mongolian text>")) > 0) {
        out = out substr(line, 1, i - 1) t
        line = substr(line, i + length("<the Mongolian text>"))
      }
      print out line
    }' "$ROOT/SKILL.md"
}

fail=0
pass=0
check() { if [ "$2" = 0 ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: $1"; fi; }

TEXTS=(
  '    Догол мөр нь хэвээр үлдэнэ.   '
  'Сайн уу, `touch CANARY` гэж бичээрэй.'
  'Үнэ нь $(touch CANARY) төгрөг.'
  'Тэр "гайхалтай" гэж хэлсэн; $HOME руу оч.'
  "Миний нэр 'Бат' – \"тэгээд\" \`touch CANARY\`"
  'Сайн уу, юу байна даа? Маргаашийн уулзалтандаа бэлдээд ирээрэй хүү.'
)

for text in "${TEXTS[@]}"; do
  CANARY="$WORK/pwned"
  rm -f "$CANARY" "$WORK/received"
  filled="${text//CANARY/$CANARY}"
  render "$filled" > "$WORK/run.sh"
  (cd "$WORK" && RECEIVED="$WORK/received" PATH="$WORK/bin:$PATH" bash "$WORK/run.sh" >/dev/null 2>&1)
  check "text [$text] ran a command" "$([ -e "$CANARY" ] && echo 1 || echo 0)"
  # Byte for byte: the heredoc adds exactly one newline after the text.
  check "text [$text] did not reach the helper unchanged" \
    "$(printf '%s\n' "$filled" | cmp -s - "$WORK/received" && echo 0 || echo 1)"
done

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
