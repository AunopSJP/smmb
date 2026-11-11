# แสดงบทสนทนาระหว่าง agent Backend ↔ Frontend แบบสด ๆ
# เปิดด้วย: powershell -NoExit -ExecutionPolicy Bypass -File scripts/watch-agent-sync.ps1
# ปิดหน้าต่าง = หยุดดู (ไม่กระทบ agent)

$ErrorActionPreference = 'SilentlyContinue'
$root = Join-Path (Split-Path $PSScriptRoot -Parent) 'docs\agent-sync'
$files = @('to-frontend.md', 'to-backend.md', 'state.md', 'measurements.md')

$Host.UI.RawUI.WindowTitle = 'SMMB agent-sync — บทสนทนา Backend <-> Frontend'
Clear-Host
Write-Host '==============================================================' -ForegroundColor DarkGray
Write-Host '  SMMB — กล่องข้อความ Agent (Backend <-> Frontend)' -ForegroundColor Cyan
Write-Host "  โฟลเดอร์: $root" -ForegroundColor DarkGray
Write-Host '  ข้อความใหม่จะขึ้นเอง · ปิดหน้าต่างนี้ได้เลยไม่กระทบ agent' -ForegroundColor DarkGray
Write-Host '==============================================================' -ForegroundColor DarkGray
Write-Host ''

# แสดงของเดิมทั้งหมดก่อน แล้วค่อยตามส่วนที่เพิ่ม
function Show-File([string]$path) {
  if (-not (Test-Path $path)) { return }
  $name = Split-Path $path -Leaf
  Write-Host "----- $name -----" -ForegroundColor Yellow
  Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object { Write-Host $_ }
  Write-Host ''
}

foreach ($f in $files) { Show-File (Join-Path $root $f) }

$offsets = @{}
foreach ($f in $files) {
  $p = Join-Path $root $f
  $offsets[$f] = if (Test-Path $p) { (Get-Item $p).Length } else { 0 }
}

while ($true) {
  Start-Sleep -Milliseconds 1000
  foreach ($f in $files) {
    $p = Join-Path $root $f
    if (-not (Test-Path $p)) { continue }
    $len = (Get-Item $p).Length
    if ($len -lt $offsets[$f]) {          # ไฟล์ถูกเขียนทับ/สั้นลง → อ่านใหม่ทั้งไฟล์
      Write-Host "===== $f (เขียนใหม่) =====" -ForegroundColor Magenta
      Get-Content -LiteralPath $p -Encoding UTF8 | ForEach-Object { Write-Host $_ }
      $offsets[$f] = $len
      continue
    }
    if ($len -eq $offsets[$f]) { continue }
    $stream = [System.IO.File]::Open($p, 'Open', 'Read', 'ReadWrite')
    try {
      [void]$stream.Seek($offsets[$f], 'Begin')
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
      $text = $reader.ReadToEnd()
      $offsets[$f] = $stream.Position
    } finally { $stream.Dispose() }
    if ($text.Trim()) {
      Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $f) -ForegroundColor Green
      $text.TrimEnd() -split "`r?`n" | ForEach-Object { Write-Host $_ }
      Write-Host ''
    }
  }
}
