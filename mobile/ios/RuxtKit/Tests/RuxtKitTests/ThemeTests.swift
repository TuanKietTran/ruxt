import XCTest
@testable import RuxtKit

final class ThemeTests: XCTestCase {
    func testLatteIsLightAndMochaIsDark() {
        XCTAssertEqual(RuxtTheme.latte.colorScheme, "light")
        XCTAssertEqual(RuxtTheme.mocha.colorScheme, "dark")
        XCTAssertEqual(RuxtTheme.opencode.colorScheme, "dark")
    }

    func testPaletteLookupMatchesStaticTokens() {
        XCTAssertEqual(RuxtTheme.tokens(for: .latte), RuxtTheme.latte)
        XCTAssertEqual(RuxtTheme.tokens(for: .mocha), RuxtTheme.mocha)
        XCTAssertEqual(RuxtTheme.tokens(for: .opencode), RuxtTheme.opencode)
    }

    func testSeededColorsMatchWebTheme() {
        XCTAssertEqual(RuxtTheme.latte.colors.bgBase, "#eff1f5")
        XCTAssertEqual(RuxtTheme.latte.colors.accent, "#164cc0")
        XCTAssertEqual(RuxtTheme.mocha.colors.bgBase, "#1e1e2e")
        XCTAssertEqual(RuxtTheme.mocha.colors.fgText, "#cdd6f4")
        XCTAssertEqual(RuxtTheme.mocha.colors.onAccent, "#11111b")
        XCTAssertEqual(RuxtTheme.mocha.colors.success, "#a6e3a1")
        XCTAssertEqual(RuxtTheme.latte.colors.onAccent, "#ffffff")
        XCTAssertEqual(RuxtTheme.opencode.colors.bgBase, "#0a0a0a")
        XCTAssertEqual(RuxtTheme.opencode.colors.accent, "#22c55e")
    }

    func testScalesAndDensity() {
        XCTAssertEqual(RuxtRadius.sm, 6)
        XCTAssertEqual(RuxtRadius.md, 10)
        XCTAssertEqual(RuxtFocusRing.width, 2)
        XCTAssertGreaterThan(RuxtDensity.comfortable.rowPadding, RuxtDensity.compact.rowPadding)
        XCTAssertEqual(RuxtDensity.comfortable.rowHeight, 40)
        XCTAssertEqual(RuxtDensity.compact.controlHeight, 30)
        XCTAssertEqual(RuxtMotion.standard, 0.2)
        XCTAssertEqual(RuxtSpacing.xxl, 20)
        XCTAssertEqual(RuxtElevation.none, "none")
    }
}
