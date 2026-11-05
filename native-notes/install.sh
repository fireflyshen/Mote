#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import shutil
root=Path.cwd()
home=Path.home()
application=root/'output/Mote Notes.app'
assert application.exists(), 'Run npm --prefix raycast-extension run build first'
target=home/'Library/Application Support/Mote'
target.mkdir(parents=True,exist_ok=True,mode=0o700)
installed=target/'Mote Notes.app'
if installed.exists():
    backup=target/('Mote Notes-'+datetime.now().strftime('%Y%m%dT%H%M%S')+'.app')
    installed.rename(backup)
shutil.copytree(application,installed)
extensions=home/'Library/Application Support/com.tinycast.app/extensions'
if extensions.exists():
    extension=extensions/'mote'
    if extension.exists():
        backups=target/'extension-backups';backups.mkdir(exist_ok=True)
        extension.rename(backups/datetime.now().strftime('%Y%m%dT%H%M%S'))
    shutil.copytree(root/'raycast-extension/dist',extension)
print('Installed Mote Notes; notebook and preferences preserved')
PY
