# Product requirements

This document is the single product requirements document for the whole system: the web application, the admin application, the native desktop applications, the mobile applications, and the platform control plane. Behaviour is described as it exists today unless it is labelled Planned. Where this document and a subsystem specification disagree, the subsystem specification defines the contract and this document records the product intent behind it.

The product is a Markdown CV editor. A user writes a CV in Markdown, sees a rendered preview, applies a template, keeps reusable profiles for the facts that recur across CVs, and exports the result. Work is stored locally in the browser by default; an account adds preferences, consent-controlled cloud features (Planned), and a subscriptions dashboard, but no account is required to write, save, or export a CV.

## Sections

| # | Section | Covers |
| --- | --- | --- |
| 1 | Goals (this document) | What the system is for and what success looks like in product terms |
| 2 | [Personas](prd/personas.md) | End user, owner/administrator, operator |
| 3 | [Information architecture and flows](prd/ia-flows.md) | Routes, shells, navigation, and the core user flows on every surface |
| 4 | [Requirements per surface](prd/requirements.md) | Prioritised requirements for web, admin, native, mobile, and platform surfaces |
| 5 | [Non-goals](prd/non-goals.md) | What the system deliberately does not do |
| 6 | [Success metrics](prd/success-metrics.md) | How each goal is measured |
| 7 | [Release channels](prd/release-channels.md) | Dev, canary, and stable channels and promotion between them |
| 8 | [Legacy sunset](prd/legacy-sunset.md) | Clerk, Cloudflare, and Deno Deploy retirement by January 2027 |
| 9 | [Security requirements](prd/security-requirements.md) | Identity, authorisation, and data-protection requirements |

## Goals

### 1. Local-first CV authoring that never loses work

A user can open the editor, write, and export without signing in. Documents, profiles, and templates live locally first; autosave, recovery, and explicit save states (saved, saving, conflict, offline) protect work, and a conflict or an offline state is shown to the user, never resolved by silently overwriting local content. Signing in, signing out, consent changes, or cloud failures must never delete or blank local records.

### 2. One product on every surface

Web, native desktop, and mobile present the same information architecture, the same screens and states (including empty, loading, and error states), and the same design tokens. A screen may be read-only on a surface, but it may not drop a state. Theme, density, and layout controls exist on every platform, with named themes, a system option (Planned where not yet present), and layout rules per window class.

### 3. Profiles and templates make repeat applications cheap

Profiles hold the reusable facts (identity, about, contact, experience, skills, education, projects, certifications, languages) once, and CVs draw on them instead of re-typing. Templates define presentation; a user can start from a built-in template, customise their own copies, and reuse them across documents. Import brings existing material in; export produces the finished CV, including PDF.

### 4. Accounts are additive and consent is explicit

An account adds account preferences, the subscriptions dashboard, and cloud features. Cloud storage of sessions and templates is Planned and is opt-in per category (cloud sessions, cloud templates), default off, with independent grants. Consent never uploads anything by itself: only individually selected sessions and templates are uploaded, and revoking consent stops future uploads without erasing local or existing cloud data.

### 5. Subscription visibility for the owner

The dashboard and providers views let a signed-in user see their plans and subscriptions, grouped by provider, with active and trial counts, nominal monthly spend per currency, and the earliest period end, and manage the subscriptions they own (create, cancel, delete; further lifecycle controls are specified in the subscriptions specification).

### 6. An operable platform (Planned)

Releases, domains, databases, configuration, and legacy retirement are run from a platform control plane with a strict plan/apply split: a plan is pure, deterministic, and checksummed; applying a plan requires explicit confirmation and defaults to dry-run; every action is recorded in an append-only audit log; secrets are referenced by name and never appear in plans, logs, or audit records. The admin application renders these registries and the audit log read-only; changes are applied by an operator, not from the admin UI.

### 7. Foundations that can be retired cleanly

Clerk, Cloudflare, and Deno Deploy are legacy dependencies with a January 2027 sunset (see section 8). The system keeps each behind a narrow seam (the auth identity seam, the weighted persistence strategy registry, checksummed migration manifests) so each can be replaced — local session authentication, the native persistence adapter with SQLite — without changing product behaviour.
