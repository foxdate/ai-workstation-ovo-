# -*- coding: utf-8 -*-
"""OVO 桌面版：内嵌窗口；不再提供「仅浏览器打开」模式。"""
from __future__ import print_function

import os
import sys
import time
import threading


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
    from server_with_proxy import run_server

    port_holder = []
    server_thread = threading.Thread(
        target=run_server,
        kwargs={"host": "127.0.0.1", "ports": [8888, 9000], "port_holder": port_holder},
        daemon=True,
    )
    server_thread.start()

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

    try:
        import webview
    except ImportError:
        print("未安装 pywebview，无法打开桌面窗口。")
        print("请执行: pip install pywebview")
        print("若失败可试: pip install \"pywebview[cef]\"")
        input("按回车退出...")
        sys.exit(1)

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
        except Exception as e:
            print("pywebview 启动失败: %s" % e)
            input("按回车退出...")
            sys.exit(1)


if __name__ == "__main__":
    main()
