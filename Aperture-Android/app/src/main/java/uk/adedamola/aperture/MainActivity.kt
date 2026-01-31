package uk.adedamola.aperture

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import dagger.hilt.android.AndroidEntryPoint
import uk.adedamola.aperture.presentation.navigation.ApertureNavHost
import uk.adedamola.aperture.ui.theme.ApertureTheme
import uk.adedamola.aperture.ui.theme.HudBlack

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ApertureTheme {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(HudBlack)
                ) {
                    ApertureNavHost()
                }
            }
        }
    }
}
