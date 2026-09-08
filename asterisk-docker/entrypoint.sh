#!/bin/bash
# VoiceTrace — Asterisk Docker Entrypoint
#
# Substitutes SIP trunk credentials from environment variables into
# the PJSIP config at container startup. This lets users configure
# their free SIP provider via docker-compose.yml or .env without
# editing Asterisk config files directly.

set -e

PJSIP_CONF="/etc/asterisk/pjsip.conf"
PJSIP_TEMPLATE="/etc/asterisk/pjsip.conf.template"

# Copy from template to ensure fresh placeholders on every restart
cp "$PJSIP_TEMPLATE" "$PJSIP_CONF"

# ── Substitute SIP credentials ──────────────────────────────────────
# Default values if env vars are not set
SIP_PROVIDER_HOST="${SIP_PROVIDER_HOST:-sip2sip.info}"
SIP_USERNAME="${SIP_USERNAME:-}"
SIP_PASSWORD="${SIP_PASSWORD:-}"

if [ -n "$SIP_USERNAME" ] && [ -n "$SIP_PASSWORD" ]; then
    echo "[entrypoint] Configuring SIP trunk: $SIP_USERNAME@$SIP_PROVIDER_HOST"
    
    # Use sed to replace placeholders in pjsip.conf
    sed -i "s|\${SIP_PROVIDER_HOST}|${SIP_PROVIDER_HOST}|g" "$PJSIP_CONF"
    sed -i "s|\${SIP_USERNAME}|${SIP_USERNAME}|g" "$PJSIP_CONF"
    sed -i "s|\${SIP_PASSWORD}|${SIP_PASSWORD}|g" "$PJSIP_CONF"
    
    echo "[entrypoint] SIP trunk configured successfully"
else
    echo "[entrypoint] No SIP credentials provided (SIP_USERNAME/SIP_PASSWORD empty)"
    echo "[entrypoint] SIP trunk disabled — softphone-only mode"
    
    # Comment out the entire trunk section so Asterisk doesn't complain
    # about empty auth credentials
    sed -i '/^\[sip-trunk/,/^$/s/^/;/' "$PJSIP_CONF"
    
    echo "[entrypoint] Trunk sections commented out"
fi

echo "[entrypoint] Starting Asterisk..."
exec asterisk -fvvv
