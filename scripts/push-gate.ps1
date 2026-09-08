# Fail if HEAD (or --all) contains AI or agent attribution. Run before every push.
param(
	[string]$Repo = (Split-Path -Parent $PSScriptRoot),
	[switch]$All
)
$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\mingw64\bin\git.exe"
if (-not (Test-Path $git)) { throw "Git not found at $git" }

$sha = & $git -C $Repo rev-parse HEAD
$sha = ($sha | Out-String).Trim()
if ($sha -notmatch '^[0-9a-f]{40}$') { throw "invalid HEAD: $sha" }

$range = if ($All) { "--all" } else { "-1" }
$forbiddenAttribution = '(?im)^(?:co-authored-by|authored-by|assisted-by):.*\b(?:cursor|cursoragent|gpt|chatgpt|openai|codex)\b|^(?:cursor|cursoragent|gpt|chatgpt|openai|codex)\b'
$bad = & $git -C $Repo log $range --format="%an <%ae>%n%B" | Select-String $forbiddenAttribution
if ($bad) { throw "STOP: AI or agent attribution found. Recreate the commit with scripts/commit-clean.ps1" }

Write-Host "push-gate ok HEAD=$sha"
