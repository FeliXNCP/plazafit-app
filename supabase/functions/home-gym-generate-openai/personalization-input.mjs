/** Frontera de entrada. Nunca trata el texto del usuario como instrucciones de sistema. */
export const PERSONALIZATION_VERSION = 'home-gym-personalization/1';
export const PROMPT_VERSION = 'plazafit-personal-request/1';
export const OUTPUT_SCHEMA_VERSION = 'home-gym-plan/1+dosage/1';
export const MAX_PREFERENCE_CHARS = 500;

export function normalizePreference(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new Error('HGAI_INVALID_PREFERENCE');
  const text = value.replace(/\r\n?/g, '\n').replace(/^[ \t\n]+|[ \t\n]+$/g, '');
  if (Array.from(text).length > MAX_PREFERENCE_CHARS || new TextEncoder().encode(text).byteLength > 2000)
    throw new Error('HGAI_PREFERENCE_TOO_LONG');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text))
    throw new Error('HGAI_INVALID_PREFERENCE');
  return text;
}
export function readPersonalPreference(context) {
  const version = context?.personalization_version;
  if (version === undefined || version === null) {
    // Un contexto antiguo sigue funcionando, pero no ignora silenciosamente un texto nuevo.
    if (context?.user_preference != null && context.user_preference !== '')
      throw new Error('HGAI_PERSONALIZATION_VERSION_MISMATCH');
    return { enabled: false, text: '' };
  }
  if (version !== PERSONALIZATION_VERSION) throw new Error('HGAI_PERSONALIZATION_VERSION_MISMATCH');
  return { enabled: true, text: normalizePreference(context.user_preference) };
}
