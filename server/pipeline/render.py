#!/usr/bin/env python3
"""Structured CV JSON → Markdown + HTML (uses templates/resume.css)."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path


def _join_when(start: str, end: str) -> str:
    if start and end:
        return f"{start} – {end}"
    return start or end or ""


def error_markdown(cv: dict) -> str:
    err = cv.get("error") or {}
    lines = [
        "# Not a CV",
        "",
        f"**{err.get('code') or 'NOT_CV_ALIKE'}** — {err.get('message') or 'This PDF is not CV-alike.'}",
        "",
    ]
    src = (cv.get("source") or {}).get("filename")
    if src:
        lines += [f"Source: `{src}`", ""]
    if err.get("score") is not None:
        lines.append(f"CV-alikeness score: {err['score']}")
    reasons = err.get("reasons") or []
    if reasons:
        lines += ["", "## Why"]
        lines += [f"- {r}" for r in reasons]
    lines.append("")
    return "\n".join(lines)


def error_html(cv: dict, css_href: str) -> str:
    err = cv.get("error") or {}
    src = (cv.get("source") or {}).get("filename") or ""
    reasons = err.get("reasons") or []
    reason_lis = "".join(f"<li>{_esc(r)}</li>" for r in reasons)
    return "\n".join(
        [
            "<!DOCTYPE html>",
            '<html lang="en">',
            "<head>",
            '  <meta charset="utf-8">',
            "  <title>Not a CV</title>",
            f'  <link rel="stylesheet" href="{_esc(css_href)}">',
            "</head>",
            "<body>",
            '  <article class="page error-page">',
            '    <p class="error-kicker">Extraction rejected</p>',
            "    <h1>This PDF is not CV-alike</h1>",
            f'    <p class="error-code">{_esc(err.get("code") or "NOT_CV_ALIKE")}</p>',
            f'    <p class="summary">{_esc(err.get("message") or "")}</p>',
            "    <section>",
            "      <h2>Why</h2>",
            f'      <ul class="bullets">{reason_lis or "<li>Failed the CV-alikeness check.</li>"}</ul>',
            "    </section>",
            f'    <footer class="note">Source: {_esc(src)} · score {err.get("score", 0)}</footer>',
            "  </article>",
            "</body>",
            "</html>",
            "",
        ]
    )


def to_markdown(cv: dict) -> str:
    if cv.get("ok") is False:
        return error_markdown(cv)
    ident = cv.get("identity", {})
    lines = [f"# {ident.get('full_name') or 'Resume'}"]
    if ident.get("headline"):
        lines.append(f"**{ident['headline']}**")
    meta = []
    if ident.get("location"):
        meta.append(ident["location"])
    if ident.get("email"):
        meta.append(ident["email"])
    if ident.get("phone"):
        meta.append(ident["phone"])
    for link in ident.get("links") or []:
        label = link.get("label") or "Link"
        url = link.get("url") or ""
        meta.append(f"[{label}]({url})" if url else label)
    if meta:
        lines.append(" · ".join(meta))
    lines.append("")

    if cv.get("summary"):
        lines += ["## Summary", cv["summary"], ""]

    if cv.get("skills"):
        lines.append("## Skills")
        for group in cv["skills"]:
            items = ", ".join(group.get("items") or [])
            name = group.get("group") or "General"
            lines.append(f"- **{name}:** {items}")
        lines.append("")

    if cv.get("experience"):
        lines.append("## Experience")
        for job in cv["experience"]:
            when = _join_when(job.get("start", ""), job.get("end", ""))
            title = job.get("title") or ""
            company = job.get("company") or ""
            head = " — ".join(x for x in (title, company) if x)
            lines.append(f"### {head}")
            sub = " · ".join(x for x in (when, job.get("location")) if x)
            if sub:
                lines.append(f"*{sub}*")
            for h in job.get("highlights") or []:
                lines.append(f"- {h}")
            lines.append("")

    if cv.get("projects"):
        lines.append("## Projects")
        for proj in cv["projects"]:
            name = proj.get("name") or "Project"
            if proj.get("url"):
                lines.append(f"### [{name}]({proj['url']})")
            else:
                lines.append(f"### {name}")
            if proj.get("description"):
                lines.append(proj["description"])
            if proj.get("tech"):
                lines.append("Tech: " + ", ".join(proj["tech"]))
            lines.append("")

    if cv.get("education"):
        lines.append("## Education")
        for edu in cv["education"]:
            when = _join_when(edu.get("start", ""), edu.get("end", ""))
            lines.append(f"### {edu.get('degree') or 'Degree'}")
            sub = " · ".join(x for x in (edu.get("school"), when, edu.get("location")) if x)
            if sub:
                lines.append(f"*{sub}*")
            if edu.get("details"):
                lines.append(edu["details"])
            lines.append("")

    if cv.get("certifications"):
        lines.append("## Certifications")
        for item in cv["certifications"]:
            lines.append(f"- {item}")
        lines.append("")

    if cv.get("languages"):
        lines.append("## Languages")
        lines.append(", ".join(cv["languages"]))
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def _esc(value: str) -> str:
    return html.escape(value or "")


def to_html(cv: dict, css_href: str = "resume.css") -> str:
    if cv.get("ok") is False:
        return error_html(cv, css_href)
    ident = cv.get("identity", {})
    meta_bits = []
    if ident.get("location"):
        meta_bits.append(_esc(ident["location"]))
    if ident.get("email"):
        meta_bits.append(f'<a href="mailto:{_esc(ident["email"])}">{_esc(ident["email"])}</a>')
    if ident.get("phone"):
        meta_bits.append(_esc(ident["phone"]))
    for link in ident.get("links") or []:
        url = _esc(link.get("url") or "#")
        label = _esc(link.get("label") or url)
        meta_bits.append(f'<a href="{url}">{label}</a>')

    parts = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '  <meta charset="utf-8">',
        f"  <title>{_esc(ident.get('full_name') or 'Resume')}</title>",
        '  <link rel="preconnect" href="https://fonts.googleapis.com">',
        '  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">',
        f'  <link rel="stylesheet" href="{_esc(css_href)}">',
        "</head>",
        "<body>",
        '  <article class="page">',
        '    <header class="mast">',
        "      <div>",
        f"        <h1>{_esc(ident.get('full_name') or 'Resume')}</h1>",
        f'        <p class="headline">{_esc(ident.get("headline") or "")}</p>',
        "      </div>",
        f'      <div class="meta">{"<br>".join(meta_bits)}</div>',
        "    </header>",
    ]

    if cv.get("summary"):
        parts += [
            "    <section>",
            "      <h2>Summary</h2>",
            f'      <p class="summary">{_esc(cv["summary"])}</p>',
            "    </section>",
        ]

    if cv.get("skills"):
        parts.append("    <section>")
        parts.append("      <h2>Skills</h2>")
        for group in cv["skills"]:
            chips = "".join(f'<span class="chip">{_esc(x)}</span>' for x in group.get("items") or [])
            parts.append('      <div class="skill-group">')
            parts.append(f'        <div class="label">{_esc(group.get("group") or "General")}</div>')
            parts.append(f'        <div class="chips">{chips}</div>')
            parts.append("      </div>")
        parts.append("    </section>")

    if cv.get("experience"):
        parts.append("    <section>")
        parts.append("      <h2>Experience</h2>")
        for job in cv["experience"]:
            when = _join_when(job.get("start", ""), job.get("end", ""))
            parts.append('      <div class="job">')
            parts.append('        <div class="row">')
            parts.append(f'          <div class="title">{_esc(job.get("title") or "")}</div>')
            parts.append(f'          <div class="when">{_esc(when)}</div>')
            parts.append("        </div>")
            parts.append('        <div class="row">')
            parts.append(f'          <div class="org">{_esc(job.get("company") or "")}</div>')
            parts.append(f'          <div class="where">{_esc(job.get("location") or "")}</div>')
            parts.append("        </div>")
            if job.get("highlights"):
                parts.append('        <ul class="bullets">')
                for h in job["highlights"]:
                    parts.append(f"          <li>{_esc(h)}</li>")
                parts.append("        </ul>")
            parts.append("      </div>")
        parts.append("    </section>")

    if cv.get("projects"):
        parts.append("    <section>")
        parts.append("      <h2>Projects</h2>")
        for proj in cv["projects"]:
            name = _esc(proj.get("name") or "Project")
            title = f'<a href="{_esc(proj["url"])}">{name}</a>' if proj.get("url") else name
            parts.append('      <div class="proj">')
            parts.append(f'        <div class="title">{title}</div>')
            if proj.get("description"):
                parts.append(f'        <p class="plain">{_esc(proj["description"])}</p>')
            parts.append("      </div>")
        parts.append("    </section>")

    if cv.get("education"):
        parts.append("    <section>")
        parts.append("      <h2>Education</h2>")
        for edu in cv["education"]:
            when = _join_when(edu.get("start", ""), edu.get("end", ""))
            parts.append('      <div class="edu">')
            parts.append('        <div class="row">')
            parts.append(f'          <div class="title">{_esc(edu.get("degree") or "")}</div>')
            parts.append(f'          <div class="when">{_esc(when)}</div>')
            parts.append("        </div>")
            parts.append(f'        <div class="org">{_esc(edu.get("school") or "")}</div>')
            if edu.get("details"):
                parts.append(f'        <p class="plain">{_esc(edu["details"])}</p>')
            parts.append("      </div>")
        parts.append("    </section>")

    if cv.get("certifications"):
        parts.append("    <section>")
        parts.append("      <h2>Certifications</h2>")
        parts.append('      <ul class="bullets">')
        for item in cv["certifications"]:
            parts.append(f"        <li>{_esc(item)}</li>")
        parts.append("      </ul>")
        parts.append("    </section>")

    if cv.get("languages"):
        parts.append("    <section>")
        parts.append("      <h2>Languages</h2>")
        parts.append(f'      <p class="plain">{_esc(", ".join(cv["languages"]))}</p>')
        parts.append("    </section>")

    src = (cv.get("source") or {}).get("filename") or ""
    parts += [
        f'    <footer class="note">Generated from {_esc(src)}</footer>',
        "  </article>",
        "</body>",
        "</html>",
        "",
    ]
    return "\n".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render CV JSON to Markdown + HTML")
    parser.add_argument("json_path", type=Path)
    parser.add_argument("-o", "--outdir", type=Path, required=True)
    parser.add_argument("--css", default="resume.css")
    args = parser.parse_args()

    cv = json.loads(args.json_path.read_text(encoding="utf-8"))
    args.outdir.mkdir(parents=True, exist_ok=True)

    md_path = args.outdir / "resume.md"
    html_path = args.outdir / "resume.html"
    css_src = Path(__file__).parent / "templates" / "resume.css"
    css_dst = args.outdir / Path(args.css).name

    md_path.write_text(to_markdown(cv), encoding="utf-8")
    html_path.write_text(to_html(cv, css_href=css_dst.name), encoding="utf-8")
    css_dst.write_text(css_src.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"wrote {md_path}")
    print(f"wrote {html_path}")
    print(f"wrote {css_dst}")


if __name__ == "__main__":
    main()
