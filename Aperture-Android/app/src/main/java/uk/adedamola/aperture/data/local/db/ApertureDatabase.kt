package uk.adedamola.aperture.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import uk.adedamola.aperture.data.local.db.dao.MessageDao
import uk.adedamola.aperture.data.local.db.dao.SessionDao
import uk.adedamola.aperture.data.local.db.entity.MessageEntity
import uk.adedamola.aperture.data.local.db.entity.SessionEntity

@Database(
    entities = [
        SessionEntity::class,
        MessageEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class ApertureDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao
    abstract fun messageDao(): MessageDao
}
