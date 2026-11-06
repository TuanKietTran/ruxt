// Generated from tokens.json (design/tokens.json). Do not edit by hand.
// Regenerate with: swift Tools/generate-theme.swift
import Foundation

public enum RuxtThemeName: String, CaseIterable, Sendable {
    case latte
    case mocha
    case opencode
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
    public let info: String
    public let mauve: String
    public let onAccent: String
    public let peach: String
    public let pink: String
    public let red: String
    public let sapphire: String
    public let sky: String
    public let success: String
    public let teal: String
    public let warning: String
    public let yellow: String
    public init(accent: String, accentHover: String, accentMuted: String, bgBase: String, bgCrust: String, bgMantle: String, bgOverlay0: String, bgOverlay1: String, bgOverlay2: String, bgSurface0: String, bgSurface1: String, bgSurface2: String, border: String, borderStrong: String, danger: String, fgSubtext0: String, fgSubtext1: String, fgText: String, green: String, info: String, mauve: String, onAccent: String, peach: String, pink: String, red: String, sapphire: String, sky: String, success: String, teal: String, warning: String, yellow: String) {
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
        self.info = info
        self.mauve = mauve
        self.onAccent = onAccent
        self.peach = peach
        self.pink = pink
        self.red = red
        self.sapphire = sapphire
        self.sky = sky
        self.success = success
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
    public static let latte = RuxtThemeTokens(name: .latte, colorScheme: "light", colors: RuxtColorPalette(accent: "#164cc0", accentHover: "#1445b0", accentMuted: "#ccd0da", bgBase: "#eff1f5", bgCrust: "#dce0e8", bgMantle: "#e6e9ef", bgOverlay0: "#9ca0b0", bgOverlay1: "#8c8fa1", bgOverlay2: "#7c7f93", bgSurface0: "#ccd0da", bgSurface1: "#bcc0cc", bgSurface2: "#acb0be", border: "#ccd0da", borderStrong: "#bcc0cc", danger: "#b00d30", fgSubtext0: "#53566e", fgSubtext1: "#505268", fgText: "#4c4f69", green: "#40a02b", info: "#135f6d", mauve: "#8839ef", onAccent: "#ffffff", peach: "#fe640b", pink: "#ea76cb", red: "#d20f39", sapphire: "#209fb5", sky: "#04a5e5", success: "#28631b", teal: "#179299", warning: "#7b4e10", yellow: "#df8e1d"))
    public static let mocha = RuxtThemeTokens(name: .mocha, colorScheme: "dark", colors: RuxtColorPalette(accent: "#89b4fa", accentHover: "#b4befe", accentMuted: "#313244", bgBase: "#1e1e2e", bgCrust: "#11111b", bgMantle: "#181825", bgOverlay0: "#6c7086", bgOverlay1: "#7f849c", bgOverlay2: "#9399b2", bgSurface0: "#313244", bgSurface1: "#45475a", bgSurface2: "#585b70", border: "#313244", borderStrong: "#45475a", danger: "#f38ba8", fgSubtext0: "#a6adc8", fgSubtext1: "#bac2de", fgText: "#cdd6f4", green: "#a6e3a1", info: "#74c7ec", mauve: "#cba6f7", onAccent: "#11111b", peach: "#fab387", pink: "#f5c2e7", red: "#f38ba8", sapphire: "#74c7ec", sky: "#89dceb", success: "#a6e3a1", teal: "#94e2d5", warning: "#f9e2af", yellow: "#f9e2af"))
    public static let opencode = RuxtThemeTokens(name: .opencode, colorScheme: "dark", colors: RuxtColorPalette(accent: "#22c55e", accentHover: "#4ade80", accentMuted: "#1a2e1a", bgBase: "#0a0a0a", bgCrust: "#050505", bgMantle: "#111111", bgOverlay0: "#404040", bgOverlay1: "#525252", bgOverlay2: "#737373", bgSurface0: "#1a1a1a", bgSurface1: "#242424", bgSurface2: "#2e2e2e", border: "#1a1a1a", borderStrong: "#2e2e2e", danger: "#f87171", fgSubtext0: "#a3a3a3", fgSubtext1: "#d4d4d4", fgText: "#fafafa", green: "#4ade80", info: "#60a5fa", mauve: "#a78bfa", onAccent: "#0a0a0a", peach: "#fb923c", pink: "#f472b6", red: "#f87171", sapphire: "#60a5fa", sky: "#38bdf8", success: "#4ade80", teal: "#2dd4bf", warning: "#fbbf24", yellow: "#fbbf24"))
    public static func tokens(for name: RuxtThemeName) -> RuxtThemeTokens {
        switch name {
        case .latte: return latte
        case .mocha: return mocha
        case .opencode: return opencode
        }
    }
}

public enum RuxtTypography {
    public static let body: Double = 14
    public static let bodyLarge: Double = 16
    public static let bodySmall: Double = 13
    public static let caption: Double = 11
    public static let display: Double = 40
    public static let heading: Double = 28
    public static let label: Double = 12
    public static let subtitle: Double = 18
    public static let title: Double = 24
}

public enum RuxtSpacing {
    public static let lg: Double = 12
    public static let md: Double = 8
    public static let none: Double = 0
    public static let sm: Double = 6
    public static let xl: Double = 16
    public static let xs: Double = 4
    public static let xxl: Double = 20
    public static let xxxl: Double = 24
    public static let xxxxl: Double = 32
    public static let xxxxxl: Double = 40
    public static let xxxxxxl: Double = 48
}

public enum RuxtRadius {
    public static let full: Double = 9999
    public static let lg: Double = 16
    public static let md: Double = 10
    public static let none: Double = 0
    public static let sm: Double = 6
}

public enum RuxtElevation {
    public static let lg: String = "0 20px 60px rgb(0 0 0 / 0.35)"
    public static let md: String = "0 12px 32px rgb(0 0 0 / 0.35)"
    public static let none: String = "none"
    public static let sm: String = "0 1px 4px rgb(0 0 0 / 0.18)"
    public static let xl: String = "0 24px 80px rgb(0 0 0 / 0.38)"
}

public enum RuxtMotion {
    public static let emphasized: Double = 0.28
    public static let fast: Double = 0.15
    public static let instant: Double = 0
    public static let skeleton: Double = 1.2
    public static let slow: Double = 0.4
    public static let standard: Double = 0.2
}

public enum RuxtMotionEasing {
    public static let emphasized: String = "cubic-bezier(0.4, 0, 0.2, 1)"
    public static let linear: String = "linear"
    public static let standard: String = "ease"
}

public enum RuxtBreakpoints {
    public static let medium: Double = 900
    public static let phone: Double = 480
    public static let small: Double = 640
    public static let compactMax: Double = 900
    public static let regularMin: Double = 901
}

public enum RuxtFocusRing {
    public static let offset: Double = 2
    public static let width: Double = 2
}

public struct RuxtDensityTokens: Equatable, Sendable {
    public let scale: Double
    public let controlHeight: Double
    public let rowHeight: Double
    public let rowPadding: Double
    public let sectionSpacing: Double
    public init(scale: Double, controlHeight: Double, rowHeight: Double, rowPadding: Double, sectionSpacing: Double) { self.scale = scale; self.controlHeight = controlHeight; self.rowHeight = rowHeight; self.rowPadding = rowPadding; self.sectionSpacing = sectionSpacing }
}
public enum RuxtDensity {
    public static let comfortable = RuxtDensityTokens(scale: 1, controlHeight: 36, rowHeight: 40, rowPadding: 12, sectionSpacing: 24)
    public static let compact = RuxtDensityTokens(scale: 0.875, controlHeight: 30, rowHeight: 32, rowPadding: 6, sectionSpacing: 12)
}
