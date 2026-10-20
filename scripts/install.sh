#!/usr/bin/env bash
set -euo pipefail

validator_prefix="${HOME:?HOME must be set}/.local"
validator_skip_browser=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix) [ "$#" -ge 2 ] || { echo 'Missing path after --prefix' >&2; exit 2; }; validator_prefix="$2"; shift 2 ;;
    --skip-browser) validator_skip_browser=true; shift ;;
    --help|-h) echo 'Usage: bash install.sh [--prefix DIRECTORY] [--skip-browser]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 20+ (including npm) from https://nodejs.org/ and reopen Terminal.' >&2; exit 2; }
command -v npm >/dev/null 2>&1 || { echo 'npm is missing. Install Node.js 20+ including npm, then reopen Terminal.' >&2; exit 2; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("Node.js 20+ is required."); process.exit(2); }'
[ -n "$validator_prefix" ] && [ "$validator_prefix" != / ] || { echo 'Choose a specific non-root installation prefix.' >&2; exit 2; }
validator_directory="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
validator_archives=("$validator_directory"/hia-html-validator-*.tgz)
[ "${#validator_archives[@]}" -eq 1 ] && [ -f "${validator_archives[0]}" ] || { echo 'Expected exactly one hia-html-validator-*.tgz beside install.sh.' >&2; exit 2; }
validator_archive="${validator_archives[0]}"
npm install --global --prefix "$validator_prefix" "$validator_archive"
if [ "$validator_skip_browser" = false ]; then
  "$validator_prefix/bin/hia-html-validator" setup
fi
echo
echo "Installed into: $validator_prefix"
printf 'For this terminal: export PATH=%q:$PATH\n' "$validator_prefix/bin"
echo 'Then run: hia-html-validator doctor'
echo 'Validate: hia-html-validator "/absolute/path/to/lesson.html"'
echo 'Your HTML files and shell startup files have not been changed.'
