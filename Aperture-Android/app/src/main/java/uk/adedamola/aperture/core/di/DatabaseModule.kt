package uk.adedamola.aperture.core.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uk.adedamola.aperture.data.local.db.ApertureDatabase
import uk.adedamola.aperture.data.local.db.dao.MessageDao
import uk.adedamola.aperture.data.local.db.dao.SessionDao
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context
    ): ApertureDatabase = Room.databaseBuilder(
        context,
        ApertureDatabase::class.java,
        "aperture_database"
    )
        .fallbackToDestructiveMigration()
        .build()

    @Provides
    fun provideSessionDao(database: ApertureDatabase): SessionDao = database.sessionDao()

    @Provides
    fun provideMessageDao(database: ApertureDatabase): MessageDao = database.messageDao()
}
