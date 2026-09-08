import asyncio
import json
import jwt
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, WebSocket
from fastapi.responses import JSONResponse

from server.limiter import limiter
from server.middleware import _is_localhost, _API_KEY

_JWT_SECRET = os.getenv("VOICETRACE_JWT_SECRET", _API_KEY)  # Fallback to API key if not set

router = APIRouter()

@router.post("/api/auth/token")
@limiter.limit("20/minute")
async def generate_token(request: Request):
    """Generate a short-lived JWT token for WebSocket authentication."""
    key = request.headers.get("X-Api-Key")
    if not _API_KEY:
        return JSONResponse({"detail": "Server API key not configured"}, status_code=500)
    if key != _API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    payload = {
        "sub": "websocket",
        "exp": datetime.utcnow() + timedelta(minutes=60),
        "iat": datetime.utcnow(),
    }
    token = jwt.encode(payload, _JWT_SECRET, algorithm="HS256")
    return {"token": token}


async def _verify_ws_key_payload(websocket: WebSocket) -> bool:
    """Check JWT from initial WebSocket auth payload or query param."""
    # Use the actual network peer address, NOT the client-controlled Host header.
    client_host = websocket.client.host if websocket.client else None
    if not _API_KEY and _is_localhost(client_host):
        return True

    if not _API_KEY:
        await websocket.close(code=1011, reason="Server API key not configured")
        return False

    token = websocket.query_params.get("token")
    if not token:
        try:
            message = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(message)
            if isinstance(data, dict) and data.get("type") == "auth":
                token = data.get("token")
        except Exception:
            pass

    if token:
        try:
            jwt.decode(token, _JWT_SECRET, algorithms=["HS256"])
            return True
        except jwt.ExpiredSignatureError:
            await websocket.close(code=1008, reason="Token expired")
            return False
        except jwt.InvalidTokenError:
            pass

    await websocket.close(code=1008, reason="Unauthorized")
    return False
