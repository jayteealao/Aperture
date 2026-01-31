package uk.adedamola.aperture.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow
import uk.adedamola.aperture.data.local.db.entity.SessionEntity

@Dao
interface SessionDao {

    @Query("SELECT * FROM sessions ORDER BY lastActivityTime DESC")
    fun observeAll(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions ORDER BY lastActivityTime DESC")
    suspend fun getAll(): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE id = :id")
    suspend fun getById(id: String): SessionEntity?

    @Query("SELECT * FROM sessions WHERE id = :id")
    fun observeById(id: String): Flow<SessionEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(session: SessionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(sessions: List<SessionEntity>)

    @Update
    suspend fun update(session: SessionEntity)

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM sessions")
    suspend fun deleteAll()

    @Query("DELETE FROM sessions WHERE cachedAt < :threshold")
    suspend fun deleteOlderThan(threshold: Long)

    @Query("UPDATE sessions SET running = :running WHERE id = :id")
    suspend fun updateRunningStatus(id: String, running: Boolean)

    @Query("SELECT COUNT(*) FROM sessions")
    suspend fun count(): Int
}
