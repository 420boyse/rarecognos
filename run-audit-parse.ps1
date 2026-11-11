# Wrapper to run audit-parser.ps1 cleanly on PowerShell 5.1 and capture errors.
# Usage: .\run-audit-parse.ps1
#
# IMPORTANT: Do NOT call the parser via powershell.exe -Command "& <script>...",
# that invocation form is rejected. Always run the parser through a separate
# .ps1 wrapper and capture $err and LASTEXITCODE here.

$ThisDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Parser = Join-Path $ThisDir "audit-parser.ps1"
$ErrFile = Join-Path $ThisDir "audit-error.txt"

# Ensure parser exists
if (-not (Test-Path $Parser)) {
    Write-Error "Parser not found: $Parser"
    exit 1
}

# Run the parser as a child process within this script, capturing stderr to $ErrFile
$output = & $Parser 2>$ErrFile
$exitCode = $LASTEXITCODE

$errContent = Get-Content -Path $ErrFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue

if ($exitCode -ne 0 -or ($errContent -and $errContent -ne "")) {
    Write-Error "Parser failed."
    Write-Error "Exit code: $exitCode"
    Write-Output $errContent
    exit $exitCode
}

Write-Output $output
Write-Output "SUCCESS: parser completed with exit code $exitCode"
Write-Output "Stderr was empty."
exit 0
