# Source PNG (regenerate in assets/ then point $src here, run script to refresh public/icons).
# Full-frame icon source (wide glass, fills square — regenerate asset then run this script).
$src = "C:\Users\HP\.cursor\projects\c-Users-HP-Documents-Crane-System-Copy\assets\app-icon-fullbleed-ref1-ref2style.png"
$destDir = Join-Path $PSScriptRoot "..\public\icons"
if (-not (Test-Path $destDir)) {
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($src)
foreach ($size in @(512, 192)) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($img, 0, 0, $size, $size)
  $out = Join-Path $destDir "icon-$size.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}
$img.Dispose()
Get-ChildItem $destDir | ForEach-Object { Write-Host $_.FullName $_.Length }
