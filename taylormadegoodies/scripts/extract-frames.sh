#!/usr/bin/env bash
# Extract a scroll-film chapter from a source video at its NATIVE frame rate.
#
#   scripts/extract-frames.sh <video> <chapter-id> [trim-start-seconds] [trim-end-seconds]
#
# Writes two WebP sets (desktop 1080w, mobile 720w) to public/film/<chapter-id>/{d,m}/
# and prints the frame count to paste into js/film-config.js.
# Needs ffmpeg with libwebp on PATH (or FFMPEG=/path/to/ffmpeg).
set -euo pipefail

VIDEO=${1:?video path}
ID=${2:?chapter id, e.g. a-mural}
SS=${3:-0}
TO=${4:-}
FFMPEG=${FFMPEG:-ffmpeg}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/film/$ID"

rm -rf "$OUT" && mkdir -p "$OUT/d" "$OUT/m"
TRIM=(-ss "$SS"); [ -n "$TO" ] && TRIM+=(-to "$TO")

"$FFMPEG" -v error -y "${TRIM[@]}" -i "$VIDEO" -an \
  -vf "scale=1080:-2:flags=lanczos" -c:v libwebp -quality 74 -compression_level 5 \
  -start_number 0 "$OUT/d/%04d.webp"
"$FFMPEG" -v error -y "${TRIM[@]}" -i "$VIDEO" -an \
  -vf "scale=720:-2:flags=lanczos" -c:v libwebp -quality 70 -compression_level 5 \
  -start_number 0 "$OUT/m/%04d.webp"

D=$(ls "$OUT/d" | wc -l | tr -d ' ')
M=$(ls "$OUT/m" | wc -l | tr -d ' ')
[ "$D" = "$M" ] || { echo "desktop/mobile counts differ ($D vs $M)" >&2; exit 1; }
echo "chapter $ID: $D frames  ($(du -sh "$OUT/d" | cut -f1) desktop, $(du -sh "$OUT/m" | cut -f1) mobile)"
