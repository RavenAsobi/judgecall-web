@echo off
chcp 65001 >nul
setlocal

set "PROJECT_DIR=%~dp0"
set "NODE_EXE=%~dp0..\.tmp\node-v22.23.1-win-x64\node.exe"

if not exist "%NODE_EXE%" (
  where node.exe >nul 2>&1
  if errorlevel 1 (
    echo 未找到 Node.js。
    echo 请安装 Node.js 22，或者保留 D:\JudgeCall-Web\.tmp\node-v22.23.1-win-x64\node.exe
    pause
    exit /b 1
  )
  set "NODE_EXE=node.exe"
)

if not exist "%PROJECT_DIR%server\.env" (
  echo 缺少 server\.env，无法校验原初管理员密码。
  pause
  exit /b 1
)

pushd "%PROJECT_DIR%server"
start "Lynx Beta Server - 关闭此窗口即可停止服务" /min "%NODE_EXE%" index.js
popd

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3000/"

echo Lynx Beta 已在浏览器中打开。
echo 本地地址：http://127.0.0.1:3000/
echo 如需停止服务，请关闭最小化的 Lynx Beta Server 窗口。
timeout /t 4 /nobreak >nul
endlocal
