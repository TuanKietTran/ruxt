import XCTest
@testable import RuxtKit

final class ThemeTests: XCTestCase {
    func testLatteIsLightAndMochaIsDark() {
        XCTAssertEqual(RuxtTheme.latte.colorScheme, "light")
        XCTAssertEqual(RuxtTheme.mocha.colorScheme, "dark")
    }

    func testPaletteLookupMatchesStaticTokens() {
        XCTAssertEqual(RuxtTheme.tokens(for: .latte), RuxtTheme.latte)
        XCTAssertEqual(RuxtTheme.tokens(for: .mocha), RuxtTheme.mocha)
    }

    func testSeededColorsMatchWebTheme() {
        XCTAssertEqual(RuxtTheme.latte.colors.bgBase, "#eff1f5")
        XCTAssertEqual(RuxtTheme.latte.colors.accent, "#164cc0")
        XCTAssertEqual(RuxtTheme.mocha.colors.bgBase, "#1e1e2e")
        XCTAssertEqual(RuxtTheme.mocha.colors.fgText, "#cdd6f4")
    }

    func testScalesAndDensity() {
        XCTAssertEqual(RuxtRadius.sm, 6)
        XCTAssertEqual(RuxtRadius.md, 10)
        XCTAssertEqual(RuxtFocusRing.width, 2)
        XCTAssertGreaterThan(RuxtDensity.comfortable.rowPadding, RuxtDensity.compact.rowPadding)
    }
}
