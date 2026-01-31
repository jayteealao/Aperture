package uk.adedamola.aperture.core.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uk.adedamola.aperture.data.repository.CredentialRepositoryImpl
import uk.adedamola.aperture.data.repository.SessionRepositoryImpl
import uk.adedamola.aperture.data.repository.SettingsRepositoryImpl
import uk.adedamola.aperture.data.repository.WorkspaceRepositoryImpl
import uk.adedamola.aperture.domain.repository.CredentialRepository
import uk.adedamola.aperture.domain.repository.SessionRepository
import uk.adedamola.aperture.domain.repository.SettingsRepository
import uk.adedamola.aperture.domain.repository.WorkspaceRepository
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindSessionRepository(
        impl: SessionRepositoryImpl
    ): SessionRepository

    @Binds
    @Singleton
    abstract fun bindCredentialRepository(
        impl: CredentialRepositoryImpl
    ): CredentialRepository

    @Binds
    @Singleton
    abstract fun bindWorkspaceRepository(
        impl: WorkspaceRepositoryImpl
    ): WorkspaceRepository

    @Binds
    @Singleton
    abstract fun bindSettingsRepository(
        impl: SettingsRepositoryImpl
    ): SettingsRepository
}
