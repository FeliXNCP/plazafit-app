import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { useState } from 'react'
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
import { supabase } from '../../lib/supabase'

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getRecoveryRequestErrorMessage(
  message: string | undefined
) {
  const normalized = message?.toLowerCase() ?? ''

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Espera un momento antes de solicitar otro código.'
  }

  return (
    message ??
    'No se pudo enviar el código de recuperación.'
  )
}

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    const normalizedEmail = normalizeEmail(email)

    if (!isValidEmail(normalizedEmail)) {
      Alert.alert(
        'Correo no válido',
        'Ingresa el correo asociado a tu cuenta.'
      )
      return
    }

    try {
      setSending(true)

      /*
       * La plantilla "Reset Password" de Supabase debe usar {{ .Token }}
       * y no {{ .ConfirmationURL }}.
       */
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail
        )

      if (error) throw error

      /*
       * El mensaje permanece genérico: no confirmamos si la cuenta existe.
       */
      router.push({
        pathname: '/verify-recovery-code',
        params: {
          email: normalizedEmail,
        },
      })
    } catch (error: any) {
      Alert.alert(
        'No se pudo enviar',
        getRecoveryRequestErrorMessage(
          error?.message
        )
      )
    } finally {
      setSending(false)
    }
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
            onPress={() => router.back()}
            disabled={sending}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color="#166534"
            />
          </Pressable>

          <View style={styles.icon}>
            <Ionicons
              name="key-outline"
              size={36}
              color="#166534"
            />
          </View>

          <Text style={styles.title}>
            Recuperar contraseña
          </Text>

          <Text style={styles.description}>
            Ingresa el correo de tu cuenta. Te enviaremos un
            código para crear una contraseña nueva dentro de
            PlazaFit.
          </Text>

          <TextInput
            placeholder="Correo"
            value={email}
            onChangeText={setEmail}
            editable={!sending}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => {
              void handleSend()
            }}
            placeholderTextColor="#6b7280"
            style={styles.input}
          />

          <Pressable
            style={[
              styles.primaryButton,
              sending && styles.disabled,
            ]}
            onPress={() => {
              void handleSend()
            }}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />
            ) : (
              <>
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color="#ffffff"
                />

                <Text style={styles.primaryButtonText}>
                  Enviar código
                </Text>
              </>
            )}
          </Pressable>

          <Text style={styles.securityNote}>
            Si existe una cuenta asociada, recibirás el código
            en ese correo.
          </Text>
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
    width: 74,
    height: 74,
    borderRadius: 37,

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
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 9,
    marginBottom: 24,
  },

  input: {
    minHeight: 50,

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,

    paddingHorizontal: 14,

    color: '#111827',
    fontSize: 15,
  },

  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    gap: 8,

    backgroundColor: '#16a34a',
    borderRadius: 13,

    alignItems: 'center',
    justifyContent: 'center',

    marginTop: 14,
    paddingHorizontal: 18,
  },

  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  securityNote: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
  },

  disabled: {
    opacity: 0.65,
  },
})
