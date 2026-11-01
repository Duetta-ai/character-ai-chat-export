#!/bin/sh
# Packs extension/ into dist/duetta-chat-export.zip with manifest.json at the zip root: the file
# for a GitHub release (users unzip it and choose the folder in "Load unpacked") and for the
# Chrome Web Store upload.
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
# -FS keeps an existing zip in step with the folder: a file removed from extension/ leaves the zip too.
(cd extension && zip -q -r -X -FS ../dist/duetta-chat-export.zip . -x '.*' '*/.*')
grep '"version"' extension/manifest.json
unzip -l dist/duetta-chat-export.zip
