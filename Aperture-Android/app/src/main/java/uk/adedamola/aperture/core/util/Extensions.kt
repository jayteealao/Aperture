package uk.adedamola.aperture.core.util

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.min
import kotlin.math.pow

/**
 * Flow extensions
 */
fun <T> Flow<T>.asResult(): Flow<Result<T, Throwable>> =
    this.map<T, Result<T, Throwable>> { Result.Success(it) }
        .catch { emit(Result.Failure(it)) }

/**
 * Sealed class for loading states
 */
sealed class LoadingState<out T> {
    data object Loading : LoadingState<Nothing>()
    data class Success<T>(val data: T) : LoadingState<T>()
    data class Error(val message: String, val cause: Throwable? = null) : LoadingState<Nothing>()

    val isLoading: Boolean get() = this is Loading
    val isSuccess: Boolean get() = this is Success
    val isError: Boolean get() = this is Error

    fun getOrNull(): T? = (this as? Success)?.data
}

fun <T> Flow<T>.asLoadingState(): Flow<LoadingState<T>> =
    this.map<T, LoadingState<T>> { LoadingState.Success(it) }
        .onStart { emit(LoadingState.Loading) }
        .catch { emit(LoadingState.Error(it.message ?: "Unknown error", it)) }

/**
 * Retry with exponential backoff
 */
suspend fun <T> retryWithBackoff(
    times: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 30000,
    factor: Double = 2.0,
    shouldRetry: (Throwable) -> Boolean = { true },
    block: suspend () -> T
): T {
    var currentDelay = initialDelayMs
    repeat(times - 1) { attempt ->
        try {
            return block()
        } catch (e: Throwable) {
            if (!shouldRetry(e)) throw e
            delay(currentDelay)
            currentDelay = min((currentDelay * factor).toLong(), maxDelayMs)
        }
    }
    return block() // Last attempt
}

/**
 * Calculate exponential backoff delay
 */
fun exponentialBackoff(
    attempt: Int,
    baseDelayMs: Long = 1000,
    maxDelayMs: Long = 30000,
    factor: Double = 2.0
): Long {
    val delay = (baseDelayMs * factor.pow(attempt.toDouble())).toLong()
    return min(delay, maxDelayMs)
}

/**
 * String extensions
 */
fun String.truncate(maxLength: Int, suffix: String = "..."): String =
    if (length <= maxLength) this
    else take(maxLength - suffix.length) + suffix

fun String.toSessionIdShort(): String = take(8)

/**
 * Date/time formatting
 */
object DateTimeFormatter {
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private val displayFormat = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())

    private val timeOnlyFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    fun parseIso(isoString: String): Date? = try {
        isoFormat.parse(isoString)
    } catch (e: Exception) {
        null
    }

    fun formatForDisplay(date: Date): String = displayFormat.format(date)

    fun formatTimeOnly(date: Date): String = timeOnlyFormat.format(date)

    fun formatRelative(timestamp: Long): String {
        val now = System.currentTimeMillis()
        val diff = now - timestamp

        return when {
            diff < 60_000 -> "Just now"
            diff < 3_600_000 -> "${diff / 60_000}m ago"
            diff < 86_400_000 -> "${diff / 3_600_000}h ago"
            diff < 604_800_000 -> "${diff / 86_400_000}d ago"
            else -> formatForDisplay(Date(timestamp))
        }
    }
}

/**
 * Number formatting for costs and tokens
 */
fun Double.formatCurrency(symbol: String = "$"): String =
    "$symbol${String.format(Locale.US, "%.4f", this)}"

fun Int.formatTokens(): String = when {
    this >= 1_000_000 -> "${this / 1_000_000}M"
    this >= 1_000 -> "${this / 1_000}K"
    else -> toString()
}

fun Long.formatDuration(): String {
    val seconds = this / 1000
    val minutes = seconds / 60
    val hours = minutes / 60

    return when {
        hours > 0 -> "${hours}h ${minutes % 60}m"
        minutes > 0 -> "${minutes}m ${seconds % 60}s"
        else -> "${seconds}s"
    }
}

/**
 * Byte size formatting
 */
fun Long.formatBytes(): String = when {
    this >= 1_073_741_824 -> String.format(Locale.US, "%.2f GB", this / 1_073_741_824.0)
    this >= 1_048_576 -> String.format(Locale.US, "%.2f MB", this / 1_048_576.0)
    this >= 1_024 -> String.format(Locale.US, "%.2f KB", this / 1_024.0)
    else -> "$this B"
}
