# -*- coding: utf-8 -*-
"""
采集本机状态，供 Cursor 等 IDE 内 AI 读取，便于结合电脑状态回答问题。
仅收集可公开的系统与使用情况，不采集密码、密钥等敏感信息。
"""
from __future__ import print_function

import json
import os
import platform
import sys
from datetime import datetime
from pathlib import Path

def _safe_list(lst, limit=50):
    if lst is None:
        return []
    return list(lst)[:limit]

def _get_basic():
    """仅用标准库：系统、用户、时间、环境摘要。"""
    out = {
        "collected_at": datetime.now().isoformat(),
        "python": sys.version.split()[0],
        "hostname": platform.node(),
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
        },
        "user": os.environ.get("USERNAME") or os.environ.get("USER") or "",
        "cwd": os.getcwd(),
        "env_summary": {
            "PATH_len": len(os.environ.get("PATH", "")),
            "HOME": os.environ.get("HOME") or os.environ.get("USERPROFILE") or "",
        },
        "disks": [],
        "processes": [],
        "memory": None,
    }
    # 磁盘（Windows 用 ctypes，Unix 用 statvfs）
    try:
        if platform.system() == "Windows":
            try:
                import ctypes
                drive_bits = ctypes.windll.kernel32.GetLogicalDrives()
                for i in range(26):
                    if (drive_bits >> i) & 1:
                        letter = chr(65 + i) + ":"
                        total, free = _win_disk(letter)
                        if total is not None:
                            out["disks"].append({"drive": letter, "total_gb": round(total / (1024**3), 2), "free_gb": round(free / (1024**3), 2)})
                if not out["disks"]:
                    out["disks"].append({"drive": "C:", "note": "could not get disk space"})
            except Exception as e:
                out["disks"] = [{"error": str(e)}]
        else:
            st = os.statvfs("/")
            out["disks"].append({
                "mount": "/",
                "total_gb": round(st.f_frsize * st.f_blocks / (1024**3), 2),
                "free_gb": round(st.f_frsize * st.f_bavail / (1024**3), 2),
            })
    except Exception as e:
        out["disks"] = [{"error": str(e)}]

    return out

def _win_disk(letter):
    """Windows 磁盘空间（仅当 os.statvfs 不可用时）。"""
    try:
        import ctypes
        free = ctypes.c_ulonglong()
        total = ctypes.c_ulonglong()
        ctypes.windll.kernel32.GetDiskFreeSpaceExW(  # noqa
            ctypes.c_wchar_p(letter + "\\"), None, ctypes.byref(total), ctypes.byref(free)
        )
        return total.value, free.value
    except Exception:
        return None, None

def _add_psutil(state):
    """若已安装 psutil，补充进程列表与内存。"""
    try:
        import psutil
        state["memory"] = {
            "total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
            "available_gb": round(psutil.virtual_memory().available / (1024**3), 2),
            "percent_used": psutil.virtual_memory().percent,
        }
        procs = []
        for p in _safe_list(psutil.process_iter(["pid", "name", "status"]), 80):
            try:
                procs.append({"pid": p.info.get("pid"), "name": (p.info.get("name") or "")[:64], "status": p.info.get("status")})
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        state["processes"] = procs
    except ImportError:
        state["processes"] = [{"note": "安装 psutil 可采集进程与内存: pip install psutil"}]
    except Exception as e:
        state["processes"] = [{"error": str(e)}]
    return state

def main():
    out_path = None
    if len(sys.argv) > 1 and sys.argv[1] in ("--output", "-o") and len(sys.argv) > 2:
        out_path = sys.argv[2]

    state = _get_basic()
    state = _add_psutil(state)

    if out_path:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        print("OK", out_path)
    else:
        print(json.dumps(state, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
