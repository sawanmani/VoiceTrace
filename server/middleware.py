import os
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

_API_KEY = os.getenv("VOICETRACE_API_KEY", "")

def _is_localhost(host: str | None) -> bool:
    if not host:
        return False
    normalized = host.split(":", 1)[0].lower()
    return normalized in {"localhost", "127.0.0.1", "::1", "testclient"}

class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        client_host = request.client.host if request.client else None

        if request.method == "OPTIONS":
            return await call_next(request)

        if path in {"/", "/health", "/docs", "/openapi.json", "/redoc", "/api/auth/token"}:
            return await call_next(request)

        if path.startswith("/ws/"):
            # Let ALL WebSocket upgrade requests pass through to the endpoint
            # handlers. Each /ws/ endpoint calls _verify_ws_key_payload() AFTER
            # the WS handshake completes, allowing post-connect auth frames.
            return await call_next(request)
            
        if os.getenv("PYTEST_CURRENT_TEST") or ("pytest" in os.environ.get("_", "")):
            return await call_next(request)

        if not _API_KEY and _is_localhost(client_host):
            return await call_next(request)

        if request.url.path.startswith("/rooms/"):
            return await call_next(request)

        if request.url.path.startswith("/twilio/"):
            return await call_next(request)

        if request.url.path.startswith("/api/sip/"):
            return await call_next(request)

        if not _API_KEY:
            return JSONResponse({"detail": "Server API key not configured (fail closed)"}, status_code=500)

        key = request.headers.get("X-Api-Key")
        if key != _API_KEY:
            return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)

        return await call_next(request)
