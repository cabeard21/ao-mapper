@echo off
setlocal enabledelayedexpansion

:: Self-elevate if not already running as Administrator
net session >nul 2>&1
if errorlevel 1 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: Ensure working directory is the repo root regardless of how the script was launched
cd /d "%~dp0"

echo === ao-mapper startup ===
echo.

:: ── 1. Environment file ──────────────────────────────────────────────────────
if not exist .env (
    echo [setup] .env not found - copying .env.example
    copy .env.example .env >nul
    echo.
    echo  .env created from .env.example.
    echo  Review it now if you need custom settings, then press any key to continue.
    pause >nul
    echo.
)

:: ── 2. Docker infrastructure ─────────────────────────────────────────────────
echo [docker] Starting postgres and redis...
docker compose up -d
if errorlevel 1 (
    echo ERROR: docker compose failed. Is Docker Desktop running?
    pause
    exit /b 1
)

echo [docker] Waiting for postgres to be healthy...
:wait_postgres
    docker compose exec -T postgres pg_isready -U ao_mapper -d ao_mapper >nul 2>&1
    if not errorlevel 1 goto :postgres_ready
    timeout /t 2 /nobreak >nul
    goto :wait_postgres
:postgres_ready
echo [docker] postgres is ready.
echo.

:: ── 3. Install dependencies ───────────────────────────────────────────────────
echo [pnpm] Installing dependencies...
call pnpm install
if errorlevel 1 (
    echo ERROR: pnpm install failed.
    pause
    exit /b 1
)
echo.

:: ── 4. Build all packages ─────────────────────────────────────────────────────
echo [build] Building shared, frontend, and api...
call pnpm build
if errorlevel 1 (
    echo ERROR: build failed. Run 'pnpm build' manually to see errors.
    pause
    exit /b 1
)
echo.

:: ── 5. Database migrations ────────────────────────────────────────────────────
echo [db] Running migrations...
call pnpm --filter @ao-mapper/api db:migrate
if errorlevel 1 (
    echo ERROR: migrations failed.
    pause
    exit /b 1
)
echo.

:: ── 6. Seed zone data if empty ────────────────────────────────────────────────
echo [etl] Checking zone data...
set ZONE_COUNT=0
for /f "tokens=1" %%c in ('docker compose exec -T postgres psql -U ao_mapper -d ao_mapper -t -A -c "SELECT COUNT(*) FROM zones;" 2^>nul') do set ZONE_COUNT=%%c
if "%ZONE_COUNT%"=="0" (
    echo [etl] Zones table is empty - importing game data ^(this may take a minute^)...
    call pnpm --filter @ao-mapper/etl load
    if errorlevel 1 (
        echo WARNING: ETL load failed. The map will work but zone search will be empty.
        echo Run 'pnpm --filter @ao-mapper/etl load' manually to retry.
        echo.
    )
) else (
    echo [etl] Found %ZONE_COUNT% zones - skipping import.
)
echo.

:: ── 7. Check for Python venv ──────────────────────────────────────────────────
if exist .venv\Scripts\python.exe (
    set PYTHON=.venv\Scripts\python.exe
    set HOTKEY_AVAILABLE=1
) else (
    echo [hotkey] .venv not found - hotkey service will be skipped.
    echo          Create it with: python -m venv .venv ^&^& .venv\Scripts\pip install -r packages\hotkey-service\requirements.txt
    set HOTKEY_AVAILABLE=0
)
echo.

:: ── 8. Start API ──────────────────────────────────────────────────────────────
echo [api] Starting API on http://localhost:3001 ...
start "ao-mapper API" cmd /k "pnpm --filter @ao-mapper/api start"

:: ── 9. Start frontend dev server ─────────────────────────────────────────────
echo [frontend] Starting frontend on http://localhost:5173 ...
start "ao-mapper Frontend" cmd /k "pnpm --filter @ao-mapper/frontend dev"

:: ── 10. Start hotkey service ──────────────────────────────────────────────────
if "%HOTKEY_AVAILABLE%"=="1" (
    echo [hotkey] Starting hotkey service ^(F9 to capture portal tooltips^)...
    start "ao-mapper Hotkey" cmd /k "%PYTHON% packages\hotkey-service\main.py"
)

:: ── 11. Start sniffer ─────────────────────────────────────────────────────────
echo [sniffer] Starting zone detection sniffer...
start "ao-mapper Sniffer" cmd /k "pnpm sniffer:dev -- --provider raw --host 127.0.0.1 --port 10001"

:: ── 12. Open browser ──────────────────────────────────────────────────────────
timeout /t 3 /nobreak >nul
start "" http://localhost:5173

:: ── 13. Summary ───────────────────────────────────────────────────────────────
echo.
echo ========================================================
echo  ao-mapper is running!
echo.
echo  Frontend:  http://localhost:5173
echo  API:       http://localhost:3001
echo.
echo  Hotkey service: press F9 while hovering a portal tooltip
echo  to auto-create the connection.
echo.
echo  Npcap preferred for raw socket capture: https://npcap.com
echo ========================================================
echo.

endlocal
