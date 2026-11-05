#!/usr/bin/env bash
set -euo pipefail
umask 077
release=$1
case "$release" in *[!0-9A-Za-z-]*) echo 'Invalid release' >&2; exit 1;; esac
mkdir -p /opt/mote/releases /opt/mote/data /opt/mote/backups
cd /opt/mote
exec 9>.deploy.lock
flock -n 9
if [ ! -f .env ]; then
    password=$(openssl rand -hex 24)
    printf 'MOTE_PASSWORD=%s\n' "$password" > .env
fi
if [ -f compose.yml ]; then cp compose.yml "backups/compose-$release.yml"; fi
cp .env "backups/env-$release"
if docker inspect mote >/dev/null 2>&1; then
    docker exec mote node --input-type=module -e 'import {DatabaseSync,backup} from "node:sqlite";await backup(new DatabaseSync("/data/mote.sqlite"),"/data/pre-deploy-'"$release"'.sqlite");'
fi
chown 1000:1000 data
chmod 700 data
mkdir -p "releases/$release"
tar -xzf /opt/mote-upload.tar.gz -C "releases/$release"
cd "releases/$release"
docker build -t "mote:$release" .
cd /opt/mote
old_image=$(sed -n 's/^MOTE_IMAGE=//p' .env)
sed -i '/^MOTE_IMAGE=/d' .env
printf 'MOTE_IMAGE=mote:%s\n' "$release" >> .env
cp "releases/$release/deploy/compose.yml" compose.yml
docker compose up -d --wait --wait-timeout 60 || {
    cp "backups/env-$release" .env
    if [ -f "backups/compose-$release.yml" ]; then cp "backups/compose-$release.yml" compose.yml; docker compose up -d; fi
    exit 1
}
curl --fail --silent http://127.0.0.1:4174/healthz >/dev/null
printf '%s\n' "$release" > current-release
printf 'Mote deployed: %s (previous %s)\n' "$release" "${old_image:-none}"
