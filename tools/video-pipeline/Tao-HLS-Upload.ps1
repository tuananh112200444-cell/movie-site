param(
  [string]$File = "",
  [string]$Slug = "",
  [string]$Episode = "",
  [switch]$NoUpload
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
  Write-Host "OK: $message" -ForegroundColor Green
}

function Write-Warn($message) {
  Write-Host "CANH BAO: $message" -ForegroundColor Yellow
}

function Expand-ConfigPath($value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $value }
  return [Environment]::ExpandEnvironmentVariables($value)
}

function Read-Config {
  $scriptDir = Split-Path -Parent $PSCommandPath
  $configPath = Join-Path $scriptDir "config.json"
  $examplePath = Join-Path $scriptDir "config.example.json"

  if (!(Test-Path $configPath)) {
    Copy-Item -LiteralPath $examplePath -Destination $configPath
    Write-Warn "Da tao config.json tu config.example.json. Ban co the sua bucket/remote/CDN trong file nay."
  }

  return Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
}

function Get-InputVideo($initialFile) {
  if (![string]::IsNullOrWhiteSpace($initialFile) -and (Test-Path -LiteralPath $initialFile)) {
    return (Resolve-Path -LiteralPath $initialFile).Path
  }

  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = "Chon file phim MP4/MKV/MOV"
  $dialog.Filter = "Video files (*.mp4;*.mkv;*.mov;*.webm)|*.mp4;*.mkv;*.mov;*.webm|All files (*.*)|*.*"
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "Ban chua chon file phim."
  }
  return $dialog.FileName
}

function Normalize-Slug($value) {
  $slug = ($value -replace '^\s+|\s+$', '').ToLowerInvariant()
  $slug = $slug -replace '[^a-z0-9\-_]+', '-'
  $slug = $slug -replace '-+', '-'
  $slug = $slug.Trim('-')
  if ([string]::IsNullOrWhiteSpace($slug)) {
    throw "Slug phim khong hop le."
  }
  return $slug
}

function Normalize-Episode($value) {
  $raw = ($value -replace '^\s+|\s+$', '').ToLowerInvariant()
  if ($raw -match '^(tap-|ep-|episode-)?([0-9]+)$') {
    return "tap-$($matches[2])"
  }
  if ($raw -match '^full$') { return "full" }
  $safe = $raw -replace '[^a-z0-9\-_]+', '-'
  $safe = $safe -replace '-+', '-'
  $safe = $safe.Trim('-')
  if ([string]::IsNullOrWhiteSpace($safe)) {
    throw "So tap khong hop le."
  }
  return $safe
}

function Test-CommandAvailable($name, $installHint) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (!$cmd) {
    throw @"
Khong tim thay $name trong PATH.

$installHint
"@
  }
  return $cmd.Source
}

function Resolve-ToolPath($name, $configuredPath, $installHint) {
  $expandedPath = Expand-ConfigPath ([string]$configuredPath)
  if (![string]::IsNullOrWhiteSpace($expandedPath) -and (Test-Path -LiteralPath $expandedPath)) {
    return (Resolve-Path -LiteralPath $expandedPath).Path
  }

  return Test-CommandAvailable $name $installHint
}

function Invoke-CheckedProcess($exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$exe thoat voi ma loi $LASTEXITCODE."
  }
}

$config = Read-Config

Write-Step "Kiem tra cong cu"
$ffmpegPath = Resolve-ToolPath "ffmpeg" $config.ffmpegPath "Cai FFmpeg roi mo lai tool. Tai ban Windows tai: https://www.gyan.dev/ffmpeg/builds/ - chon release full, them thu muc bin vao PATH."
Write-Ok "ffmpeg: $ffmpegPath"

$shouldUpload = -not $NoUpload -and [bool]$config.uploadAfterConvert
$rclonePath = ""
if ($shouldUpload) {
  $rclonePath = Resolve-ToolPath "rclone" $config.rclonePath "Cai rclone tai https://rclone.org/downloads/ va chay Cai-dat-rclone-Backblaze.bat de ket noi Backblaze B2."
  Write-Ok "rclone: $rclonePath"
}

Write-Step "Chon thong tin phim"
$inputFile = Get-InputVideo $File
if ([string]::IsNullOrWhiteSpace($Slug)) {
  $Slug = Read-Host "Nhap slug phim (vi du: cherm-chey)"
}
if ([string]::IsNullOrWhiteSpace($Episode)) {
  $Episode = Read-Host "Nhap so tap (vi du: 5 hoac full)"
}

$movieSlug = Normalize-Slug $Slug
$episodeSlug = Normalize-Episode $Episode
$bucket = [string]$config.bucket
$cdnOrigin = ([string]$config.cdnOrigin).TrimEnd('/')
$remoteName = [string]$config.rcloneRemote
$outputRoot = Expand-ConfigPath ([string]$config.outputRoot)
$outputDir = Join-Path (Join-Path $outputRoot $movieSlug) $episodeSlug

Write-Host "File phim: $inputFile"
Write-Host "Slug phim: $movieSlug"
Write-Host "Tap: $episodeSlug"
Write-Host "Thu muc xuat: $outputDir"

if (Test-Path -LiteralPath $outputDir) {
  $answer = Read-Host "Thu muc da ton tai. Xoa va tao lai? (y/n)"
  if ($answer -notin @("y", "Y", "yes", "YES")) {
    throw "Da huy de tranh ghi de file cu."
  }
  Remove-Item -LiteralPath $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Write-Step "Chuyen MP4/MKV sang HLS m3u8"
$segmentPath = Join-Path $outputDir "seg_%05d.ts"
$playlistPath = Join-Path $outputDir "master.m3u8"

$ffmpegArgs = @(
  "-hide_banner",
  "-y",
  "-i", $inputFile,
  "-c:v", "libx264",
  "-preset", ([string]$config.preset),
  "-crf", ([string]$config.crf),
  "-c:a", "aac",
  "-b:a", ([string]$config.audioBitrate),
  "-hls_time", ([string]$config.segmentSeconds),
  "-hls_playlist_type", "vod",
  "-hls_segment_filename", $segmentPath,
  $playlistPath
)

Invoke-CheckedProcess $ffmpegPath $ffmpegArgs
Write-Ok "Da tao HLS: $playlistPath"

if (!(Test-Path -LiteralPath $playlistPath)) {
  throw "Khong thay master.m3u8 sau khi convert."
}

$relativePath = "$movieSlug/$episodeSlug"
$cdnLink = "$cdnOrigin/$relativePath/master.m3u8"

if ($shouldUpload) {
  Write-Step "Upload len Backblaze B2 bang rclone"
  $remoteTarget = "$remoteName`:$bucket/$relativePath"
  Write-Host "Dich upload: $remoteTarget"
  $rcloneArgs = @(
    "copy",
    $outputDir,
    $remoteTarget,
    "--progress",
    "--transfers", "8",
    "--checkers", "16"
  )
  Invoke-CheckedProcess $rclonePath $rcloneArgs
  Write-Ok "Da upload xong."
} else {
  Write-Warn "Dang bo qua upload. Ban co the upload thu muc nay thu cong: $outputDir"
}

Write-Step "Link dan vao add-movie"
Write-Host $cdnLink -ForegroundColor Green

if ([bool]$config.copyLinkToClipboard) {
  try {
    Set-Clipboard -Value $cdnLink
    Write-Ok "Da copy link vao clipboard."
  } catch {
    Write-Warn "Khong copy duoc vao clipboard, hay copy link mau xanh o tren."
  }
}

Write-Host ""
Write-Host "Xong. Dan link nay vao o Stream URL cua tap phim." -ForegroundColor Green
