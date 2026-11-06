# Mobile PoC — asset index

All assets are **prototype renders**, not real app screenshots: HTML mirrors of the actual app screens (in each platform `prototype/` directory, styled from the generated design tokens) screenshot headless, with sample data only. No mobile toolchain on the build machine can produce real captures (no Flutter/Dart SDK, no iOS simulator runtimes, no Android SDK platforms/build-tools). Each platform README labels this the same way.

**Totals: 77 PNG + 9 GIF + 9 MP4 = 95 visual assets, 184 files, ~4.1 MB total. Largest GIF ~246 KB (limit 3 MB each, 30 MB total).**

Regenerate: [`tools/poc/README.md`](../../../tools/poc/README.md) — one command per platform (`tools/poc/capture-android.sh`, `capture-ios.sh`, `capture-flutter.sh`, or `capture-all.sh`), or the manual `poc-capture` workflow.

## Android (27 screens + 3 flows)

Dimensions: 412x915 phone, wide-rail 800x1280. Platform notes: [android/README.md](android/README.md) · Generator: [android/gen.py](android/gen.py)

### Screens

- [01-login.png](android/01-login.png)
- [02-sessions.png](android/02-sessions.png)
- [03-sessions-empty.png](android/03-sessions-empty.png)
- [04-editor.png](android/04-editor.png)
- [05-editor-offline.png](android/05-editor-offline.png)
- [06-templates.png](android/06-templates.png)
- [07-profiles.png](android/07-profiles.png)
- [08-providers.png](android/08-providers.png)
- [09-dashboard.png](android/09-dashboard.png)
- [10-settings.png](android/10-settings.png)
- [11-settings-consents.png](android/11-settings-consents.png)
- [12-about.png](android/12-about.png)
- [13-more.png](android/13-more.png)
- [14-planned.png](android/14-planned.png)
- [15-loading.png](android/15-loading.png)
- [16-error.png](android/16-error.png)
- [17-wide-rail-sessions.png](android/17-wide-rail-sessions.png)
- [18-wide-rail-editor.png](android/18-wide-rail-editor.png)
- [19-templates-empty.png](android/19-templates-empty.png)
- [20-profiles-empty.png](android/20-profiles-empty.png)
- [21-editor-empty.png](android/21-editor-empty.png)
- [22-planned-billing.png](android/22-planned-billing.png)
- [23-planned-iam.png](android/23-planned-iam.png)
- [24-offline.png](android/24-offline.png)
- [25-wide-rail-settings.png](android/25-wide-rail-settings.png)
- [26-wide-rail-dashboard.png](android/26-wide-rail-dashboard.png)
- [27-editor-edited.png](android/27-editor-edited.png)

### Flows

| Flow | GIF | MP4 |
|---|---|---|
| flow-login-list-edit-export | [flow-login-list-edit-export.gif](android/flow-login-list-edit-export.gif) | [flow-login-list-edit-export.mp4](android/flow-login-list-edit-export.mp4) |
| flow-offline | [flow-offline.gif](android/flow-offline.gif) | [flow-offline.mp4](android/flow-offline.mp4) |
| flow-wide-rail | [flow-wide-rail.gif](android/flow-wide-rail.gif) | [flow-wide-rail.mp4](android/flow-wide-rail.mp4) |

## iOS (24 screens + 3 flows)

Dimensions: 393x852 phone, iPad split 820x1180. Platform notes: [ios/README.md](ios/README.md) · Generator: [ios/gen.py](ios/gen.py)

### Screens

- [01-sessions.png](ios/01-sessions.png)
- [02-sessions-empty.png](ios/02-sessions-empty.png)
- [03-editor.png](ios/03-editor.png)
- [04-editor-manual-save.png](ios/04-editor-manual-save.png)
- [05-templates.png](ios/05-templates.png)
- [06-templates-loading.png](ios/06-templates-loading.png)
- [07-templates-error.png](ios/07-templates-error.png)
- [08-profiles.png](ios/08-profiles.png)
- [09-providers.png](ios/09-providers.png)
- [10-settings.png](ios/10-settings.png)
- [11-settings-account-login.png](ios/11-settings-account-login.png)
- [12-about.png](ios/12-about.png)
- [13-offline-or-error-state.png](ios/13-offline-or-error-state.png)
- [14-ipad-split-sessions.png](ios/14-ipad-split-sessions.png)
- [15-ipad-split-editor.png](ios/15-ipad-split-editor.png)
- [16-profiles-loading.png](ios/16-profiles-loading.png)
- [17-profiles-error.png](ios/17-profiles-error.png)
- [18-providers-loading.png](ios/18-providers-loading.png)
- [19-providers-error.png](ios/19-providers-error.png)
- [20-editor-preview.png](ios/20-editor-preview.png)
- [21-editor-css-expanded.png](ios/21-editor-css-expanded.png)
- [22-settings-account-signed-in.png](ios/22-settings-account-signed-in.png)
- [23-ipad-split-about.png](ios/23-ipad-split-about.png)
- [24-settings-latte.png](ios/24-settings-latte.png)

### Flows

| Flow | GIF | MP4 |
|---|---|---|
| flow-ipad-split | [flow-ipad-split.gif](ios/flow-ipad-split.gif) | [flow-ipad-split.mp4](ios/flow-ipad-split.mp4) |
| flow-login-list-edit-save | [flow-login-list-edit-save.gif](ios/flow-login-list-edit-save.gif) | [flow-login-list-edit-save.mp4](ios/flow-login-list-edit-save.mp4) |
| flow-offline | [flow-offline.gif](ios/flow-offline.gif) | [flow-offline.mp4](ios/flow-offline.mp4) |

## Flutter (26 screens + 3 flows)

Dimensions: 412x915 phone, wide-rail 800x1280. Platform notes: [flutter/README.md](flutter/README.md) · Generator: [flutter/gen.py](flutter/gen.py)

### Screens

- [01-editor.png](flutter/01-editor.png)
- [02-sessions.png](flutter/02-sessions.png)
- [03-sessions-empty.png](flutter/03-sessions-empty.png)
- [04-templates.png](flutter/04-templates.png)
- [05-profiles.png](flutter/05-profiles.png)
- [06-settings.png](flutter/06-settings.png)
- [07-providers.png](flutter/07-providers.png)
- [08-cloud-data.png](flutter/08-cloud-data.png)
- [09-cloud-data-consents.png](flutter/09-cloud-data-consents.png)
- [10-about.png](flutter/10-about.png)
- [11-login.png](flutter/11-login.png)
- [12-loading.png](flutter/12-loading.png)
- [13-error.png](flutter/13-error.png)
- [14-offline.png](flutter/14-offline.png)
- [15-wide-rail-editor.png](flutter/15-wide-rail-editor.png)
- [16-wide-rail-sessions.png](flutter/16-wide-rail-sessions.png)
- [17-editor-preview.png](flutter/17-editor-preview.png)
- [18-editor-empty.png](flutter/18-editor-empty.png)
- [19-templates-empty.png](flutter/19-templates-empty.png)
- [20-profiles-empty.png](flutter/20-profiles-empty.png)
- [21-providers-empty.png](flutter/21-providers-empty.png)
- [22-wide-rail-settings.png](flutter/22-wide-rail-settings.png)
- [23-settings-latte.png](flutter/23-settings-latte.png)
- [24-editor-export.png](flutter/24-editor-export.png)
- [25-wide-rail-cloud-data.png](flutter/25-wide-rail-cloud-data.png)
- [26-editor-edited.png](flutter/26-editor-edited.png)

### Flows

| Flow | GIF | MP4 |
|---|---|---|
| flow-login-list-edit-export | [flow-login-list-edit-export.gif](flutter/flow-login-list-edit-export.gif) | [flow-login-list-edit-export.mp4](flutter/flow-login-list-edit-export.mp4) |
| flow-offline | [flow-offline.gif](flutter/flow-offline.gif) | [flow-offline.mp4](flutter/flow-offline.mp4) |
| flow-wide-rail | [flow-wide-rail.gif](flutter/flow-wide-rail.gif) | [flow-wide-rail.mp4](flutter/flow-wide-rail.mp4) |
