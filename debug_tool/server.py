#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Realtime Prompt Debugger - Local Server
Combines HTTP static file server (Port 8765) and WebSocket Relay (Port 8766).
Relays browser audio/events to DashScope Realtime API with custom Authorization header.
"""

import os
import sys
import json
import asyncio
import threading
import webbrowser
import http.server
import socketserver
import urllib.parse
from pathlib import Path

# Force UTF-8 on Windows command prompts to avoid GBK UnicodeEncodeError
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

try:
    import websockets
except ImportError:
    print("❌ 缺少 websockets 库，正在为您自动安装...")
    os.system(f'"{sys.executable}" -m pip install websockets')
    import websockets

HTTP_PORT = 8765
WS_PORT = 8766
DASHSCOPE_WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-omni-flash-realtime"

BASE_DIR = Path(__file__).parent.resolve()
STATIC_DIR = BASE_DIR / "static"


class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """Serve static files from static/ directory with proper MIME types."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format, *args):
        # Silence routine static asset requests for clean console
        pass


def run_http_server():
    """Run HTTP static file server in a background thread."""
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", HTTP_PORT), CustomHTTPHandler) as httpd:
        print(f"🌐 [HTTP] 本地调试网页已就绪: http://127.0.0.1:{HTTP_PORT}")
        httpd.serve_forever()


async def relay_handler(client_ws):
    """Handle client connection and relay bi-directionally to DashScope."""
    # Extract apiKey from URL path or query
    # e.g. ws://127.0.0.1:8766/?apiKey=sk-xxx
    parsed_path = urllib.parse.urlparse(client_ws.request.path if hasattr(client_ws, 'request') else client_ws.path)
    query_params = urllib.parse.parse_qs(parsed_path.query)
    api_key = query_params.get("apiKey", [None])[0]

    dashscope_ws = None
    try:
        # If not in query string, wait for first JSON message
        if not api_key:
            initial_msg_str = await client_ws.recv()
            try:
                initial_msg = json.loads(initial_msg_str)
                if initial_msg.get("type") == "init":
                    api_key = initial_msg.get("apiKey", "").strip()
                else:
                    await client_ws.send(json.dumps({
                        "type": "error",
                        "error": {"message": "首次建立连接需先发送包含 apiKey 的 init 消息或通过 URL 传递"}
                    }))
                    return
            except Exception as e:
                await client_ws.send(json.dumps({
                    "type": "error",
                    "error": {"message": f"解析初始参数失败: {e}"}
                }))
                return

        if not api_key or not api_key.startswith("sk-"):
            await client_ws.send(json.dumps({
                "type": "error",
                "error": {"message": "无效的 DashScope API Key，必须以 sk- 开头"}
            }))
            return

        print(f"🔗 [Proxy] 正在直连阿里云百炼 Realtime API (Key: {api_key[:7]}...)...")

        # Connect upstream to DashScope with Authorization header
        dashscope_ws = await websockets.connect(
            DASHSCOPE_WS_URL,
            additional_headers={"Authorization": f"Bearer {api_key}"},
            ping_interval=20,
            ping_timeout=20
        )
        print("✅ [Proxy] 百炼 WebSocket 长连接握手成功！开始双向透传音频流...")

        # Notify browser client that upstream is ready
        await client_ws.send(json.dumps({"type": "proxy.ready"}))

        # Forward tasks
        async def client_to_dashscope():
            try:
                async for message in client_ws:
                    if dashscope_ws.state == websockets.protocol.State.OPEN:
                        await dashscope_ws.send(message)
            except Exception:
                pass

        async def dashscope_to_client():
            try:
                async for message in dashscope_ws:
                    if client_ws.state == websockets.protocol.State.OPEN:
                        await client_ws.send(message)
            except Exception:
                pass

        # Run both forwarders concurrently
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(client_to_dashscope()),
                asyncio.create_task(dashscope_to_client())
            ],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except Exception as e:
        print(f"❌ [Proxy] 连接异常: {e}")
        try:
            await client_ws.send(json.dumps({
                "type": "error",
                "error": {"message": f"代理服务异常: {str(e)}"}
            }))
        except Exception:
            pass
    finally:
        if dashscope_ws:
            await dashscope_ws.close()
        print("🔌 [Proxy] 会话结束，连接已释放。")


async def main():
    print("=" * 65)
    print("🎙️ Realtime 实时语音提示词本地调试工作台 (Prompt Debugger)")
    print("=" * 65)

    # 1. Start HTTP Server in background thread
    http_thread = threading.Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # 2. Open browser automatically
    def open_browser():
        import time
        time.sleep(1)
        url = f"http://127.0.0.1:{HTTP_PORT}"
        print(f"🚀 [Browser] 正在自动为您打开浏览器: {url}")
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()

    # 3. Start WebSocket Server
    print(f"⚡ [WebSocket] 本地透明代理已就绪: ws://127.0.0.1:{WS_PORT}")
    print("💡 提示: 您可以在浏览器中自由调整提示词并随时测试语音连麦。按 Ctrl+C 可停止。")
    print("=" * 65)

    async with websockets.serve(relay_handler, "127.0.0.1", WS_PORT):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 调试服务器已安全关闭。")
