import Foundation
import RuxtKit
import SwiftUI

/// User-facing theme choice: follow the system, or pin a named palette.
/// Latte is the light palette and Mocha the dark palette, mirroring the web themes.
enum AppThemeChoice: String, CaseIterable, Identifiable {
    case system
    case latte
    case mocha

    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: return "System"
        case .latte: return "Latte (light)"
        case .mocha: return "Mocha (dark)"
        }
    }
    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .latte: return .light
        case .mocha: return .dark
        }
    }
    func palette(systemScheme: ColorScheme) -> RuxtThemeTokens {
        switch self {
        case .latte: return RuxtTheme.latte
        case .mocha: return RuxtTheme.mocha
        case .system: return systemScheme == .dark ? RuxtTheme.mocha : RuxtTheme.latte
        }
    }
}

enum AppDensity: String, CaseIterable, Identifiable {
    case comfortable
    case compact

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var tokens: RuxtDensityTokens {
        switch self {
        case .comfortable: return RuxtDensity.comfortable
        case .compact: return RuxtDensity.compact
        }
    }
}

extension Color {
    /// Creates a color from a "#rrggbb" token value.
    init(hex: String) {
        let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: value).scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

private struct RuxtPaletteKey: EnvironmentKey {
    static let defaultValue: RuxtThemeTokens = RuxtTheme.mocha
}

private struct RuxtDensityKey: EnvironmentKey {
    static let defaultValue: RuxtDensityTokens = RuxtDensity.comfortable
}

extension EnvironmentValues {
    var ruxtPalette: RuxtThemeTokens {
        get { self[RuxtPaletteKey.self] }
        set { self[RuxtPaletteKey.self] = newValue }
    }
    var ruxtDensity: RuxtDensityTokens {
        get { self[RuxtDensityKey.self] }
        set { self[RuxtDensityKey.self] = newValue }
    }
}
