# สร้าง SMMB-Firmware-Flasher-Setup.exe ด้วย IExpress (มีในตัว Windows)
# ใช้: powershell -ExecutionPolicy Bypass -File installer\build-setup.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $root '..\app'
$fw = Join-Path $root '..\..\firmware'
$out = Join-Path $root 'dist'
$stage = Join-Path $env:TEMP 'smmb-setup-stage'
$pkg = Join-Path $env:TEMP 'smmb-setup-pkg'
Remove-Item $stage, $pkg -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage, "$stage\firmware", $pkg, $out | Out-Null

$version = ((Select-String -Path (Join-Path $app 'Cargo.toml') -Pattern '^version\s*=\s*"(.+)"').Matches[0].Groups[1].Value)
Copy-Item (Join-Path $app 'SMMB-Firmware-Flasher.exe') $stage
Copy-Item (Join-Path $app 'assets\app.ico') $stage
Set-Content (Join-Path $stage 'version.txt') $version
foreach ($f in 'bootloader.bin','partitions.bin','boot_app0.bin') { Copy-Item (Join-Path $fw $f) "$stage\firmware" }
Get-ChildItem $fw -Filter 'firmware-*.bin' | Copy-Item -Destination "$stage\firmware"
Compress-Archive -Path "$stage\*" -DestinationPath "$pkg\payload.zip" -Force
foreach ($f in 'install.cmd','install.ps1','uninstall.ps1') { Copy-Item (Join-Path $root $f) $pkg }

$target = Join-Path $out 'SMMB-Firmware-Flasher-Setup.exe'
Remove-Item $target -Force -ErrorAction SilentlyContinue
$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$target
FriendlyName=SMMB Firmware Flasher Setup
AppLaunched=cmd.exe /c install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[SourceFiles]
SourceFiles0=$pkg\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
[Strings]
FILE0="install.cmd"
FILE1="install.ps1"
FILE2="uninstall.ps1"
FILE3="payload.zip"
"@
$sedPath = Join-Path $env:TEMP 'smmb-setup.sed'
Set-Content $sedPath $sed -Encoding ASCII
& "$env:WINDIR\System32\iexpress.exe" /N /Q $sedPath | Out-Null
Start-Sleep 2
while (Get-Process iexpress -ErrorAction SilentlyContinue) { Start-Sleep 1 }
if (-not (Test-Path $target)) { throw 'IExpress ไม่สร้างไฟล์ Setup' }
"{0}  ({1:N1} MB)" -f $target, ((Get-Item $target).Length / 1MB)
