# -*- coding: utf-8 -*-
"""安装后自检：确认本机环境能让OVO正常接入并运行。"""
from __future__ import print_function

import os
import sys
import socket

def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def port_open(host, port, timeout=1):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        r = s.connect_ex((host, port)) == 0
        s.close()
        return r
    except Exception:
        return False

def main():
    base = get_base_dir()
    os.chdir(base)
    all_ok = True

    print()
    print("=" * 50)
    print("  OVO 安装自检")
    print("=" * 50)
    print()

    # 1. Python 版本
    print("[1] Python")
    print("    版本: %s" % sys.version.split()[0])
    if sys.version_info < (3, 6):
        print("    状态: 需要 Python 3.6 或以上")
        all_ok = False
    else:
        print("    状态: 通过")
    if sys.version_info >= (3, 14):
        print("    建议: 桌面内嵌窗口推荐用 3.11/3.12，当前版本可能需额外依赖")
    print()

    # 2. 必要文件
    print("[2] 项目文件")
    files = [
        ("index.html", "主页面"),
        ("server_with_proxy.py", "本地服务与代理"),
        ("litellm/config.yaml", "LiteLLM 配置"),
    ]
    for path, desc in files:
        full = os.path.join(base, path.replace("/", os.sep))
        if os.path.isfile(full):
            print("    %s: 存在" % desc)
        else:
            print("    %s: 缺失 (%s)" % (desc, path))
            all_ok = False
    print()

    # 3. 可选依赖（桌面版）
    print("[3] 桌面版依赖 (可选)")
    try:
        import webview
        print("    pywebview: 已安装")
    except ImportError:
        print("    pywebview: 未安装 (仅用网页版可忽略；用桌面版请执行 pip install pywebview)")
    print()

    # 4. Docker（LiteLLM 用）
    print("[4] Docker (运行 LiteLLM 时需要)")
    docker_ok = False
    try:
        import subprocess
        r = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        docker_ok = r.returncode == 0
    except Exception:
        pass
    if docker_ok:
        print("    Docker: 已安装且正在运行")
    else:
        print("    Docker: 未检测到或未启动 (要用云模型/通义等请安装并打开 Docker Desktop)")
    print()

    # 5. LiteLLM 端口 4000
    print("[5] LiteLLM 后端 (端口 4000)")
    if port_open("127.0.0.1", 4000):
        print("    状态: 已就绪 (已启动 启动.bat 选 3 LiteLLM 或 Docker 容器)")
    else:
        print("    状态: 未检测到 (使用前请先运行 启动.bat 选 3 LiteLLM)")
    print()

    # 6. Ollama 端口 11434（免 Key 本地模型）
    print("[6] Ollama (端口 11434，可选，用于免 Key 本地模型)")
    if port_open("127.0.0.1", 11434):
        print("    状态: 已就绪")
    else:
        print("    状态: 未检测到 (不用本地免 Key 可忽略；要用请安装 Ollama 并执行 ollama run qwen2:7b)")
    print()

    # 7. 本机服务端口 8888 / 9000
    print("[7] 本地网页服务 (8888/9000)")
    if port_open("127.0.0.1", 8888):
        print("    状态: 8888 已在使用 (本地服务可能已启动)")
    elif port_open("127.0.0.1", 9000):
        print("    状态: 9000 已在使用 (本地服务可能已启动)")
    else:
        print("    状态: 未启动 (使用前请运行 启动.bat 选 1 或 2)")
    print()

    print("=" * 50)
    if all_ok:
        print("  自检完成。必要项均通过，可按教程启动使用。")
        print("  下一步: 运行「启动.bat」选 1（网页）或 2（桌面）打开 OVO。")
    else:
        print("  自检完成。请根据上方提示补全缺失项后再启动。")
        print("  未装 Python: 请阅读「首次安装指引.md」并安装 Python，勾选 Add to PATH。")
    print("=" * 50)
    print()

if __name__ == "__main__":
    main()
