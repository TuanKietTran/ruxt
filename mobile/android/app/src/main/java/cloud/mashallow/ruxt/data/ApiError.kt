package cloud.mashallow.ruxt.data

import kotlinx.serialization.Serializable

// Contract section (e): errors are h3 createError JSON
// { statusCode, statusMessage, message, data?: { code } }. Direct route errors
// carry no data.code; mediator errors map the domain message to a status and
// set data.code. Clients branch on HTTP status first, then data.code.
@Serializable
data class ApiErrorBody(
    val statusCode: Int? = null,
    val statusMessage: String? = null,
    val message: String? = null,
    val data: ApiErrorData? = null
)

@Serializable
data class ApiErrorData(val code: String? = null)

open class ApiException(
    val status: Int,
    val apiCode: String?,
    message: String
) : Exception(message)

// Any 401 from an authenticated route means the 7-day auth_session cookie is
// gone or expired; there is no refresh endpoint, so the user must log in again.
class SessionExpiredException(message: String = "Session expired") :
    ApiException(401, null, message)
