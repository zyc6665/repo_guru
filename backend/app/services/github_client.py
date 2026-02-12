from __future__ import annotations

import re
import asyncio
from typing import Optional

import httpx

from app.config import settings

BASE_URL = "https://api.github.com"


def _headers() -> dict[str, str]:
    h = {"Accept": "application/vnd.github.v3+json"}
    if settings.github_token:
        h["Authorization"] = f"Bearer {settings.github_token}"
    return h


async def _get(client: httpx.AsyncClient, url: str, params: dict | None = None) -> dict | list | None:
    resp = await client.get(url, headers=_headers(), params=params)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def parse_github_url(url: str) -> tuple[str, str] | None:
    """Extract owner/repo from a GitHub URL."""
    m = re.match(r"(?:https?://)?github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", url.strip())
    if m:
        return m.group(1), m.group(2)
    m = re.match(r"^([^/]+)/([^/]+)$", url.strip())
    if m:
        return m.group(1), m.group(2)
    return None


async def search_repos(query: str, limit: int = 5) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        data = await _get(client, f"{BASE_URL}/search/repositories", {"q": query, "per_page": limit, "sort": "stars"})
        if not data or "items" not in data:
            return []
        return [
            {
                "name": r["name"],
                "full_name": r["full_name"],
                "description": r.get("description") or "",
                "stars": r.get("stargazers_count", 0),
                "language": r.get("language") or "",
                "url": r.get("html_url", ""),
            }
            for r in data["items"]
        ]


async def get_repo_info(owner: str, repo: str) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        data = await _get(client, f"{BASE_URL}/repos/{owner}/{repo}")
        if not data:
            return None
        return {
            "name": data["name"],
            "full_name": data["full_name"],
            "description": data.get("description") or "",
            "stars": data.get("stargazers_count", 0),
            "language": data.get("language") or "",
            "url": data.get("html_url", ""),
        }


async def get_readme(owner: str, repo: str) -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BASE_URL}/repos/{owner}/{repo}/readme",
            headers={**_headers(), "Accept": "application/vnd.github.v3.raw"},
        )
        if resp.status_code != 200:
            return ""
        return resp.text[:15000]


async def get_file_tree(owner: str, repo: str, path: str = "", depth: int = 2) -> list[dict]:
    if depth <= 0:
        return []
    async with httpx.AsyncClient(timeout=15) as client:
        data = await _get(client, f"{BASE_URL}/repos/{owner}/{repo}/contents/{path}")
        if not data or not isinstance(data, list):
            return []
        tree = []
        for item in sorted(data, key=lambda x: (x["type"] != "dir", x["name"])):
            node = {"name": item["name"], "type": item["type"], "path": item["path"]}
            if item["type"] == "dir" and depth > 1:
                node["children"] = await get_file_tree(owner, repo, item["path"], depth - 1)
            tree.append(node)
        return tree


def format_tree(tree: list[dict], prefix: str = "") -> str:
    lines = []
    for i, node in enumerate(tree):
        is_last = i == len(tree) - 1
        connector = "└── " if is_last else "├── "
        icon = "📁 " if node["type"] == "dir" else "📄 "
        lines.append(f"{prefix}{connector}{icon}{node['name']}")
        if "children" in node:
            extension = "    " if is_last else "│   "
            lines.append(format_tree(node["children"], prefix + extension))
    return "\n".join(lines)


_DEP_FILES = [
    "package.json", "requirements.txt", "pyproject.toml", "Cargo.toml",
    "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json",
]


async def get_dependency_files(owner: str, repo: str) -> str:
    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for fname in _DEP_FILES:
            resp = await client.get(
                f"{BASE_URL}/repos/{owner}/{repo}/contents/{fname}",
                headers={**_headers(), "Accept": "application/vnd.github.v3.raw"},
            )
            if resp.status_code == 200:
                content = resp.text[:5000]
                results.append(f"--- {fname} ---\n{content}")
    return "\n\n".join(results) if results else ""


async def get_file_content(owner: str, repo: str, path: str) -> str:
    """获取单个文件的原始内容。用于 Plan-and-Execute 的 Execute 阶段。"""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BASE_URL}/repos/{owner}/{repo}/contents/{path}",
            headers={**_headers(), "Accept": "application/vnd.github.v3.raw"},
        )
        if resp.status_code != 200:
            return ""
        return resp.text[:10000]  # 单文件截断 10k，避免 token 爆炸


async def get_multiple_files(owner: str, repo: str, paths: list[str]) -> str:
    """并行获取多个文件内容，拼接返回。"""
    async def _fetch_one(p: str) -> str:
        content = await get_file_content(owner, repo, p)
        return f"--- {p} ---\n{content}" if content else ""

    results = await asyncio.gather(*[_fetch_one(p) for p in paths])
    return "\n\n".join(r for r in results if r)
