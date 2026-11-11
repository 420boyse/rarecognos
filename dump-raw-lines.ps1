cd C:\Users\efeca\Desktop\RareCognos-V2-Production-Verified\RareCognos-V2
$indices = @(133,134,135,136,144,145,146,147,154,155,156,157,241,242,243,244,254,255,256,257,258,259)
$all = Get-Content audit-parser.ps1 -Encoding UTF8
foreach ($i in $indices) {
    if ($i -lt $all.Length) {
        $line = $all[$i]
        $hex = [System.BitConverter]::ToString([System.Text.Encoding]::UTF8.GetBytes($line)) -replace '-', ' '
        Write-Host "INDEX $([int]$i).PadLeft(3,'0') LEN $([int]$line.Length).PadLeft(4,'0') : $hex"
        Write-Host "RAW  : $line"
    }
}
