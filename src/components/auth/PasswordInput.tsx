import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import {
    Pressable,
    StyleSheet,
    TextInput,
    type TextInputProps,
    View,
} from 'react-native'

type PasswordInputProps = TextInputProps

export function PasswordInput({
  style,
  editable = true,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <View
      style={[
        styles.container,
        !editable && styles.disabled,
      ]}
    >
      <TextInput
        {...props}
        editable={editable}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#6b7280"
        style={[styles.input, style]}
      />

      <Pressable
        style={styles.visibilityButton}
        onPress={() =>
          setVisible((current) => !current)
        }
        disabled={!editable}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={
          visible
            ? 'Ocultar contraseña'
            : 'Mostrar contraseña'
        }
      >
        <Ionicons
          name={
            visible
              ? 'eye-off-outline'
              : 'eye-outline'
          }
          size={21}
          color="#166534"
        />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#ffffff',

    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
  },

  disabled: {
    opacity: 0.65,
  },

  input: {
    flex: 1,
    minHeight: 48,

    paddingLeft: 14,
    paddingRight: 6,

    color: '#111827',
    fontSize: 15,
  },

  visibilityButton: {
    width: 48,
    minHeight: 48,

    alignItems: 'center',
    justifyContent: 'center',
  },
})