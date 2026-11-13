#!/bin/sh
# Regenerates the fixture media with ffmpeg. The output is committed, so e2e runs do not need ffmpeg.
set -e
cd "$(dirname "$0")/fixtures"
i=0
for color in ff4444 44aa44 4466ff ffaa22 aa44ff 22aaaa; do
  i=$((i + 1))
  ffmpeg -loglevel error -y -f lavfi -i "color=c=0x$color:s=800x600" \
    -vf "drawbox=x=40:y=40:w=$((i * 60)):h=80:color=white:t=fill" -frames:v 1 "shot-$i.png"
done
ffmpeg -loglevel error -y -f lavfi -i "color=c=0xffcc00:s=48x48" -frames:v 1 emoji.png
cp shot-1.png avatar.png
# VP8 and Opus: Playwright's Chromium has no H.264.
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=s=640x360:r=15:d=6" -f lavfi -i "sine=f=440:d=6" \
  -c:v libvpx -b:v 200k -c:a libopus -shortest demo.webm
