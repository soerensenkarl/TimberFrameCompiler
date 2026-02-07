"""Main frame generator — orchestrates analysis and rule execution."""

from __future__ import annotations

from generator.models import (
    Wall, TimberFrame, FrameParams, GenerationConfig, BuildingContext,
)
from generator.core.registry import RuleRegistry
from generator.core.analyzer import WallAnalyzer


class FrameGenerator:
    """
    Stateless frame generator.

    Takes walls + params, runs analysis, executes applicable rules,
    and returns a complete TimberFrame.
    """

    def __init__(self, registry: RuleRegistry) -> None:
        self.registry = registry
        self.analyzer = WallAnalyzer()

    def generate(
        self,
        walls: list[Wall],
        params: FrameParams,
        config: GenerationConfig | None = None,
    ) -> TimberFrame:
        if config is None:
            config = GenerationConfig()

        # Build context
        context = BuildingContext(
            walls=walls,
            params=params,
            config=config,
        )

        # Analysis phase — detect corners, intersections, etc.
        self.analyzer.analyze(context)

        # Generation phase — run applicable rules
        rules = self.registry.get_applicable_rules(context)
        for rule in rules:
            members = rule.generate(context)
            context.add_members(members)

        return TimberFrame(members=context.members)
