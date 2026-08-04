param(
  [string]$Ffmpeg = "ffmpeg",
  [string]$Slides = (Join-Path $PSScriptRoot "..\output\final-demo-slides"),
  [string]$Output = (Join-Path $PSScriptRoot "polydesk-okx-final-118s.mp4")
)

$ErrorActionPreference = "Stop"

& $Ffmpeg -y `
  -loop 1 -t 10 -i "$Slides\01-title.png" `
  -loop 1 -t 10 -i "$Slides\02-stats.png" `
  -loop 1 -t 14 -i "$Slides\03-pulse.png" `
  -loop 1 -t 16 -i "$Slides\04-machine.png" `
  -loop 1 -t 15 -i "$Slides\05-rails.png" `
  -loop 1 -t 12 -i "$Slides\06-proof.png" `
  -loop 1 -t 12 -i "$Slides\07-funding-proof.png" `
  -loop 1 -t 14 -i "$Slides\08-governance-proof.png" `
  -loop 1 -t 15 -i "$Slides\09-trade-proof.png" `
  -filter_complex "[0:v]fps=30,format=yuv420p[v0];[1:v]fps=30,format=yuv420p[v1];[2:v]fps=30,format=yuv420p[v2];[3:v]fps=30,format=yuv420p[v3];[4:v]fps=30,format=yuv420p[v4];[5:v]fps=30,format=yuv420p[v5];[6:v]fps=30,format=yuv420p[v6];[7:v]fps=30,format=yuv420p[v7];[8:v]fps=30,format=yuv420p[v8];[v0][v1][v2][v3][v4][v5][v6][v7][v8]concat=n=9:v=1:a=0[v]" `
  -map "[v]" `
  -c:v libx264 `
  -preset medium `
  -crf 18 `
  -movflags +faststart `
  $Output

if ($LASTEXITCODE -ne 0) {
  throw "FFmpeg failed with exit code $LASTEXITCODE"
}

Get-Item -LiteralPath $Output | Select-Object FullName, Length, LastWriteTime
