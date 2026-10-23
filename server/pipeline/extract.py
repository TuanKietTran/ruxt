#!/usr/bin/env python3
"""PDF or image CV → raw text + structured concept JSON (heuristic, no API)."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import pytesseract
from PIL import Image

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}
PDF_EXTS = {".pdf"}
MIN_TEXT_FOR_NATIVE_PDF = 80

SECTION_ALIASES = {
    "summary": {"summary", "profile", "about", "objective", "professional summary"},
    "experience": {
        "experience",
        "work experience",
        "employment",
        "professional experience",
        "work history",
    },
    "education": {"education", "academic", "academics"},
    "skills": {"skills", "technical skills", "core skills", "competencies"},
    "projects": {"projects", "selected projects", "personal projects"},
    "certifications": {"certifications", "certificates", "licenses"},
    "languages": {"languages", "language"},
}

EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}")
URL_RE = re.compile(r"https?://[^\s)]+", re.I)
LINKEDIN_RE = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_/]+", re.I)
GITHUB_RE = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[A-Za-z0-9\-_/]+", re.I)
DATE_RANGE_RE = re.compile(
    r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})"
    r"\s*[–\-—to]+\s*"
    r"((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Now|Current)",
    re.I,
)


def ocr_image(path: Path) -> str:
    image = Image.open(path)
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")
    return (pytesseract.image_to_string(image) or "").strip()


def ocr_pdf(pdf_path: Path) -> tuple[str, int]:
    if not shutil.which("pdftoppm"):
        return "", 0
    with tempfile.TemporaryDirectory() as tmp:
        prefix = Path(tmp) / "page"
        subprocess.run(
            ["pdftoppm", "-png", "-r", "200", str(pdf_path), str(prefix)],
            check=True,
            capture_output=True,
        )
        frames = sorted(Path(tmp).glob("page*.png"))
        texts = [ocr_image(frame) for frame in frames]
        return "\n".join(t for t in texts if t).strip(), len(frames)


def extract_pdf_text(pdf_path: Path) -> tuple[str, int]:
    pages = []
    with pdfplumber.open(pdf_path) as doc:
        n = len(doc.pages)
        for page in doc.pages:
            pages.append(page.extract_text() or "")
    return "\n".join(pages).strip(), n


def extract_document(path: Path) -> tuple[str, int, dict]:
    suffix = path.suffix.lower()
    if suffix in IMAGE_EXTS:
        text = ocr_image(path)
        return text, 1, {"kind": "image", "ocr": True}
    if suffix not in PDF_EXTS:
        raise ValueError(f"Unsupported file type: {suffix or path.name}")
    text, pages = extract_pdf_text(path)
    used_ocr = False
    if len(text) < MIN_TEXT_FOR_NATIVE_PDF:
        ocr_text, ocr_pages = ocr_pdf(path)
        if len(ocr_text) > len(text):
            text, pages, used_ocr = ocr_text, ocr_pages or pages, True
    return text, pages, {"kind": "pdf", "ocr": used_ocr}


def extract_text(path: Path) -> tuple[str, int]:
    text, pages, _meta = extract_document(path)
    return text, pages


def _norm(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _is_section(line: str) -> str | None:
    key = re.sub(r"[^a-z ]", "", line.lower()).strip()
    for name, aliases in SECTION_ALIASES.items():
        if key in aliases:
            return name
    return None


def split_sections(text: str) -> dict[str, list[str]]:
    lines = [_norm(ln) for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    buckets: dict[str, list[str]] = {"header": []}
    current = "header"
    for ln in lines:
        section = _is_section(ln)
        if section:
            current = section
            buckets.setdefault(current, [])
            continue
        buckets.setdefault(current, []).append(ln)
    return buckets


def parse_identity(header_lines: list[str], full_text: str) -> dict:
    blob = "\n".join(header_lines)
    emails = EMAIL_RE.findall(full_text)
    phones = [p.strip() for p in PHONE_RE.findall(full_text) if len(re.sub(r"\D", "", p)) >= 8]
    links = []
    for m in LINKEDIN_RE.findall(full_text):
        url = m if m.startswith("http") else "https://" + m
        links.append({"label": "LinkedIn", "url": url.rstrip("/")})
    for m in GITHUB_RE.findall(full_text):
        url = m if m.startswith("http") else "https://" + m
        url = url.rstrip("/")
        parts = url.split("github.com/")[-1].split("/")
        if len(parts) > 1:
            continue
        links.append({"label": "GitHub", "url": url})
    for m in URL_RE.findall(full_text):
        if "linkedin.com" in m.lower() or "github.com" in m.lower():
            continue
        links.append({"label": "Website", "url": m.rstrip("/.,")})

    seen = set()
    uniq_links = []
    for item in links:
        if item["url"] in seen:
            continue
        seen.add(item["url"])
        uniq_links.append(item)

    name = header_lines[0] if header_lines else ""
    headline = ""
    location = ""
    for ln in header_lines[1:8]:
        for bit in re.split(r"\s*[·|]\s*", ln):
            bit = bit.strip().strip("-")
            if EMAIL_RE.search(bit) or URL_RE.search(bit) or PHONE_RE.search(bit):
                continue
            if re.search(r"indonesia|remote|jakarta|bandung|singapore|london|,", bit, re.I):
                if 3 < len(bit) < 48:
                    location = bit
                    break
        if location:
            break
    for ln in header_lines[1:6]:
        if EMAIL_RE.search(ln) or PHONE_RE.search(ln) or URL_RE.search(ln) or LINKEDIN_RE.search(ln):
            continue
        if not headline and 8 <= len(ln) <= 80:
            headline = ln

    return {
        "full_name": name,
        "headline": headline,
        "location": location,
        "email": emails[0] if emails else "",
        "phone": phones[0] if phones else "",
        "links": uniq_links,
    }


def parse_skills(lines: list[str]) -> list[dict]:
    groups = []
    for ln in lines:
        if ":" in ln:
            group, rest = ln.split(":", 1)
            items = [x.strip() for x in re.split(r"[,|/•;]", rest) if x.strip()]
            groups.append({"group": group.strip(), "items": items})
        else:
            items = [x.strip() for x in re.split(r"[,|/•;]", ln) if x.strip()]
            if items:
                groups.append({"group": "General", "items": items})
    return groups


def parse_experience(lines: list[str]) -> list[dict]:
    jobs: list[dict] = []
    current: dict | None = None
    for ln in lines:
        dates = DATE_RANGE_RE.search(ln)
        if dates and (current is None or not ln.startswith(("-", "•", "*"))):
            head = ln[: dates.start()].strip(" |,-–")
            parts = [p.strip() for p in re.split(r"\s*\|\s*", head) if p.strip()]
            title = parts[0] if parts else ""
            company = parts[1] if len(parts) > 1 else ""
            loc = parts[2] if len(parts) > 2 else ""
            current = {
                "title": title,
                "company": company or title,
                "location": loc,
                "start": dates.group(1),
                "end": dates.group(2),
                "highlights": [],
            }
            jobs.append(current)
            continue
        if ln.startswith(("-", "•", "*")) and current:
            current["highlights"].append(ln.lstrip("-•* ").strip())
            continue
        if current and not current["title"] and " at " in ln.lower():
            title, _, company = re.split(r"\s+at\s+", ln, flags=re.I, maxsplit=1)
            current["title"] = title.strip()
            if not current["company"]:
                current["company"] = company.strip()
            continue
        if current and not current["title"] and "|" in ln:
            parts = [p.strip() for p in ln.split("|")]
            current["title"] = parts[0]
            if len(parts) > 1 and not current["company"]:
                current["company"] = parts[1]
            if len(parts) > 2:
                current["location"] = parts[2]
            continue
        if current and not current["title"]:
            current["title"] = ln
            continue
        if current:
            current["highlights"].append(ln)
    return jobs


def parse_education(lines: list[str]) -> list[dict]:
    items = []
    buf: dict | None = None
    for ln in lines:
        dates = DATE_RANGE_RE.search(ln)
        if buf is None or (dates and not ln.startswith(("-", "•"))):
            buf = {
                "degree": ln if not dates else ln[: dates.start()].strip(" |,-"),
                "school": "",
                "location": "",
                "start": dates.group(1) if dates else "",
                "end": dates.group(2) if dates else "",
                "details": "",
            }
            items.append(buf)
            continue
        if not buf["school"]:
            buf["school"] = ln
        else:
            buf["details"] = (buf["details"] + " " + ln).strip()
    return items


def parse_projects(lines: list[str]) -> list[dict]:
    projects = []
    current = None
    for ln in lines:
        if ln.startswith(("-", "•", "*")) and current:
            current["description"] = (current["description"] + " " + ln.lstrip("-•* ")).strip()
            continue
        url = URL_RE.search(ln)
        name = ln
        if url:
            name = ln[: url.start()].strip(" -–—|")
        current = {
            "name": name,
            "url": url.group(0) if url else "",
            "description": "",
            "tech": [],
        }
        projects.append(current)
    return projects


CV_HINT_RE = re.compile(
    r"\b(curriculum vitae|\bcv\b|resume|work experience|professional experience|"
    r"education|skills|certifications?|linkedin|github)\b",
    re.I,
)
JOB_TITLE_RE = re.compile(
    r"\b(engineer|developer|designer|manager|analyst|consultant|intern|"
    r"director|officer|specialist|scientist|researcher|founder|lead)\b",
    re.I,
)
ANTI_CV_RE = re.compile(
    r"\b(invoice|tax invoice|receipt|purchase order|statement of account|"
    r"amount due|subtotal|vat|npwp|terms and conditions|privacy policy|"
    r"table of contents|isbn|doi:|abstract|references cited|"
    r"bank statement|account balance|boarding pass|itinerary)\b",
    re.I,
)


def assess_cv_alikeness(text: str) -> dict:
    compact = re.sub(r"\s+", " ", text).strip()
    reasons: list[str] = []
    score = 0

    if len(compact) < 40:
        return {
            "ok": False,
            "code": "EMPTY_OR_UNREADABLE",
            "score": 0.0,
            "reasons": ["Almost no readable text after extract/OCR."],
        }

    emails = EMAIL_RE.findall(text)
    phones = [p for p in PHONE_RE.findall(text) if len(re.sub(r"\D", "", p)) >= 8]
    has_linkedin = bool(LINKEDIN_RE.search(text))
    has_github = bool(GITHUB_RE.search(text))
    sections_found = []
    for line in text.splitlines():
        name = _is_section(_norm(line))
        if name and name not in sections_found:
            sections_found.append(name)
    date_ranges = DATE_RANGE_RE.findall(text)
    hints = CV_HINT_RE.findall(text)
    jobs = JOB_TITLE_RE.findall(text)
    anti = ANTI_CV_RE.findall(text)

    if emails:
        score += 2
    if phones:
        score += 1
    if has_linkedin:
        score += 2
    if has_github:
        score += 1
    if "experience" in sections_found:
        score += 2
    if "education" in sections_found:
        score += 2
    if "skills" in sections_found:
        score += 1
    if sections_found:
        score += 1
    if date_ranges:
        score += 1
    if hints:
        score += 1
    if jobs:
        score += 1
    if len(compact) >= 80:
        score += 1

    anti_labels = sorted({a.lower() for a in anti})
    if anti_labels:
        score -= 2
        reasons.append("Looks like another document type: " + ", ".join(anti_labels))

    has_contact = bool(emails or phones or has_linkedin)
    has_any_cv_signal = bool(sections_found or hints or jobs or date_ranges or has_contact)
    # Loose gate: accept anything with a CV-ish signal unless the file is
    # clearly some other document and has almost no resume cues.
    clearly_other = len(anti_labels) >= 2 and not sections_found and not emails and not has_linkedin
    ok = has_any_cv_signal and not clearly_other
    if not has_any_cv_signal:
        reasons.append("No resume-like cues (contact, headings, dates, or role words).")
    if ok:
        reasons = []

    return {
        "ok": ok,
        "code": "OK" if ok else "NOT_CV_ALIKE",
        "score": round(min(max(score, 0) / 12, 1.0), 2),
        "reasons": reasons,
        "signals": {
            "emails": len(emails),
            "phones": len(phones),
            "linkedin": has_linkedin,
            "github": has_github,
            "sections": sections_found,
            "date_ranges": len(date_ranges),
            "anti_labels": sorted({a.lower() for a in anti}),
        },
    }


def error_result(source_name: str, pages: int, text: str, assessment: dict) -> dict:
    code = assessment.get("code") or "NOT_CV_ALIKE"
    if code == "EMPTY_OR_UNREADABLE":
        message = "This file has no readable text, so it cannot be treated as a CV."
    else:
        message = "This file does not look like a CV/resume. Extraction was skipped."
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "score": assessment.get("score", 0),
            "reasons": assessment.get("reasons") or ["Document failed the CV-alikeness check."],
            "signals": assessment.get("signals") or {},
        },
        "source": {
            "filename": source_name,
            "pages": pages,
            "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "raw_text": text,
    }


def extract_concept(text: str, source_name: str, pages: int, meta: dict | None = None) -> dict:
    assessment = assess_cv_alikeness(text)
    source = {
        "filename": source_name,
        "pages": pages,
        "kind": (meta or {}).get("kind", "pdf"),
        "ocr": bool((meta or {}).get("ocr")),
        "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if not assessment["ok"]:
        result = error_result(source_name, pages, text, assessment)
        result["source"] = source
        return result

    sections = split_sections(text)
    identity = parse_identity(sections.get("header", []), text)
    return {
        "ok": True,
        "error": None,
        "cv_score": assessment["score"],
        "source": source,
        "identity": identity,
        "summary": " ".join(sections.get("summary", [])),
        "skills": parse_skills(sections.get("skills", [])),
        "experience": parse_experience(sections.get("experience", [])),
        "education": parse_education(sections.get("education", [])),
        "projects": parse_projects(sections.get("projects", [])),
        "certifications": sections.get("certifications", []),
        "languages": [
            part.strip()
            for ln in sections.get("languages", [])
            for part in re.split(r"[,;/]", ln)
            if part.strip()
        ],
        "raw_text": text,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract structured CV data from a PDF or image")
    parser.add_argument("source", type=Path)
    parser.add_argument("-o", "--out", type=Path, help="Write JSON here")
    args = parser.parse_args()

    text, pages, meta = extract_document(args.source)
    concept = extract_concept(text, args.source.name, pages, meta)
    payload = json.dumps(concept, indent=2, ensure_ascii=False)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding="utf-8")
    else:
        print(payload)
    if not concept.get("ok", True):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
