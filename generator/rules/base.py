"""Abstract base class for all framing rules.

Every rule in the system implements this interface. Rules are:
- Self-contained: each generates a specific type of framing members
- Composable: multiple rules run in sequence via the registry
- Conditional: each rule decides if it applies to the current context
"""

from __future__ import annotations
from abc import ABC, abstractmethod

from generator.models.context import BuildingContext
from generator.models.framing import TimberMember


class FramingRule(ABC):
    """
    Base class for all framing rules.

    Subclasses implement `applies()` and `generate()`.
    The generator queries the registry, filters by `applies()`,
    sorts by `priority`, and calls `generate()` in order.
    """

    # Lower priority = runs first. Default 100.
    priority: int = 100

    # IDs of rules that must run before this one.
    dependencies: list[str] = []

    @abstractmethod
    def get_id(self) -> str:
        """Unique identifier for this rule (e.g., 'wall.platform_frame')."""
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Human-readable name (e.g., 'Platform Wall Framing')."""
        ...

    @abstractmethod
    def applies(self, context: BuildingContext) -> bool:
        """Return True if this rule should run for the given context."""
        ...

    @abstractmethod
    def generate(self, context: BuildingContext) -> list[TimberMember]:
        """
        Generate timber members for the given context.

        The context provides walls, params, and any analysis results
        (corners, intersections) from earlier phases.
        """
        ...
