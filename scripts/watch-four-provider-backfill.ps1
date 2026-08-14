$ErrorActionPreference = 'SilentlyContinue'

$workspace = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $workspace 'tmp_four_provider_backfill_state.json'
$logPath = Join-Path $workspace 'tmp_four_provider_backfill.log'

while ($true) {
  Clear-Host
  Write-Host 'KHO PHIM - THEO DOI NHAP 4 API' -ForegroundColor Cyan
  Write-Host ('Cap nhat luc: ' + (Get-Date -Format 'dd/MM/yyyy HH:mm:ss'))
  Write-Host ''

  if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $checkpointTime = ([datetime]$state.updatedAt).ToLocalTime()
    $heartbeatValue = if ($state.workerHeartbeatAt) { $state.workerHeartbeatAt } else { $state.updatedAt }
    $heartbeatTime = ([datetime]$heartbeatValue).ToLocalTime()
    $heartbeatAge = [Math]::Max(0, [int]((Get-Date) - $heartbeatTime).TotalSeconds)
    if ($heartbeatAge -le 90) {
      Write-Host ("TIEN TRINH: DANG CHAY - tin hieu moi {0} giay truoc" -f $heartbeatAge) -ForegroundColor Green
    } else {
      Write-Host ("CANH BAO: tien trinh im lang {0} giay" -f $heartbeatAge) -ForegroundColor Red
    }
    $rows = foreach ($name in @('ophim','kkphim','vsmov','nguonc')) {
      $item = $state.providers.$name
      if (-not $item) { continue }
      $done = [Math]::Max(0, [int]$item.nextPage - 1)
      $total = [Math]::Max(1, [int]$item.totalPages)
      [pscustomobject]@{
        API = $name.ToUpper()
        Trang = "$done / $total"
        PhanTram = ('{0:N2}%' -f (($done * 100.0) / $total))
        TrangThai = $item.status
        SoLo = [int]$item.batches
        SongSong = [int]$item.parallelPages
        LoiChoXuLy = @($item.pendingSlugs).Count
      }
    }
    Write-Host ''
    $rows | Format-Table -AutoSize
    Write-Host ('Checkpoint cuoi: ' + $checkpointTime.ToString('dd/MM/yyyy HH:mm:ss'))
  }

  Write-Host ''
  Write-Host 'LOG MOI NHAT:' -ForegroundColor Yellow
  if (Test-Path -LiteralPath $logPath) {
    Get-Content -LiteralPath $logPath -Tail 8
  }
  Write-Host ''
  Write-Host 'Tu dong lam moi sau 5 giay. Dong cua so nay KHONG dung tien trinh nhap.' -ForegroundColor DarkGray
  Start-Sleep -Seconds 5
}
