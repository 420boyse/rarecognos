param($path = "audit-critical.json")

$raw = Get-Content $path -Raw -ErrorAction Stop
$lines = $raw -split "`r`n" | Where-Object { $_.Length -gt 0 }
$root = $lines[0]
$json = $lines | ForEach-Object { $_ } | Out-String
$jsonData = $json | ConvertFrom-Json

Write-Output "=== audit auditLevel: $($jsonData.auditLevel) ==="
Write-Output "Total vulnerabilities: $($jsonData.vulnerabilities.Count)"
Write-Output ""

$byCwe = @{}
$bySeverity = @{}
$byAdvisoryId = @{}
$hasDirect = $false

foreach ($id in $jsonData.vulnerabilities.Keys) {
    $v = $jsonData.vulnerabilities[$id]
    $sev = $v.severity
    $mod = $v.moduleName

    if (-not $bySeverity.ContainsKey($sev)) { $bySeverity[$sev] = 0 }
    $bySeverity[$sev]++

    $cwe = $v.cwe
    if ($cwe) {
        if (-not $byCwe.ContainsKey($cwe)) { $byCwe[$cwe] = @{ "Count" = 0; "Advisories" = @() } }
        $byCwe[$cwe].Count++
        if ($byCwe[$cwe].Advisories -notcontains $v.advisoryId) { $byCwe[$cwe].Advisories += $v.advisoryId }
    }

    if (-not $byAdvisoryId.ContainsKey($v.advisoryId)) {
        $byAdvisoryId[$v.advisoryId] = @{
            "Count" = 0
            "Modules" = @{}
            "Severity" = $sev
            "Direct" = $v.direct
            "Dependents" = @($v.dependents)
            "PatchedIn" = $v.patchedVersions
            "VulnerableVersions" = $v.vulnerableVersions
        }
    }
    $byAdvisoryId[$v.advisoryId]["Count"]++
    $byAdvisoryId[$v.advisoryId]["Modules"][$mod] = $true
    if ($v.direct) { $hasDirect = $true }
}

Write-Output "--- By severity ---"
foreach ($k in ($bySeverity.GetEnumerator() | Sort-Object -Property Value -Descending)) {
    Write-Output "$($k.Key): $($k.Value)"
}
Write-Output ""

Write-Output "--- Unique CVE advisories ($($byAdvisoryId.Count)) ---"
foreach ($a in $byAdvisoryId.Keys | Sort-Object) {
    $v = $byAdvisoryId[$a]
    $d = if ($v["Direct"]) { "DIRECT" } else { "transitive" }
    Write-Output "[$d] $a  $($v.Severity)  modules: $($v.Modules.Keys -join ', ')"
    if ($v["VulnerableVersions"]) { Write-Output "       vulnerable: $($v["VulnerableVersions"]) -> patched: $($v["PatchedIn"])" }
}
Write-Output ""

Write-Output "--- CVEs by CWE ---"
foreach ($cwe in $byCwe.Keys | Sort-Object) {
    Write-Output "${cwe}: $($byCwe[$cwe]["Count"])  -  $($byCwe[$cwe]["Advisories"] -join ', ')"
}
Write-Output ""

if ($hasDirect) {
    Write-Output "=== DIRECT DEPENDENCY FINDINGS ==="
    $direct = $byAdvisoryId.Values | Where-Object { $_["Direct"] -eq $true }
    foreach ($d in $direct) {
        Write-Output "[$($d.Severity)] $($d.Count)x  $($d.Modules.Keys -join ', ')"
        Write-Output "       vulnerable: $($d["VulnerableVersions"]) -> patched: $($d["PatchedIn"])"
        Write-Output ""
    }
}

Write-Output "--- Findings by top-level module ---"
$directDeps = Get-Content "package.json" | ConvertFrom-Json
$allModules = @()
$allModules += $directDeps.dependencies.PSObject.Properties.Name
$allModules += $directDeps.devDependencies.PSObject.Properties.Name
$uniqueModules = $allModules | Sort-Object -Unique

foreach ($m in $uniqueModules) {
    $mod = $byAdvisoryId.Values | Where-Object {
        $_.Modules.ContainsKey($m) -or
        [int](($_.Dependents | Where-Object { $_ -eq $m }) / $_.Count) -ge 1
    }
    if ($mod) {
        Write-Output "$m`t$($mod.Count)"
    }
}
