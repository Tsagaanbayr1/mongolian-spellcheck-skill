# mongolian-spellcheck-skill 🇲🇳

A portable, **zero-dependency AI skill** for spell-checking and auto-correcting
Mongolian (Cyrillic) text. It wraps the [`spellcheck.mn`](https://spellcheck.mn)
service and lets any agent runtime — **Claude Code, Codex, Gemini CLI, Copilot
CLI** — proofread Mongolian writing with contextual judgment.

> The catch with `spellcheck.mn` is that every request needs a content-derived
> `key`, or the server replies `"Invalid hash."`. This skill ships that key
> algorithm built-in, so you never touch the raw API.

## What it does

1. A helper script computes the required request `key`, calls the **check** and
   **suggest** endpoints, and prints one tidy JSON object.
2. The AI reads the misspelled words and their candidate corrections, then picks
   the right one **in context** (Mongolian suffixes encode case, possession, and
   vowel harmony — the top suggestion isn't always correct).
3. You get back the **corrected text** plus a `original → fixed` change list.

```
                ┌─────────────────────┐
  Mongolian ───▶│ scripts/spellcheck  │───▶ {misspelled, suggestions}
    text        │  (auto-builds key)  │              │
                └─────────────────────┘              ▼
                                          AI picks best fix in context
                                                     │
                                                     ▼
                                      corrected text + change list
```

## Layout

```
.
├── SKILL.md            # the skill — the workflow the AI follows
├── scripts/
│   ├── spellcheck.py   # Python 3 helper (standard library only)
│   └── spellcheck.js   # Node helper (built-ins only, Node 18+)
├── tests/
│   └── skill-command.sh  # the SKILL.md command never lets the shell touch the text
├── references/
│   └── api.md          # endpoint contracts + the request-key algorithm
└── README.md
```

## Install

Clone (or copy) this repo into your agent's skills directory as
`mongolian-spell-check`:

| Runtime | Path |
|---------|------|
| Claude Code (personal) | `~/.claude/skills/mongolian-spell-check/` |
| Cross-runtime alias (Codex / Copilot / Gemini) | `~/.agents/skills/mongolian-spell-check/` |
| Project-scoped (Claude Code) | `<project>/.claude/skills/mongolian-spell-check/` |

```bash
git clone https://github.com/Tsagaanbayr1/mongolian-spellcheck-skill.git \
  ~/.claude/skills/mongolian-spell-check
```

No `pip install` / `npm install` — the scripts use only the standard library and
Node built-ins.

## Standalone usage (no agent required)

```bash
# Check + suggest (default):
python3 scripts/spellcheck.py "Маргаашийн уулзалтандаа бэлдээд ирээрэй хүү."

# Node equivalent:
node scripts/spellcheck.js "Маргаашийн уулзалтандаа бэлдээд ирээрэй хүү."

# Long text, or any text with quotes, backticks or $ in it: a quoted heredoc
# passes it on stdin without the shell expanding anything (this is what SKILL.md
# tells agents to use):
python3 scripts/spellcheck.py <<'MN_TEXT'
<text>
MN_TEXT

# Just the misspelled words (skip suggestions):
python3 scripts/spellcheck.py --check-only "<text>"

# One word's suggestions:
python3 scripts/spellcheck.py --suggest "уулзалтандаа"
```

Output:

```json
{
  "text": "Маргаашийн уулзалтандаа бэлдээд ирээрэй хүү.",
  "misspelled": ["уулзалтандаа"],
  "suggestions": {
    "уулзалтандаа": ["уулзалтайндаа", "уулзалтдаа", "уулзалтындаа", "..."]
  }
}
```

## How the request key works

`spellcheck.mn`'s client derives a per-request hash from the content:

```
n   = ( Σ over each Unicode code point c of the content of (c + 1) ) mod 10000000008
key = sha256_hex( decimal_string_of(n) )
```

Both helper scripts implement this exactly (and assert it against known vectors).
Full endpoint and algorithm details: [`references/api.md`](references/api.md).

## Notes

- This skill targets **spelling** corrections, not translation or full grammar
  rewriting.
- It depends on the public `spellcheck.mn` service being reachable.
- Not affiliated with or endorsed by `spellcheck.mn`.

## Testing

`bash tests/skill-command.sh` fills the SKILL.md command with text containing
backticks, `$(...)`, quotes and `$VAR`, runs it against stub `python3`/`node`
(nothing is sent to spellcheck.mn), and checks that the shell runs nothing and the
helper receives the text unchanged.

## License

MIT
