
// PDF CV → raw text + structured concept JSON (heuristic, no API).

export const SECTION_ALIASES = {
  "summary": ["summary", "profile", "about", "objective", "professional summary"] as const,
    "experience": [
        "experience",
        "work experience",
        "employment",
        "professional experience",
        "work history",
    ] as const,
    "education": ["education", "academic", "academics"] as const,
    "skills": ["skills", "technical skills", "core skills", "competencies"] as const,
    "projects": ["projects", "selected projects", "personal projects"] as const,
    "certifications": ["certifications", "certificates", "licenses"] as const,
    "languages": ["languages", "language"] as const,
}

export const EMAIL_RE =
  /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;

export const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;

export const URL_RE =
  /https?:\/\/[^\s)]+/gi;

export const LINKEDIN_RE =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_/]+/gi;

export const GITHUB_RE =
  /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9\-_/]+/gi;

export const DATE_RANGE_RE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[–\-—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Now|Current)/gi;