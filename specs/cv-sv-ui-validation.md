# UI validation

Run against disposable local data and a configured development Clerk instance.

| Area | Check |
| --- | --- |
| Draft/session | First edit creates one local session; route/title remain stable; reload restores source |
| Save failures | Quota/blocked storage preserves existing records and in-memory edits |
| Navigation | Switching sessions and leaving the page retains the latest edit |
| Profiles | Nested fields edit correctly; incomplete entries remain unsaved; dirty switches require a decision |
| Transfer | Encrypted profile import/export round-trips; wrong passphrases fail without changing local data |
| Preview | Markdown sanitization, scoped CSS, page breaks, pagination, zoom, font loading |
| Exports | Active document only; PDF A4 print; PNG/JPEG quality and multi-page ZIP |
| Responsive | Narrow sidebar drawer, split resize, overflow, touch and keyboard navigation |
| Accessibility | Labels, focus restoration, Escape dismissal, reduced motion |
| Authentication | Sign-in/up/logout, protected redirects, independent consent categories |
| Isolation | Sign-out, errors, and remote changes never clear browser-local CVs |

Existing smoke/browser suites are opt-in. Mocked auth and skipped cases do not verify live Clerk behavior. Historical browser sessions are not a substitute for repeatable regression checks.
