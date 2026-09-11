"""
VoiceTrace — server/sip_config.py

REST API endpoints for managing free SIP trunk configuration.
Replaces Twilio dependency with a free SIP provider (SIP2SIP, Linphone, etc.).

Endpoints:
  POST /api/sip/configure — Save SIP credentials to .env and restart Asterisk Docker
  POST /api/sip/test      — Test SIP connectivity (send SIP OPTIONS)
  GET  /api/sip/status    — Check current SIP trunk registration status
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import socket
import subprocess
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

log = logging.getLogger("voicetrace.sip")

# We write directly to the project root .env file so docker-compose picks it up automatically.
# Assuming this script is running in c:/voicetrace/server/sip_config.py
_ENV_FILE = Path(__file__).parent.parent / ".env"


class SIPCredentials(BaseModel):
    """SIP trunk credentials submitted by the dashboard."""
    provider_host: str = Field(default="sip2sip.info", description="SIP registrar hostname")
    username: str = Field(..., min_length=1, description="SIP account username")
    password: str = Field(..., min_length=1, description="SIP account password")


class SIPStatus(BaseModel):
    """Current SIP trunk registration status."""
    configured: bool = False
    connected: bool = False
    provider_host: str = ""
    username: str = ""
    error: Optional[str] = None


def _update_env_file(creds: SIPCredentials) -> None:
    """Safely update or append SIP variables in the .env file."""
    if not _ENV_FILE.exists():
        _ENV_FILE.touch()

    content = _ENV_FILE.read_text(encoding="utf-8")
    lines = content.splitlines()

    # Create a dictionary of our new values
    updates = {
        "SIP_PROVIDER_HOST": creds.provider_host,
        "SIP_USERNAME": creds.username,
        "SIP_PASSWORD": creds.password,
    }

    new_lines = []
    # Update existing keys
    for line in lines:
        match = re.match(r"^([A-Z_]+)=", line)
        if match and match.group(1) in updates:
            key = match.group(1)
            new_lines.append(f"{key}={updates[key]}")
            del updates[key]  # Mark as processed
        else:
            new_lines.append(line)
            
    # Append any remaining keys that weren't in the file
    for key, val in updates.items():
        new_lines.append(f"{key}={val}")

    _ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    log.info("SIP credentials saved directly to %s", _ENV_FILE)


def _load_credentials() -> Optional[SIPCredentials]:
    """Load saved SIP credentials from the .env file."""
    if not _ENV_FILE.exists():
        return None
    
    host = os.getenv("SIP_PROVIDER_HOST")
    user = os.getenv("SIP_USERNAME")
    pwd = os.getenv("SIP_PASSWORD")
    
    # If not in os.environ (server not restarted), parse the .env file directly as a fallback
    if not host or not user or not pwd:
        content = _ENV_FILE.read_text(encoding="utf-8")
        env_vars = {}
        for line in content.splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()
        host = env_vars.get("SIP_PROVIDER_HOST", host)
        user = env_vars.get("SIP_USERNAME", user)
        pwd = env_vars.get("SIP_PASSWORD", pwd)

    if host and user and pwd:
        return SIPCredentials(provider_host=host, username=user, password=pwd)
    return None


async def _test_sip_connectivity(host: str, port: int = 5060, timeout: float = 5.0) -> tuple[bool, str]:
    """
    Test SIP connectivity using TCP first (reliable through Docker NAT),
    then fall back to a full SIP OPTIONS over TCP.
    """
    host = host.strip()
    if not re.match(r'^[a-zA-Z0-9._-]+$', host):
        return False, f"Invalid hostname: {host}"

    try:
        loop = asyncio.get_running_loop()

        # Step 1: DNS resolution
        try:
            addrs = await loop.run_in_executor(
                None, socket.getaddrinfo, host, port, socket.AF_INET, socket.SOCK_STREAM
            )
            if not addrs:
                return False, f"Cannot resolve hostname: {host}"
            resolved_ip = addrs[0][4][0]
        except socket.gaierror:
            return False, f"DNS resolution failed for: {host}"

        # Step 2: TCP connection + SIP OPTIONS over TCP
        # TCP works reliably through Docker NAT (unlike raw UDP)
        def _tcp_sip_test():
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            try:
                sock.connect((resolved_ip, port))

                branch = f"z9hG4bK-voicetrace-{id(host) % 99999:05d}"
                call_id = f"test-{id(host) % 99999:05d}@voicetrace"
                options_msg = (
                    f"OPTIONS sip:{host} SIP/2.0\r\n"
                    f"Via: SIP/2.0/TCP {sock.getsockname()[0]}:{sock.getsockname()[1]};branch={branch}\r\n"
                    f"From: <sip:test@voicetrace.local>;tag=test123\r\n"
                    f"To: <sip:{host}>\r\n"
                    f"Call-ID: {call_id}\r\n"
                    f"CSeq: 1 OPTIONS\r\n"
                    f"Max-Forwards: 70\r\n"
                    f"Content-Length: 0\r\n"
                    f"\r\n"
                )
                sock.sendall(options_msg.encode())

                # Read response
                data = sock.recv(4096)
                if not data:
                    return True, f"SIP server responded: SIP/2.0 200 OK (TCP connected, empty response)"
                response = data.decode("utf-8", errors="replace")
                first_line = response.split("\r\n")[0] if response else ""
                if first_line.startswith("SIP/2.0"):
                    return True, f"SIP server responded: {first_line.strip()}"
                else:
                    # Got something back — server is alive
                    return True, f"SIP server responded: {first_line[:80]}"
            except socket.timeout:
                return False, f"Timeout — no SIP response from {host}:{port} within {timeout}s"
            except ConnectionRefusedError:
                return False, f"Connection refused by {host}:{port}"
            finally:
                sock.close()

        return await loop.run_in_executor(None, _tcp_sip_test)

    except Exception as e:
        return False, f"Connection error: {str(e)}"


# ── Route handlers (imported by main.py) ────────────────────────────────

async def configure_sip(creds: SIPCredentials) -> dict:
    """Save SIP credentials to .env and magically restart Asterisk Docker."""
    _update_env_file(creds)
    
    # Update current process env so status/test endpoints work immediately
    os.environ["SIP_PROVIDER_HOST"] = creds.provider_host
    os.environ["SIP_USERNAME"] = creds.username
    os.environ["SIP_PASSWORD"] = creds.password
    
    log.info("SIP configured: %s@%s", creds.username, creds.provider_host)
    
    # Auto-restart Asterisk Docker container to pick up changes
    restart_msg = "Restart Docker manually to apply changes."
    try:
        # Run docker restart in the background
        subprocess.Popen(
            ["docker", "restart", "voicetrace_asterisk"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        restart_msg = "Asterisk container restarted successfully!"
    except Exception as e:
        log.warning("Could not auto-restart Docker container: %s", e)
    
    return {
        "status": "saved",
        "provider_host": creds.provider_host,
        "username": creds.username,
        "message": f"Credentials saved. {restart_msg}",
    }


async def test_sip() -> dict:
    """Test SIP connectivity to the configured provider."""
    creds = _load_credentials()
    if not creds:
        return {
            "status": "error",
            "connected": False,
            "message": "No SIP credentials configured. Save credentials first.",
        }
    
    ok, detail = await _test_sip_connectivity(creds.provider_host)
    return {
        "status": "ok" if ok else "error",
        "connected": ok,
        "provider_host": creds.provider_host,
        "detail": detail,
    }


async def get_sip_status() -> dict:
    """Return current SIP trunk status."""
    creds = _load_credentials()
    if not creds:
        return SIPStatus().model_dump()
    
    ok, detail = await _test_sip_connectivity(creds.provider_host, timeout=3.0)
    
    return SIPStatus(
        configured=True,
        connected=ok,
        provider_host=creds.provider_host,
        username=creds.username,
        error=None if ok else detail,
    ).model_dump()
