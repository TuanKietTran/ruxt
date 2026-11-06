package cloud.mashallow.ruxt.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Colour schemes are built from Tokens.kt, generated from design/tokens.json.
// Do not hardcode palette hex values here; read them from the token objects.
private fun hex(value: String): Color =
    Color(0xFF000000L or value.removePrefix("#").toLong(16))

private data class Palette(
    val bgBase: String, val bgSurface0: String, val fgText: String,
    val accent: String, val accentHover: String, val onAccent: String,
    val mauve: String, val danger: String, val border: String
)

private val MochaPalette = Palette(
    MochaTokens.bgBase, MochaTokens.bgSurface0, MochaTokens.fgText,
    MochaTokens.accent, MochaTokens.accentHover, MochaTokens.onAccent,
    MochaTokens.mauve, MochaTokens.danger, MochaTokens.border
)
private val LattePalette = Palette(
    LatteTokens.bgBase, LatteTokens.bgSurface0, LatteTokens.fgText,
    LatteTokens.accent, LatteTokens.accentHover, LatteTokens.onAccent,
    LatteTokens.mauve, LatteTokens.danger, LatteTokens.border
)
private val OpencodePalette = Palette(
    OpencodeTokens.bgBase, OpencodeTokens.bgSurface0, OpencodeTokens.fgText,
    OpencodeTokens.accent, OpencodeTokens.accentHover, OpencodeTokens.onAccent,
    OpencodeTokens.mauve, OpencodeTokens.danger, OpencodeTokens.border
)

/** Valid saved theme names; anything else falls back to mocha. */
val ThemeNames = listOf("system", "mocha", "latte", "opencode")

fun normalizeThemeName(value: String?): String =
    if (value in ThemeNames) value!! else "mocha"

@Composable
fun RuxtTheme(themeName: String = "mocha", content: @Composable () -> Unit) {
    val systemDark = isSystemInDarkTheme()
    val palette = when (normalizeThemeName(themeName)) {
        "latte" -> LattePalette
        "opencode" -> OpencodePalette
        "system" -> if (systemDark) MochaPalette else LattePalette
        else -> MochaPalette
    }
    val colors = if (palette === LattePalette) {
        lightColorScheme(
            primary = hex(palette.accent), onPrimary = hex(palette.onAccent),
            secondary = hex(palette.mauve), background = hex(palette.bgBase),
            onBackground = hex(palette.fgText), surface = hex(palette.bgSurface0),
            onSurface = hex(palette.fgText), error = hex(palette.danger),
            outline = hex(palette.border)
        )
    } else {
        darkColorScheme(
            primary = hex(palette.accent), onPrimary = hex(palette.onAccent),
            secondary = hex(palette.mauve), background = hex(palette.bgBase),
            onBackground = hex(palette.fgText), surface = hex(palette.bgSurface0),
            onSurface = hex(palette.fgText), error = hex(palette.danger),
            outline = hex(palette.border)
        )
    }
    val typography = Typography(
        bodyLarge = TextStyle(fontSize = Tokens.textBodyLargeSize.sp, fontWeight = FontWeight(Tokens.textBodyLargeWeight.toInt())),
        bodyMedium = TextStyle(fontSize = Tokens.textBodySize.sp, fontWeight = FontWeight(Tokens.textBodyWeight.toInt())),
        titleLarge = TextStyle(fontSize = Tokens.textTitleSize.sp, fontWeight = FontWeight(Tokens.textTitleWeight.toInt())),
        headlineMedium = TextStyle(fontSize = Tokens.textHeadingSize.sp, fontWeight = FontWeight(Tokens.textHeadingWeight.toInt())),
        labelMedium = TextStyle(fontSize = Tokens.textLabelSize.sp, fontWeight = FontWeight(Tokens.textLabelWeight.toInt()))
    )
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
