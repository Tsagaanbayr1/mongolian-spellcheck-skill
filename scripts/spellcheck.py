#!/usr/bin/env python3
"""Mongolian spell checker via spellcheck.mn.

Generates the request `key` the service requires (an undocumented hash of the
content), then calls the check + suggest endpoints and prints a single JSON
object an AI agent can act on.

The key algorithm is the site's `$encrypt(content)`:
    n   = (sum of (codePoint + 1) for each char) mod 10000000008
    key = sha256_hex(str(n))

Usage:
    python3 spellcheck.py "Монгол текст энд бичнэ үү."
    echo "текст" | python3 spellcheck.py
    python3 spellcheck.py --check-only "текст"     # skip suggestions
    python3 spellcheck.py --suggest "уулзалтандаа"  # one word only
    python3 spellcheck.py <<'MN_TEXT'               # what agents should use:
    ...text...                                      # nothing in it is expanded
    MN_TEXT

Output (stdout, JSON):
    {"text": "...", "misspelled": ["word", ...],
     "suggestions": {"word": ["cand1", ...]}}

Zero dependencies — Python 3 standard library only.
"""

import json
import sys
import urllib.request
import urllib.error
from hashlib import sha256

BASE = "https://spellcheck.mn/cms-client/modules/spellchecker"
HEADERS = {
    "content-type": "application/json",
    "origin": "https://spellcheck.mn",
    "referer": "https://spellcheck.mn/",
    "accept": "application/json, text/plain, */*",
    "user-agent": "Mozilla/5.0 (spellchecker-mn skill)",
}
MOD = 10_000_000_008
TIMEOUT = 20


def encrypt(s):
    """Return the request key for a piece of content (matches site $encrypt)."""
    n = 0
    # Python iterates a str by Unicode code point, matching the site's logic.
    for ch in s:
        n += ord(ch) + 1
        n %= MOD
    return sha256(str(n).encode("utf-8")).hexdigest()


def _post(endpoint, payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{BASE}/{endpoint}", data=data, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"error: {endpoint} returned HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        raise SystemExit(f"error: could not reach {endpoint}: {e.reason}")
    if body.strip() == "Invalid hash." or body.strip().strip('"') == "Invalid hash.":
        raise SystemExit(f"error: server rejected key for {endpoint} (Invalid hash)")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise SystemExit(f"error: unexpected response from {endpoint}: {body!r}")


def check(text):
    """Return the list of misspelled words in `text`."""
    words = _post("check", {"text": text, "key": encrypt(text)})
    # The site strips hyphens from each returned word.
    return [w.replace("-", "") for w in words]


def suggest(word):
    """Return candidate corrections for a single `word`."""
    return _post("suggest", {"word": word, "key": encrypt(word)})


def run(text, with_suggestions=True):
    result = {"text": text, "misspelled": [], "suggestions": {}}
    if len(text.strip()) < 2:  # mirrors the site's guard
        return result
    misspelled = check(text)
    result["misspelled"] = misspelled
    if with_suggestions:
        for word in dict.fromkeys(misspelled):  # unique, order-preserving
            result["suggestions"][word] = suggest(word)
    return result


def _read_input(args):
    if args:
        return " ".join(args)
    return sys.stdin.read().strip()


def main(argv):
    args = argv[1:]
    if args and args[0] == "--suggest":
        word = _read_input(args[1:]).strip()
        if not word:
            raise SystemExit("usage: spellcheck.py --suggest <word>  (or pipe the word via stdin)")
        print(json.dumps({"word": word, "suggestions": suggest(word)}, ensure_ascii=False))
        return
    with_suggestions = True
    if args and args[0] == "--check-only":
        with_suggestions = False
        args = args[1:]
    text = _read_input(args)
    if not text:
        raise SystemExit("usage: spellcheck.py [--check-only] \"<text>\"  (or pipe text via stdin)")
    print(json.dumps(run(text, with_suggestions), ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv)
