"""Building context — accumulates state during frame generation."""

from __future__ import annotations
from pydantic import BaseModel, Field

from .building import Wall, Corner
from .framing import TimberMember
from .parameters import FrameParams, GenerationConfig


class BuildingContext(BaseModel):
    """
    Holds all state during a single frame generation pass.

    Analyzers add metadata (corners, intersections).
    Rules add generated members.
    The generator orchestrates the flow.
    """
    # Input
    walls: list[Wall]
    params: FrameParams
    config: GenerationConfig = Field(default_factory=GenerationConfig)

    # Analysis results (populated by analyzers)
    corners: list[Corner] = []

    # Output (populated by rules)
    members: list[TimberMember] = []

    def add_member(self, member: TimberMember) -> None:
        self.members.append(member)

    def add_members(self, members: list[TimberMember]) -> None:
        self.members.extend(members)

    def get_wall(self, wall_id: str) -> Wall | None:
        for w in self.walls:
            if w.id == wall_id:
                return w
        return None
