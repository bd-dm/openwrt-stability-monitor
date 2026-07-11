#!/bin/sh
set -eu

: "${PACKAGE_NAME:?}"
mkdir -p artifacts
find openwrt-sdk/bin -type f -name "${PACKAGE_NAME}-*.apk" -exec cp {} artifacts/ \;

apk_file="$(find artifacts -type f -name "${PACKAGE_NAME}-*.apk" -print -quit)"
test -n "${apk_file}" || { echo "No APK produced for ${PACKAGE_NAME}" >&2; exit 1; }

case "$(basename "${apk_file}")" in
  "${PACKAGE_NAME}"-*.apk) ;;
  *) echo "Unexpected APK filename: ${apk_file}" >&2; exit 1 ;;
esac

test "$(find artifacts -type f -name '*.apk' | wc -l | tr -d ' ')" = 1
echo "Collected ${apk_file}"
