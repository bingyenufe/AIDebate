@echo off
chcp 65001 >nul
title Realtime 实时语音提示词本地调试工作台
cd /d "%~dp0"

echo ================================================================
echo  🎙️ 正在启动 Realtime 提示词本地调试工作台...
echo ================================================================
echo.

python -c "import websockets" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 正在安装必要的 websockets 依赖...
    python -m pip install websockets
)

python server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ 运行出错，请检查 Python 是否已安装并配置在环境变量中。
    pause
)
