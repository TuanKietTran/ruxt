import Foundation

// Generates RuxtKit/Sources/RuxtKit/Theme.swift from a token JSON file.
// Usage: swift Tools/generate-theme.swift [input.json] [output.swift]
// Defaults: input Tools/provisional-tokens.json, output RuxtKit/Sources/RuxtKit/Theme.swift,
// resolved relative to the current directory or to this script's parent directory.

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

func resolve(_ explicit: String?, _ relativeCandidates: [String]) -> String {
    if let explicit { return explicit.hasPrefix("/") ? explicit : (cwd as NSString).appendingPathComponent(explicit) }
    for candidate in relativeCandidates where fm.fileExists(atPath: candidate) { return candidate }
    return relativeCandidates[0]
}

let args = Array(CommandLine.arguments.dropFirst())
let inputPath = resolve(args.count > 0 ? args[0] : nil, [
    (cwd as NSString).appendingPathComponent("Tools/provisional-tokens.json"),
    (toolsDir as NSString).appendingPathComponent("provisional-tokens.json"),
])
let outputPath = resolve(args.count > 1 ? args[1] : nil, [
    (cwd as NSString).appendingPathComponent("RuxtKit/Sources/RuxtKit/Theme.swift"),
    (iosRoot as NSString).appendingPathComponent("RuxtKit/Sources/RuxtKit/Theme.swift"),
])

guard let data = fm.contents(atPath: inputPath) else { fail("cannot read tokens at \(inputPath)") }
guard let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { fail("tokens file is not a JSON object") }

func num(_ value: Any?) -> String {
    guard let n = value as? NSNumber else { fail("expected number, got \(String(describing: value))") }
    let d = n.doubleValue
    return d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d)
}
func dict(_ value: Any?) -> [String: Any] {
    guard let d = value as? [String: Any] else { fail("expected object") }
    return d
}

let comment = (root["_comment"] as? String) ?? ""
let provisional = comment.uppercased().contains("PROVISIONAL")
let themes = dict(root["themes"])
let themeNames = themes.keys.sorted()
guard !themeNames.isEmpty else { fail("no themes in tokens") }
let firstColors = dict(dict(themes[themeNames[0]])["colors"])
let colorKeys = firstColors.keys.sorted()

var out: [String] = []
out.append("// Generated from \((inputPath as NSString).lastPathComponent)" + (provisional ? " (PROVISIONAL tokens, seeded from app/assets/theme/themes.css)" : "") + ". Do not edit by hand.")
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
    let colors = dict(theme["colors"])
    let argsList = colorKeys.map { "\($0): \"\(colors[$0] as? String ?? "")\"" }.joined(separator: ", ")
    out.append("    public static let \(name) = RuxtThemeTokens(name: .\(name), colorScheme: \"\(theme["colorScheme"] as? String ?? "")\", colors: RuxtColorPalette(\(argsList)))")
}
out.append("    public static func tokens(for name: RuxtThemeName) -> RuxtThemeTokens {")
out.append("        switch name {")
for name in themeNames { out.append("        case .\(name): return \(name)") }
out.append("        }")
out.append("    }")
out.append("}")

func scalarEnum(_ typeName: String, _ key: String) {
    let values = dict(root[key])
    out.append("")
    out.append("public enum Ruxt\(typeName) {")
    for k in values.keys.sorted() { out.append("    public static let \(k): Double = \(num(values[k]))") }
    out.append("}")
}
scalarEnum("Typography", "typography")
scalarEnum("Spacing", "spacing")
scalarEnum("Radius", "radius")
scalarEnum("Elevation", "elevation")
scalarEnum("Motion", "motion")
scalarEnum("Breakpoints", "breakpoints")
scalarEnum("FocusRing", "focusRing")

let density = dict(root["density"])
out.append("")
out.append("public struct RuxtDensityTokens: Equatable, Sendable {")
out.append("    public let rowPadding: Double")
out.append("    public let sectionSpacing: Double")
out.append("    public init(rowPadding: Double, sectionSpacing: Double) { self.rowPadding = rowPadding; self.sectionSpacing = sectionSpacing }")
out.append("}")
out.append("public enum RuxtDensity {")
for name in density.keys.sorted() {
    let d = dict(density[name])
    out.append("    public static let \(name) = RuxtDensityTokens(rowPadding: \(num(d["rowPadding"])), sectionSpacing: \(num(d["sectionSpacing"])))")
}
out.append("}")

let text = out.joined(separator: "\n") + "\n"
try! fm.createDirectory(atPath: (outputPath as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
try! text.write(toFile: outputPath, atomically: true, encoding: .utf8)
print("wrote \(outputPath)")
