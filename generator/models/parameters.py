"""Frame generation parameters and configuration."""

from __future__ import annotations
from pydantic import BaseModel


class FrameParams(BaseModel):
    """User-adjustable parameters for frame generation."""
    stud_spacing: float = 0.6       # Center-to-center in meters (600mm)
    wall_height: float = 2.4        # Meters
    stud_width: float = 0.045       # Cross-section narrow face (45mm)
    stud_depth: float = 0.095       # Cross-section wide face (95mm)
    noggings: bool = True           # Generate mid-height noggings
    double_top_plate: bool = False  # Double top plate (common in N. America)


class GenerationConfig(BaseModel):
    """Controls which rules and strategies are applied."""
    wall_framing: str = "platform"       # platform | balloon | advanced
    corner_treatment: str = "butt"       # butt | three_stud | california
    enabled_rules: list[str] = []        # Empty = use all registered defaults
    disabled_rules: list[str] = []       # Explicitly disable specific rules
