// localStorage-backed settings. Values stay on-device.

const KEY = 'quill-companion-settings-v1';

const DEFAULTS = {
  // API keys
  assemblyaiKey: '',
  anthropicKey: '',

  // Email
  emailMethod: 'off', // off | resend | webhook | mailto
  emailTo: '',
  emailFrom: '',
  resendKey: '',
  emailWebhook: '',
  emailAuto: false,

  // Activators
  actTap: true,
  actShake: false,
  actVolume: false,
  actDeeplinkAutostart: true,
  actHaptic: true,

  // Analysis
  claudeModel: 'claude-sonnet-4-6',
  speakerHints: '',
  defaultTags: 'conversation, meeting'
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function patchSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  saveSettings(next);
  return next;
}

export function speakerHintList(settings) {
  return (settings.speakerHints || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tagList(settings) {
  return (settings.defaultTags || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
