Add-Type -AssemblyName System.Drawing

$dir = Join-Path (Get-Location) 'public\mhophim-assets'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$items = @(
  @{ File='hero.png'; W=1280; H=720; Title='MHOPHIM'; Sub='Tin phim - Review - Lich chieu'; A='#121826'; B='#7f1d1d'; C='#ef233c' },
  @{ File='thai.png'; W=360; H=540; Title='PHIM THAI'; Sub='Top phim dang hot'; A='#16192a'; B='#7f1d1d'; C='#f97316' },
  @{ File='bl.png'; W=360; H=540; Title='BL MOI'; Sub='Review va goi y'; A='#120a18'; B='#9f1239'; C='#fb7185' },
  @{ File='kdrama.png'; W=360; H=540; Title='K-DRAMA'; Sub='Lich chieu moi'; A='#111827'; B='#1e3a8a'; C='#ef4444' },
  @{ File='cdrama.png'; W=360; H=540; Title='CO TRANG'; Sub='Tien hiep - ngon tinh'; A='#1c1917'; B='#92400e'; C='#f59e0b' },
  @{ File='anime.png'; W=360; H=540; Title='ANIME'; Sub='Vietsub hay'; A='#0f172a'; B='#075985'; C='#38bdf8' },
  @{ File='action.png'; W=360; H=540; Title='HANH DONG'; Sub='Bom tan moi'; A='#111111'; B='#991b1b'; C='#f97316' },
  @{ File='vietnam.png'; W=360; H=540; Title='PHIM VIET'; Sub='Chieu rap - gia dinh'; A='#111827'; B='#7f1d1d'; C='#fbbf24' }
)

function New-Brush($color) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color))
}

foreach ($item in $items) {
  $bmp = [System.Drawing.Bitmap]::new($item.W, $item.H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = [System.Drawing.Rectangle]::new(0, 0, $item.W, $item.H)
  $lg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.ColorTranslator]::FromHtml($item.A),
    [System.Drawing.ColorTranslator]::FromHtml($item.B),
    45
  )
  $g.FillRectangle($lg, $rect)

  $accent = [System.Drawing.ColorTranslator]::FromHtml($item.C)
  for ($i = 0; $i -lt 10; $i++) {
    $alpha = [Math]::Max(16, 90 - $i * 7)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb($alpha, $accent), 2)
    $x = -120 + ($i * 70)
    $g.DrawEllipse($pen, $x, 40 + ($i * 28), $item.W * .9, $item.H * .42)
    $pen.Dispose()
  }

  $overlay = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(95, 0, 0, 0))
  $g.FillRectangle($overlay, 0, [int]($item.H * .62), $item.W, [int]($item.H * .38))

  $fontTitle = [System.Drawing.Font]::new('Arial Black', [Math]::Max(22, [int]($item.W / 12)), [System.Drawing.FontStyle]::Bold)
  $fontSub = [System.Drawing.Font]::new('Arial', [Math]::Max(13, [int]($item.W / 26)), [System.Drawing.FontStyle]::Bold)
  $white = New-Brush '#ffffff'
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 255, 255, 255))
  $red = New-Brush $item.C

  $g.FillRectangle($red, 28, [int]($item.H * .13), 74, 8)
  $g.DrawString($item.Title, $fontTitle, $white, 28, [int]($item.H * .68))
  $g.DrawString($item.Sub, $fontSub, $muted, 31, [int]($item.H * .80))
  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(58, 255, 255, 255), 2)
  $g.DrawRectangle($borderPen, 10, 10, $item.W - 20, $item.H - 20)

  $path = Join-Path $dir $item.File
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $borderPen.Dispose()
  $g.Dispose()
  $bmp.Dispose()
  $lg.Dispose()
  $overlay.Dispose()
  $fontTitle.Dispose()
  $fontSub.Dispose()
  $white.Dispose()
  $muted.Dispose()
  $red.Dispose()
}

Write-Host "Generated $($items.Count) MHoPhim assets."
