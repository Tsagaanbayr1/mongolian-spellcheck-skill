#!/usr/bin/env node
/**
 * Mongolian spell checker via spellcheck.mn.
 *
 * Generates the request `key` the service requires (an undocumented hash of the
 * content), then calls the check + suggest endpoints and prints a single JSON
 * object an AI agent can act on.
 *
 * The key algorithm is the site's `$encrypt(content)`:
 *     n   = (sum of (codePoint + 1) for each char) mod 10000000008
 *     key = sha256_hex(String(n))
 *
 * Usage:
 *     node spellcheck.js "Монгол текст энд бичнэ үү."
 *     echo "текст" | node spellcheck.js
 *     node spellcheck.js --check-only "текст"      // skip suggestions
 *     node spellcheck.js --suggest "уулзалтандаа"  // one word only
 *     node spellcheck.js <<'MN_TEXT'               // what agents should use:
 *     ...text...                                   // nothing in it is expanded
 *     MN_TEXT
 *
 * Output (stdout, JSON):
 *     {"text": "...", "misspelled": ["word", ...],
 *      "suggestions": {"word": ["cand1", ...]}}
 *
 * Zero dependencies — Node.js built-ins only (requires Node 18+ for global fetch).
 */

"use strict";

const { createHash } = require("crypto");

const BASE = "https://spellcheck.mn/cms-client/modules/spellchecker";
const HEADERS = {
  "content-type": "application/json",
  origin: "https://spellcheck.mn",
  referer: "https://spellcheck.mn/",
  accept: "application/json, text/plain, */*",
  "user-agent": "Mozilla/5.0 (spellchecker-mn skill)",
};
const MOD = 10_000_000_008n;
const TIMEOUT = 20_000;

/** Return the request key for a piece of content (matches site $encrypt). */
function encrypt(s) {
  let n = 0n;
  // `for...of` iterates a string by Unicode code point, matching the site's logic.
  for (const ch of s) {
    n += BigInt(ch.codePointAt(0)) + 1n;
    n %= MOD;
  }
  return createHash("sha256").update(String(n), "utf8").digest("hex");
}

async function post(endpoint, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  let res;
  try {
    res = await fetch(`${BASE}/${endpoint}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    fail(`could not reach ${endpoint}: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.text();
  if (!res.ok) fail(`${endpoint} returned HTTP ${res.status}: ${body}`);
  if (body.trim().replace(/^"|"$/g, "") === "Invalid hash.")
    fail(`server rejected key for ${endpoint} (Invalid hash)`);
  try {
    return JSON.parse(body);
  } catch {
    fail(`unexpected response from ${endpoint}: ${body}`);
  }
}

async function check(text) {
  const words = await post("check", { text, key: encrypt(text) });
  return words.map((w) => w.replaceAll("-", "")); // site strips hyphens
}

async function suggest(word) {
  return post("suggest", { word, key: encrypt(word) });
}

async function run(text, withSuggestions = true) {
  const result = { text, misspelled: [], suggestions: {} };
  if (text.trim().length < 2) return result; // mirrors site guard
  result.misspelled = await check(text);
  if (withSuggestions) {
    for (const word of new Set(result.misspelled)) {
      result.suggestions[word] = await suggest(word);
    }
  }
  return result;
}

function fail(msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    // Keep the text as written (indentation, trailing spaces); only drop the one
    // newline that `echo` or a heredoc adds at the end.
    process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
  });
}

async function main() {
  let args = process.argv.slice(2);

  if (args[0] === "--suggest") {
    const rest = args.slice(1);
    const word = (rest.length ? rest.join(" ") : await readStdin()).trim();
    if (!word) fail("usage: spellcheck.js --suggest <word>  (or pipe the word via stdin)");
    process.stdout.write(
      JSON.stringify({ word, suggestions: await suggest(word) }) + "\n"
    );
    return;
  }

  let withSuggestions = true;
  if (args[0] === "--check-only") {
    withSuggestions = false;
    args = args.slice(1);
  }

  const text = args.length ? args.join(" ") : await readStdin();
  if (!text.trim()) fail('usage: spellcheck.js [--check-only] "<text>"  (or pipe text via stdin)');

  process.stdout.write(JSON.stringify(await run(text, withSuggestions)) + "\n");
}

main();
