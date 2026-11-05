#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
app="output/Mote Notes.app"
mkdir -p "$app/Contents/MacOS"
xcrun swiftc -swift-version 5 -O native-notes/NotesModel.swift native-notes/main.swift -o "$app/Contents/MacOS/MoteNotes" -framework AppKit -framework SwiftUI
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>MoteNotes</string>
<key>CFBundleIdentifier</key><string>top.caten.mote.notes</string>
<key>CFBundleName</key><string>Mote Notes</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PLIST
codesign --force --sign - "$app"
