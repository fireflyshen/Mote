#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p output
xcrun swiftc -swift-version 5 native-notes/NotesModel.swift native-notes/tests/main.swift -o output/native-notes-tests
./output/native-notes-tests
