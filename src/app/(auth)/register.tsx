import { Link } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    const trimmedName = fullName.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert('Campos incompletos', 'Completa todos los campos.')
      return
    }

    if (password.length < 6) {
      Alert.alert('Contraseña débil', 'La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden.')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { full_name: trimmedName },
        },
      })

      if (error) throw error

      Alert.alert(
        'Registro exitoso',
        'Si tienes confirmación por correo activada, revisa tu email.'
      )
    } catch (error: any) {
      Alert.alert('Error al registrar', error.message ?? 'Intenta nuevamente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Image
            source={require('../../../assets/images/plazafit-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.brand}>PlazaFit</Text>
          <Text style={styles.title}>Crear cuenta</Text>

          <TextInput
            placeholder="Nombre completo"
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholderTextColor="#6b7280"
          />

          <TextInput
            placeholder="Correo"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholderTextColor="#6b7280"
          />

          <TextInput
            placeholder="Contraseña"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor="#6b7280"
          />

          <TextInput
            placeholder="Confirmar contraseña"
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholderTextColor="#6b7280"
          />

          <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
            <Text style={styles.buttonText}>
              {loading ? 'Creando...' : 'Registrarme'}
            </Text>
          </Pressable>

          <Link href="/login" style={styles.link}>
            Ya tengo cuenta
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    gap: 12,
  },
  logo: {
    width: 110,
    height: 110,
    alignSelf: 'center',
    marginBottom: 8,
  },
  brand: {
    fontSize: 32,
    fontWeight: '800',
    color: '#16a34a',
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
  },
  link: {
    marginTop: 8,
    textAlign: 'center',
    color: '#15803d',
  },
})