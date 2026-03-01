import { StyleSheet, TextInput, type TextInputProps } from "react-native";

export function Input({ style, ...props }: TextInputProps) {
  return <TextInput placeholderTextColor="#94a3b8" style={[styles.input, style]} {...props} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
});
