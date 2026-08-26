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

const RESET_PASSWORD_REDIRECT_URL =
  'plazafit://reset-password'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    const normalizedEmail =
      email.trim().toLowerCase()

    if (
      !normalizedEmail ||
      !normalizedEmail.includes('@')
    ) {
      Alert.alert(
        'Correo no válido',
        'Ingresa el correo asociado a tu cuenta.'
      )
      return
    }

    try {
      setSending(true)

      const { error } =
        await supabase.auth
          .resetPasswordForEmail(
            normalizedEmail,
            {
              redirectTo:
                RESET_PASSWORD_REDIRECT_URL,
            }
          )

      if (error) throw error

      setSent(true)
    } catch (error: any) {
      Alert.alert(
        'No se pudo enviar',
        error.message ??
          'No se pudo enviar el correo de recuperación.'
      )
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.resultContainer}>
          <View style={styles.resultIcon}>
            <Ionicons
              name="mail-outline"
              size={36}
              color="#166534"
            />
          </View>

          <Text style={styles.resultTitle}>
            Revisa tu correo
          </Text>

          <Text style={styles.resultText}>
            Si existe una cuenta asociada a ese
            correo, recibirás un enlace para crear
            una nueva contraseña.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              router.replace('/login')
            }
          >
            <Text style={styles.primaryButtonText}>
              Volver a iniciar sesión
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setSent(false)
              setEmail('')
            }}
          >
            <Text style={styles.secondaryButtonText}>
              Usar otro correo
            </Text>
          </Pressable>
        </View>
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
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
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
            Ingresa el correo de tu cuenta y te
            enviaremos un enlace para establecer
            una contraseña nueva.
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
              <Text
                style={styles.primaryButtonText}
              >
                Enviar enlace
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

  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  secondaryButtonText: {
    color: '#166534',
    fontWeight: '800',
  },

  disabled: {
    opacity: 0.65,
  },

  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',

    padding: 28,
  },

  resultIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,

    backgroundColor: '#dcfce7',

    alignItems: 'center',
    justifyContent: 'center',
  },

  resultTitle: {
    color: '#111827',
    fontSize: 27,
    fontWeight: '900',
    marginTop: 20,
  },

  resultText: {
    color: '#6b7280',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 9,
  },
})