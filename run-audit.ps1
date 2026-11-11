# Run npm audit --json and capture output with UTF-8 encoding
Set-Location "C:\Users\efeca\Desktop\RareCognos-V2-Production-Verified\RareCognos-V2"

# Redirect stderr to a file, stdout to json
$stderrFile = "audit-error.txt"
$outFile = "audit-critical.json"

# Use a temporary script to capture exit code properly
[System.Diagnostics.Process]::Start("npm", "audit --json"), $null, $null, $stderrFile, $outFile | Out-Null