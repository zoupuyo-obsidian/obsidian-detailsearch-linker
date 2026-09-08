# Create a git commit without AI or agent attribution in author fields or trailers.
param(
	[Parameter(Mandatory = $true)]
	[string]$Repo,
	[string]$MessageFile,
	[string]$Message,
	[string[]]$Paths,
	[switch]$AllowEmpty
)

$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\mingw64\bin\git.exe"
if (-not (Test-Path $git)) { throw "Git not found at $git" }
Set-Location $Repo

if ($MessageFile) {
	$msgPath = (Resolve-Path $MessageFile).Path
} elseif ($Message) {
	$msgPath = Join-Path $Repo ".git\COMMIT_MSG_TMP"
	[System.IO.File]::WriteAllText($msgPath, $Message)
} else {
	throw "Specify -Message or -MessageFile"
}

$hasParent = $false
if ($AllowEmpty) {
	$tree = & $git rev-parse "HEAD^{tree}"
	if ($LASTEXITCODE -ne 0) { throw "rev-parse tree failed" }
	$parent = & $git rev-parse HEAD
	if ($LASTEXITCODE -ne 0) { throw "rev-parse HEAD failed" }
	$hasParent = $true
} else {
	if ($Paths -and $Paths.Count -gt 0) {
		& $git add @Paths
	} else {
		& $git add -A
	}
	$tree = & $git write-tree
	if ($LASTEXITCODE -ne 0) { throw "write-tree failed" }
	$prev = $ErrorActionPreference
	$ErrorActionPreference = "Continue"
	$parent = & $git rev-parse --verify --quiet HEAD 2>$null
	$ErrorActionPreference = $prev
	$hasParent = ($LASTEXITCODE -eq 0) -and ($parent -match '^[0-9a-f]{40}$')
}

if ($AllowEmpty -or $hasParent) {
	$new = & $git commit-tree $tree -p $parent -F $msgPath
} else {
	$new = & $git commit-tree $tree -F $msgPath
}

$new = ($new | Out-String).Trim()
if ($new -notmatch '^[0-9a-f]{40}$') {
	throw "commit-tree failed (expected 40-char SHA, got): $new"
}

& $git reset --hard $new

$forbiddenAttribution = '(?im)^(?:co-authored-by|authored-by|assisted-by):.*\b(?:cursor|cursoragent|gpt|chatgpt|openai|codex)\b|^(?:cursor|cursoragent|gpt|chatgpt|openai|codex)\b'
$hit = & $git log -1 --format="%an <%ae>%n%B" | Select-String $forbiddenAttribution
if ($hit) { throw "AI or agent attribution is present in the commit author or message" }

Write-Host "Created commit $new"
& $git log -1 --oneline
