import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import {
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  PasswordInput,
} from '../components/auth/PasswordInput'
import { supabase } from '../lib/supabase'

function getUpdatePasswordErrorMessage(
  message: string | undefined
) {
  const normalized = message?.toLowerCase() ?? ''

  if (
    normalized.includes('same password') ||
    normalized.includes('different from the old')
  ) {
    return 'La contraseña nueva debe ser diferente de la anterior.'
  }

  if (
    normalized.includes('weak') ||
    normalized.includes('characters')
  ) {
    return 'La contraseña no cumple los requisitos de seguridad.'
  }

  if (
    normalized.includes('session') ||
    normalized.includes('jwt')
  ) {
    return 'La sesión de recuperación expiró. Solicita un código nuevo.'
  }

  return (
    message ??
    'No se pudo actualizar la contraseña.'
  )
}

export default function ResetPasswordScreen() {
  const [
    validatingSession,
    setValidatingSession,
  ] = useState(true)

  const [
    sessionError,
    setSessionError,
  ] = useState<string | null>(null)

  const [password, setPassword] =
    useState('')

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('')

  const [saving, setSaving] =
    useState(false)

  const [updated, setUpdated] =
    useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        setValidatingSession(true)
        setSessionError(null)

        const {
          data: sessionData,
          error: sessionErrorResult,
        } = await supabase.auth.getSession()

        if (sessionErrorResult) {
          throw sessionErrorResult
        }

        if (!sessionData.session) {
          throw new Error(
            'Primero debes validar el código enviado a tu correo.'
          )
        }

        /*
         * getUser valida la sesión contra Supabase,
         * no solo contra el valor persistido localmente.
         */
        const {
          data: userData,
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError

        if (!userData.user) {
          throw new Error(
            'La sesión de recuperación no es válida.'
          )
        }
      } catch (error: any) {
        if (!cancelled) {
          setSessionError(
            error?.message ??
              'La sesión de recuperación no es válida o expiró.'
          )
        }
      } finally {
        if (!cancelled) {
          setValidatingSession(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleUpdatePassword() {
    if (password.length < 6) {
      Alert.alert(
        'Contraseña débil',
        'La contraseña debe tener al menos 6 caracteres.'
      )
      return
    }

    if (password !== confirmPassword) {
      Alert.alert(
        'Las contraseñas no coinciden',
        'Revisa ambos campos.'
      )
      return
    }

    try {
      setSaving(true)

      const {
        data,
        error,
      } = await supabase.auth.updateUser({
        password,
      })

      if (error) throw error

      if (!data.user) {
        throw new Error(
          'No se pudo confirmar la actualización de la contraseña.'
        )
      }

      /*
       * Cerramos la sesión temporal de recuperación.
       * Si el cierre falla, la contraseña ya fue actualizada igualmente.
       */
      const {
        error: signOutError,
      } = await supabase.auth.signOut()

      if (signOutError) {
        console.warn(
          'La contraseña se actualizó, pero no se pudo cerrar la sesión temporal:',
          signOutError.message
        )
      }

      setUpdated(true)
    } catch (error: any) {
      Alert.alert(
        'No se pudo actualizar',
        getUpdatePasswordErrorMessage(
          error?.message
        )
      )
    } finally {
      setSaving(false)
    }
  }

  if (validatingSession) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />

        <Text style={styles.loadingText}>
          Validando recuperación...
        </Text>
      </SafeAreaView>
    )
  }

  if (sessionError) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.errorIcon}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color="#b91c1c"
          />
        </View>

        <Text style={styles.errorTitle}>
          Recuperación no disponible
        </Text>

        <Text style={styles.errorText}>
          {sessionError}
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace('/forgot-password')
          }
        >
          <Text style={styles.primaryButtonText}>
            Solicitar otro código
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (updated) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.successIcon}>
          <Ionicons
            name="checkmark"
            size={45}
            color="#ffffff"
          />
        </View>

        <Text style={styles.successTitle}>
          Contraseña actualizada
        </Text>

        <Text style={styles.successText}>
          Ya puedes iniciar sesión con tu contraseña nueva.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace('/login')
          }
        >
          <Text style={styles.primaryButtonText}>
            Iniciar sesión
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.icon}>
            <Ionicons
              name="lock-closed-outline"
              size={36}
              color="#166534"
            />
          </View>

          <Text style={styles.title}>
            Nueva contraseña
          </Text>

          <Text style={styles.description}>
            Crea una contraseña nueva para recuperar
            el acceso a tu cuenta.
          </Text>

          <PasswordInput
            placeholder="Nueva contraseña"
            value={password}
            onChangeText={setPassword}
            editable={!saving}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
          />

          <PasswordInput
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!saving}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={() => {
              void handleUpdatePassword()
            }}
          />

          <Pressable
            style={[
              styles.primaryButton,
              saving && styles.disabled,
            ]}
            onPress={() => {
              void handleUpdatePassword()
            }}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name="save-outline"
                  size={19}
                  color="#ffffff"
                />

                <Text style={styles.primaryButtonText}>
                  Guardar nueva contraseña
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },

  flex: {
    flex: 1,
  },

  center: {
    flex: 1,
    backgroundColor: '#f0fdf4',

    justifyContent: 'center',
    alignItems: 'center',

    padding: 26,
  },

  container: {
    flexGrow: 1,
    justifyContent: 'center',

    padding: 24,
    gap: 13,
  },

  icon: {
    width: 76,
    height: 76,
    borderRadius: 38,

    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#dcfce7',
  },

  title: {
    color: '#111827',
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },

  description: {
    color: '#6b7280',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 10,
  },

  primaryButton: {
    minHeight: 51,
    flexDirection: 'row',
    gap: 8,

    backgroundColor: '#16a34a',
    borderRadius: 13,

    justifyContent: 'center',
    alignItems: 'center',

    paddingHorizontal: 18,
    marginTop: 3,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  disabled: {
    opacity: 0.65,
  },

  loadingText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },

  errorIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,

    backgroundColor: '#fee2e2',

    alignItems: 'center',
    justifyContent: 'center',
  },

  errorTitle: {
    color: '#111827',
    fontSize: 23,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 18,
  },

  errorText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },

  successIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,

    backgroundColor: '#16a34a',

    alignItems: 'center',
    justifyContent: 'center',
  },

  successTitle: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 19,
  },

  successText: {
    color: '#6b7280',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
})
