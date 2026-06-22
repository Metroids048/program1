#!/usr/bin/env python3
"""Ensure Codex Desktop browser plugins stay disabled (Windows IAB crash guard)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

CODEX_CONFIG = Path.home() / ".codex" / "config.toml"

PLUGIN_FALSE_TARGETS = (
    'browser@openai-bundled',
    'chrome@openai-bundled',
    'computer-use@openai-bundled',
    'build-web-apps@openai-curated',
)

STABILITY_MARKER = "Codex stability (hard, all projects):"


def set_plugin_enabled(content: str, plugin_id: str, enabled: bool) -> tuple[str, bool]:
    pattern = rf'(\[plugins\."{re.escape(plugin_id)}"\]\s*\nenabled\s*=\s*)(true|false)'
    replacement = rf"\g<1>{'true' if enabled else 'false'}"
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.IGNORECASE)
    if count:
        return updated, True
    return content, False


def set_browser_backends_empty(content: str) -> tuple[str, bool]:
    pattern = r'(BROWSER_USE_AVAILABLE_BACKENDS\s*=\s*)(".*?"|\'.*?\')'
    updated, count = re.subn(pattern, r'\1""', content, count=1)
    return updated, count > 0


def ensure_persistent_instructions(content: str) -> tuple[str, bool]:
    if STABILITY_MARKER in content:
        return content, False

    block = """

Codex stability (hard, all projects):
- NEVER invoke Browser / IAB / Chrome / Computer Use plugins, @browser, control-in-app-browser, frontend-testing-debugging browser paths, setupBrowserRuntime, agent.browsers, browser.tabs, node_repl browser bootstrap, Start-Process browser, or any in-app Browser pane.
- On Windows, IAB browser-use crashes Codex Desktop (Electron). Treat browser automation as forbidden in Codex.
- UI / layout validation in Codex: npm run verify, Vitest, API inject tests, code review only.
- Rendered UI checks belong in Cursor (Browser MCP / Playwright MCP) or manual browser, not Codex IAB.
"""
    marker = 'Before coding: Read matching SKILL.md from the index; SessionStart/UserPromptSubmit hooks inject Top matches.'
    if marker not in content:
        return content, False
    updated = content.replace(marker, marker + block, 1)
    return updated, True


def main() -> int:
    if not CODEX_CONFIG.is_file():
        print(f"MISSING: {CODEX_CONFIG}")
        return 1

    original = CODEX_CONFIG.read_text(encoding="utf-8")
    content = original
    changes: list[str] = []

    for plugin_id in PLUGIN_FALSE_TARGETS:
        content, changed = set_plugin_enabled(content, plugin_id, False)
        if changed:
            changes.append(f"disabled plugin {plugin_id}")

    content, changed = set_browser_backends_empty(content)
    if changed:
        changes.append("cleared BROWSER_USE_AVAILABLE_BACKENDS")

    content, changed = ensure_persistent_instructions(content)
    if changed:
        changes.append("appended Codex stability persistent_instructions")

    if content == original:
        print("OK: Codex browser stability guard already applied.")
        return 0

    CODEX_CONFIG.write_text(content, encoding="utf-8", newline="\n")
    print("APPLIED:")
    for item in changes:
        print(f"- {item}")
    print(f"Updated: {CODEX_CONFIG}")
    print("Restart Codex Desktop before the next thread.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
