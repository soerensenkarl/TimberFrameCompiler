"""Geometric analysis — corner detection, wall intersections, etc."""

from __future__ import annotations
import math

from generator.models import BuildingContext, Corner, Point2D


TOLERANCE = 0.01  # 10mm tolerance for point matching


class WallAnalyzer:
    """Analyzes walls to detect corners, T-junctions, and intersections."""

    def analyze(self, context: BuildingContext) -> None:
        """Run all analysis passes and populate the context."""
        context.corners = self._detect_corners(context)

    def _detect_corners(self, context: BuildingContext) -> list[Corner]:
        """Detect points where two or more wall endpoints meet."""
        corners: list[Corner] = []
        walls = context.walls

        # Group wall endpoints by proximity
        endpoint_map: dict[str, list[tuple[str, Point2D, bool]]] = {}

        for wall in walls:
            for is_end, pt in [(False, wall.start), (True, wall.end)]:
                key = self._snap_key(pt)
                if key not in endpoint_map:
                    endpoint_map[key] = []
                endpoint_map[key].append((wall.id, pt, is_end))

        # Where 2+ walls share an endpoint, it's a corner
        for key, endpoints in endpoint_map.items():
            if len(endpoints) < 2:
                continue

            wall_ids = list(set(ep[0] for ep in endpoints))
            avg_pt = Point2D(
                x=sum(ep[1].x for ep in endpoints) / len(endpoints),
                z=sum(ep[1].z for ep in endpoints) / len(endpoints),
            )

            # Compute angle between the two wall directions at this corner
            angle = self._compute_corner_angle(context, wall_ids, avg_pt)

            corners.append(Corner(
                point=avg_pt,
                wall_ids=wall_ids,
                angle=angle,
            ))

        return corners

    def _snap_key(self, pt: Point2D) -> str:
        """Snap to grid for grouping nearby points."""
        sx = round(pt.x / TOLERANCE) * TOLERANCE
        sz = round(pt.z / TOLERANCE) * TOLERANCE
        return f"{sx:.3f},{sz:.3f}"

    def _compute_corner_angle(
        self, context: BuildingContext, wall_ids: list[str], corner_pt: Point2D,
    ) -> float:
        """Compute the interior angle at a corner between walls."""
        if len(wall_ids) < 2:
            return math.pi

        directions: list[tuple[float, float]] = []
        for wid in wall_ids[:2]:
            wall = context.get_wall(wid)
            if wall is None:
                continue
            # Direction pointing away from the corner
            if wall.start.distance_to(corner_pt) < TOLERANCE:
                dx, dz = wall.end.x - wall.start.x, wall.end.z - wall.start.z
            else:
                dx, dz = wall.start.x - wall.end.x, wall.start.z - wall.end.z
            ln = math.sqrt(dx * dx + dz * dz)
            if ln > 1e-10:
                directions.append((dx / ln, dz / ln))

        if len(directions) < 2:
            return math.pi

        d1, d2 = directions[0], directions[1]
        dot = d1[0] * d2[0] + d1[1] * d2[1]
        dot = max(-1.0, min(1.0, dot))
        return math.acos(dot)
