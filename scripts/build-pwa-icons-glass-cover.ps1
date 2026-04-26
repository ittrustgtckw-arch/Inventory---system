# Builds icon-512.png / icon-192.png from public/icons/pwa-glass-hero-source.png
# Uses a CENTER VERTICAL STRIP (full height) + uniform "cover" scale so the glass
# fills the square without black side bars. No stretching (same scale X/Y).
#
# Tune $StripWidthFraction: smaller = narrower strip = more zoom = glass fills width more.
# Try 0.34 - 0.42. Too small may crop too much off the glass sides.
$ErrorActionPreference = "Stop"
$StripWidthFraction = 0.36
$root = Split-Path $PSScriptRoot -Parent
$srcPath = Join-Path $root "public\icons\pwa-glass-hero-source.png"
$destDir = Join-Path $root "public\icons"
if (-not (Test-Path $srcPath)) {
  Write-Error "Missing $srcPath"
}
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($srcPath)
try {
  $iw = [float]$src.Width
  $ih = [float]$src.Height
  $srcW = [float][Math]::Max(8, [Math]::Floor($iw * $StripWidthFraction))
  $srcX = [Math]::Floor(($iw - $srcW) / 2.0)
  $srcY = 0.0
  $srcH = $ih

  foreach ($size in @(512, 192)) {
    $sz = [float]$size
    $s = [Math]::Max($sz / $srcW, $sz / $srcH)
    $dw = $srcW * $s
    $dh = $srcH * $s
    $ox = ($sz - $dw) / 2.0
    $oy = ($sz - $dh) / 2.0

    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))

    $clip = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $g.SetClip($clip)

    $srcRect = New-Object System.Drawing.RectangleF $srcX, $srcY, $srcW, $srcH
    $destRect = New-Object System.Drawing.RectangleF $ox, $oy, $dw, $dh
    $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetClip()

    $out = Join-Path $destDir ("icon-" + $size + ".png")
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host ("Wrote " + $out + " stripW=" + [int]$srcW + " scale=" + [Math]::Round($s, 3))
  }
}
finally {
  $src.Dispose()
}
