#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
stash_test_dir=$(mktemp -d)
trap 'rm -rf "$stash_test_dir"' EXIT
swiftc -swift-version 5 -parse-as-library \
  native/Stash/API/Models.swift native/Stash/API/ItemList.swift \
  native/Stash/API/LibraryChanges.swift native/Stash/API/LinkCapture.swift \
  native/Stash/API/QueueOrder.swift native/Tests/NativeRegression.swift \
  -o "$stash_test_dir/native-regression"
"$stash_test_dir/native-regression"
node native/Tests/reader-bridge.cjs
