# -*- coding: utf-8 -*-
"""把对话总结追加到 memory_store/chat_summaries.txt（占位方案，替代 Mem0）"""
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "memory_store" / "chat_summaries.txt"
FILE.parent.mkdir(parents=True, exist_ok=True)

def main():
    session = sys.argv[1] if len(sys.argv) > 1 else "default"
    summary = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else sys.stdin.read().strip()
    if not summary:
        print("用法: python append_summary.py [会话ID] 总结内容")
        print("  或: echo 总结内容 | python append_summary.py [会话ID]")
        return
    line = f"[{session}] {datetime.now().strftime('%Y-%m-%d %H:%M')} - {summary}\n"
    with open(FILE, "a", encoding="utf-8") as f:
        f.write(line)
    print("已追加:", line.strip())

if __name__ == "__main__":
    main()
