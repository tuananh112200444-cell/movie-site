param(
  [string]$Source = "C:\Users\CPS\Pictures\e1260dce-9377-44c8-83b0-d22bf9614677.png"
)

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $repoRoot "public\brand"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$sourceBitmap = [System.Drawing.Bitmap]::FromFile($Source)
try {
  $minX = $sourceBitmap.Width
  $minY = $sourceBitmap.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $sourceBitmap.Height; $y++) {
    for ($x = 0; $x -lt $sourceBitmap.Width; $x++) {
      if ($sourceBitmap.GetPixel($x, $y).A -gt 8) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    throw "The source image has no visible pixels."
  }

  $contentWidth = $maxX - $minX + 1
  $contentHeight = $maxY - $minY + 1
  $contentSize = [Math]::Max($contentWidth, $contentHeight)
  $padding = [Math]::Ceiling($contentSize * 0.08)
  $cropSize = $contentSize + (2 * $padding)
  $cropX = [Math]::Max(0, [Math]::Floor(($minX + $maxX + 1 - $cropSize) / 2))
  $cropY = [Math]::Max(0, [Math]::Floor(($minY + $maxY + 1 - $cropSize) / 2))
  $cropSize = [Math]::Min($cropSize, [Math]::Min($sourceBitmap.Width - $cropX, $sourceBitmap.Height - $cropY))
  $sourceRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropSize, $cropSize)

  $assets = @(
    @{ Name = "khophim-logo-v2.png"; Size = 1024 },
    @{ Name = "khophim-favicon-v2-48.png"; Size = 48 },
    @{ Name = "khophim-favicon-v2-96.png"; Size = 96 },
    @{ Name = "khophim-apple-touch-v2.png"; Size = 180 },
    @{ Name = "khophim-pwa-v2-192.png"; Size = 192 },
    @{ Name = "khophim-pwa-v2-512.png"; Size = 512 }
  )

  foreach ($asset in $assets) {
    $size = $asset.Size
    $output = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $destinationRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
        $graphics.DrawImage($sourceBitmap, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
      } finally {
        $graphics.Dispose()
      }
      $output.Save((Join-Path $outputDir $asset.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $output.Dispose()
    }
  }
} finally {
  $sourceBitmap.Dispose()
}
