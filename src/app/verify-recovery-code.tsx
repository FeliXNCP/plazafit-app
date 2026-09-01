import Ionicons from '@expo/vector-icons/Ionicons'
import {
    router,
    useLocalSearchParams,
} from 'expo-router'
import {
    useEffect,
    useMemo,
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
    TextInput,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

const RESEND_COOLDOWN_SECONDS = 60
const OTP_LENGTH = 8

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function getOtpErrorMessage(
  message: string | undefined
) {
  const normalized = message?.toLowerCase() ?? ''

  if (
    normalized.includes('expired') ||
    normalized.includes('invalid') ||
    normalized.includes('token')
  ) {
    return 'El código no es válido, expiró o ya fue utilizado. Solicita uno nuevo.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Realizaste demasiados intentos. Espera un momento e inténtalo nuevamente.'
  }

  return (
    message ??
    'No se pudo validar el código de recuperación.'
  )
}

function getResendErrorMessage(
  message: string | undefined
) {
  const normalized = message?.toLowerCase() ?? ''

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Debes esperar antes de solicitar otro código.'
  }

  return (
    message ??
    'No se pudo reenviar el código.'
  )
}

export default function VerifyRecoveryCodeScreen() {
  const params = useLocalSearchParams<{
    email?: string
  }>()

  const email = useMemo(
    () => normalizeEmail(params.email ?? ''),
    [params.email]
  )

  const [code, setCode] = useState('')
  const [verifying, setVerifying] =
    useState(false)
  const [resending, setResending] =
    useState(false)

  const [
    secondsUntilResend,
    setSecondsUntilResend,
  ] = useState(
    RESEND_COOLDOWN_SECONDS
  )

  const codeInputRef =
    useRef<TextInput | null>(null)

  useEffect(() => {
    if (secondsUntilResend <= 0) {
      return
    }

    const timer = setInterval(() => {
      setSecondsUntilResend(
        (current) =>
          Math.max(current - 1, 0)
      )
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsUntilResend])

  useEffect(() => {
    const timer = setTimeout(() => {
      codeInputRef.current?.focus()
    }, 350)

    return () => clearTimeout(timer)
  }, [])

  function handleCodeChange(value: string) {
    setCode(
      value
        .replace(/\D/g, '')
        .slice(0, OTP_LENGTH)
    )
  }

  async function handleVerifyCode() {
    if (!email) {
      Alert.alert(
        'Correo no disponible',
        'Vuelve a solicitar la recuperación e intenta nuevamente.'
      )
      return
    }

    if (code.length !== OTP_LENGTH) {
      Alert.alert(
        'Código incompleto',
        `Ingresa los ${OTP_LENGTH} dígitos enviados a tu correo.`
      )
      return
    }

    try {
      setVerifying(true)

      const {
        data,
        error,
      } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'recovery',
      })

      if (error) throw error

      if (!data.session) {
        throw new Error(
          'No se pudo crear la sesión temporal de recuperación.'
        )
      }

      router.replace('/reset-password')
    } catch (error: any) {
      Alert.alert(
        'Código no válido',
        getOtpErrorMessage(error?.message)
      )
    } finally {
      setVerifying(false)
    }
  }

  async function handleResendCode() {
    if (
      !email ||
      resending ||
      secondsUntilResend > 0
    ) {
      return
    }

    try {
      setResending(true)

      const { error } =
        await supabase.auth
          .resetPasswordForEmail(email)

      if (error) throw error

      setCode('')
      setSecondsUntilResend(
        RESEND_COOLDOWN_SECONDS
      )

      Alert.alert(
        'Código reenviado',
        'Si existe una cuenta asociada, recibirás un código nuevo.'
      )

      setTimeout(() => {
        codeInputRef.current?.focus()
      }, 250)
    } catch (error: any) {
      Alert.alert(
        'No se pudo reenviar',
        getResendErrorMessage(
          error?.message
        )
      )
    } finally {
      setResending(false)
    }
  }

  if (!email) {
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
          Falta el correo
        </Text>

        <Text style={styles.errorText}>
          Vuelve a solicitar la recuperación para
          recibir un código nuevo.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace('/forgot-password')
          }
        >
          <Text style={styles.primaryButtonText}>
            Solicitar código
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
          <Pressable
            style={styles.backButton}
            onPress={() =>
              router.replace('/forgot-password')
            }
            disabled={verifying || resending}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color="#166534"
            />
          </Pressable>

          <View style={styles.icon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={38}
              color="#166534"
            />
          </View>

          <Text style={styles.title}>
            Ingresa el código
          </Text>

          <Text style={styles.description}>
            Enviamos un código de recuperación a:
          </Text>

          <Text style={styles.email}>
            {email}
          </Text>

          <TextInput
            ref={codeInputRef}
            value={code}
            onChangeText={handleCodeChange}
            editable={!verifying}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={OTP_LENGTH}
            placeholder={'0'.repeat(OTP_LENGTH)}
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            onSubmitEditing={() => {
              void handleVerifyCode()
            }}
            style={styles.codeInput}
          />

          <Text style={styles.codeHelp}>
            El código es de un solo uso.
          </Text>

          <Pressable
            style={[
              styles.primaryButton,
              (
                verifying ||
                code.length !== OTP_LENGTH
              ) &&
                styles.disabled,
            ]}
            onPress={() => {
              void handleVerifyCode()
            }}
            disabled={
              verifying ||
              code.length !== OTP_LENGTH
            }
          >
            {verifying ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#ffffff"
                />

                <Text style={styles.primaryButtonText}>
                  Validar código
                </Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.resendButton}
            onPress={() => {
              void handleResendCode()
            }}
            disabled={
              resending ||
              secondsUntilResend > 0
            }
          >
            {resending ? (
              <ActivityIndicator
                size="small"
                color="#166534"
              />
            ) : (
              <Text
                style={[
                  styles.resendText,
                  secondsUntilResend > 0 &&
                    styles.resendTextDisabled,
                ]}
              >
                {secondsUntilResend > 0
                  ? `Reenviar código en ${secondsUntilResend} s`
                  : 'Reenviar código'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.changeEmailButton}
            onPress={() =>
              router.replace('/forgot-password')
            }
            disabled={verifying || resending}
          >
            <Text style={styles.changeEmailText}>
              Usar otro correo
            </Text>
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
  },

  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,

    width: 44,
    height: 44,
    borderRadius: 22,

    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 20,
  },

  description: {
    color: '#6b7280',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 9,
  },

  email: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 5,
  },

  codeInput: {
    minHeight: 66,

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 16,

    paddingHorizontal: 18,
    marginTop: 26,

    color: '#111827',
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 6,
  },

  codeHelp: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
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
    marginTop: 20,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  resendButton: {
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  resendText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },

  resendTextDisabled: {
    color: '#9ca3af',
  },

  changeEmailButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  changeEmailText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '700',
  },

  disabled: {
    opacity: 0.55,
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
