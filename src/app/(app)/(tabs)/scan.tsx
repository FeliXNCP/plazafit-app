import Ionicons from '@expo/vector-icons/Ionicons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleBarcodeScanned({ data }: { data: string }) {
    if (scanned || loading) return

    setScanned(true)
    setLoading(true)

    try {
      const match = /^PFM:(\d+)$/.exec(data.trim())

      if (!match) {
        Alert.alert(
          'QR no válido',
          'Este código no corresponde a una máquina registrada en PlazaFit.'
        )
        return
      }

      const plazaMachineId = Number(match[1])

      const { data: plazaMachine, error } = await supabase
        .from('plaza_machines')
        .select('id, plaza_id, machine_type_id')
        .eq('id', plazaMachineId)
        .single()

      if (error || !plazaMachine) {
        Alert.alert(
          'Máquina no encontrada',
          'No se encontró una máquina asociada a este código QR.'
        )
        return
      }

      router.push({
        pathname: '/maquina/[id]',
        params: {
          id: String(plazaMachine.machine_type_id),
          plazaId: String(plazaMachine.plaza_id),
        },
      })
    } catch (error: any) {
      Alert.alert('Error', error.message ?? 'No se pudo procesar el QR.')
    } finally {
      setLoading(false)
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={46} color="#16a34a" />
        <Text style={styles.permissionTitle}>Permiso de cámara</Text>
        <Text style={styles.permissionText}>
          Necesitamos acceso a la cámara para escanear los códigos QR de las máquinas.
        </Text>

        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Conceder permiso</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      <View style={styles.overlay}>
        <Text style={styles.title}>Escanea el QR de la máquina</Text>
        <Text style={styles.subtitle}>
          Alinea el código dentro del recuadro para ver su información y rutinas.
        </Text>

        <View style={styles.scanFrame} />

        <Pressable
          style={styles.secondaryButton}
          onPress={() => setScanned(false)}
        >
          <Text style={styles.secondaryButtonText}>Escanear de nuevo</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 14,
  },
  permissionText: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
    marginBottom: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#22c55e',
    borderRadius: 20,
    backgroundColor: 'transparent',
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
})