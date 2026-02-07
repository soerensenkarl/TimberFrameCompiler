"""Geometric primitives used throughout the generator."""

from __future__ import annotations
import math
from pydantic import BaseModel


class Point2D(BaseModel):
    """Point on the floor plane (X-Z in Three.js convention)."""
    x: float
    z: float

    def distance_to(self, other: Point2D) -> float:
        return math.sqrt((self.x - other.x) ** 2 + (self.z - other.z) ** 2)

    def lerp(self, other: Point2D, t: float) -> Point2D:
        return Point2D(
            x=self.x + (other.x - self.x) * t,
            z=self.z + (other.z - self.z) * t,
        )

    def __add__(self, other: Point2D) -> Point2D:
        return Point2D(x=self.x + other.x, z=self.z + other.z)

    def __sub__(self, other: Point2D) -> Point2D:
        return Point2D(x=self.x - other.x, z=self.z - other.z)

    def __mul__(self, scalar: float) -> Point2D:
        return Point2D(x=self.x * scalar, z=self.z * scalar)


class Point3D(BaseModel):
    """Point in 3D space."""
    x: float
    y: float
    z: float

    def distance_to(self, other: Point3D) -> float:
        return math.sqrt(
            (self.x - other.x) ** 2
            + (self.y - other.y) ** 2
            + (self.z - other.z) ** 2
        )

    def lerp(self, other: Point3D, t: float) -> Point3D:
        return Point3D(
            x=self.x + (other.x - self.x) * t,
            y=self.y + (other.y - self.y) * t,
            z=self.z + (other.z - self.z) * t,
        )


class Vector2D(BaseModel):
    """2D vector for direction calculations on the floor plane."""
    x: float
    z: float

    def length(self) -> float:
        return math.sqrt(self.x * self.x + self.z * self.z)

    def normalized(self) -> Vector2D:
        ln = self.length()
        if ln < 1e-10:
            return Vector2D(x=0.0, z=0.0)
        return Vector2D(x=self.x / ln, z=self.z / ln)

    def perpendicular(self) -> Vector2D:
        """90-degree counterclockwise rotation."""
        return Vector2D(x=-self.z, z=self.x)

    def dot(self, other: Vector2D) -> float:
        return self.x * other.x + self.z * other.z

    def angle_to(self, other: Vector2D) -> float:
        """Angle between two vectors in radians."""
        d = self.dot(other) / (self.length() * other.length() + 1e-10)
        d = max(-1.0, min(1.0, d))
        return math.acos(d)

    def __mul__(self, scalar: float) -> Vector2D:
        return Vector2D(x=self.x * scalar, z=self.z * scalar)


def direction_from_points(start: Point2D, end: Point2D) -> Vector2D:
    """Get direction vector from start to end."""
    return Vector2D(x=end.x - start.x, z=end.z - start.z)
