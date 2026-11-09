#!/bin/bash
# vaapi_variants.sh <video> [render node] [start s] [length s] - encodes a piece of the video with hevc_vaapi the way
# we_manager does (mp4, faststart, audio copied, no hvc1 tag) and with a few variants, then scores every result against
# the source with PSNR. A healthy encode at -qp 28 scores about 35 dB or more; a green/pink or black one is far lower.
# The files are kept in ./vaapi-variants/ so they can be played.
video=$1 dev=${2:-/dev/dri/renderD128} start=${3:-0} len=${4:-60}
[ -f "$video" ] || { echo "usage: $0 <video> [render node] [start s] [length s]"; exit 1; }
out=vaapi-variants
mkdir -p "$out"
rm -f "$out"/*.mp4 "$out"/*.mkv "$out"/*.err

run() { # run <name> <ext> <filter> <encoder options before the output> <muxer options>
    local name=$1 ext=$2 vf=$3 enc=$4 mux=$5 file="$out/$1.$2" t0=$SECONDS rc psnr
    # shellcheck disable=SC2086
    ffmpeg -hide_banner -nostdin -y -loglevel error -vaapi_device "$dev" -ss "$start" -t "$len" -i "$video" \
        -map 0:v:0 -map '0:a?' -map_metadata 0 -vf "$vf" -c:v hevc_vaapi -qp 28 $enc -c:a copy $mux "$file" 2>"$out/$name.err"
    rc=$?
    psnr=$(ffmpeg -hide_banner -nostdin -ss "$start" -t "$len" -i "$video" -i "$file" \
        -lavfi "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]psnr" -f null - 2>&1 | grep -o 'average:[0-9.inf]*' | tail -1)
    printf '%-24s exit=%s %3ss  size=%s  %s\n' "$name" "$rc" "$((SECONDS - t0))" "$(du -h "$file" 2>/dev/null | cut -f1)" "${psnr:-no psnr}"
}

F="format=nv12,hwupload"
run app-exact-mp4        mp4 "$F" "" "-movflags +faststart"
run mp4-hvc1-tag         mp4 "$F" "-tag:v hvc1" "-movflags +faststart"
run mp4-no-faststart     mp4 "$F" "" ""
run mkv                  mkv "$F" "" ""
run mp4-async_depth-1    mp4 "$F" "-async_depth 1" "-movflags +faststart"
echo "kept in $out/, play the files to look at them"
