$ErrorActionPreference = "Stop"
chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$configPath = Join-Path $HOME ".codex\config.toml"
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Missing Codex config: $configPath"
}

$content = Get-Content -Raw -Encoding UTF8 $configPath
$original = $content
$changes = New-Object System.Collections.Generic.List[string]

$pluginIds = @(
  "browser@openai-bundled",
  "chrome@openai-bundled",
  "computer-use@openai-bundled",
  "build-web-apps@openai-curated"
)

foreach ($pluginId in $pluginIds) {
  $pattern = '(?ms)(\[plugins\."' + [regex]::Escape($pluginId) + '"\]\s*`nenabled\s*=\s*)(true|false)'
  $updated = [regex]::Replace($content, $pattern, '$1false', 1)
  if ($updated -ne $content) {
    $content = $updated
    $changes.Add("disabled plugin $pluginId")
  }
}

$backendPattern = '(?m)(BROWSER_USE_AVAILABLE_BACKENDS\s*=\s*)(".*?"|''.*?'')'
$updatedBackends = [regex]::Replace($content, $backendPattern, '$1""', 1)
if ($updatedBackends -ne $content) {
  $content = $updatedBackends
  $changes.Add("cleared BROWSER_USE_AVAILABLE_BACKENDS")
}

$marker = "Codex stability (hard, all projects):"
if ($content -notmatch [regex]::Escape($marker)) {
  $anchor = "Before coding: Read matching SKILL.md from the index; SessionStart/UserPromptSubmit hooks inject Top matches."
  $block = @'

Codex stability (hard, all projects):
- NEVER invoke Browser / IAB / Chrome / Computer Use plugins, @browser, control-in-app-browser, frontend-testing-debugging browser paths, setupBrowserRuntime, agent.browsers, browser.tabs, node_repl browser bootstrap, Start-Process browser, or any in-app Browser pane.
- On Windows, IAB browser-use crashes Codex Desktop (Electron). Treat browser automation as forbidden in Codex.
- UI / layout validation in Codex: npm run verify, Vitest, API inject tests, code review only.
- Rendered UI checks belong in Cursor (Browser MCP / Playwright MCP) or manual browser, not Codex IAB.
'@
  if ($content.Contains($anchor)) {
    $content = $content.Replace($anchor, $anchor + $block)
    $changes.Add("appended Codex stability persistent_instructions")
  }
}

if ($content -eq $original) {
  Write-Host "OK: Codex browser stability guard already applied."
  exit 0
}

[System.IO.File]::WriteAllText($configPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "APPLIED:"
foreach ($item in $changes) {
  Write-Host "- $item"
}
Write-Host "Updated: $configPath"
Write-Host "Restart Codex Desktop before the next thread."
