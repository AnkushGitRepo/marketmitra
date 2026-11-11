#!/usr/bin/env bash
# Deploys the app to production exactly as `main` is, and verifies that production reports that commit afterwards.
# A deploy does not imply a new version (ADR 0059): a release is cut only when the maintainer asks for one.
# Needs the maintainer's go-ahead (see AGENTS.md); this script does not ask, it only refuses unsafe states.
#
#   npm run deploy:prod
set -euo pipefail

APP="${APP_URL:-https://marketmitra-v2.vercel.app}"
die() { echo "deploy:prod refused: $1" >&2; exit 1; }

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "not on main."
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "uncommitted changes."
git fetch --quiet origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main is not equal to origin/main (pull or push first)."

# Stray IDE duplicates ("name 2.ts") are gitignored but get uploaded and break the remote type check (HANDOFF gotcha 15).
dupes="$(find src public -name '* [0-9].*' -type f 2>/dev/null | head -3)"
[ -z "$dupes" ] || die "stray duplicate files would be uploaded: ${dupes}"

COMMIT="$(git rev-parse --short HEAD)"
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  AHEAD="$(git rev-list --count "${TAG}..HEAD")"
  if [ "$AHEAD" = "0" ]; then WHERE="the tagged release ${TAG}"; else WHERE="${AHEAD} commit(s) after ${TAG}"; fi
else
  WHERE="no tag for ${VERSION}"
fi
echo "Deploying ${COMMIT} (${WHERE}; package version ${VERSION}) to production..."
npx vercel deploy --prod --yes --build-env "APP_COMMIT=${COMMIT}"

echo "Checking that production reports commit ${COMMIT}..."
for attempt in 1 2 3 4 5 6; do
  live="$(curl -s -m 20 "${APP}/api/version" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const d=JSON.parse(s).data;console.log(d.commit+' '+d.version)}catch{console.log('')}})")"
  if [ "${live%% *}" = "$COMMIT" ]; then echo "ok    production runs ${COMMIT} (version ${live##* })"; break; fi
  [ "$attempt" = 6 ] && die "production reports '${live}', expected commit ${COMMIT}."
  sleep 10
done

bash scripts/smoke-test.sh "${APP}"
