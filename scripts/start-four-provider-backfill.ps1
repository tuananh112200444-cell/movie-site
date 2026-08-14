param(
  [string]$Providers = 'kkphim,nguonc',
  [switch]$Once
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*sync-four-provider-catalogs.mjs*' }
if ($running) {
  Write-Output 'Four-provider catalog backfill is already running.'
  exit 0
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class KhoPhimPowerRequest {
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint flags);
}
'@
$executionStateContinuous = [Convert]::ToUInt32('80000000', 16)
$executionStateSystemRequired = [Convert]::ToUInt32('00000001', 16)
$executionStateAwayModeRequired = [Convert]::ToUInt32('00000040', 16)
[void][KhoPhimPowerRequest]::SetThreadExecutionState(
  $executionStateContinuous -bor $executionStateSystemRequired -bor $executionStateAwayModeRequired
)

if (-not $env:SUPABASE_CRON_SECRET) {
  $query = "select decrypted_secret as cron_secret from vault.decrypted_secrets where name='CRON_SECRET' order by created_at desc limit 1;"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $raw = & npx.cmd supabase db query --linked --output json $query 2>$null
  $credentialQueryExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($credentialQueryExitCode -ne 0) { throw 'Unable to read the protected backfill credential' }

  $payload = ($raw -join [Environment]::NewLine) | ConvertFrom-Json
  $env:SUPABASE_CRON_SECRET = [string]$payload.rows[0].cron_secret
}
if (-not $env:SUPABASE_CRON_SECRET) { throw 'Protected backfill credential is unavailable' }

# Long-run catalogue load showed that six writers eventually saturate the
# database and trigger statement timeouts. Four keeps useful parallelism while
# leaving enough headroom for triggers and exact per-movie retries.
if (-not $env:CATALOG_EDGE_WRITERS) {
  $env:CATALOG_EDGE_WRITERS = '4'
}

try {
  $runnerArgs = @('scripts\sync-four-provider-catalogs.mjs', "--providers=$Providers")
  if ($Once) { $runnerArgs += '--once' }
  & node @runnerArgs
  if ($LASTEXITCODE -ne 0) { throw "Catalog runner exited with code $LASTEXITCODE" }
} finally {
  Remove-Item Env:SUPABASE_CRON_SECRET -ErrorAction SilentlyContinue
  [void][KhoPhimPowerRequest]::SetThreadExecutionState($executionStateContinuous)
}
