[CmdletBinding()]
param(
  [ValidateSet('chrome', 'firefox', 'webkit', 'msedge')]
  [string]$Browser = 'chrome'
)
$ErrorActionPreference = 'Stop'
$auditSession = "bos-audit-$Browser"
$scenarioPath = Join-Path $PSScriptRoot 'audit-browser-scenario.js'
& npx --yes --package '@playwright/cli' playwright-cli "--session=$auditSession" open 'http://127.0.0.1:3000/' --browser $Browser
if ($LASTEXITCODE -ne 0) { throw "Unable to launch $Browser" }
$auditOutput = & npx --yes --package '@playwright/cli' playwright-cli "--session=$auditSession" run-code --filename $scenarioPath
$auditExit = $LASTEXITCODE
$outputText = $auditOutput -join "`n"
[System.IO.Directory]::CreateDirectory((Join-Path (Get-Location) 'output/audit')) | Out-Null
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "output/audit/browser-$Browser.log"), $outputText)
if ($auditExit -ne 0 -or $outputText.Contains('### Error')) { throw "Browser audit failed for $Browser; see output/audit/browser-$Browser.log" }
$jsonLine = ($auditOutput | Where-Object { $_ -match '^"\{' } | Select-Object -First 1)
if (-not $jsonLine) { throw 'Browser audit produced no JSON results.' }
$result = ($jsonLine | ConvertFrom-Json) | ConvertFrom-Json
$result | ConvertTo-Json -Depth 20 | Write-Output
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "output/audit/browser-$Browser.json"), ($result | ConvertTo-Json -Depth 20))
if (@($result.checks | Where-Object { $_.status -ne 'PASS' }).Count -or @($result.responsive | Where-Object { $_.status -ne 'PASS' }).Count) { throw "Browser assertions failed for $Browser" }
