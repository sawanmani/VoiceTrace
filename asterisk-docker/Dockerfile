# VoiceTrace — Free Phone Call via Asterisk + Docker
#
# Architecture:
#   Phone (real/softphone) → SIP → Asterisk (Docker) → AudioSocket TCP → VoiceTrace
#
# TWO modes:
#   1. LOCAL: MicroSIP softphone → SIP → Asterisk (no internet needed)
#   2. FREE SIP TRUNK: Real phone → PSTN → Free SIP provider → Asterisk
#
# All free. No Twilio needed.

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    asterisk \
    && rm -rf /var/lib/apt/lists/*

# Copy config files (with env var placeholders for SIP trunk)
COPY pjsip.conf /etc/asterisk/pjsip.conf.template
COPY extensions.conf /etc/asterisk/extensions.conf
COPY modules.conf /etc/asterisk/modules.conf

# Copy entrypoint that substitutes SIP credentials at startup
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# SIP (5060 UDP) + RTP range (10000-10100 UDP)
EXPOSE 5060/udp
EXPOSE 10000-10100/udp

# Environment variables for free SIP trunk (set in docker-compose.yml)
ENV SIP_PROVIDER_HOST=sip.zadarma.com
ENV SIP_USERNAME=
ENV SIP_PASSWORD=

ENTRYPOINT ["/entrypoint.sh"]
