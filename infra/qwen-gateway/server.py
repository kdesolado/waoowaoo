#!/usr/bin/env python3
"""Authenticated, image-only gateway for a loopback ComfyUI Qwen workflow."""

from __future__ import annotations

import base64
import copy
import hmac
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
WORKFLOW_PATH = Path(os.environ["QWEN_WORKFLOW_PATH"])
gateway_bearer_token = os.environ["QWEN_GATEWAY_TOKEN"]
HOST = os.environ.get("QWEN_GATEWAY_HOST", "0.0.0.0")
PORT = int(os.environ.get("QWEN_GATEWAY_PORT", "8789"))
TIMEOUT_SECONDS = int(os.environ.get("QWEN_GATEWAY_TIMEOUT_SECONDS", "900"))


def request_json(url: str, *, method: str = "GET", payload: object | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def positive_int(value: object, default: int, minimum: int, maximum: int, field: str) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f"{field} must be an integer between {minimum} and {maximum}")
    return value


def build_workflow(body: dict) -> tuple[dict, int]:
    prompt = body.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 12_000:
        raise ValueError("prompt must be a non-empty string of at most 12000 characters")
    width = positive_int(body.get("width"), 1536, 512, 1920, "width")
    height = positive_int(body.get("height"), 864, 512, 1920, "height")
    if width % 8 or height % 8:
        raise ValueError("width and height must be multiples of 8")
    steps = positive_int(body.get("steps"), 25, 1, 50, "steps")
    seed = positive_int(body.get("seed"), secrets.randbits(63), 0, 2**63 - 1, "seed")
    negative_prompt = body.get("negative_prompt", "")
    if not isinstance(negative_prompt, str) or len(negative_prompt) > 4_000:
        raise ValueError("negative_prompt must be a string of at most 4000 characters")

    document = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
    graph = copy.deepcopy(document.get("prompt", document))
    graph["4"]["inputs"]["prompt"] = prompt.strip()
    graph["4"]["inputs"]["negative_prompt"] = negative_prompt
    graph["5"]["inputs"]["width"] = width
    graph["5"]["inputs"]["height"] = height
    graph["6"]["inputs"]["seed"] = seed
    graph["6"]["inputs"]["steps"] = steps
    graph["9"]["inputs"]["filename_prefix"] = f"waoowaoo/{int(time.time())}-{seed}"
    return graph, seed


def generate_image(body: dict) -> dict:
    graph, seed = build_workflow(body)
    client_id = secrets.token_hex(16)
    queued = request_json(f"{COMFYUI_URL}/prompt", method="POST", payload={"prompt": graph, "client_id": client_id})
    prompt_id = queued.get("prompt_id")
    if not isinstance(prompt_id, str) or not prompt_id:
        raise RuntimeError("ComfyUI did not return a prompt_id")

    deadline = time.monotonic() + TIMEOUT_SECONDS
    output = None
    while time.monotonic() < deadline:
        history = request_json(f"{COMFYUI_URL}/history/{urllib.parse.quote(prompt_id)}")
        record = history.get(prompt_id)
        if isinstance(record, dict):
            status = record.get("status", {})
            if status.get("status_str") == "error" or status.get("completed") is False:
                messages = status.get("messages", [])
                if any(item and item[0] == "execution_error" for item in messages if isinstance(item, list)):
                    raise RuntimeError("ComfyUI execution failed")
            images = record.get("outputs", {}).get("9", {}).get("images", [])
            if images:
                output = images[0]
                break
        time.sleep(1)
    if not isinstance(output, dict):
        raise TimeoutError(f"ComfyUI generation timed out after {TIMEOUT_SECONDS} seconds")

    query = urllib.parse.urlencode({
        "filename": output["filename"],
        "subfolder": output.get("subfolder", ""),
        "type": output.get("type", "output"),
    })
    with urllib.request.urlopen(f"{COMFYUI_URL}/view?{query}", timeout=60) as response:
        image = response.read()
    return {
        "created": int(time.time()),
        "data": [{"b64_json": base64.b64encode(image).decode("ascii")}],
        "prompt_id": prompt_id,
        "seed": seed,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "QwenImageGateway/1.0"

    def send_json(self, status: int, payload: object) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, f"Bearer {gateway_bearer_token}")

    def do_GET(self) -> None:
        if self.path == "/health":
            try:
                stats = request_json(f"{COMFYUI_URL}/system_stats")
                self.send_json(200, {"ok": True, "provider": "qwen-image-2.1", "comfyui": stats.get("system", {}).get("comfyui_version")})
            except Exception as error:
                self.send_json(503, {"ok": False, "error": type(error).__name__})
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/v1/images/generations":
            self.send_json(404, {"error": "not_found"})
            return
        if not self.authorized():
            self.send_json(401, {"error": "unauthorized"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 64_000:
                raise ValueError("request body is empty or too large")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("request body must be a JSON object")
            self.send_json(200, generate_image(body))
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except TimeoutError as error:
            self.send_json(504, {"error": str(error)})
        except Exception as error:
            self.send_json(502, {"error": "generation_failed", "detail": type(error).__name__})

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
