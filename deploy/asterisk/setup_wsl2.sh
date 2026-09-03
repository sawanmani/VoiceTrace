#!/bin/bash
# VoiceTrace — WSL2 Asterisk Setup Script
# SIH 2026 | PSID 260104 | Run this inside WSL2 Ubuntu
set -e

echo "========================================"
echo " VoiceTrace — Asterisk Setup for WSL2"
echo " SIH 2026 | PSID 260104"
echo "========================================"
echo ""

# Step 1: Install Asterisk
echo "[1/6] Installing Asterisk..."
sudo apt update
sudo apt install -y asterisk
echo "✅ Asterisk installed"

# Step 2: Verify AudioSocket modules
echo ""
echo "[2/6] Checking AudioSocket modules..."
if ls /usr/lib/asterisk/modules/ | grep -q audiosocket; then
    echo "✅ AudioSocket modules found:"
    ls /usr/lib/asterisk/modules/ | grep audiosocket
else
    echo "❌ AudioSocket modules NOT found!"
    echo "   Your Asterisk version may not include AudioSocket."
    echo "   Try: sudo apt install asterisk-modules"
    exit 1
fi

# Step 3: Backup original configs
echo ""
echo "[3/6] Backing up original configs..."
for f in pjsip.conf extensions.conf modules.conf rtp.conf; do
    if [ -f "/etc/asterisk/$f" ]; then
        sudo cp "/etc/asterisk/$f" "/etc/asterisk/${f}.bak"
        echo "   Backed up $f"
    fi
done
echo "✅ Backups created"

# Step 4: Copy VoiceTrace configs
echo ""
echo "[4/6] Installing VoiceTrace configs..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for f in pjsip.conf extensions.conf modules.conf rtp.conf; do
    if [ -f "$SCRIPT_DIR/configs/$f" ]; then
        sudo cp "$SCRIPT_DIR/configs/$f" "/etc/asterisk/$f"
        echo "   Installed $f"
    else
        echo "   ⚠️  $f not found in configs/ — skipping"
    fi
done
echo "✅ Configs installed"

# Step 5: Create custom sounds directory
echo ""
echo "[5/6] Creating custom sounds directory..."
sudo mkdir -p /var/lib/asterisk/sounds/custom
if [ -f "$SCRIPT_DIR/audio/voicetrace-welcome.wav" ]; then
    sudo cp "$SCRIPT_DIR/audio/voicetrace-welcome.wav" /var/lib/asterisk/sounds/custom/
    echo "   Copied welcome audio"
fi
echo "✅ Sounds directory ready"

# Step 6: Start Asterisk
echo ""
echo "[6/6] Starting Asterisk..."
echo ""
echo "========================================"
echo " VERIFICATION COMMANDS"
echo " Run these in the Asterisk CLI:"
echo "========================================"
echo ""
echo "  module show like audiosocket"
echo "    → Should show 2 modules (res + app)"
echo ""
echo "  pjsip show endpoints"
echo "    → Should show 'softphone' endpoint"
echo ""
echo "  dialplan show voicetrace-inbound"
echo "    → Should show AudioSocket routing"
echo ""
echo "  exit"
echo "    → To leave Asterisk CLI"
echo ""
echo "Starting Asterisk in foreground (Ctrl+C to stop)..."
echo ""
sudo asterisk -cvvvvv
