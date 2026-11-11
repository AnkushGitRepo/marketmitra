#!/usr/bin/env bash
# Deploys the app to production, but only a tagged release, and verifies that production reports that version afterwards.
# Needs the maintainer's go-ahead (see AGENTS.md); this script does not ask, it only refuses unsafe states.
#
#   npm run deploy:prod
#   ALLOW_UNTAGGED=1 npm run deploy:prod     emergency only: skips the "HEAD is the tagged release" rule
set -euo pipefail

APP="${APP_URL:-https://marketmitra-v2.vercel.app}"
die() { echo "deploy:prod refused: $1" >&2; exit 1; }

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "not on main."
[ -z "$(git status --porcelain --untracked-files=no)" ] || die "uncommitted changes."
git fetch --quiet origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main is not equal to origin/main (pull or push first)."

if [ "${ALLOW_UNTAGGED:-}" != "1" ]; then
  git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null \
    || die "there is no ${TAG} tag. Run 'npm run release', merge the release PR, and wait for the Release workflow."
  [ "$(git rev-parse HEAD)" = "$(git rev-parse "${TAG}^{commit}")" ] \
    || die "HEAD is not at ${TAG}: there are commits after the release. Run 'npm run release' for a new version (each deploy gets its own version)."
fi

# Stray IDE duplicates ("name 2.ts") are gitignored but get uploaded and break the remote type check (HANDOFF gotcha 15).
dupes="$(find src public -name '* [0-9].*' -type f 2>/dev/null | head -3)"
[ -z "$dupes" ] || die "stray duplicate files would be uploaded: ${dupes}"

COMMIT="$(git rev-parse --short HEAD)"
echo "Deploying ${TAG} (${COMMIT}) to production..."
npx vercel deploy --prod --yes --build-env "APP_COMMIT=${COMMIT}"

echo "Checking that production reports ${VERSION}..."
for attempt in 1 2 3 4 5 6; do
  live="$(curl -s -m 20 "${APP}/api/version" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.version)}catch{console.log('')}})")"
  if [ "$live" = "$VERSION" ]; then echo "ok    production runs ${VERSION} (${COMMIT})"; break; fi
  [ "$attempt" = 6 ] && die "production reports '${live}', expected ${VERSION}."
  sleep 10
done

bash scripts/smoke-test.sh "${APP}"
