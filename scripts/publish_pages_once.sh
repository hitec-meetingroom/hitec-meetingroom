#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

PUBLISH_BRANCH="${PUBLISH_BRANCH:-gh-pages}"
DEPLOY_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$DEPLOY_DIR"
}
trap cleanup EXIT

python scripts/export_room_status.py --output-dir site
python scripts/build_static_site.py

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

if git clone --depth 1 --branch "$PUBLISH_BRANCH" "$REMOTE_URL" "$DEPLOY_DIR"; then
  echo "Checked out ${PUBLISH_BRANCH}."
else
  echo "Creating ${PUBLISH_BRANCH}."
  git init "$DEPLOY_DIR"
  git -C "$DEPLOY_DIR" checkout --orphan "$PUBLISH_BRANCH"
  git -C "$DEPLOY_DIR" remote add origin "$REMOTE_URL"
fi

find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name ".git" -exec rm -rf {} +
cp -R site/. "$DEPLOY_DIR"/
touch "$DEPLOY_DIR/.nojekyll"

git -C "$DEPLOY_DIR" add -A
if git -C "$DEPLOY_DIR" diff --cached --quiet; then
  echo "No Pages changes to publish."
  exit 0
fi

git -C "$DEPLOY_DIR" commit -m "chore: publish room status $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
git -C "$DEPLOY_DIR" push origin "HEAD:${PUBLISH_BRANCH}"
