import { Link } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    try {
      setLoading(true)

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
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

      <Pressable style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creando...' : 'Registrarme'}</Text>
      </Pressable>

      <Link href="/login" style={styles.link}>
        Ya tengo cuenta
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#f0fdf4',
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
  buttonText: { color: 'white', fontWeight: '700' },
  link: {
    marginTop: 8,
    textAlign: 'center',
    color: '#15803d',
  },
  logo: {
    width: 110,
    height: 110,
    alignSelf: 'center',
    marginBottom: 8,
  },
})