/**
 * Settings - User preferences and danger zone
 */

import { store } from '../store.js';
import { router, showToast } from '../app.js';

export function renderSettings() {
  const settings = store.get('settings');

  const container = document.createElement('div');
  container.className = 'loading-screen';

  container.innerHTML = `
    <div class="surface surface--heavy" style="max-width: 600px; width: calc(100vw - 32px);">
      <div class="cluster mb-6">
        <button class="btn btn--ghost btn--sm" id="back-btn">← Back</button>
        <h1 class="title">SETTINGS</h1>
        <div></div>
      </div>

      <div class="stack">
        <div class="stack--s3">
          <h3 class="kicker">Accessibility</h3>

          <label class="checkbox-label">
            <input type="checkbox" id="reduce-motion" ${settings.reduceMotion ? 'checked' : ''} />
            <div>
              <div class="kicker">Reduce Motion</div>
              <div class="meta">Disable view transitions and animations</div>
            </div>
          </label>
        </div>

        <div class="stack--s3">
          <h3 class="kicker">Typography</h3>

          <label class="kicker" for="font-scale">Font Scale: <span id="font-scale-value">${settings.fontScale}</span></label>
          <input
            type="range"
            id="font-scale"
            class="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value="${settings.fontScale}"
          />
          <p class="meta">Adjust base font size (0.75x to 1.5x)</p>
        </div>

        <div class="stack--s3">
          <h3 class="kicker">Privacy</h3>

          <label class="checkbox-label">
            <input type="checkbox" id="save-transcripts" ${settings.saveTranscripts ? 'checked' : ''} />
            <div>
              <div class="kicker">Save Transcripts</div>
              <div class="meta">Store chat history locally (currently disabled)</div>
            </div>
          </label>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h3 class="kicker danger">Danger Zone</h3>

          <p class="meta">
            These actions cannot be undone. Proceed with caution.
          </p>

          <button class="btn btn--secondary btn--block" id="clear-data-btn">
            Clear All Local Data
          </button>

          <p class="meta">
            This will clear all stored sessions, messages, server configuration, and settings from this browser.
          </p>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h3 class="kicker">About</h3>
          <p class="body">Aperture Gateway Web Interface</p>
          <p class="meta">Built with vanilla HTML, CSS, and JavaScript</p>
          <p class="meta">Neo-brutalist design system</p>
        </div>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('#back-btn');
  const reduceMotionCheckbox = container.querySelector('#reduce-motion');
  const fontScaleInput = container.querySelector('#font-scale');
  const fontScaleValue = container.querySelector('#font-scale-value');
  const saveTranscriptsCheckbox = container.querySelector('#save-transcripts');
  const clearDataBtn = container.querySelector('#clear-data-btn');

  // Back button
  backBtn.addEventListener('click', () => {
    router.push('/sessions');
  });

  // Reduce motion
  reduceMotionCheckbox.addEventListener('change', (e) => {
    const newSettings = { ...settings, reduceMotion: e.target.checked };
    store.set('settings', newSettings);
    showToast('Saved', 'Motion preferences updated', 'success');
  });

  // Font scale
  fontScaleInput.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    fontScaleValue.textContent = scale.toFixed(2);
    document.documentElement.style.setProperty('--font-scale', scale);
  });

  fontScaleInput.addEventListener('change', (e) => {
    const scale = parseFloat(e.target.value);
    const newSettings = { ...settings, fontScale: scale };
    store.set('settings', newSettings);
    showToast('Saved', 'Font scale updated', 'success');
  });

  // Apply current font scale
  document.documentElement.style.setProperty('--font-scale', settings.fontScale);

  // Save transcripts
  saveTranscriptsCheckbox.addEventListener('change', (e) => {
    const newSettings = { ...settings, saveTranscripts: e.target.checked };
    store.set('settings', newSettings);
    showToast('Saved', 'Transcript preferences updated', 'success');
  });

  // Clear all data
  clearDataBtn.addEventListener('click', () => {
    if (confirm('Clear all local data? This will remove all sessions, messages, and settings. You will need to reconnect to the server.')) {
      if (confirm('Are you absolutely sure? This cannot be undone.')) {
        store.clearAll();
        showToast('Cleared', 'All local data has been cleared', 'success');
        setTimeout(() => {
          router.push('/');
        }, 1000);
      }
    }
  });

  return container;
}
