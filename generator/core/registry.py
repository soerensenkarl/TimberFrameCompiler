"""Rule registry — discovers, stores, and resolves framing rules."""

from __future__ import annotations

from generator.models.context import BuildingContext
from generator.rules.base import FramingRule


class RuleRegistry:
    """
    Central registry for all framing rules.

    Rules are registered at startup. During generation, the registry
    returns the applicable rules sorted by priority with dependencies
    resolved.
    """

    def __init__(self) -> None:
        self._rules: dict[str, FramingRule] = {}

    def register(self, rule: FramingRule) -> None:
        """Register a framing rule."""
        self._rules[rule.get_id()] = rule

    def unregister(self, rule_id: str) -> None:
        """Remove a rule from the registry."""
        self._rules.pop(rule_id, None)

    def get_rule(self, rule_id: str) -> FramingRule | None:
        return self._rules.get(rule_id)

    def list_rules(self) -> list[FramingRule]:
        """Return all registered rules."""
        return list(self._rules.values())

    def get_applicable_rules(self, context: BuildingContext) -> list[FramingRule]:
        """
        Return rules that apply to the given context, sorted by priority.

        Respects GenerationConfig.enabled_rules and disabled_rules.
        """
        config = context.config
        candidates = list(self._rules.values())

        # If enabled_rules is specified, only use those
        if config.enabled_rules:
            candidates = [r for r in candidates if r.get_id() in config.enabled_rules]

        # Remove explicitly disabled rules
        if config.disabled_rules:
            candidates = [r for r in candidates if r.get_id() not in config.disabled_rules]

        # Filter by applies()
        applicable = [r for r in candidates if r.applies(context)]

        # Sort by priority (lower first), then resolve dependencies
        applicable.sort(key=lambda r: r.priority)
        return self._resolve_order(applicable)

    def _resolve_order(self, rules: list[FramingRule]) -> list[FramingRule]:
        """Topological sort respecting dependencies."""
        rule_map = {r.get_id(): r for r in rules}
        visited: set[str] = set()
        ordered: list[FramingRule] = []

        def visit(rule_id: str) -> None:
            if rule_id in visited:
                return
            visited.add(rule_id)
            rule = rule_map.get(rule_id)
            if rule is None:
                return
            for dep_id in rule.dependencies:
                visit(dep_id)
            ordered.append(rule)

        for r in rules:
            visit(r.get_id())

        return ordered


def create_default_registry() -> RuleRegistry:
    """Create a registry with all standard framing rules."""
    from generator.rules.wall.platform_frame import PlatformWallFramingRule

    registry = RuleRegistry()
    registry.register(PlatformWallFramingRule())
    return registry
