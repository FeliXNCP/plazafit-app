import Ionicons from '@expo/vector-icons/Ionicons'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import {
    useEffect,
    useRef,
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
import { PasswordInput } from '../components/auth/PasswordInput'
import { supabase } from '../lib/supabase'

function getRecoveryParameters(
  url: string
) {
  const parameters =
    new URLSearchParams()

  const queryIndex = url.indexOf('?')
  const hashIndex = url.indexOf('#')

  if (queryIndex >= 0) {
    const queryEnd =
      hashIndex >= 0
        ? hashIndex
        : url.length

    const query = url.slice(
      queryIndex + 1,
      queryEnd
    )

    new URLSearchParams(query).forEach(
      (value, key) => {
        parameters.set(key, value)
      }
    )
  }

  if (hashIndex >= 0) {
    const fragment =
      url.slice(hashIndex + 1)

    new URLSearchParams(fragment).forEach(
      (value, key) => {
        parameters.set(key, value)
      }
    )
  }

  return parameters
}

async function createRecoverySession(
  url: string
) {
  const parameters =
    getRecoveryParameters(url)

  const errorDescription =
    parameters.get('error_description')

  if (errorDescription) {
    throw new Error(errorDescription)
  }

  /*
   * Flujo PKCE.
   */
  const code = parameters.get('code')

  if (code) {
    const { error } =
      await supabase.auth
        .exchangeCodeForSession(code)

    if (error) throw error

    return
  }

  /*
   * Flujo implicit.
   */
  const accessToken =
    parameters.get('access_token')

  const refreshToken =
    parameters.get('refresh_token')

  if (accessToken && refreshToken) {
    const { error } =
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

    if (error) throw error

    return
  }

  /*
   * La sesión puede haber sido procesada
   * previamente por Supabase.
   */
  const {
    data,
    error,
  } = await supabase.auth.getSession()

  if (error) throw error

  if (!data.session) {
    throw new Error(
      'El enlace no contiene una sesión de recuperación válida.'
    )
  }
}

export default function ResetPasswordScreen() {
  const [loadingLink, setLoadingLink] =
    useState(true)

  const [linkError, setLinkError] =
    useState<string | null>(null)

  const [password, setPassword] =
    useState('')

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('')

  const [saving, setSaving] =
    useState(false)

  const processedUrl =
    useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function processUrl(
      url: string | null
    ) {
      if (
        !url ||
        processedUrl.current === url
      ) {
        return
      }

      processedUrl.current = url

      try {
        setLoadingLink(true)
        setLinkError(null)

        await createRecoverySession(url)

        if (!cancelled) {
          setLoadingLink(false)
        }
      } catch (error: any) {
        if (!cancelled) {
          setLinkError(
            error.message ??
              'El enlace no es válido o expiró.'
          )

          setLoadingLink(false)
        }
      }
    }

    void Linking.getInitialURL().then(
      (url) => {
        if (url) {
          void processUrl(url)
          return
        }

        void supabase.auth
          .getSession()
          .then(({ data }) => {
            if (cancelled) return

            if (data.session) {
              setLoadingLink(false)
            } else {
              setLinkError(
                'Abre esta pantalla desde el enlace enviado a tu correo.'
              )

              setLoadingLink(false)
            }
          })
      }
    )

    const subscription =
      Linking.addEventListener(
        'url',
        ({ url }) => {
          void processUrl(url)
        }
      )

    return () => {
      cancelled = true
      subscription.remove()
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

      const { error } =
        await supabase.auth.updateUser({
          password,
        })

      if (error) throw error

      /*
       * Cerramos la sesión temporal de recuperación
       * para pedir un inicio de sesión normal.
       */
      await supabase.auth.signOut()

      Alert.alert(
        'Contraseña actualizada',
        'Ya puedes iniciar sesión con tu nueva contraseña.',
        [
          {
            text: 'Continuar',
            onPress: () =>
              router.replace('/login'),
          },
        ]
      )
    } catch (error: any) {
      Alert.alert(
        'No se pudo actualizar',
        error.message ??
          'Solicita un enlace de recuperación nuevo.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loadingLink) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#16a34a"
        />

        <Text style={styles.loadingText}>
          Validando enlace...
        </Text>
      </SafeAreaView>
    )
  }

  if (linkError) {
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
          Enlace no disponible
        </Text>

        <Text style={styles.errorText}>
          {linkError}
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace('/forgot-password')
          }
        >
          <Text style={styles.primaryButtonText}>
            Solicitar otro enlace
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
          contentContainerStyle={
            styles.container
          }
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
              <Text
                style={styles.primaryButtonText}
              >
                Guardar nueva contraseña
              </Text>
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
    marginTop: 18,
  },

  errorText: {
    color: '#6b7280',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
})