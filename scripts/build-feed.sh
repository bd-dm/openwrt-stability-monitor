#!/bin/sh
set -eu

: "${PACKAGE_NAME:?}"
: "${APK_SIGNING_KEY:?APK_SIGNING_KEY secret is not configured}"
: "${APK_SIGNING_KEY_NAME:?}"
: "${GH_TOKEN:?}"
APK="${APK:-apk}"

mkdir -p site
printf '%s\n' "${APK_SIGNING_KEY}" > "${RUNNER_TEMP:-/tmp}/${APK_SIGNING_KEY_NAME}"
chmod 600 "${RUNNER_TEMP:-/tmp}/${APK_SIGNING_KEY_NAME}"

# Retain installable versions attached to earlier GitHub releases.
gh api --paginate "repos/${GITHUB_REPOSITORY}/releases?per_page=100" \
  --jq '.[].assets[].browser_download_url' \
  | grep "/${PACKAGE_NAME}-.*\.apk$" \
  | sort -u \
  | while IFS= read -r url; do wget -q -P site "${url}"; done

cp artifacts/*.apk site/
cp "repository/${APK_SIGNING_KEY_NAME}" site/

"${APK}" adbsign --allow-untrusted \
  --sign-key "${RUNNER_TEMP:-/tmp}/${APK_SIGNING_KEY_NAME}" site/*.apk
"${APK}" mkndx --allow-untrusted \
  --sign-key "${RUNNER_TEMP:-/tmp}/${APK_SIGNING_KEY_NAME}" \
  --output site/packages.adb site/*.apk
"${APK}" adbdump --format json site/packages.adb > site/packages.json
grep -q "${PACKAGE_NAME}" site/packages.json

cat > site/index.html <<EOF
<!doctype html>
<meta charset="utf-8">
<title>OpenWrt Stability Monitor APK feed</title>
<h1>OpenWrt Stability Monitor APK feed</h1>
<p>Signed package feed for OpenWrt 25.12 and newer.</p>
<ul>
  <li><a href="packages.adb">packages.adb</a></li>
  <li><a href="${APK_SIGNING_KEY_NAME}">${APK_SIGNING_KEY_NAME}</a></li>
</ul>
EOF
