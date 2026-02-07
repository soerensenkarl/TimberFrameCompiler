"""Platform wall framing — the standard light timber framing system.

Generates bottom plate, top plate, studs at regular spacing,
and optional mid-height noggings for each wall.
"""

from __future__ import annotations
import math

from generator.rules.base import FramingRule
from generator.models import (
    BuildingContext, TimberMember, MemberType, Point3D,
    direction_from_points,
)


class PlatformWallFramingRule(FramingRule):
    """Standard platform framing: plates + studs + noggings per wall."""

    priority = 50  # Run early — basic wall framing is foundational

    def get_id(self) -> str:
        return "wall.platform_frame"

    def get_name(self) -> str:
        return "Platform Wall Framing"

    def applies(self, context: BuildingContext) -> bool:
        return (
            len(context.walls) > 0
            and context.config.wall_framing == "platform"
        )

    def generate(self, context: BuildingContext) -> list[TimberMember]:
        members: list[TimberMember] = []
        for wall in context.walls:
            members.extend(self._frame_wall(wall.id, wall.start.x, wall.start.z,
                                             wall.end.x, wall.end.z, context))
        return members

    def _frame_wall(
        self,
        wall_id: str,
        sx: float, sz: float,
        ex: float, ez: float,
        context: BuildingContext,
    ) -> list[TimberMember]:
        members: list[TimberMember] = []
        params = context.params

        dx = ex - sx
        dz = ez - sz
        wall_length = math.sqrt(dx * dx + dz * dz)
        if wall_length < 0.01:
            return members

        dir_x = dx / wall_length
        dir_z = dz / wall_length

        sw = params.stud_width
        sd = params.stud_depth
        wh = params.wall_height

        # Bottom plate
        members.append(TimberMember(
            start=Point3D(x=sx, y=0, z=sz),
            end=Point3D(x=ex, y=0, z=ez),
            width=sw, depth=sd,
            type=MemberType.BOTTOM_PLATE,
            wall_id=wall_id,
        ))

        # Top plate
        members.append(TimberMember(
            start=Point3D(x=sx, y=wh - sw, z=sz),
            end=Point3D(x=ex, y=wh - sw, z=ez),
            width=sw, depth=sd,
            type=MemberType.TOP_PLATE,
            wall_id=wall_id,
        ))

        # Double top plate
        if params.double_top_plate:
            members.append(TimberMember(
                start=Point3D(x=sx, y=wh - 2 * sw, z=sz),
                end=Point3D(x=ex, y=wh - 2 * sw, z=ez),
                width=sw, depth=sd,
                type=MemberType.TOP_PLATE,
                wall_id=wall_id,
                tags={"layer": "second"},
            ))

        # Studs
        stud_positions = self._compute_stud_positions(wall_length, params.stud_spacing)
        for t in stud_positions:
            px = sx + dir_x * t
            pz = sz + dir_z * t
            plate_offset = 2 * sw if params.double_top_plate else sw

            members.append(TimberMember(
                start=Point3D(x=px, y=sw, z=pz),
                end=Point3D(x=px, y=wh - plate_offset, z=pz),
                width=sw, depth=sd,
                type=MemberType.STUD,
                wall_id=wall_id,
            ))

        # Noggings
        if params.noggings and len(stud_positions) >= 2:
            nog_y = wh / 2
            for i in range(len(stud_positions) - 1):
                t1, t2 = stud_positions[i], stud_positions[i + 1]
                members.append(TimberMember(
                    start=Point3D(x=sx + dir_x * t1, y=nog_y, z=sz + dir_z * t1),
                    end=Point3D(x=sx + dir_x * t2, y=nog_y, z=sz + dir_z * t2),
                    width=sw, depth=sd,
                    type=MemberType.NOGGING,
                    wall_id=wall_id,
                ))

        return members

    def _compute_stud_positions(self, wall_length: float, spacing: float) -> list[float]:
        positions = [0.0]
        pos = spacing
        while pos < wall_length - 0.01:
            positions.append(pos)
            pos += spacing
        if wall_length - positions[-1] > 0.05:
            positions.append(wall_length)
        return positions
