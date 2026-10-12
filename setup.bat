@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title AncestralWhisper - Auto Setup

echo =====================================================
echo    ANCESTRALWHISPER - TỔ TIÊN MÁCH BẢO AUTO SETUP
echo =====================================================
echo.

set "SCRIPT_DIR=%~dp0"
:: Loại bỏ dấu backslash ở cuối nếu có
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

echo [i] Thu muc extension: "%SCRIPT_DIR%"
echo.

set "ENV_FILE=%SCRIPT_DIR%\.env"
set "ENV_EXAMPLE=%SCRIPT_DIR%\.env.example"

:: 1. Kiem tra file .env
if not exist "%ENV_FILE%" (
    if exist "%ENV_EXAMPLE%" (
        echo [i] Dang khoi tao file .env tu .env.example...
        copy "%ENV_EXAMPLE%" "%ENV_FILE%" >nul
    ) else (
        echo [i] Dang tao moi file .env...
        (
            echo # AncestralWhisper Configuration
            echo GEMINI_API_KEY=
            echo GEMINI_MODEL=auto
            echo DEFAULT_MODE=semi-auto
        ) > "%ENV_FILE%"
    )
    echo [v] Da tao file .env thanh cong!
) else (
    echo [v] File .env da ton tai san.
)

:: 2. Kiem tra API Key trong .env
set "API_KEY="
for /f "tokens=1,* delims==" %%A in ('type "%ENV_FILE%" 2^>nul') do (
    if "%%A"=="GEMINI_API_KEY" set "API_KEY=%%B"
)

:: Xoa khoang trang hoac dau ngoac kep
set "API_KEY=%API_KEY:"=%"
set "API_KEY=%API_KEY: =%"

if "%API_KEY%"=="" (
    echo.
    echo [!] Chua co Gemini API Key duoc thiet lap.
    echo     (Lay key mien phi tai: https://aistudio.google.com/apikey)
    set /p "INPUT_KEY=>> Nhap hoac dan Gemini API Key cua ban (hoac Enter de bo qua): "
    
    if not "!INPUT_KEY!"=="" (
        :: Thay the hoac ghi vao .env
        powershell -Command "(Get-Content '%ENV_FILE%') -replace '^GEMINI_API_KEY=.*', 'GEMINI_API_KEY=!INPUT_KEY!' | Set-Content '%ENV_FILE%'"
        echo [v] Da luu Gemini API Key vao file .env!
    ) else (
        echo [i] Bo qua nhap key. Ban co the sua file .env sau bat cu luc nao.
    )
) else (
    echo [v] API Key da san sang trong file .env.
)

:: 3. Copy duong dan vao Clipboard
echo %SCRIPT_DIR%| clip
echo.
echo [v] Da tu dong COPY duong dan thu muc vao Clipboard!
echo.
echo =====================================================
echo  HUONG DAN CAI DAT VAO CHROME / EDGE / BRAVE:
echo =====================================================
echo 1. Mo trinh duyet va truy cap: chrome://extensions/
echo 2. Bat cong tac Developer mode (goc tren ben phai).
echo 3. Bam vao nut "Load unpacked" (Tai tien ich da giai nen).
echo 4. Chi can bam Ctrl+V de dan duong dan da copy va bam "Select Folder".
echo.
echo =====================================================
echo  PHIM TAT SU DUNG:
echo   * Alt + S : Chup man hinh giai de thi (Skillups va moi web)
echo   * Alt + L : Bat/Tat thu am bai nghe Listening
echo   * Alt + H : An/Hien widget dieu khien
echo =====================================================
echo.
pause
