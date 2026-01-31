package uk.adedamola.aperture.core.util

/**
 * A discriminated union that encapsulates a successful outcome with a value of type [T]
 * or a failure with an error of type [E].
 */
sealed class Result<out T, out E> {
    data class Success<T>(val value: T) : Result<T, Nothing>()
    data class Failure<E>(val error: E) : Result<Nothing, E>()

    val isSuccess: Boolean get() = this is Success
    val isFailure: Boolean get() = this is Failure

    fun getOrNull(): T? = when (this) {
        is Success -> value
        is Failure -> null
    }

    fun errorOrNull(): E? = when (this) {
        is Success -> null
        is Failure -> error
    }

    inline fun <R> map(transform: (T) -> R): Result<R, E> = when (this) {
        is Success -> Success(transform(value))
        is Failure -> Failure(error)
    }

    inline fun <R> mapError(transform: (E) -> R): Result<T, R> = when (this) {
        is Success -> Success(value)
        is Failure -> Failure(transform(error))
    }

    inline fun <R> flatMap(transform: (T) -> Result<R, @UnsafeVariance E>): Result<R, E> = when (this) {
        is Success -> transform(value)
        is Failure -> Failure(error)
    }

    inline fun onSuccess(action: (T) -> Unit): Result<T, E> {
        if (this is Success) action(value)
        return this
    }

    inline fun onFailure(action: (E) -> Unit): Result<T, E> {
        if (this is Failure) action(error)
        return this
    }

    inline fun fold(
        onSuccess: (T) -> Unit,
        onFailure: (E) -> Unit
    ) {
        when (this) {
            is Success -> onSuccess(value)
            is Failure -> onFailure(error)
        }
    }

    companion object {
        fun <T> success(value: T): Result<T, Nothing> = Success(value)
        fun <E> failure(error: E): Result<Nothing, E> = Failure(error)
    }
}

/**
 * Network-specific result type with common error cases
 */
sealed class NetworkError {
    data class HttpError(val code: Int, val message: String) : NetworkError()
    data class ConnectionError(val cause: Throwable) : NetworkError()
    data class TimeoutError(val cause: Throwable) : NetworkError()
    data class ParseError(val cause: Throwable) : NetworkError()
    data class UnknownError(val cause: Throwable) : NetworkError()
}

typealias NetworkResult<T> = Result<T, NetworkError>

/**
 * Extensions for working with nullable results
 */
fun <T, E> T?.toResult(error: E): Result<T, E> =
    if (this != null) Result.Success(this) else Result.Failure(error)

/**
 * Run a suspending block and wrap exceptions in Result
 */
suspend inline fun <T> runCatching(block: suspend () -> T): Result<T, Throwable> =
    try {
        Result.Success(block())
    } catch (e: Throwable) {
        Result.Failure(e)
    }
