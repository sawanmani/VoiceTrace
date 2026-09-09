from fastapi import APIRouter
from server.schemas import HealthResponse
from server.connection_manager import manager

router = APIRouter()

@router.get("/")
async def root():
    return {
        "status": "ok",
        "service": "VoiceTrace",
        "docs": "/docs",
        "health": "/health",
    }

@router.get("/health")
async def health(extended: bool = False):
    if extended:
        from server.health_extended import get_system_status
        return await get_system_status()
        
    from server.pubsub import broker
    from server._model_cache import get_aasist
    active_calls = await broker.get_active_calls()
    model_loaded = get_aasist() is not None
    return HealthResponse(
        status="ok" if model_loaded else "degraded — AASIST checkpoint missing",
        active_calls=active_calls,
        dashboard_subscribers=len(manager.global_subscribers),
        model="AASIST-L" if model_loaded else "not loaded",
    )

@router.get("/api/config")
async def get_config():
    """Exposes risk thresholds to sync frontend UI with backend configuration."""
    from server.config import THRESHOLD_UNCERTAIN, THRESHOLD_MEDIUM, THRESHOLD_HIGH
    return {
        "thresholds": {
            "uncertain": THRESHOLD_UNCERTAIN,
            "medium": THRESHOLD_MEDIUM,
            "high": THRESHOLD_HIGH,
        }
    }
