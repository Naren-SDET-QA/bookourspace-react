[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [ValidateSet('chrome', 'firefox', 'webkit', 'msedge')]
  [string]$Browser = 'firefox'
)

$ErrorActionPreference = 'Stop'
$session = "bookourspace-stays-e2e-$([guid]::NewGuid().ToString('N'))"
$pwcli = '/mnt/c/Users/windows/.codex/skills/playwright/scripts/playwright_cli.sh'

function Invoke-PwCli {
  param([Parameter(Mandatory = $true)][string[]]$CommandArgs)

  if ($env:OS -eq 'Windows_NT') {
    $output = & npx --yes --package '@playwright/cli' playwright-cli "--session=$session" @CommandArgs 2>&1
  } else {
    $wslArgs = @($pwcli, "--session=$session") + $CommandArgs
    $output = & bash @wslArgs 2>&1
  }
  if ($LASTEXITCODE -ne 0 -or ($output -join "`n").Contains('### Error')) {
    throw "Playwright CLI failed: $($output -join "`n")"
  }
  return ($output -join "`n")
}

function Assert-Contains {
  param(
    [string]$Text,
    [string]$Expected,
    [string]$Message
  )
  if (-not $Text.Contains($Expected)) {
    throw "$Message (expected '$Expected')"
  }
}

try {
  Get-Command npx -ErrorAction Stop | Out-Null

  Invoke-PwCli @('open', $BaseUrl, '--browser', $Browser) | Out-Null
  Invoke-PwCli @('resize', '390', '844') | Out-Null
  $snapshot = Invoke-PwCli @('snapshot')
  Assert-Contains $snapshot 'BookOurSpace' 'Home screen did not render'

  $journeyPath = Join-Path $PSScriptRoot 'stays-browser-scenario.js'
  $journeyResult = Invoke-PwCli @('run-code', '--filename', $journeyPath)
  Assert-Contains $journeyResult 'stays-search-filter-map-gallery-price-booking-pass' 'Stays customer journey did not complete'

  Write-Output 'PASS: stays search -> guests -> filters -> map -> gallery -> room/price -> booking handoff'
  Write-Output 'NOTE: payment, booking confirmation, cancellation and refund mutation are covered by the isolated integration test; this browser test never fabricates payment success.'
}
finally {
  try { Invoke-PwCli @('close') | Out-Null } catch { }
}
