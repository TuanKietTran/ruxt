# Job automation

## Status

Implemented: the `/jobs` editor context, the authenticated proxy to the Job CV Finder core, browser-side candidate snapshots, and every section listed below. Delivery is a route-level module in this application; the core is a separate Go service with Python workers (see the `job-cv-finder` package in llm-toolkit).

## Ownership

Ruxt remains the owner of candidate data. Profiles and CVs stay browser-local. The core receives only what the owner selects in **CV workspace**, as a read-only snapshot (`candidate-snapshot.schema.json`, v1) that keeps each CV's id and revision. This is an explicit, per-send action. It does not change the rule that standalone profiles are never synchronized automatically ([Cloud data](authenticated-cloud-data.md)).

Generated documents are never written over a CV. **Open in CV editor as a new CV** creates a new local session. That is Ruxt's local-first form of registering an artifact, and the core records it as `registered`.

## Transport and trust

- The browser calls `/api/jobs/v1/...` only. `server/routes/api/jobs/[...path].ts` requires a signed-in principal equal to `runtimeConfig.jobAutomation.owner`. Any other account gets 404, so the feature's existence is not revealed. The route forwards an allow-listed set of paths with the server-held `jobAutomation.token`.
- Platform credentials, the core token, worker endpoints and model keys never reach the browser. Credentials are write-only (stored encrypted by the core) and accepted only for sources with an authorized-API capability.
- Live progress uses SSE over the core's durable event log, which resumes with `Last-Event-ID`.
- Configuration comes from `NUXT_JOB_AUTOMATION_URL`, `NUXT_JOB_AUTOMATION_TOKEN` and `NUXT_JOB_AUTOMATION_OWNER`. When any is empty the feature answers 503 and the page shows it as unavailable.

## Sections

Overview, Job sources, Platform accounts, Discovery, Matching, CV workspace, Application queue, Applications (with detail), Execution history, Analytics, Settings.

Settings holds job preferences and standing answers. Both are written by the owner, stored in this browser (`ruxt:job-automation:preferences:v1`) and sent with the next snapshot. The core answers application questions only from these and from evidenced CV facts. Anything else is shown to the owner as a question.

## Platform policy shown to the owner

Discovery and submission are shown as separate capabilities, each with its basis. LinkedIn and ITviec (preferred) and CareerViet and VietnamWorks (candidates) are discovery-by-email or by pasted job, with **submission by the owner** (handoff). Their confirmation emails verify submission. Automated submission is enabled only where a source's policy grants an authorized API. Policy is changed in code review, not from this UI.

## Verification

`tests/unit/job-snapshot.test.ts` covers snapshot shape and preference normalization. Cross-service behaviour is covered by the core's Go and Python tests and its end-to-end script.
