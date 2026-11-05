// Generated from provisional-tokens.json (PROVISIONAL tokens, seeded from app/assets/theme/themes.css). Do not edit by hand.
// Regenerate with: swift Tools/generate-theme.swift
import Foundation

public enum RuxtThemeName: String, CaseIterable, Sendable {
    case latte
    case mocha
}

public struct RuxtColorPalette: Equatable, Sendable {
    public let accent: String
    public let accentHover: String
    public let accentMuted: String
    public let bgBase: String
    public let bgCrust: String
    public let bgMantle: String
    public let bgOverlay0: String
    public let bgOverlay1: String
    public let bgOverlay2: String
    public let bgSurface0: String
    public let bgSurface1: String
    public let bgSurface2: String
    public let border: String
    public let borderStrong: String
    public let danger: String
    public let fgSubtext0: String
    public let fgSubtext1: String
    public let fgText: String
    public let green: String
    public let mauve: String
    public let peach: String
    public let pink: String
    public let red: String
    public let sapphire: String
    public let sky: String
    public let teal: String
    public let warning: String
    public let yellow: String
    public init(accent: String, accentHover: String, accentMuted: String, bgBase: String, bgCrust: String, bgMantle: String, bgOverlay0: String, bgOverlay1: String, bgOverlay2: String, bgSurface0: String, bgSurface1: String, bgSurface2: String, border: String, borderStrong: String, danger: String, fgSubtext0: String, fgSubtext1: String, fgText: String, green: String, mauve: String, peach: String, pink: String, red: String, sapphire: String, sky: String, teal: String, warning: String, yellow: String) {
        self.accent = accent
        self.accentHover = accentHover
        self.accentMuted = accentMuted
        self.bgBase = bgBase
        self.bgCrust = bgCrust
        self.bgMantle = bgMantle
        self.bgOverlay0 = bgOverlay0
        self.bgOverlay1 = bgOverlay1
        self.bgOverlay2 = bgOverlay2
        self.bgSurface0 = bgSurface0
        self.bgSurface1 = bgSurface1
        self.bgSurface2 = bgSurface2
        self.border = border
        self.borderStrong = borderStrong
        self.danger = danger
        self.fgSubtext0 = fgSubtext0
        self.fgSubtext1 = fgSubtext1
        self.fgText = fgText
        self.green = green
        self.mauve = mauve
        self.peach = peach
        self.pink = pink
        self.red = red
        self.sapphire = sapphire
        self.sky = sky
        self.teal = teal
        self.warning = warning
        self.yellow = yellow
    }
}

public struct RuxtThemeTokens: Equatable, Sendable {
    public let name: RuxtThemeName
    public let colorScheme: String
    public let colors: RuxtColorPalette
    public init(name: RuxtThemeName, colorScheme: String, colors: RuxtColorPalette) {
        self.name = name; self.colorScheme = colorScheme; self.colors = colors
    }
}

public enum RuxtTheme {
    public static let latte = RuxtThemeTokens(name: .latte, colorScheme: "light", colors: RuxtColorPalette(accent: "#164cc0", accentHover: "#1445b0", accentMuted: "#ccd0da", bgBase: "#eff1f5", bgCrust: "#dce0e8", bgMantle: "#e6e9ef", bgOverlay0: "#9ca0b0", bgOverlay1: "#8c8fa1", bgOverlay2: "#7c7f93", bgSurface0: "#ccd0da", bgSurface1: "#bcc0cc", bgSurface2: "#acb0be", border: "#ccd0da", borderStrong: "#bcc0cc", danger: "#d20f39", fgSubtext0: "#53566e", fgSubtext1: "#505268", fgText: "#4c4f69", green: "#40a02b", mauve: "#8839ef", peach: "#fe640b", pink: "#ea76cb", red: "#d20f39", sapphire: "#209fb5", sky: "#04a5e5", teal: "#179299", warning: "#df8e1d", yellow: "#df8e1d"))
    public static let mocha = RuxtThemeTokens(name: .mocha, colorScheme: "dark", colors: RuxtColorPalette(accent: "#89b4fa", accentHover: "#b4befe", accentMuted: "#313244", bgBase: "#1e1e2e", bgCrust: "#11111b", bgMantle: "#181825", bgOverlay0: "#6c7086", bgOverlay1: "#7f849c", bgOverlay2: "#9399b2", bgSurface0: "#313244", bgSurface1: "#45475a", bgSurface2: "#585b70", border: "#313244", borderStrong: "#45475a", danger: "#f38ba8", fgSubtext0: "#a6adc8", fgSubtext1: "#bac2de", fgText: "#cdd6f4", green: "#a6e3a1", mauve: "#cba6f7", peach: "#fab387", pink: "#f5c2e7", red: "#f38ba8", sapphire: "#74c7ec", sky: "#89dceb", teal: "#94e2d5", warning: "#f9e2af", yellow: "#f9e2af"))
    public static func tokens(for name: RuxtThemeName) -> RuxtThemeTokens {
        switch name {
        case .latte: return latte
        case .mocha: return mocha
        }
    }
}

public enum RuxtTypography {
    public static let body: Double = 17
    public static let callout: Double = 16
    public static let caption: Double = 12
    public static let footnote: Double = 13
    public static let headline: Double = 17
    public static let largeTitle: Double = 34
    public static let subheadline: Double = 15
    public static let title: Double = 28
    public static let title2: Double = 22
    public static let title3: Double = 20
}

public enum RuxtSpacing {
    public static let lg: Double = 24
    public static let md: Double = 16
    public static let sm: Double = 8
    public static let xl: Double = 32
    public static let xs: Double = 4
    public static let xxl: Double = 48
}

public enum RuxtRadius {
    public static let full: Double = 9999
    public static let lg: Double = 16
    public static let md: Double = 10
    public static let sm: Double = 6
}

public enum RuxtElevation {
    public static let high: Double = 16
    public static let low: Double = 2
    public static let medium: Double = 8
}

public enum RuxtMotion {
    public static let fast: Double = 0.15
    public static let standard: Double = 0.3
}

public enum RuxtBreakpoints {
    public static let compactMax: Double = 599
    public static let regularMin: Double = 600
}

public enum RuxtFocusRing {
    public static let offset: Double = 2
    public static let width: Double = 2
}

public struct RuxtDensityTokens: Equatable, Sendable {
    public let rowPadding: Double
    public let sectionSpacing: Double
    public init(rowPadding: Double, sectionSpacing: Double) { self.rowPadding = rowPadding; self.sectionSpacing = sectionSpacing }
}
public enum RuxtDensity {
    public static let comfortable = RuxtDensityTokens(rowPadding: 12, sectionSpacing: 24)
    public static let compact = RuxtDensityTokens(rowPadding: 6, sectionSpacing: 12)
}
