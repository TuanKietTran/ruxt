import Foundation

// Generates RuxtKit/Sources/RuxtKit/Theme.swift from the shared design tokens.
// Usage: swift Tools/generate-theme.swift [input.json] [output.swift]
// Defaults: input <worktree>/design/tokens.json, output RuxtKit/Sources/RuxtKit/Theme.swift,
// resolved relative to the current directory or to this script's location.
//
// The design token schema differs from the provisional file this generator
// used before; the mapping below preserves RuxtKit's existing public API
// where the shell and tests use it:
// - themes.<name>.color -> RuxtColorPalette (all themes share one key set)
// - typography.scale.<name>.sizePx -> RuxtTypography.<name>
// - spacing keys that start with a digit (2xl, 3xl, ...) are emitted with
//   the digit expanded to x's (xxl, xxxl, ...), valid Swift identifiers
// - elevation values are shadow strings -> RuxtElevation String constants
// - motion.durationMs -> RuxtMotion, converted from milliseconds to seconds
// - motion.easing -> RuxtMotionEasing String constants
// - breakpoints.valuesPx -> RuxtBreakpoints phone/small/medium;
//   compactMax/regularMin are derived from the compact window class
// - focusRing widthPx/offsetPx -> RuxtFocusRing width/offset
// - density keeps its real fields (scale, controlHeight, rowHeight) and
//   also rowPadding/sectionSpacing, derived from the spacing scale
//   (comfortable: lg / 3xl, compact: sm / lg), which the shell displays

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let fm = FileManager.default
let cwd = fm.currentDirectoryPath
let scriptPath = CommandLine.arguments[0]
let scriptAbs = scriptPath.hasPrefix("/") ? scriptPath : (cwd as NSString).appendingPathComponent(scriptPath)
let toolsDir = (scriptAbs as NSString).deletingLastPathComponent
let iosRoot = (toolsDir as NSString).deletingLastPathComponent
let repoRoot = ((iosRoot as NSString).deletingLastPathComponent as NSString).deletingLastPathComponent

func resolve(_ explicit: String?, _ relativeCandidates: [String]) -> String {
    if let explicit { return explicit.hasPrefix("/") ? explicit : (cwd as NSString).appendingPathComponent(explicit) }
    for candidate in relativeCandidates where fm.fileExists(atPath: candidate) { return candidate }
    return relativeCandidates[0]
}

let args = Array(CommandLine.arguments.dropFirst())
let inputPath = resolve(args.count > 0 ? args[0] : nil, [
    (cwd as NSString).appendingPathComponent("design/tokens.json"),
    (repoRoot as NSString).appendingPathComponent("design/tokens.json"),
])
let outputPath = resolve(args.count > 1 ? args[1] : nil, [
    (cwd as NSString).appendingPathComponent("RuxtKit/Sources/RuxtKit/Theme.swift"),
    (iosRoot as NSString).appendingPathComponent("RuxtKit/Sources/RuxtKit/Theme.swift"),
])

guard let data = fm.contents(atPath: inputPath) else { fail("cannot read tokens at \(inputPath)") }
guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { fail("tokens file is not a JSON object") }

func dict(_ value: Any?) -> [String: Any] {
    guard let d = value as? [String: Any] else { fail("expected object, got \(String(describing: value))") }
    return d
}
func str(_ value: Any?) -> String {
    guard let s = value as? String else { fail("expected string, got \(String(describing: value))") }
    return s
}
func fmt(_ d: Double) -> String {
    return d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d)
}
func numD(_ value: Any?) -> Double {
    guard let n = value as? NSNumber else { fail("expected number, got \(String(describing: value))") }
    return n.doubleValue
}
func num(_ value: Any?) -> String { return fmt(numD(value)) }
func esc(_ s: String) -> String {
    return s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
}
func ident(_ key: String) -> String {
    guard let first = key.first, first.isNumber else { return key }
    let n = Int(String(first)) ?? 1
    return String(repeating: "x", count: max(n - 1, 0)) + String(key.dropFirst())
}

let themes = dict(root["themes"])
let themeNames = themes.keys.sorted()
guard !themeNames.isEmpty else { fail("no themes in tokens") }
let colorKeys = dict(dict(themes[themeNames[0]])["color"]).keys.sorted()
for name in themeNames {
    let keys = dict(dict(themes[name])["color"]).keys.sorted()
    guard keys == colorKeys else { fail("theme \(name) has a different color key set") }
}

var out: [String] = []
out.append("// Generated from tokens.json (design/tokens.json). Do not edit by hand.")
out.append("// Regenerate with: swift Tools/generate-theme.swift")
out.append("import Foundation")
out.append("")
out.append("public enum RuxtThemeName: String, CaseIterable, Sendable {")
for name in themeNames { out.append("    case \(name)") }
out.append("}")
out.append("")
out.append("public struct RuxtColorPalette: Equatable, Sendable {")
for key in colorKeys { out.append("    public let \(key): String") }
out.append("    public init(" + colorKeys.map { "\($0): String" }.joined(separator: ", ") + ") {")
for key in colorKeys { out.append("        self.\(key) = \(key)") }
out.append("    }")
out.append("}")
out.append("")
out.append("public struct RuxtThemeTokens: Equatable, Sendable {")
out.append("    public let name: RuxtThemeName")
out.append("    public let colorScheme: String")
out.append("    public let colors: RuxtColorPalette")
out.append("    public init(name: RuxtThemeName, colorScheme: String, colors: RuxtColorPalette) {")
out.append("        self.name = name; self.colorScheme = colorScheme; self.colors = colors")
out.append("    }")
out.append("}")
out.append("")
out.append("public enum RuxtTheme {")
for name in themeNames {
    let theme = dict(themes[name])
    let colors = dict(theme["color"])
    let scheme = str(theme["colorScheme"])
    let pairs = colorKeys.map { "\($0): \"\(str(colors[$0]))\"" }.joined(separator: ", ")
    out.append("    public static let \(name) = RuxtThemeTokens(name: .\(name), colorScheme: \"\(scheme)\", colors: RuxtColorPalette(\(pairs)))")
}
out.append("    public static func tokens(for name: RuxtThemeName) -> RuxtThemeTokens {")
out.append("        switch name {")
for name in themeNames { out.append("        case .\(name): return \(name)") }
out.append("        }")
out.append("    }")
out.append("}")

let typeScale = dict(dict(root["typography"])["scale"])
out.append("")
out.append("public enum RuxtTypography {")
for k in typeScale.keys.sorted() {
    let size = num(dict(typeScale[k])["sizePx"])
    out.append("    public static let \(k): Double = \(size)")
}
out.append("}")

let spacing = dict(root["spacing"])
out.append("")
out.append("public enum RuxtSpacing {")
for k in spacing.keys.sorted(by: { ident($0) < ident($1) }) { out.append("    public static let \(ident(k)): Double = \(num(spacing[k]))") }
out.append("}")

let radius = dict(root["radius"])
out.append("")
out.append("public enum RuxtRadius {")
for k in radius.keys.sorted() { out.append("    public static let \(k): Double = \(num(radius[k]))") }
out.append("}")

let elevation = dict(root["elevation"])
out.append("")
out.append("public enum RuxtElevation {")
for k in elevation.keys.sorted() { out.append("    public static let \(k): String = \"\(esc(str(elevation[k])))\"") }
out.append("}")

let motion = dict(root["motion"])
let durations = dict(motion["durationMs"])
out.append("")
out.append("public enum RuxtMotion {")
for k in durations.keys.sorted() { out.append("    public static let \(k): Double = \(fmt(numD(durations[k]) / 1000))") }
out.append("}")
let easing = dict(motion["easing"])
out.append("")
out.append("public enum RuxtMotionEasing {")
for k in easing.keys.sorted() { out.append("    public static let \(k): String = \"\(esc(str(easing[k])))\"") }
out.append("}")

let breakpoints = dict(root["breakpoints"])
let bpValues = dict(breakpoints["valuesPx"])
guard let windowClasses = breakpoints["windowClasses"] as? [[String: Any]], let compactClass = windowClasses.first(where: { str($0["name"]) == "compact" }) else { fail("breakpoints.windowClasses has no compact class") }
let compactMax = numD(compactClass["maxWidthPx"])
out.append("")
out.append("public enum RuxtBreakpoints {")
for k in bpValues.keys.sorted() { out.append("    public static let \(k): Double = \(num(bpValues[k]))") }
out.append("    public static let compactMax: Double = \(fmt(compactMax))")
out.append("    public static let regularMin: Double = \(fmt(compactMax + 1))")
out.append("}")

let focusRing = dict(root["focusRing"])
out.append("")
out.append("public enum RuxtFocusRing {")
let ringOffset = num(focusRing["offsetPx"])
let ringWidth = num(focusRing["widthPx"])
out.append("    public static let offset: Double = \(ringOffset)")
out.append("    public static let width: Double = \(ringWidth)")
out.append("}")

let density = dict(root["density"])
let legacySteps: [String: (String, String)] = ["comfortable": ("lg", "3xl"), "compact": ("sm", "lg")]
out.append("")
out.append("public struct RuxtDensityTokens: Equatable, Sendable {")
out.append("    public let scale: Double")
out.append("    public let controlHeight: Double")
out.append("    public let rowHeight: Double")
out.append("    public let rowPadding: Double")
out.append("    public let sectionSpacing: Double")
out.append("    public init(scale: Double, controlHeight: Double, rowHeight: Double, rowPadding: Double, sectionSpacing: Double) { self.scale = scale; self.controlHeight = controlHeight; self.rowHeight = rowHeight; self.rowPadding = rowPadding; self.sectionSpacing = sectionSpacing }")
out.append("}")
out.append("public enum RuxtDensity {")
for name in density.keys.sorted() {
    let d = dict(density[name])
    guard let steps = legacySteps[name] else { fail("no spacing-step mapping for density \(name)") }
    let scale = num(d["scale"])
    let controlHeight = num(d["controlHeightPx"])
    let rowHeight = num(d["rowHeightPx"])
    let rowPadding = num(spacing[steps.0])
    let sectionSpacing = num(spacing[steps.1])
    out.append("    public static let \(name) = RuxtDensityTokens(scale: \(scale), controlHeight: \(controlHeight), rowHeight: \(rowHeight), rowPadding: \(rowPadding), sectionSpacing: \(sectionSpacing))")
}
out.append("}")

let text = out.joined(separator: "\n") + "\n"
try! fm.createDirectory(atPath: (outputPath as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
try! text.write(toFile: outputPath, atomically: true, encoding: .utf8)
print("wrote \(outputPath)")
