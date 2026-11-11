@echo off
chcp 65001 >nul
rem Double-click to update JJptt from GitHub.
cd /d "%~dp0"
echo Updating JJptt...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Update failed. Send a screenshot of the messages above to Claude.
) else (
  echo.
  echo Done. Go back to JJptt and click Apply update.
)
pause
