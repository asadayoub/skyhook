#!/usr/bin/env bash
# Skyhook Universal Installer
# curl -fsSL https://raw.githubusercontent.com/asadayoub/skyhook/main/install.sh | bash

set -e

SKYHOOK_HOME="${SKYHOOK_HOME:-$HOME/.skyhook}"
REPO="${REPO:-asadayoub/skyhook}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="$SKYHOOK_HOME/skill"

echo "🚀 Installing Skyhook from $REPO@$BRANCH to $INSTALL_DIR..."

TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download repo
if command -v gh &> /dev/null && gh auth status &> /dev/null; then
    gh repo clone "$REPO" "$TMP_DIR/skyhook" -- --branch "$BRANCH" --depth 1 2>/dev/null || \
    git clone "https://github.com/$REPO.git" "$TMP_DIR/skyhook" --branch "$BRANCH" --depth 1
else
    git clone "https://github.com/$REPO.git" "$TMP_DIR/skyhook" --branch "$BRANCH" --depth 1
fi

# Install
mkdir -p "$SKYHOOK_HOME"
rm -rf "$INSTALL_DIR"
cp -r "$TMP_DIR/skyhook/skyhook" "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/cli/skyhook.js"

# Create skyhook wrapper (no .js extension) for direct PATH execution
cat > "$INSTALL_DIR/cli/skyhook" << 'WRAPPER_EOF'
#!/usr/bin/env bash
exec node "$(dirname "$0")/skyhook.js" "$@"
WRAPPER_EOF
chmod +x "$INSTALL_DIR/cli/skyhook"

# Verify
if "$INSTALL_DIR/cli/skyhook" version &> /dev/null; then
    echo "✅ Skyhook installed successfully!"
else
    echo "⚠️  Install completed but verification failed"
fi

echo ""
echo "📝 Add to your shell config (~/.zshrc, ~/.bashrc, ~/.config/fish/config.fish):"
echo "   export PATH=\"\$HOME/.skyhook/skill/cli:\$PATH\""
echo ""
echo "🔄 Then restart shell or run: source ~/.zshrc"
echo ""
echo "🎯 Quick start:"
echo "   cd your-project"
echo "   skyhook init"
echo "   skyhook discover"
