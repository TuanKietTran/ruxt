import RuxtKit
import SwiftUI

/// Settings mirrors the web /settings and /settings/cloud-data screens and
/// exposes the shell controls: theme and density, both persisted in
/// @AppStorage (UserDefaults) under the same keys RootView reads.
struct SettingsView: View {
    @AppStorage("ruxt.theme.choice") private var themeChoiceRaw = AppThemeChoice.system.rawValue
    @AppStorage("ruxt.density") private var densityRaw = AppDensity.comfortable.rawValue
    @AppStorage("ruxt.profile.saveMode") private var saveMode = "auto"
    @AppStorage("ruxt.cloud.sessionRecoveryConsent") private var sessionRecoveryConsent = false
    @AppStorage("ruxt.cloud.templateConsent") private var templateConsent = false
    @Environment(\.ruxtPalette) private var palette
    @Environment(\.ruxtDensity) private var density

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Theme", selection: $themeChoiceRaw) {
                    ForEach(AppThemeChoice.allCases) { choice in
                        Text(choice.label).tag(choice.rawValue)
                    }
                }
                .accessibilityLabel("Theme")
                Picker("Density", selection: $densityRaw) {
                    ForEach(AppDensity.allCases) { value in
                        Text(value.label).tag(value.rawValue)
                    }
                }
                .accessibilityLabel("Density")
                HStack(spacing: 8) {
                    swatch(palette.colors.bgBase, label: "Background")
                    swatch(palette.colors.bgSurface0, label: "Surface")
                    swatch(palette.colors.accent, label: "Accent")
                    swatch(palette.colors.fgText, label: "Text")
                    Text(palette.name.rawValue.capitalized).font(.body).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Current palette \(palette.name.rawValue)")
            }
            Section("Profile editor") {
                Picker("Save mode", selection: $saveMode) {
                    Text("Auto-save").tag("auto")
                    Text("Save with button").tag("manual")
                }
                .accessibilityLabel("Profile editor save mode")
                Text(saveMode == "auto" ? "Changes save automatically while you edit." : "Changes save only when you use the save button.")
                    .font(.body).foregroundStyle(.secondary)
            }
            Section("Cloud data") {
                Toggle("Cloud session recovery", isOn: $sessionRecoveryConsent)
                    .accessibilityLabel("Cloud session recovery consent")
                Toggle("Cloud templates", isOn: $templateConsent)
                    .accessibilityLabel("Cloud template consent")
                Text("Local-first by default. Cloud features stay off until you opt in.")
                    .font(.body).foregroundStyle(.secondary)
            }
            Section {
                Text("Row padding \(Int(density.rowPadding)) pt, section spacing \(Int(density.sectionSpacing)) pt at the current density.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }

    private func swatch(_ hex: String, label: String) -> some View {
        RoundedRectangle(cornerRadius: RuxtRadius.sm)
            .fill(Color(hex: hex))
            .frame(width: 24, height: 24)
            .overlay(RoundedRectangle(cornerRadius: RuxtRadius.sm).stroke(.secondary, lineWidth: 0.5))
            .accessibilityLabel(label)
    }
}
