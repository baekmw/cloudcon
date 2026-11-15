Add-Type -AssemblyName System.Drawing

function Render-PwaIcon {
  param(
    [string]$OutPath,
    [int]$Size = 512,
    [bool]$TransparentBg = $false
  )

  $scale = $Size / 512.0
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($TransparentBg) {
    $g.Clear([System.Drawing.Color]::Transparent)
  } else {
    $g.Clear([System.Drawing.Color]::White)
  }

  $w = 270.0 * $scale
  $h = 190.0 * $scale
  $centerX = $Size / 2.0
  $centerY = $Size / 2.0

  $leftX = $centerX - ($w / 2.0)
  $rightX = $centerX + ($w / 2.0)
  $topY = $centerY - ($h / 2.0)
  $botY = $centerY + ($h / 2.0)
  $r = 26.0 * $scale
  $nr = 34.0 * $scale

  $strokeWidth = 20.0 * $scale
  $blueColor = [System.Drawing.Color]::FromArgb(255, 49, 130, 246) # #3182f6
  $pen = New-Object System.Drawing.Pen($blueColor, $strokeWidth)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath

  # 1. Top horizontal line
  $path.AddLine([float]$leftX, [float]$topY, [float]($rightX - $r), [float]$topY)

  # 2. Top-right rounded corner
  $trRect = New-Object System.Drawing.RectangleF([float]($rightX - 2.0 * $r), [float]$topY, [float](2.0 * $r), [float](2.0 * $r))
  $path.AddArc($trRect, [float]-90.0, [float]90.0)

  # 3. Line down to notch
  $path.AddLine([float]$rightX, [float]($topY + $r), [float]$rightX, [float]($centerY - $nr))

  # 4. Concave notch (semi-circle cutting into ticket)
  $notchRect = New-Object System.Drawing.RectangleF([float]($rightX - $nr), [float]($centerY - $nr), [float](2.0 * $nr), [float](2.0 * $nr))
  $path.AddArc($notchRect, [float]-90.0, [float]-180.0)

  # 5. Line down from notch
  $path.AddLine([float]$rightX, [float]($centerY + $nr), [float]$rightX, [float]($botY - $r))

  # 6. Bottom-right rounded corner
  $brRect = New-Object System.Drawing.RectangleF([float]($rightX - 2.0 * $r), [float]($botY - 2.0 * $r), [float](2.0 * $r), [float](2.0 * $r))
  $path.AddArc($brRect, [float]0.0, [float]90.0)

  # 7. Bottom horizontal line
  $path.AddLine([float]($rightX - $r), [float]$botY, [float]$leftX, [float]$botY)

  $g.DrawPath($pen, $path)

  # Dashed vertical tear line
  $dashX = $leftX + ($w * 0.513)
  
  $dashPen = New-Object System.Drawing.Pen($blueColor, $strokeWidth)
  $dashPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
  $dashPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat

  $unit = $h / 14.0
  $dashSegments = @(
    @{ Start = 0.5; End = 2.5 },
    @{ Start = 4.0; End = 6.2 },
    @{ Start = 7.8; End = 10.0 },
    @{ Start = 11.5; End = 13.5 }
  )

  foreach ($seg in $dashSegments) {
    $y1 = $topY + ($seg.Start * $unit)
    $y2 = $topY + ($seg.End * $unit)
    $g.DrawLine($dashPen, [float]$dashX, [float]$y1, [float]$dashX, [float]$y2)
  }

  $pen.Dispose()
  $dashPen.Dispose()
  $path.Dispose()
  $g.Dispose()

  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Generated $OutPath ($($Size)x$($Size))"
}

# Generate PWA App Icons
Render-PwaIcon -OutPath "public/pwa-512x512.png" -Size 512
Render-PwaIcon -OutPath "public/pwa-maskable-512x512.png" -Size 512
Render-PwaIcon -OutPath "public/pwa-192x192.png" -Size 192
Render-PwaIcon -OutPath "public/apple-touch-icon.png" -Size 180

# Logos
Render-PwaIcon -OutPath "public/logos/logo-stroke-white.png" -Size 512
Render-PwaIcon -OutPath "public/logos/logo-stroke-transparent.png" -Size 512 -TransparentBg $true
