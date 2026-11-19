#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
黑果夜剧插件商店 · 插件打包脚本
================================

作用：把某个插件的 main.js 打成一个「新版本」，保证 manifest.json / main.js / index.json
      三者原子一致，从根上避免「改了 main.js 却忘了改哈希」或「版本号没跟上」的错配。

用法（在本仓库根目录执行）：
    python3 pack-plugin.py <插件目录>                  # 版本自动 patch +1（如 1.0.4 -> 1.0.5）
    python3 pack-plugin.py <插件目录> --version 1.1.0  # 手动指定版本号

完成后照常发布：
    git add -A && git commit -m "插件 <id> 发布 v<version>" && git push origin main

注意：每次改动 main.js 都必须重跑本脚本（版本必 +1），不要手工改 manifest 的哈希。
"""

import argparse
import base64
import hashlib
import json
import os
import sys

INDEX = "index.json"


def sha256_b64(path):
    """返回 'sha256-<base64>' 形式的完整性哈希。"""
    with open(path, "rb") as f:
        return "sha256-" + base64.b64encode(hashlib.sha256(f.read()).digest()).decode()


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path, obj, indent):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def bump_patch(version):
    """语义化版本 patch 位 +1：'1.0.4' -> '1.0.5'。解析不了返回 None。"""
    parts = str(version).split(".")
    if len(parts) == 3 and parts[2].isdigit():
        parts[2] = str(int(parts[2]) + 1)
        return ".".join(parts)
    return None


def main():
    ap = argparse.ArgumentParser(description="打包黑果夜剧插件（自动算哈希 + 更新 manifest + 同步 index）")
    ap.add_argument("dir", help="插件目录名，如 ikanbot")
    ap.add_argument("--version", help="手动指定版本号（默认自动 patch +1）")
    args = ap.parse_args()

    plugin_dir = args.dir.rstrip("/")
    manifest_path = os.path.join(plugin_dir, "manifest.json")
    if not os.path.isfile(manifest_path):
        sys.exit(f"✕ 找不到 {manifest_path}")

    m = load_json(manifest_path)
    entry = m.get("entry") or "main.js"
    entry_path = os.path.join(plugin_dir, entry)
    if not os.path.isfile(entry_path):
        sys.exit(f"✕ 找不到入口文件 {entry_path}")

    # 1. 计算 main.js 哈希
    digest = sha256_b64(entry_path)

    # 2. 版本号：自动 +1 或手动指定
    old_version = m.get("version", "0.0.0")
    new_version = args.version or bump_patch(old_version)
    if new_version is None:
        sys.exit(f"✕ 无法自动递增版本 {old_version}，请用 --version 手动指定")

    # 3. 更新 manifest.json（version + integrity）
    m["version"] = new_version
    m.setdefault("integrity", {}).setdefault("files", {})[entry] = digest
    dump_json(manifest_path, m, indent=1)

    # 4. 同步 index.json 里的 version
    if os.path.isfile(INDEX):
        idx = load_json(INDEX)
        updated = False
        for e in idx.get("plugins", []):
            if e.get("id") == m.get("id") or e.get("manifest") == f"{plugin_dir}/manifest.json":
                e["version"] = new_version
                updated = True
        if updated:
            dump_json(INDEX, idx, indent=2)
        else:
            print(f"⚠  index.json 里没找到 {m.get('id')}，未更新索引（请手动添加一条）")
    else:
        print(f"⚠  没有 {INDEX}，跳过索引更新")

    print(f"✓ {m.get('id')}  {old_version} -> {new_version}")
    print(f"✓ integrity[{entry}] = {digest}")


if __name__ == "__main__":
    main()
