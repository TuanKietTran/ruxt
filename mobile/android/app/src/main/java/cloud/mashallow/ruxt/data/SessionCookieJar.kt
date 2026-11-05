package cloud.mashallow.ruxt.data

import android.content.Context
import java.io.File
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl

// Cookie jar for the legacy auth flow: the server sets a sealed `auth_session`
// cookie (maxAge 7 days, payload { userId }); there is no bearer token and no
// refresh endpoint. Cookies are persisted to a private file so the session
// survives process death; expired cookies are pruned on every access.
class PersistentCookieJar(private val storeFile: File) : CookieJar {

    constructor(context: Context) : this(File(context.filesDir, "ruxt_cookies.txt"))

    private val cookies = mutableListOf<Cookie>()

    init { load() }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val now = System.currentTimeMillis()
        for (cookie in cookies) {
            this.cookies.removeAll {
                it.name == cookie.name && it.domain == cookie.domain && it.path == cookie.path
            }
            if (cookie.expiresAt > now) this.cookies.add(cookie)
        }
        persist()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        if (cookies.removeAll { it.expiresAt <= now }) persist()
        return cookies.filter { it.matches(url) }
    }

    @Synchronized
    fun clear() {
        cookies.clear()
        persist()
    }

    private fun load() {
        if (!storeFile.exists()) return
        val now = System.currentTimeMillis()
        for (line in storeFile.readLines()) {
            val tab = line.indexOf('\t')
            if (tab <= 0) continue
            val url = line.substring(0, tab).toHttpUrl()
            val cookie = Cookie.parse(url, line.substring(tab + 1)) ?: continue
            if (cookie.expiresAt > now) cookies.add(cookie)
        }
    }

    private fun persist() {
        val lines = cookies.map { "https://${it.domain}\t$it" }
        if (lines.isEmpty()) storeFile.delete()
        else storeFile.writeText(lines.joinToString("\n"))
    }
}
