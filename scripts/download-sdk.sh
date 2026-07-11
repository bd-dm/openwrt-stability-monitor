#!/bin/sh
set -eu

: "${OPENWRT_VERSION:?}"
: "${OPENWRT_TARGET:?}"
: "${OPENWRT_SUBTARGET:?}"

base_url="https://downloads.openwrt.org/releases/${OPENWRT_VERSION}/targets/${OPENWRT_TARGET}/${OPENWRT_SUBTARGET}"
index="$(wget -qO- "${base_url}/")"
sdk_archive="$(printf '%s' "${index}" | grep -oE 'openwrt-sdk-[^" ]+\.tar\.(xz|zst)' | head -n 1)"

test -n "${sdk_archive}" || { echo "No SDK found at ${base_url}/" >&2; exit 1; }
wget -O "${sdk_archive}" "${base_url}/${sdk_archive}"
wget -O sha256sums "${base_url}/sha256sums"
grep -E "[ *]${sdk_archive}$" sha256sums | sha256sum -c -

mkdir -p openwrt-sdk
tar --strip-components=1 -xf "${sdk_archive}" -C openwrt-sdk
