# -*- coding: utf-8 -*-
"""OVO 桌面版：内嵌浏览器窗口，无需单独打开网页。"""
from __future__ import print_function

import os
import sys
import time
import threading

# 打包后 exe 所在目录；开发时为脚本所在目录（项目根）
def get_base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def wait_for_server(url, timeout=15, interval=0.3):
    try:
        import urllib.request
        for _ in range(int(timeout / interval)):
            try:
                urllib.request.urlopen(url, timeout=1)
                return True
            except Exception:
                time.sleep(interval)
    except Exception:
        pass
    return False

def main():
    base_dir = get_base_dir()

    # 在后台线程启动服务（与 server_with_proxy 共用逻辑，无需子进程）
    from server_with_proxy import run_server
    port_holder = []
    server_thread = threading.Thread(
        target=run_server,
        kwargs={"host": "127.0.0.1", "ports": [8888, 9000], "port_holder": port_holder},
        daemon=True,
    )
    server_thread.start()

    # 等待端口就绪
    url = None
    for _ in range(50):
        if port_holder:
            port = port_holder[0]
            url = "http://127.0.0.1:%s/" % port
            if wait_for_server(url, timeout=2):
                break
        time.sleep(0.2)
    if not url or not wait_for_server(url, timeout=2):
        print("本地服务启动超时，请检查 8888/9000 端口是否被占用。")
        input("按回车退出...")
        sys.exit(1)

    def open_in_browser():
        print("未使用内嵌窗口，改用默认浏览器打开（功能一致）。")
        print()
        try:
            import webbrowser
            webbrowser.open(url)
            print("已在浏览器中打开: %s" % url)
            print("关闭浏览器后，在本窗口按回车结束本地服务。")
        except Exception:
            print("请手动在浏览器中打开: %s" % url)
        print("按回车退出。")
        input()

    try:
        import webview
        window = webview.create_window(
            "OVO",
            url,
            width=1000,
            height=700,
            min_size=(600, 400),
        )
        try:
            webview.start(gui="cef")
        except Exception:
            try:
                webview.start()
            except Exception:
                open_in_browser()
    except ImportError:
        open_in_browser()

if __name__ == "__main__":
    main()
