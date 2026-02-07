"""Timber framing output models."""

from __future__ import annotations
from enum import Enum
from pydantic import BaseModel

from .geometry import Point3D


class MemberType(str, Enum):
    STUD = "stud"
    BOTTOM_PLATE = "bottom_plate"
    TOP_PLATE = "top_plate"
    NOGGING = "nogging"
    KING_STUD = "king_stud"
    JACK_STUD = "jack_stud"
    CRIPPLE_STUD = "cripple_stud"
    HEADER = "header"
    SILL = "sill"
    JOIST = "joist"
    RIM_JOIST = "rim_joist"
    BLOCKING = "blocking"
    RAFTER = "rafter"
    RIDGE_BEAM = "ridge_beam"
    COLLAR_TIE = "collar_tie"


class TimberMember(BaseModel):
    """A single piece of timber positioned in 3D space."""
    start: Point3D
    end: Point3D
    width: float    # Cross-section narrow face (meters)
    depth: float    # Cross-section wide face (meters)
    type: MemberType
    wall_id: str = ""
    tags: dict[str, str] = {}  # Extensible metadata (rule that created it, etc.)


class TimberFrame(BaseModel):
    """The complete generated timber frame."""
    members: list[TimberMember]
    stats: FrameStats = None  # type: ignore[assignment]

    def model_post_init(self, __context: object) -> None:
        if self.stats is None:
            self.stats = FrameStats.from_members(self.members)


class FrameStats(BaseModel):
    """Summary statistics for a generated frame."""
    total_members: int = 0
    studs: int = 0
    plates: int = 0
    noggings: int = 0
    other: int = 0

    @classmethod
    def from_members(cls, members: list[TimberMember]) -> FrameStats:
        studs = sum(1 for m in members if m.type == MemberType.STUD)
        plates = sum(1 for m in members if m.type in (MemberType.BOTTOM_PLATE, MemberType.TOP_PLATE))
        noggings = sum(1 for m in members if m.type == MemberType.NOGGING)
        return cls(
            total_members=len(members),
            studs=studs,
            plates=plates,
            noggings=noggings,
            other=len(members) - studs - plates - noggings,
        )
