"""Building element models — walls, openings, floors, etc."""

from __future__ import annotations
from enum import Enum
from pydantic import BaseModel

from .geometry import Point2D


class OpeningType(str, Enum):
    WINDOW = "window"
    DOOR = "door"


class Wall(BaseModel):
    """A wall segment defined by two floor-plane endpoints."""
    id: str
    start: Point2D
    end: Point2D
    openings: list[Opening] = []

    @property
    def length(self) -> float:
        return self.start.distance_to(self.end)


class Opening(BaseModel):
    """An opening (window/door) positioned along a wall."""
    id: str
    type: OpeningType
    offset: float       # Distance from wall start to opening center
    width: float        # Rough opening width (meters)
    height: float       # Rough opening height (meters)
    sill_height: float  # Height from floor to bottom of opening (meters)


class Corner(BaseModel):
    """A detected corner where two walls meet."""
    point: Point2D
    wall_ids: list[str]
    angle: float  # Interior angle in radians
