#!/usr/bin/env bash
set -euo pipefail

# Build web assets and sync into Capacitor Android project
npm run build
npx cap sync android

if ! command -v java >/dev/null 2>&1; then
  echo "ERROR: Java JDK 17+ is required to compile the Android APK." >&2
  exit 1
fi

if [ ! -d "android" ]; then
  echo "ERROR: android/ directory not found. Run: npx cap add android" >&2
  exit 1
fi

pushd android >/dev/null
chmod +x ./gradlew

if [ -n "${GOOD_BITES_KEYSTORE_PATH:-}" ] && [ -f "${GOOD_BITES_KEYSTORE_PATH}" ]; then
  ./gradlew assembleRelease \
    -Pandroid.injected.signing.store.file="${GOOD_BITES_KEYSTORE_PATH}" \
    -Pandroid.injected.signing.store.password="${GOOD_BITES_KEYSTORE_PASSWORD}" \
    -Pandroid.injected.signing.key.alias="${GOOD_BITES_KEY_ALIAS}" \
    -Pandroid.injected.signing.key.password="${GOOD_BITES_KEY_PASSWORD}"
  APK_SOURCE="app/build/outputs/apk/release/app-release.apk"
else
  echo "No release keystore env vars detected; building debug APK..."
  ./gradlew assembleDebug
  APK_SOURCE="app/build/outputs/apk/debug/app-debug.apk"
fi
popd >/dev/null

mkdir -p public/downloads
cp "android/${APK_SOURCE}" public/downloads/good-bites.apk
echo "APK ready at public/downloads/good-bites.apk"
