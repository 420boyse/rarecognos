# Parse npm audit JSON (read-only analysis) - PowerShell 5.1
# Usage: .\audit-parser.ps1

param (
    [string]$InputFile = "audit-critical.json",
    [string]$OutputFile = "audit-parse-output.txt"
)

$JsonPath = Resolve-Path $InputFile
$Json = Get-Content -Path $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$Output = New-Object System.Text.StringBuilder

# Header
$Output.AppendLine("==============================================================================")
$Output.AppendLine("NPM AUDIT REMEDIATION ANALYSIS - READ-ONLY (no npm audit fix executed)")
$Output.AppendLine("==============================================================================")
$Output.AppendLine("Input:  ${JsonPath}")
$Output.AppendLine("Node:   node -v")
$Output.AppendLine("NPM:    npm -v")
$Output.AppendLine("")

$Advisories = @($Json.advisories)
$Total = $Advisories.Length
$Output.AppendLine("Total vulnerabilities found: ${Total}")
$Output.AppendLine("")

# Severity breakdown
$Severities = @("info", "low", "moderate", "high", "critical")
$BySeverity = @{ }
foreach ($sev in $Severities) {
    $BySeverity[$sev] = 0
}
foreach ($a in $Advisories) {
    $s = $a.severity.ToLower()
    if ($null -eq $s) { $s = "info" }
    $BySeverity[$s] = $BySeverity[$s] + 1
}

$Output.AppendLine("------------------------------------------------------------------")
$Output.AppendLine("SEVERITY BREAKDOWN")
$Output.AppendLine("------------------------------------------------------------------")
foreach ($sev in $Severities) {
    $Output.AppendLine("  ${sev, -10} ${BySeverity[$sev],5}")
}
$Output.AppendLine("")

# Direct vs transitive classification
$DirectCount = 0
$TransitiveCount = 0
$DirectMods = @()
$TransitiveMods = @()
foreach ($a in $Advisories) {
    $foundIn = @($a.findings.findings)
    foreach ($f in $foundIn) {
        if ($f.path -eq $f.version) {
            $DirectCount++
            if ($DirectMods -notcontains $f.moduleName) { $DirectMods += $f.moduleName }
        }
        else {
            $TransitiveCount++
            if ($TransitiveMods -notcontains "$($f.moduleName) via $f.path") {
                $TransitiveMods += "$($f.moduleName) via $f.path"
            }
        }
    }
}

$Output.AppendLine("------------------------------------------------------------------")
$Output.AppendLine("DEPENDENCY CLASSIFICATION")
$Output.AppendLine("------------------------------------------------------------------")
$Output.AppendLine("  Direct dependencies:  ${DirectCount}")
$Output.AppendLine("  Transitive deps:      ${TransitiveCount}")
$Output.AppendLine("")

$Output.AppendLine("Direct dependencies with vulnerabilities:")
$DirectMods | Sort-Object | ForEach-Object {
    $Output.AppendLine("    - $_")
}
$Output.AppendLine("")

$Output.AppendLine("Transitive dependency paths (top-level):")
$TransitiveMods | Sort-Object | Select-Object -First 100 | ForEach-Object {
    $Output.AppendLine("    - $_")
}
$Output.AppendLine("")

# Group by module for remediation
$Output.AppendLine("==============================================================================")
$Output.AppendLine("MODULE-BY-MODULE REMEDIATION")
$Output.AppendLine("==============================================================================")

$Modules = @{}
foreach ($a in $Advisories) {
    $mod = $a.module_name
    if ($null -eq $mod) { continue }
    if (-not $Modules.ContainsKey($mod)) {
        $Modules[$mod] = @()
    }
    $Modules[$mod] += $a
}

$ModuleNames = $Modules.Keys | Sort-Object
foreach ($mod in $ModuleNames) {
    $Findings = $Modules[$mod]
    $SeveritiesList = $Findings | ForEach-Object { $_.severity }
    $MaxSeverity = @()
    foreach ($sev in $Severities) {
        $found = $Findings | Where-Object { $_.severity -eq $sev }
        if ($found.Length -gt 0) { $MaxSeverity += $sev; break }
    }
    if ($MaxSeverity -eq @()) { $MaxSeverity = "info" }

    $Output.AppendLine("")
    $Output.AppendLine("------------------------------------------------------------------")
    $Output.AppendLine("MODULE: ${mod}")
    $Output.AppendLine("  Max severity: ${MaxSeverity}")
    $Output.AppendLine("  Vulnerable instances: ${Findings.Length}")

    # Classify: direct?
    $DirectVersions = @()
    $TransitivePaths = @()
    foreach ($a in $Findings) {
        foreach ($f in $a.findings.findings) {
            if ($f.path -eq $f.version) {
                $DirectVersions += $f.version
            }
            else {
                $TransitivePaths += "$($f.moduleName) via $f.path"
            }
        }
    }

    if ($DirectVersions.Length -gt 0) {
        $Output.AppendLine("  Direct dependency versions: ${DirectVersions -join ", "}")
        $Output.AppendLine("  REMEDIATION: Upgrade direct dependency via `npm update <module>`")
        $Output.AppendLine("  CAUTION: verify package.json version constraints allow the fix")
    }
    else {
        $Output.AppendLine("  Transitive paths:")
        $TransitivePaths | Sort-Object | Select-Object -First 50 | ForEach-Object {
            $Output.AppendLine("    - $_")
        }
        if ($TransitivePaths.Length -gt 50) {
            $Output.AppendLine("    ... ($($TransitivePaths.Length) total)")
        }
        $Output.AppendLine("  REMEDIATION: transitive-only - consider upstream fix or")
        $Output.AppendLine("    exception. Upgrade the parent package if available.")
    }

    # Advisory details
    foreach ($a in $Findings) {
        $cves = $a.cves -join ", "
        $cvss = "N/A"
        if ($a.cvss && $a.cvss.score) {
            $cvss = "$($a.cvss.score) ($($a.cvss.severity))"
        }
        $Output.AppendLine("")
        $Output.AppendLine("  ADMI: ${a.id}  CVEs: ${cves}")
        $Output.AppendLine("    Severity: ${a.severity}   CVSS: ${cvss}")
        $Output.AppendLine("    Patched versions: ${a.patched_versions}")
        $Output.AppendLine("    Vulnerable versions: ${a.vulnerable_versions}")
        $Output.AppendLine("    Title: ${a.title}")
        $Output.AppendLine("    URL: https://www.npmjs.com/advisories/${a.id}")
    }
}

# Special flags: breaking changes, critical paths
$Output.AppendLine("")
$Output.AppendLine("==============================================================================")
$Output.AppendLine("HIGH-PRIORITY / BREAKING-CHANGE FLAGS")
$Output.AppendLine("==============================================================================")

$Flagged = @()
foreach ($mod in $ModuleNames) {
    $Findings = $Modules[$mod]
    foreach ($a in $Findings) {
        if ($a.severity -eq "critical" -or $a.severity -eq "high") {
            $Flagged += $mod
        }
    }
}
$Flagged = $Flagged | Sort-Object -Unique
$Flagged | ForEach-Object {
    $Output.AppendLine("  [!] ${_} - has ${Modules[$_]} critical/high advisories")
}
$Output.AppendLine("")

$Output.AppendLine("Ganache test-toolchain transitive-only flags (npm audit ignore candidate):")
$GanachePaths = @()
foreach ($a in $Advisories) {
    $hasGanache = $false
    foreach ($f in $a.findings.findings) {
        if ($f.path -like "*ganache*" -or $f.moduleName -eq "ganache") {
            $hasGanache = $true
        }
    }
    if ($hasGanache) {
        foreach ($f in $a.findings.findings) {
            if ($f.path -ne $f.version) {
                $GanachePaths += "$($f.moduleName) via $f.path"
            }
        }
    }
}
$GanachePaths | Sort-Object -Unique | Select-Object -First 40 | ForEach-Object {
    $Output.AppendLine("    - $_")
}
$Output.AppendLine("")
$Output.AppendLine("  RECOMMENDATION: These are test-toolchain-only. Ignore via:")
$Output.AppendLine("    npm audit --audit-level=critical --json | ...")
$Output.AppendLine("  Or add to package.json: \"auditIgnore\": [...]")

# Summary table
$Output.AppendLine("")
$Output.AppendLine("==============================================================================")
$Output.AppendLine("SUMMARY TABLE")
$Output.AppendLine("==============================================================================")
$Output.AppendLine("Module                                          Severity | Type")
$Output.AppendLine("------------------------------------------------------------------")

foreach ($mod in $ModuleNames) {
    $Findings = $Modules[$mod]
    $MaxSeverity = $null
    foreach ($sev in $Severities) {
        $found = $Findings | Where-Object { $_.severity -eq $sev }
        if ($found.Length -gt 0) { $MaxSeverity = $sev; break }
    }
    if ($MaxSeverity -eq $null) { $MaxSeverity = "info" }

    $Direct = $null
    foreach ($a in $Findings) {
        foreach ($f in $a.findings.findings) {
            if ($f.path -eq $f.version) {
                $Direct = "direct"; break 2
            }
        }
    }
    if ($Direct -eq $null) { $Direct = "transitive" }

    $Pad = [math]::Max(0, 45 - $mod.Length)
    $Padded = $mod + (" " * $Pad)
    $Output.AppendLine($Padded + " " + $MaxSeverity.PadRight(8) + " | " + $Direct)
}

$Output.AppendLine("")
$Output.AppendLine("==============================================================================")
$Output.AppendLine("END OF ANALYSIS - READ ONLY")
$Output.AppendLine("==============================================================================")

$Content = $Output.ToString()
$Bytes = [System.Text.Encoding]::UTF8.GetBytes($Content)
[System.IO.File]::WriteAllBytes($OutputFile, $Bytes)
$Output.AppendLine("Wrote: ${OutputFile}")

Write-Host "Analysis complete. Results written to: ${OutputFile}"
