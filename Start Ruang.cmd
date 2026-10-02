@echo off
cd /d "%~dp0"
if exist "release\Ruang-0.10.2\Ruang.exe" (
  start "" "release\Ruang-0.10.2\Ruang.exe"
) else (
  call npm.cmd start
)
