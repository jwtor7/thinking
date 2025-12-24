#!/bin/bash
# Bump version in all locations and prepare for release
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

BUMP_TYPE="${1:-patch}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 [patch|minor|major]"
  echo "  patch - bug fixes (0.3.0 -> 0.3.1)"
  echo "  minor - new features (0.3.0 -> 0.4.0)"
  echo "  major - breaking changes (0.3.0 -> 1.0.0)"
  exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('$ROOT_DIR/package.json').version")
echo "Current version: $CURRENT_VERSION"

# Calculate new version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update package.json
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$ROOT_DIR/package.json"
echo "Updated package.json"

# Update types.ts VERSION constant
sed -i '' "s/VERSION: '$CURRENT_VERSION'/VERSION: '$NEW_VERSION'/" "$ROOT_DIR/src/server/types.ts"
echo "Updated types.ts"

# Update types.test.ts
sed -i '' "s/serverVersion: '$CURRENT_VERSION'/serverVersion: '$NEW_VERSION'/" "$ROOT_DIR/src/server/types.test.ts"
echo "Updated types.test.ts"

# Get today's date
TODAY=$(date '+%Y-%m-%d')

# Check if CHANGELOG.md has today's date already
if grep -q "## $TODAY" "$ROOT_DIR/CHANGELOG.md"; then
  echo "CHANGELOG.md already has entry for $TODAY"
else
  # Add new dated section to CHANGELOG.md
  TEMP_FILE=$(mktemp)
  echo "# Changelog

## $TODAY

### Changed
- Version bump to $NEW_VERSION

---
" > "$TEMP_FILE"
  # Append everything after "# Changelog" line
  tail -n +3 "$ROOT_DIR/CHANGELOG.md" >> "$TEMP_FILE"
  mv "$TEMP_FILE" "$ROOT_DIR/CHANGELOG.md"
  echo "Added new section to CHANGELOG.md"
fi

echo ""
echo "Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Edit CHANGELOG.md with actual changes"
echo "  2. Update README.md Recent Changes if needed"
echo "  3. git add -A && git commit -m \"v$NEW_VERSION: <description>\""
echo "  4. git tag -a v$NEW_VERSION -m \"v$NEW_VERSION: <description>\""
echo "  5. git push origin main --tags"
