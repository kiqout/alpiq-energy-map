@echo off
setlocal
cd /d "%~dp0"

echo ====================================================
echo Alpiq Energy Atlas - Build the Swiss 3D terrain scene
echo ====================================================
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo Python Launcher was not found. Install Python 3.11 from https://www.python.org/downloads/windows/
  echo Make sure the Python Launcher is enabled during installation.
  pause
  exit /b 1
)

if not exist ".venv-swiss-terrain\Scripts\python.exe" (
  echo Creating an isolated Python environment...
  py -3.11 -m venv .venv-swiss-terrain 2>nul
  if errorlevel 1 py -3 -m venv .venv-swiss-terrain
  if errorlevel 1 goto :fail
)

call ".venv-swiss-terrain\Scripts\activate.bat"
if errorlevel 1 goto :fail

echo Installing geospatial processing libraries...
python -m pip install --disable-pip-version-check -r scripts\requirements-swiss-terrain.txt
if errorlevel 1 goto :fail

echo.
echo Downloading SWISSIMAGE, swissALTI3D relief, Copernicus DEM and VIIRS data...
python scripts\build-swiss-terrain.py
if errorlevel 1 goto :fail

echo.
echo Generating the 2,110 municipality light markers...
python scripts\build-municipality-lights.py
if errorlevel 1 goto :fail

echo.
echo SUCCESS - Swiss 3D scene assets have been created.
echo Restart the app with: npm run dev
echo Select Switzerland, then switch between Satellite and Night lights.
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. Read the error above and retry after correcting the issue.
echo Existing assets were not deleted.
pause
exit /b 1
