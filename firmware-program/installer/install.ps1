# SMMB Firmware Flasher - ตัวติดตั้ง (ไม่ต้องใช้สิทธิ์แอดมิน)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$name = 'SMMB Firmware Flasher'
$dest = Join-Path $env:LOCALAPPDATA "Programs\$name"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Say($text, $buttons = 'OK', $icon = 'Information') {
    [System.Windows.Forms.MessageBox]::Show($text, "ติดตั้ง $name", $buttons, $icon)
}
try {
    Get-Process -Name 'SMMB-Firmware-Flasher' -ErrorAction SilentlyContinue | Stop-Process -Force
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Expand-Archive -Path (Join-Path $here 'payload.zip') -DestinationPath $dest -Force
    Copy-Item (Join-Path $here 'uninstall.ps1') $dest -Force

    $exe = Join-Path $dest 'SMMB-Firmware-Flasher.exe'
    $ico = Join-Path $dest 'app.ico'
    $shell = New-Object -ComObject WScript.Shell
    $links = @(
        (Join-Path ([Environment]::GetFolderPath('Programs')) "$name.lnk"),
        (Join-Path ([Environment]::GetFolderPath('Desktop')) "$name.lnk")
    )
    foreach ($path in $links) {
        $link = $shell.CreateShortcut($path)
        $link.TargetPath = $exe
        $link.WorkingDirectory = $dest
        $link.IconLocation = $ico
        $link.Description = $name
        $link.Save()
    }

    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SMMBFirmwareFlasher'
    New-Item -Path $key -Force | Out-Null
    $version = (Get-Content (Join-Path $dest 'version.txt') -ErrorAction SilentlyContinue | Select-Object -First 1)
    Set-ItemProperty $key DisplayName $name
    Set-ItemProperty $key DisplayVersion $version
    Set-ItemProperty $key Publisher 'SMMB'
    Set-ItemProperty $key DisplayIcon $ico
    Set-ItemProperty $key InstallLocation $dest
    Set-ItemProperty $key UninstallString "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\uninstall.ps1`""
    Set-ItemProperty $key NoModify 1 -Type DWord
    Set-ItemProperty $key NoRepair 1 -Type DWord

    # เครื่องมือแฟลช: ต้องมี Python + esptool
    $hasTool = $false
    foreach ($py in @('python', 'py')) {
        if (Get-Command $py -ErrorAction SilentlyContinue) {
            & $py -m esptool version *> $null
            if ($LASTEXITCODE -eq 0) { $hasTool = $true; break }
        }
    }
    $note = ''
    if (-not $hasTool) {
        $python = @('python', 'py') | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
        if ($python) {
            $answer = Say "เครื่องนี้ยังไม่มี esptool (ใช้เขียนเฟิร์มแวร์ลงบอร์ด)`nติดตั้งให้ตอนนี้เลยไหม? (ต้องต่ออินเทอร์เน็ต)" 'YesNo' 'Question'
            if ($answer -eq 'Yes') {
                & $python -m pip install --user --upgrade esptool
                if ($LASTEXITCODE -eq 0) { $hasTool = $true } else { $note = "`n`nติดตั้ง esptool ไม่สำเร็จ ลองรันเอง: $python -m pip install esptool" }
            } else { $note = "`n`nยังไม่มี esptool: รัน  $python -m pip install esptool" }
        } else {
            $note = "`n`nเครื่องนี้ยังไม่มี Python (จำเป็นต้องใช้แฟลชบอร์ด)`nติดตั้งจาก python.org โดยติ๊ก 'Add python.exe to PATH' แล้วรัน  python -m pip install esptool"
        }
    }
    Say "ติดตั้งเสร็จแล้ว`nเปิดจากไอคอนบนเดสก์ท็อปหรือเมนู Start ได้เลย$note" | Out-Null
    Start-Process $exe -WorkingDirectory $dest
} catch {
    Say "ติดตั้งไม่สำเร็จ:`n$($_.Exception.Message)" 'OK' 'Error' | Out-Null
    exit 1
}
