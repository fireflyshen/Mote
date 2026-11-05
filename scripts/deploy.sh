#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm --prefix raycast-extension run typecheck
npm --prefix raycast-extension run lint
npm --prefix raycast-extension test
npm --prefix raycast-extension run build
npm run typecheck
npm run lint
npm test
npm run build
release=$(date -u +%Y%m%dT%H%M%SZ)
archive=$(mktemp /tmp/mote-deploy.XXXXXX.tar.gz)
trap 'rm -f "$archive"' EXIT
COPYFILE_DISABLE=1 tar -czf "$archive" dist output/server output/scripts Dockerfile deploy/compose.yml
scp "$archive" rn:/opt/mote-upload.tar.gz
ssh rn bash -s -- "$release" < deploy/install.sh
