"""FastAPI route definitions."""

from __future__ import annotations

from fastapi import APIRouter

from generator.models import Wall
from generator.services.frame_service import FrameService
from generator.api.schemas import (
    GenerateRequest, GenerateResponse, RuleInfo,
)

router = APIRouter()

# Shared service instance
_service = FrameService()


@router.post("/generate", response_model=GenerateResponse)
async def generate_frame(request: GenerateRequest) -> GenerateResponse:
    """Generate a timber frame from walls and parameters."""
    walls = [
        Wall(id=w.id, start=w.start, end=w.end)
        for w in request.walls
    ]

    frame = _service.generate(walls, request.params, request.config)

    return GenerateResponse(
        frame=frame,
        rule_count=len(_service.list_rules()),
        wall_count=len(walls),
    )


@router.get("/rules", response_model=list[RuleInfo])
async def list_rules() -> list[RuleInfo]:
    """List all available framing rules."""
    return [RuleInfo(**r) for r in _service.list_rules()]


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
