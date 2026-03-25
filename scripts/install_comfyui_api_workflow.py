#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 ComfyUI 的 API 工作流 JSON 安装到OVO工作区。

无需在 ComfyUI 里点「Save (API Format)」时，可用以下任一方式拿到 JSON 后由本脚本写入：

1. 浏览器 F12 → Network → 在 ComfyUI 里点「Queue」→ 找到对 /prompt 的 POST →
   右键「Copy」→「Copy as cURL」或复制 Request Payload，保存为 .json 文件；
2. 若已从别处得到「API 格式」工作流（顶层键为节点 ID 字符串），直接作为输入。

本脚本会：
- 自动从 { "prompt": { ... } } 中取出 prompt；
- 校验是否为 ComfyUI API 工作流形态；
- 写入项目 zhiquan_workspace/comfyui_api_workflow.json（可 --dry-run 只检查）。

用法:
  python scripts/install_comfyui_api_workflow.py path/to/saved.json
  python scripts/install_comfyui_api_workflow.py -  < payload.json   # stdin

仅「画布 UI 格式」（含 nodes / links 数组）无法由本脚本转换，需用 ComfyUI 导出 API 格式，
或使用能生成 /prompt 请求体的其它工具。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _default_out() -> Path:
    return _repo_root() / "zhiquan_workspace" / "comfyui_api_workflow.json"


def _is_api_node_entry(v: object) -> bool:
    if not isinstance(v, dict):
        return False
    if "class_type" not in v or "inputs" not in v:
        return False
    return isinstance(v.get("inputs"), dict)


def _looks_like_api_prompt(obj: object) -> bool:
    """ComfyUI /prompt 的 prompt 字段：字符串键 -> { class_type, inputs, ... }。"""
    if not isinstance(obj, dict) or not obj:
        return False
    for k, v in obj.items():
        if not isinstance(k, str):
            return False
        if not k.isdigit():
            # 少数自定义节点 id 可能非纯数字，放宽：允许非空字符串键
            if not k.strip():
                return False
        if not _is_api_node_entry(v):
            return False
    return True


def extract_prompt(data: object) -> dict:
    """从多种包装中取出 API prompt 字典。"""
    if isinstance(data, dict):
        if "prompt" in data and isinstance(data["prompt"], dict):
            inner = data["prompt"]
            if _looks_like_api_prompt(inner):
                return inner
        if _looks_like_api_prompt(data):
            return data
        # 有些导出可能嵌套一层
        for key in ("workflow", "api_prompt"):
            inner = data.get(key)
            if isinstance(inner, dict) and _looks_like_api_prompt(inner):
                return inner
    raise ValueError(
        "无法识别为 ComfyUI API 工作流：需要顶层为节点字典，或包含 prompt 字段。\n"
        "若当前是「画布 UI」JSON（含 nodes/links），请先在 ComfyUI 中导出 API 格式，"
        "或从浏览器 Network 里复制 /prompt 的请求体。"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="安装 ComfyUI API 工作流到 zhiquan_workspace")
    ap.add_argument(
        "input",
        nargs="?",
        default="-",
        help="输入 JSON 文件路径，缺省或 - 表示从 stdin 读取",
    )
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help=f"输出路径（默认: {_default_out()}）",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="只校验并打印节点数量，不写文件",
    )
    args = ap.parse_args()

    raw: str
    if args.input in ("-", None):
        raw = sys.stdin.read()
    else:
        p = Path(args.input)
        if not p.is_file():
            print(f"错误: 文件不存在: {p}", file=sys.stderr)
            return 2
        raw = p.read_text(encoding="utf-8", errors="replace")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"错误: JSON 解析失败: {e}", file=sys.stderr)
        return 2

    try:
        prompt = extract_prompt(data)
    except ValueError as e:
        print(f"错误: {e}", file=sys.stderr)
        return 2

    out = args.output or _default_out()
    text = json.dumps(prompt, ensure_ascii=False, indent=2)

    if args.dry_run:
        print(f"校验通过。节点数: {len(prompt)}")
        print("(dry-run，未写入文件)")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"已写入: {out}")
    print(f"节点数: {len(prompt)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
