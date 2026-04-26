# Builds icon-512.png and icon-192.png from public/icons/flat-logo-source.png
# (your exact flat logo). Uniform scale, centered, ~94% fill — no slim pillar effect.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root "public\icons\flat-logo-source.png"
$destDir = Join-Path $root "public\icons"
if (-not (Test-Path $src)) {
  Write-Error "Missing $src - add your flat logo PNG as flat-logo-source.png"
}
Add-Type -AssemblyName System.Drawing
$logo = [System.Drawing.Image]::FromFile($src)
try {
  foreach ($size in @(512, 192)) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $pad = [Math]::Floor($size * 0.03)
    $inner = $size - 2 * $pad
    $scale = [Math]::Min($inner / $logo.Width, $inner / $logo.Height)
    $w = [int]([Math]::Floor($logo.Width * $scale))
    $h = [int]([Math]::Floor($logo.Height * $scale))
    $x = [int](($size - $w) / 2)
    $y = [int](($size - $h) / 2)
    $g.DrawImage($logo, $x, $y, $w, $h)
    $out = Join-Path $destDir ("icon-" + $size + ".png")
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host ('{0} logo {1} by {2} in {3}px canvas' -f $out, $w, $h, $size)
  }
}
finally {
  $logo.Dispose()
}
