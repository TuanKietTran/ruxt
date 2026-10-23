#!/usr/bin/env python3
"""One-shot: PDF or image → JSON concept + Markdown + HTML/CSS."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import sys

from extract import extract_concept, extract_document
from render import to_html, to_markdown


def run(source: Path, outdir: Path) -> dict:
    outdir.mkdir(parents=True, exist_ok=True)
    text, pages, meta = extract_document(source)
    concept = extract_concept(text, source.name, pages, meta)

    stem = "resume" if concept.get("ok", True) else "error"
    json_path = outdir / f"{stem}.json"
    md_path = outdir / f"{stem}.md"
    html_path = outdir / f"{stem}.html"
    css_src = Path(__file__).parent / "templates" / "resume.css"
    css_dst = outdir / "resume.css"
    raw_path = outdir / "raw.txt"

    json_path.write_text(json.dumps(concept, indent=2, ensure_ascii=False), encoding="utf-8")
    md_path.write_text(to_markdown(concept), encoding="utf-8")
    html_path.write_text(to_html(concept, css_href="resume.css"), encoding="utf-8")
    css_dst.write_text(css_src.read_text(encoding="utf-8"), encoding="utf-8")
    raw_path.write_text(text, encoding="utf-8")

    print(f"json     {json_path}")
    print(f"markdown {md_path}")
    print(f"html     {html_path}")
    print(f"css      {css_dst}")
    print(f"raw text {raw_path}")
    if not concept.get("ok", True):
        err = concept.get("error") or {}
        print(f"ERROR    {err.get('code')}: {err.get('message')}")
    return concept


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="PDF or image (png/jpg/webp/tiff/bmp)")
    parser.add_argument("-o", "--outdir", type=Path, default=Path("out"))
    args = parser.parse_args()
    result = run(args.source, args.outdir)
    if not result.get("ok", True):
        sys.exit(2)


if __name__ == "__main__":
    main()
