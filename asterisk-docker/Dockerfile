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

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    asterisk openssl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/asterisk/keys && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/asterisk/keys/asterisk.key \
    -out /etc/asterisk/keys/asterisk.crt \
    -subj "/C=US/ST=State/L=City/O=VoiceTrace/OU=VoiceTrace/CN=asterisk"

# Copy config files (with env var placeholders for SIP trunk)
COPY pjsip.conf /etc/asterisk/pjsip.conf.template
COPY extensions.conf /etc/asterisk/extensions.conf
COPY modules.conf /etc/asterisk/modules.conf

# Copy entrypoint that substitutes SIP credentials at startup
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# SIP (5060 UDP, 5061 TCP for TLS) + RTP range (10000-10100 UDP)
EXPOSE 5060/udp
EXPOSE 5061/tcp
EXPOSE 10000-10100/udp

# Environment variables for free SIP trunk (set in docker-compose.yml)
ENV SIP_PROVIDER_HOST=sip.zadarma.com
ENV SIP_USERNAME=
ENV SIP_PASSWORD=

ENTRYPOINT ["/entrypoint.sh"]
