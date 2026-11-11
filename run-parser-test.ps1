$err = & .\audit-parser.ps1 -InputFile .\audit-critical.json -OutputFile .\audit-parse-output.txt 2>&1
Write-Host 'LASTEXITCODE:' $LASTEXITCODE
Write-Host '---ERROR---'
Write-Host $err
