"""API request/response schemas."""

from __future__ import annotations
from pydantic import BaseModel

from generator.models import (
    FrameParams, GenerationConfig, TimberFrame,
)
from generator.models.geometry import Point2D


class WallInput(BaseModel):
    """Wall as sent from the frontend."""
    id: str
    start: Point2D
    end: Point2D


class GenerateRequest(BaseModel):
    """Request body for the /generate endpoint."""
    walls: list[WallInput]
    params: FrameParams = FrameParams()
    config: GenerationConfig = GenerationConfig()


class GenerateResponse(BaseModel):
    """Response from the /generate endpoint."""
    frame: TimberFrame
    rule_count: int
    wall_count: int


class RuleInfo(BaseModel):
    id: str
    name: str
