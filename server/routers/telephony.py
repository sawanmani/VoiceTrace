import base64
import hashlib
import hmac
import logging
import os
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response as FastAPIResponse

from server.limiter import limiter
from server.sip_config import SIPCredentials, configure_sip, get_sip_status, test_sip

router = APIRouter()
log = logging.getLogger("voicetrace")

@router.get("/api/webrtc/credentials")
async def webrtc_credentials(request: Request):
    """
    Returns ICE servers including dynamically generated TURN credentials if configured.
    """
    turn_secret = os.getenv("TURN_SHARED_SECRET", "")
    host = request.headers.get("host", "localhost").split(":")[0]
    
    servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun.relay.metered.ca:80"},
    ]
    
    if turn_secret:
        # Generate time-limited credentials (valid for 24h)
        timestamp = int(time.time()) + 86400
        username = f"{timestamp}:voicetrace"
        
        mac = hmac.new(
            turn_secret.encode(),
            username.encode(),
            hashlib.sha1
        )
        credential = base64.b64encode(mac.digest()).decode()
        
        servers.append({
            "urls": f"turn:{host}:3478?transport=udp",
            "username": username,
            "credential": credential
        })
        
    return {"iceServers": servers}


@router.post("/api/sip/configure")
@limiter.limit("10/minute")
async def sip_configure(request: Request, creds: SIPCredentials):
    """Save SIP trunk credentials for the free SIP provider."""
    return await configure_sip(creds)


@router.post("/api/sip/test")
@limiter.limit("10/minute")
async def sip_test(request: Request):
    """Test SIP connectivity to the configured provider."""
    return await test_sip()


@router.get("/api/sip/status")
async def sip_status():
    """Check current SIP trunk registration status."""
    return await get_sip_status()


@router.post("/twilio/incoming")
async def twilio_incoming(request: Request):
    """
    Webhook endpoint for Twilio incoming calls.
    Returns TwiML instructing Twilio to stream audio to our WebSocket.

    Fix 3: Optionally validates Twilio request signature when
    TWILIO_VALIDATE_SIGNATURE=true and TWILIO_AUTH_TOKEN are set.
    Gate is off by default so local testing works without a Twilio account.

    Fix 4: wss detection covers ngrok, cloudflared, Railway, Render.
    """
    # Fix 3 — Twilio signature validation (env-gated)
    _validate_sig = os.getenv("TWILIO_VALIDATE_SIGNATURE", "false").lower() == "true"
    if _validate_sig:
        _auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        if not _auth_token:
            raise HTTPException(status_code=500, detail="TWILIO_AUTH_TOKEN not configured")
        try:
            from twilio.request_validator import RequestValidator
            validator = RequestValidator(_auth_token)
            signature = request.headers.get("X-Twilio-Signature", "")
            url = str(request.url)
            form = dict(await request.form())
            if not validator.validate(url, form, signature):
                log.warning("twilio_incoming  invalid Twilio signature from %s", request.client)
                raise HTTPException(status_code=403, detail="Invalid Twilio signature")
        except ImportError:
            log.error("twilio_incoming  TWILIO_VALIDATE_SIGNATURE=true but 'twilio' package not installed")
            raise HTTPException(status_code=500, detail="twilio package required for signature validation")

    host = request.headers.get("host", "localhost:8000")
    scheme = request.headers.get("x-forwarded-proto", "http")
    # Fix 4 — detect wss for all common tunnel/hosting providers
    _wss_hosts = ("ngrok", "trycloudflare", "railway", "render", "fly.io", "herokuapp")
    ws_scheme = "wss" if (
        scheme == "https" or any(h in host for h in _wss_hosts)
    ) else "ws"
    stream_url = f"{ws_scheme}://{host}/ws/twilio"

    # Fix 2 — Use <Connect><Stream> instead of <Start>+<Pause length="60">.
    # <Connect> keeps the call alive for the stream's duration (no hard timeout).
    # <Start>+<Pause length="60"> was hanging up calls after 60 seconds.
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>VoiceTrace active. This call is being monitored for AI voice cloning.</Say>
  <Connect>
    <Stream url="{stream_url}" />
  </Connect>
</Response>"""
    return FastAPIResponse(content=twiml, media_type="application/xml")
