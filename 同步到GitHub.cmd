@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   正在同步到 GitHub ...
echo ========================================
echo.
node "%~dp0scripts\sync-to-github.mjs" %*
set EXIT_CODE=%ERRORLEVEL%
echo.
if not %EXIT_CODE%==0 (
  echo [ERROR] 同步失败，请检查上方错误信息。
  echo 若提示认证失败，请先配置 GitHub 登录：
  echo   gh auth login
  echo 或在 Git 凭据管理器中保存 Personal Access Token。
  pause
  exit /b %EXIT_CODE%
)
echo 按任意键关闭窗口...
pause >nul
