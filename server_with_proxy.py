# -*- coding: utf-8 -*-
"""本地静态服务 + LiteLLM 代理，避免浏览器跨域。"""
import http.server
import subprocess
import urllib.request
import urllib.error
import urllib.parse
import json
import os
import sys
import copy
import time
import random
import uuid
import base64

PORT = int(os.environ.get("RECALLWEB_PORT", "8888"))
LITELLM_URL = "http://127.0.0.1:4000"

def _api_config_path():
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "api_config.json")


def _workspace_dir():
    """OVO与 Cursor 等 IDE 联动：状态与拓展代码存放目录（项目内）。"""
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "zhiquan_workspace")


def _browser_capture_path():
    """浏览器捕获数据存放路径，供前端/扩展写入与读取。"""
    return os.path.join(_workspace_dir(), "browser_capture.json")


def _conversations_path():
    """对话持久化文件路径，重启后可从该文件恢复对话列表。"""
    return os.path.join(_workspace_dir(), "conversations.json")

def _assets_dir():
    """生成/挑选后的美术资源存放目录（项目内工作区）。"""
    return os.path.join(_workspace_dir(), "assets")


def _comfyui_workflow_path():
    """ComfyUI「Save (API Format)」导出 JSON，供抽卡批量改写提示词与尺寸。"""
    return os.path.join(_workspace_dir(), "comfyui_api_workflow.json")


def _natural_node_id(nid):
    try:
        return (0, int(nid))
    except (ValueError, TypeError):
        return (1, str(nid))


def _build_comfyui_prompt_with_anchors(prompt, prompt_prefix, prompt_suffix):
    """将可变提示词与固定前缀/后缀合并为英文 tag 常见逗号分隔形式。"""
    parts = []
    pp = (prompt_prefix or "").strip().strip(",").strip()
    p = (prompt or "").strip()
    ps = (prompt_suffix or "").strip().strip(",").strip()
    if pp:
        parts.append(pp)
    if p:
        parts.append(p)
    if ps:
        parts.append(ps)
    return ", ".join(parts) if parts else ""


def _comfyui_upload_image_bytes(base_url, image_bytes, filename="ovo_control.png"):
    """POST /upload/image，返回 LoadImage 可用的 image 路径字符串。"""
    boundary = "----OVOFormBoundary" + uuid.uuid4().hex
    base = base_url.rstrip("/")
    safe_name = filename.replace('"', "").replace("\r", "").replace("\n", "") or "ovo_control.png"
    lower = safe_name.lower()
    ctype = "image/png"
    if lower.endswith((".jpg", ".jpeg")):
        ctype = "image/jpeg"
    elif lower.endswith(".webp"):
        ctype = "image/webp"
    crlf = "\r\n"
    parts = []
    parts.append("--" + boundary)
    parts.append('Content-Disposition: form-data; name="image"; filename="%s"' % safe_name)
    parts.append("Content-Type: " + ctype)
    parts.append("")
    body_head = crlf.join(parts).encode("utf-8") + b"\r\n\r\n"
    body_tail = (crlf + "--" + boundary + "--" + crlf).encode("utf-8")
    body = body_head + image_bytes + body_tail
    req = urllib.request.Request(
        base + "/upload/image",
        data=body,
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    name = data.get("name")
    if not name:
        raise RuntimeError("ComfyUI 上传图片未返回 name: %s" % raw[:500])
    subfolder = (data.get("subfolder") or "").replace("\\", "/").strip("/")
    if subfolder:
        return subfolder + "/" + name
    return name


def _collect_lora_applicable_nodes(w):
    """标准 LoraLoader / LoraLoaderModelOnly 节点，按 ID 排序。"""
    out = []
    for nid, node in w.items():
        if not isinstance(node, dict):
            continue
        ct = str(node.get("class_type", ""))
        if ct in ("LoraLoader", "LoraLoaderModelOnly"):
            out.append((nid, node, ct))
    out.sort(key=lambda x: _natural_node_id(x[0]))
    return out


def _patch_lora_nodes(w, lora_configs):
    """按顺序将 lora_configs 应用到工作流中的 LoRA 节点。"""
    if not lora_configs:
        return
    nodes_list = _collect_lora_applicable_nodes(w)
    idx = 0
    for cfg in lora_configs:
        if idx >= len(nodes_list):
            break
        if not isinstance(cfg, dict):
            continue
        name = (cfg.get("lora_name") or cfg.get("model_name") or "").strip()
        if not name:
            continue
        _nid, node, ct = nodes_list[idx]
        idx += 1
        inp = node.setdefault("inputs", {})
        inp["lora_name"] = name
        try:
            sm = float(cfg.get("strength_model", cfg.get("strength", 1.0)))
        except (TypeError, ValueError):
            sm = 1.0
        try:
            sc = float(cfg.get("strength_clip", 1.0))
        except (TypeError, ValueError):
            sc = 1.0
        if ct == "LoraLoader":
            inp["strength_model"] = sm
            inp["strength_clip"] = sc
        elif ct == "LoraLoaderModelOnly":
            inp["strength_model"] = sm


def _patch_comfyui_workflow(
    wf,
    prompt,
    negative,
    width,
    height,
    batch_size,
    seed,
    prompt_prefix="",
    prompt_suffix="",
    lora_configs=None,
    control_image_filename=None,
    control_load_image_node_id=None,
    style_image_filename=None,
    style_load_image_node_id=None,
):
    """按常见节点类型修补工作流（CLIPTextEncode、EmptyLatentImage、KSampler、LoRA、LoadImage）。"""
    w = copy.deepcopy(wf)
    combined_prompt = _build_comfyui_prompt_with_anchors(prompt, prompt_prefix, prompt_suffix)
    clip_nodes = []
    for nid, node in w.items():
        if not isinstance(node, dict):
            continue
        ct = str(node.get("class_type", ""))
        if ct == "CLIPTextEncode" or "CLIPTextEncode" in ct:
            clip_nodes.append((nid, node))
    clip_nodes.sort(key=lambda x: _natural_node_id(x[0]))
    if len(clip_nodes) >= 1:
        clip_nodes[0][1].setdefault("inputs", {})["text"] = combined_prompt or ""
    if len(clip_nodes) >= 2:
        clip_nodes[1][1].setdefault("inputs", {})["text"] = negative or ""
    if not clip_nodes:
        text_nodes = []
        for nid, node in w.items():
            if not isinstance(node, dict):
                continue
            inp = node.get("inputs") or {}
            if "text" in inp and isinstance(inp.get("text"), str):
                text_nodes.append((nid, node))
        text_nodes.sort(key=lambda x: _natural_node_id(x[0]))
        if len(text_nodes) >= 1:
            text_nodes[0][1].setdefault("inputs", {})["text"] = combined_prompt or ""
        if len(text_nodes) >= 2:
            text_nodes[1][1].setdefault("inputs", {})["text"] = negative or ""
    for nid, node in w.items():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") == "EmptyLatentImage":
            inp = node.setdefault("inputs", {})
            inp["width"] = int(width)
            inp["height"] = int(height)
            inp["batch_size"] = int(batch_size)
            break
    seed_val = int(seed) if seed is not None else -1
    if seed_val < 0:
        seed_val = random.randint(0, 2**31 - 1)
    for nid, node in w.items():
        if not isinstance(node, dict):
            continue
        ct = node.get("class_type", "")
        if ct in ("KSampler", "KSamplerAdvanced"):
            node.setdefault("inputs", {})["seed"] = seed_val
            break
    if lora_configs:
        _patch_lora_nodes(w, lora_configs)
    if control_image_filename and control_load_image_node_id:
        nid = str(control_load_image_node_id).strip()
        if nid not in w:
            raise ValueError("ControlNet LoadImage 节点 ID 不存在于工作流中: %s" % nid)
        node = w[nid]
        if not isinstance(node, dict) or str(node.get("class_type", "")) != "LoadImage":
            raise ValueError("节点 %s 不是 LoadImage，无法写入 ControlNet 参考图" % nid)
        node.setdefault("inputs", {})["image"] = control_image_filename
    if style_image_filename and style_load_image_node_id:
        nid = str(style_load_image_node_id).strip()
        if nid not in w:
            raise ValueError("画风参考 LoadImage 节点 ID 不存在于工作流中: %s" % nid)
        node = w[nid]
        if not isinstance(node, dict) or str(node.get("class_type", "")) != "LoadImage":
            raise ValueError("节点 %s 不是 LoadImage，无法写入画风参考图" % nid)
        node.setdefault("inputs", {})["image"] = style_image_filename
    return w


def _comfyui_queue_and_collect(base_url, workflow, timeout_sec=600):
    """向 ComfyUI 提交 /prompt，轮询 /history，拉取 /view 图片为 base64。"""
    base = base_url.rstrip("/")
    client_id = str(uuid.uuid4())
    body = json.dumps({"prompt": workflow, "client_id": client_id}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(base + "/prompt", data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            q = json.loads(raw)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError("ComfyUI /prompt 失败 HTTP %s: %s" % (e.code, err_body[:1200]))
    prompt_id = q.get("prompt_id")
    if not prompt_id:
        raise RuntimeError("ComfyUI 未返回 prompt_id: %s" % str(q)[:500])
    deadline = time.time() + timeout_sec
    hist_entry = None
    while time.time() < deadline:
        hreq = urllib.request.Request(base + "/history/" + urllib.parse.quote(str(prompt_id), safe=""))
        with urllib.request.urlopen(hreq, timeout=60) as hresp:
            hist = json.loads(hresp.read().decode("utf-8"))
        if isinstance(hist, dict):
            for k, entry in hist.items():
                if str(k) == str(prompt_id) and isinstance(entry, dict) and entry.get("outputs"):
                    hist_entry = entry
                    break
            if hist_entry:
                break
        time.sleep(0.4)
    if not hist_entry:
        raise RuntimeError("等待 ComfyUI 出图超时（prompt_id=%s），请确认 ComfyUI 已启动且工作流可运行。" % prompt_id)
    images_b64 = []
    outputs = hist_entry.get("outputs") or {}
    for node_id, out in outputs.items():
        for img in out.get("images") or []:
            fn = img.get("filename")
            if not fn:
                continue
            sub = img.get("subfolder") or ""
            typ = img.get("type", "output")
            qstr = urllib.parse.urlencode({"filename": fn, "type": typ, "subfolder": sub})
            vreq = urllib.request.Request(base + "/view?" + qstr)
            with urllib.request.urlopen(vreq, timeout=180) as vresp:
                blob = vresp.read()
            images_b64.append(base64.b64encode(blob).decode("ascii"))
    if not images_b64:
        raise RuntimeError("ComfyUI 执行完成但未在 outputs 中发现图片（请检查工作流是否包含 SaveImage 等输出节点）。")
    return images_b64


def _project_root():
    """项目根目录（绝对路径），供工作站「在某某软件中打开」使用。"""
    return os.path.dirname(os.path.abspath(__file__))


def _integrated_apps_path():
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "integrated_apps.json")

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/local-config":
            self._get_local_config()
        elif path == "/api/integrated-apps":
            self._get_integrated_apps()
        elif path == "/api/project-path":
            self._get_project_path()
        elif path == "/api/app-code":
            self._get_app_code()
        elif path == "/api/browser-data":
            self._get_browser_data()
        elif path == "/api/conversations":
            self._get_conversations()
        elif path == "/api/workspace-files":
            self._list_workspace_files()
        elif path == "/api/comfyui-workflow-status":
            self._get_comfyui_workflow_status()
        elif path.startswith("/api/workspace-file"):
            self._get_workspace_file()
        elif self.path.startswith("/api/v1/"):
            self._proxy_to_litellm()
        else:
            self._serve_static()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/local-config":
            self._save_local_config()
        elif path == "/api/export-state":
            self._export_state()
        elif path == "/api/export-conversation":
            self._export_conversation()
        elif path == "/api/collect-computer-state":
            self._collect_computer_state()
        elif path == "/api/plugin-call":
            self._plugin_call()
        elif path == "/api/browser-data":
            self._post_browser_data()
        elif path == "/api/conversations":
            self._save_conversations()
        elif path == "/api/save-asset":
            self._save_asset()
        elif path == "/api/comfyui-generate":
            self._post_comfyui_generate()
        elif self.path.startswith("/api/v1/"):
            self._proxy_to_litellm()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        path = self.path.split("?")[0]
        if path == "/api/browser-data":
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "86400")
            self.end_headers()
        else:
            self.send_error(404)

    def _get_integrated_apps(self):
        """返回已接入的工作站软件列表（用于 AI 软件工作站平滑切换）。"""
        try:
            p = _integrated_apps_path()
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = {"apps": []}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"apps": [], "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _get_project_path(self):
        """返回项目根目录绝对路径，供前端「复制路径」「在 Cursor 中打开」等使用。"""
        try:
            path = _project_root()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"path": path}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"path": "", "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _get_app_code(self):
        """返回本软件拓展相关代码/说明，供「创建拓展协助对话」作为附件发给 AI。"""
        try:
            base = os.path.dirname(os.path.abspath(__file__))
            doc_path = os.path.join(base, "docs", "09-自我拓展-API说明.md")
            if os.path.isfile(doc_path):
                with open(doc_path, "r", encoding="utf-8") as f:
                    content = f.read()
            else:
                content = "# OVO自我拓展 API\n\n见项目 docs 目录下的自我拓展说明。ext.addPanel(id,name,html)、ext.toast(msg)、ext.getMessages()、ext.getState/setState、ext.runCode(code)。"
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"content": content}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"content": "", "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _get_browser_data(self):
        """返回最近一次浏览器推送的页面数据，供OVO前端展示或插入对话。"""
        try:
            p = _browser_capture_path()
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = {}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _post_browser_data(self):
        """接收浏览器扩展/书签推送的页面数据并保存，供OVO读取。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                os.makedirs(wdir, exist_ok=True)
            out = {
                "url": data.get("url", ""),
                "title": data.get("title", ""),
                "content": data.get("content", ""),
                "selection": data.get("selection", ""),
                "timestamp": data.get("timestamp", ""),
            }
            with open(_browser_capture_path(), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _get_conversations(self):
        """返回持久化的对话列表与当前标签页，供前端启动时恢复。"""
        try:
            p = _conversations_path()
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = {}
            conversations = data.get("conversations")
            if not isinstance(conversations, list):
                conversations = []
            currentTabId = data.get("currentTabId")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"conversations": conversations, "currentTabId": currentTabId}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"conversations": [], "currentTabId": None, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _save_conversations(self):
        """保存前端提交的对话列表与当前标签页，写入文件以便重启后恢复。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            conversations = data.get("conversations")
            if not isinstance(conversations, list):
                conversations = []
            currentTabId = data.get("currentTabId")
            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                os.makedirs(wdir, exist_ok=True)
            out = {"conversations": conversations, "currentTabId": currentTabId}
            with open(_conversations_path(), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _save_asset(self):
        """保存前端挑选的图片到工作区 assets/，用于像素美术抽卡工作流。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            image = data.get("image", "")  # data URL 或 http(s) URL
            filename = (data.get("filename") or "").strip()
            subdir = (data.get("subdir") or "").strip()
            if not image:
                raise ValueError("missing image")

            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                os.makedirs(wdir, exist_ok=True)
            adir = _assets_dir()
            if subdir:
                # 简单防穿越
                subdir = subdir.replace("\\", "/").strip("/")
                subdir = "/".join([p for p in subdir.split("/") if p and p not in (".", "..")])
                adir = os.path.join(adir, subdir) if subdir else adir
            os.makedirs(adir, exist_ok=True)

            if not filename:
                filename = "asset_%d.png" % int(__import__("time").time() * 1000)
            if not filename.lower().endswith(".png"):
                filename += ".png"
            out_path = os.path.join(adir, filename)

            if isinstance(image, str) and image.startswith("data:image"):
                # data:image/png;base64,xxxx
                if "base64," not in image:
                    raise ValueError("invalid data url")
                b64 = image.split("base64,", 1)[1]
                import base64
                blob = base64.b64decode(b64.encode("utf-8"))
                with open(out_path, "wb") as f:
                    f.write(blob)
            elif isinstance(image, str) and (image.startswith("http://") or image.startswith("https://")):
                req = urllib.request.Request(image, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    blob = resp.read()
                with open(out_path, "wb") as f:
                    f.write(blob)
            else:
                raise ValueError("unsupported image format")

            rel = os.path.relpath(out_path, _project_root()).replace("\\", "/")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": rel}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _get_comfyui_workflow_status(self):
        """供前端检测 ComfyUI API 工作流文件是否存在（避免用户误以为整页坏了）。"""
        try:
            wf_path = _comfyui_workflow_path()
            exists = os.path.isfile(wf_path)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "ok": True,
                        "workflow_file_exists": exists,
                        "expected_path": wf_path.replace("\\", "/"),
                    },
                    ensure_ascii=False,
                ).encode("utf-8")
                )
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _post_comfyui_generate(self):
        """OVO抽卡：调用本地 ComfyUI，返回 OpenAI 风格 data[].b64_json 供前端画廊展示。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            comfyui_base = (data.get("comfyui_base") or "http://127.0.0.1:8188").strip().rstrip("/")
            prompt = (data.get("prompt") or "").strip()
            negative = (data.get("negative") or "").strip()
            prompt_prefix = (data.get("prompt_prefix") or "").strip()
            prompt_suffix = (data.get("prompt_suffix") or "").strip()
            width = int(data.get("width") or 512)
            height = int(data.get("height") or 512)
            batch_size = int(data.get("batch_size") or 1)
            seed = data.get("seed", -1)
            timeout_sec = int(data.get("timeout_sec") or 600)
            lora_configs = data.get("lora_configs")
            if lora_configs is None:
                ln = (data.get("lora_name") or "").strip()
                if ln:
                    try:
                        sm = float(data.get("lora_strength_model", 0.8))
                    except (TypeError, ValueError):
                        sm = 0.8
                    try:
                        sc = float(data.get("lora_strength_clip", 0.8))
                    except (TypeError, ValueError):
                        sc = 0.8
                    lora_configs = [{"lora_name": ln, "strength_model": sm, "strength_clip": sc}]
                else:
                    lora_configs = []
            elif not isinstance(lora_configs, list):
                lora_configs = []
            control_b64 = (data.get("control_image_base64") or "").strip()
            control_nid = (data.get("control_load_image_node_id") or "").strip()
            control_filename = None
            if control_b64:
                if not control_nid:
                    raise ValueError("已提供 ControlNet 参考图（Base64）但未填写 LoadImage 节点 ID（control_load_image_node_id）")
                if "base64," in control_b64:
                    control_b64 = control_b64.split("base64,", 1)[-1].strip()
                try:
                    raw_img = base64.b64decode(control_b64, validate=False)
                except Exception as e:
                    raise ValueError("ControlNet 参考图 Base64 无效: %s" % e)
                if len(raw_img) > 15 * 1024 * 1024:
                    raise ValueError("ControlNet 参考图过大（>15MB）")
                control_filename = _comfyui_upload_image_bytes(comfyui_base, raw_img, "ovo_control.png")
            style_b64 = (data.get("style_reference_image_base64") or "").strip()
            style_nid = (data.get("style_reference_load_image_node_id") or "").strip()
            style_filename = None
            if style_b64:
                if not style_nid:
                    raise ValueError("已提供画风参考图（Base64）但未填写 LoadImage 节点 ID（style_reference_load_image_node_id）")
                if "base64," in style_b64:
                    style_b64 = style_b64.split("base64,", 1)[-1].strip()
                try:
                    raw_style = base64.b64decode(style_b64, validate=False)
                except Exception as e:
                    raise ValueError("画风参考图 Base64 无效: %s" % e)
                if len(raw_style) > 15 * 1024 * 1024:
                    raise ValueError("画风参考图过大（>15MB）")
                style_filename = _comfyui_upload_image_bytes(comfyui_base, raw_style, "ovo_style_ref.png")
            wf_inline = data.get("workflow")
            wf_path = data.get("workflow_path") or _comfyui_workflow_path()
            if wf_inline is not None and isinstance(wf_inline, dict):
                wf_root = wf_inline
            else:
                if not os.path.isfile(wf_path):
                    alt = os.path.join(_workspace_dir(), "comfyui_api_workflow.json")
                    wf_path = alt if os.path.isfile(alt) else wf_path
                if not os.path.isfile(wf_path):
                    raise FileNotFoundError(
                        "未找到 ComfyUI API 工作流文件：请在 zhiquan_workspace 下放置 comfyui_api_workflow.json "
                        "（在 ComfyUI 中 Workflow → Save (API Format) 导出）。"
                    )
                with open(wf_path, "r", encoding="utf-8") as f:
                    wf_root = json.load(f)
            if isinstance(wf_root, dict) and "prompt" in wf_root and isinstance(wf_root["prompt"], dict):
                actual = wf_root["prompt"]
            else:
                actual = wf_root
            if not isinstance(actual, dict):
                raise ValueError("workflow 格式无效：应为 API 格式的节点字典")
            patched = _patch_comfyui_workflow(
                actual,
                prompt,
                negative,
                width,
                height,
                batch_size,
                seed,
                prompt_prefix=prompt_prefix,
                prompt_suffix=prompt_suffix,
                lora_configs=lora_configs,
                control_image_filename=control_filename,
                control_load_image_node_id=control_nid if control_filename else None,
                style_image_filename=style_filename,
                style_load_image_node_id=style_nid if style_filename else None,
            )
            b64_list = _comfyui_queue_and_collect(comfyui_base, patched, timeout_sec=timeout_sec)
            out = {"data": [{"b64_json": b} for b in b64_list]}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))
        except FileNotFoundError as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "data": []}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "data": []}, ensure_ascii=False).encode("utf-8"))

    def _get_local_config(self):
        try:
            p = _api_config_path()
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = {}
            # 兼容旧版：仅有 apiBase/apiKey 时转为 apis 数组
            if data.get("apis") is None and (data.get("apiBase") is not None or data.get("apiKey") is not None):
                base = (data.get("apiBase") or "").strip().rstrip("/") or None
                key = (data.get("apiKey") or "").strip() or None
                data["apis"] = [{"id": "default", "name": "默认", "base": base, "key": key}]
        except Exception:
            data = {}
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _save_local_config(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            p = _api_config_path()
            out = {}
            if os.path.isfile(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        out = json.load(f)
                except Exception:
                    pass
            if data.get("apis") is not None:
                apis = []
                for i, a in enumerate(data["apis"]):
                    if not isinstance(a, dict):
                        continue
                    aid = (a.get("id") or "api-%d" % i).strip() or ("api-%d" % i)
                    apis.append({
                        "id": aid,
                        "name": (a.get("name") or "API").strip() or "API",
                        "base": (a.get("base") or "").strip().rstrip("/") or None,
                        "key": (a.get("key") or "").strip() or None,
                    })
                out["apis"] = apis
            elif data.get("apiBase") is not None or data.get("apiKey") is not None:
                out["apiBase"] = str(data.get("apiBase") or "").strip().rstrip("/") or None
                out["apiKey"] = str(data.get("apiKey") or "").strip() or None
            if data.get("plugins") is not None:
                plugins = []
                for i, pl in enumerate(data["plugins"]):
                    if not isinstance(pl, dict):
                        continue
                    pid = (pl.get("id") or "plugin-%d" % i).strip() or ("plugin-%d" % i)
                    plugins.append({
                        "id": pid,
                        "name": (pl.get("name") or "插件").strip() or "插件",
                        "endpoint": (pl.get("endpoint") or "").strip().rstrip("/") or None,
                        "apiKey": (pl.get("apiKey") or "").strip() or None,
                    })
                out["plugins"] = plugins
            with open(p, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=2)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _plugin_call(self):
        """转发插件调用：前端 POST pluginId + messages + newMessage，本机请求插件 endpoint，返回插件响应。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            plugin_id = (data.get("pluginId") or "").strip()
            messages = data.get("messages")
            new_message = data.get("newMessage") or ""
            if not plugin_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "缺少 pluginId"}, ensure_ascii=False).encode("utf-8"))
                return
            p = _api_config_path()
            config = {}
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    config = json.load(f)
            plugins = config.get("plugins") or []
            plugin = next((x for x in plugins if (x.get("id") or "") == plugin_id), None)
            if not plugin or not (plugin.get("endpoint") or "").strip():
                self.send_response(404)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "未找到插件或插件 endpoint 为空"}, ensure_ascii=False).encode("utf-8"))
                return
            endpoint = (plugin.get("endpoint") or "").strip().rstrip("/")
            url = endpoint + "/chat" if not endpoint.endswith("/chat") else endpoint
            key = (plugin.get("apiKey") or "").strip()
            body = json.dumps({"messages": messages or [], "newMessage": new_message}, ensure_ascii=False).encode("utf-8")
            headers = {"Content-Type": "application/json; charset=utf-8"}
            if key:
                headers["Authorization"] = "Bearer " + key
            req = urllib.request.Request(url, data=body, method="POST", headers=headers)
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ("transfer-encoding", "connection"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(e.read())
        except urllib.error.URLError as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "无法连接插件: " + str(e.reason), "content": ""}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "content": ""}, ensure_ascii=False).encode("utf-8"))

    def _export_state(self):
        """将前端提交的OVO状态写入 zhiquan_workspace/state.json，供 Cursor 等 IDE 内 AI 读取。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                os.makedirs(wdir, exist_ok=True)
            out_path = os.path.join(wdir, "state.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": "zhiquan_workspace/state.json"}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _export_conversation(self):
        """将单条对话导出到 zhiquan_workspace/conversation_export.json，便于导入到其他 AI 软件或本软件。"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            data = json.loads(raw)
            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                os.makedirs(wdir, exist_ok=True)
            out_path = os.path.join(wdir, "conversation_export.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": "zhiquan_workspace/conversation_export.json"}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _collect_computer_state(self):
        """运行 Python 脚本采集本机状态，写入 zhiquan_workspace/computer_state.json。"""
        try:
            base = os.path.dirname(os.path.abspath(__file__))
            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                os.makedirs(wdir, exist_ok=True)
            out_path = os.path.join(wdir, "computer_state.json")
            script = os.path.join(base, "scripts", "collect_computer_state.py")
            if not os.path.isfile(script):
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": "scripts/collect_computer_state.py 不存在"}, ensure_ascii=False).encode("utf-8"))
                return
            proc = subprocess.run(
                [sys.executable, script, "--output", out_path],
                cwd=base,
                capture_output=True,
                timeout=30,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            if proc.returncode != 0:
                err = (proc.stderr or b"").decode("utf-8", errors="replace").strip() or "脚本执行失败"
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": err}, ensure_ascii=False).encode("utf-8"))
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": "zhiquan_workspace/computer_state.json"}, ensure_ascii=False).encode("utf-8"))
        except subprocess.TimeoutExpired:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": "采集超时"}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _safe_workspace_filename(self, name):
        """只允许简单文件名，禁止路径穿越。"""
        if not name or not isinstance(name, str):
            return None
        name = name.strip()
        if ".." in name or "/" in name or "\\" in name or len(name) > 64:
            return None
        return name

    def _list_workspace_files(self):
        """列出 zhiquan_workspace 下可加载的文件（.js/.txt/.json）。"""
        try:
            wdir = _workspace_dir()
            if not os.path.isdir(wdir):
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"files": []}, ensure_ascii=False).encode("utf-8"))
                return
            allowed = (".js", ".txt", ".json")
            files = [f for f in os.listdir(wdir) if os.path.isfile(os.path.join(wdir, f)) and f.endswith(allowed)]
            files.sort()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"files": files}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"files": [], "error": str(e)}, ensure_ascii=False).encode("utf-8"))

    def _get_workspace_file(self):
        """读取 zhiquan_workspace 下指定文件内容（用于「从工作区加载并运行」）。"""
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            name = (qs.get("name") or [""])[0]
            name = self._safe_workspace_filename(name)
            if not name:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "无效文件名"}, ensure_ascii=False).encode("utf-8"))
                return
            wdir = _workspace_dir()
            filepath = os.path.join(wdir, name)
            if not os.path.isfile(filepath):
                self.send_response(404)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "文件不存在"}, ensure_ascii=False).encode("utf-8"))
                return
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"name": name, "content": content}, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "content": ""}, ensure_ascii=False).encode("utf-8"))

    def _proxy_to_litellm(self):
        path = self.path.split("?")[0].replace("/api/v1", "/v1", 1)
        if path == "/v1":
            path = "/v1/"
        url = LITELLM_URL + path
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else None
            req = urllib.request.Request(
                url,
                data=body,
                method=self.command,
                headers={
                    "Content-Type": self.headers.get("Content-Type", "application/json"),
                    "Authorization": self.headers.get("Authorization", ""),
                },
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ("transfer-encoding", "connection"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.URLError as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": {"message": "无法连接 LiteLLM（" + str(e.reason) + "）。请确认已启动: docker 端口 4000"}
            }, ensure_ascii=False).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": {"message": str(e)}
            }, ensure_ascii=False).encode("utf-8"))

    def _serve_static(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/index.html"
        if not path.startswith("/"):
            path = "/" + path
        import os
        base = os.path.dirname(os.path.abspath(__file__))
        filepath = base + path.replace("/", os.sep)
        if os.path.isdir(filepath):
            filepath = os.path.join(filepath, "index.html")
        if not os.path.isfile(filepath):
            self.send_error(404)
            return
        ext = os.path.splitext(filepath)[1].lower()
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".ico": "image/x-icon",
        }.get(ext, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with open(filepath, "rb") as f:
            self.wfile.write(f.read())

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))


def run_server(host="127.0.0.1", ports=None, port_holder=None):
    """在指定端口启动服务并阻塞；port_holder 为 list，成功绑定后写入实际端口供外部读取。"""
    if ports is None:
        ports = [int(os.environ.get("RECALLWEB_PORT", "8888")), 9000]
    for port in ports:
        try:
            server = http.server.HTTPServer((host, port), ProxyHandler)
            if port_holder is not None:
                port_holder.append(port)
            server.serve_forever()
            return
        except OSError as e:
            err = str(e).lower()
            if "address already in use" in err or (hasattr(e, "errno") and e.errno == 10048):
                continue
            raise
    raise RuntimeError("端口 %s 均被占用" % ports)


if __name__ == "__main__":
    host = "127.0.0.1"
    ports_to_try = [PORT, 9000]
    for port in ports_to_try:
        try:
            server = http.server.HTTPServer((host, port), ProxyHandler)
            print("OVO 本地服务已启动")
            print("  请在浏览器打开: http://localhost:%s/" % port)
            print("  或: http://127.0.0.1:%s/index.html" % port)
            print("  API 代理: /api/v1 -> %s/v1" % LITELLM_URL)
            print("  按 Ctrl+C 停止")
            sys.stdout.flush()
            sys.stderr.flush()
            server.serve_forever()
            break
        except OSError as e:
            err = str(e).lower()
            if "address already in use" in err or (hasattr(e, "errno") and e.errno == 10048):
                print("端口 %s 已被占用，尝试下一端口..." % port)
                continue
            print("启动失败: %s" % e, file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print("启动失败: %s" % e, file=sys.stderr)
            import traceback
            traceback.print_exc()
            sys.exit(1)
    else:
        print("端口 %s 和 9000 均被占用，请关闭占用程序后重试。" % PORT, file=sys.stderr)
        sys.exit(1)
