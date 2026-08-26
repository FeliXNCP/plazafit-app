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

import { router } from 'expo-router'
import { PasswordInput } from '../../components/auth/PasswordInput'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    try {
      setLoading(true)

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) throw error
    } catch (error: any) {
      Alert.alert('Error al iniciar sesión', error.message ?? 'Intenta nuevamente')
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
          <Text style={styles.title}>Bienvenido</Text>

          <TextInput
            placeholder="Correo"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            placeholderTextColor="#6b7280"
            style={styles.input}
          />

          <PasswordInput
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={() => {
              void handleLogin()
            }}
          />

          <Pressable
            style={styles.forgotPasswordButton}
            onPress={() =>
              router.push('/forgot-password')
            }
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>
              ¿Olvidaste tu contraseña?
            </Text>
          </Pressable>


          <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
            <Text style={styles.buttonText}>
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </Text>
          </Pressable>

          <Link href="/register" style={styles.link}>
            ¿No tienes cuenta? Regístrate
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
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
  },

  forgotPasswordText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '700',
  },
})