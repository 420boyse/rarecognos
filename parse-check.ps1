$Errors.Clear()
$AST = [System.Management.Automation.Language.Parser]::ParseFile('audit-parser.ps1', [ref]$null, [ref]$Errors)
if ($Errors.Count -eq 0) {
    'PARSE OK'
} else {
    $Errors | ForEach-Object { $_.ToString() }
}
