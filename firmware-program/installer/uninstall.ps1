Add-Type -AssemblyName System.Windows.Forms
$name = 'SMMB Firmware Flasher'
$dest = Split-Path -Parent $MyInvocation.MyCommand.Path
$ask = [System.Windows.Forms.MessageBox]::Show("ถอนการติดตั้ง $name ?", $name, 'YesNo', 'Question')
if ($ask -ne 'Yes') { exit 0 }
Get-Process -Name 'SMMB-Firmware-Flasher' -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) "$name.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) "$name.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SMMBFirmwareFlasher' -Recurse -Force -ErrorAction SilentlyContinue
# ลบโฟลเดอร์หลังสคริปต์นี้จบ
Start-Process cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$dest`"" -WindowStyle Hidden
