package uk.adedamola.aperture

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class ApertureApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // Initialize any app-wide components here
    }
}
