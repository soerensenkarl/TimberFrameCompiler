"""High-level frame generation service — facade for the API layer."""

from __future__ import annotations

from generator.models import (
    Wall, TimberFrame, FrameParams, GenerationConfig,
)
from generator.core.generator import FrameGenerator
from generator.core.registry import RuleRegistry, create_default_registry


class FrameService:
    """Validates input, delegates to the generator, post-processes output."""

    def __init__(self, registry: RuleRegistry | None = None) -> None:
        self.registry = registry or create_default_registry()
        self.generator = FrameGenerator(self.registry)

    def generate(
        self,
        walls: list[Wall],
        params: FrameParams | None = None,
        config: GenerationConfig | None = None,
    ) -> TimberFrame:
        if params is None:
            params = FrameParams()
        if config is None:
            config = GenerationConfig()

        frame = self.generator.generate(walls, params, config)
        return frame

    def list_rules(self) -> list[dict[str, str]]:
        return [
            {"id": r.get_id(), "name": r.get_name()}
            for r in self.registry.list_rules()
        ]
