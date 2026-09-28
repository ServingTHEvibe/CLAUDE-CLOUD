#!/usr/bin/env bash
# Extract a scroll-film chapter from a source video at its NATIVE frame rate.
#
#   scripts/extract-frames.sh <video> <chapter-id> [first-frame] [frame-count]
#
# Env: DESKTOP_W (default 1080), MOBILE_W (default 720). Use wider sets for footage that
# plays full-bleed (e.g. DESKTOP_W=1600 MOBILE_W=960 for the 16:9 mural).
# Writes two WebP sets to public/film/<chapter-id>/{d,m}/
# and prints the frame count to paste into js/film-config.js.
# Needs ffmpeg with libwebp on PATH (or FFMPEG=/path/to/ffmpeg).
set -euo pipefail

VIDEO=${1:?video path}
ID=${2:?chapter id, e.g. a-mural}
FIRST=${3:-0}
COUNT=${4:-}
DW=${DESKTOP_W:-1080}
MW=${MOBILE_W:-720}
FFMPEG=${FFMPEG:-ffmpeg}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/film/$ID"

rm -rf "$OUT" && mkdir -p "$OUT/d" "$OUT/m"
SEL="gte(n\\,$FIRST)"; [ -n "$COUNT" ] && SEL="between(n\\,$FIRST\\,$((FIRST + COUNT - 1)))"

"$FFMPEG" -v error -y -i "$VIDEO" -an \
  -vf "select=$SEL,scale=$DW:-2:flags=lanczos" -fps_mode passthrough -c:v libwebp -quality 74 -compression_level 5 \
  -start_number 0 "$OUT/d/%04d.webp"
"$FFMPEG" -v error -y -i "$VIDEO" -an \
  -vf "select=$SEL,scale=$MW:-2:flags=lanczos" -fps_mode passthrough -c:v libwebp -quality 70 -compression_level 5 \
  -start_number 0 "$OUT/m/%04d.webp"

D=$(ls "$OUT/d" | wc -l | tr -d ' ')
M=$(ls "$OUT/m" | wc -l | tr -d ' ')
[ "$D" = "$M" ] || { echo "desktop/mobile counts differ ($D vs $M)" >&2; exit 1; }
echo "chapter $ID: $D frames  ($(du -sh "$OUT/d" | cut -f1) desktop, $(du -sh "$OUT/m" | cut -f1) mobile)"
