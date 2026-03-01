import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";

type ButtonProps = PressableProps & {
  label: string;
  variant?: "default" | "outline";
};

export function Button({ label, variant = "default", ...props }: ButtonProps) {
  return (
    <Pressable
      style={[styles.base, variant === "default" ? styles.default : styles.outline, props.disabled ? styles.disabled : null]}
      {...props}
    >
      <Text style={[styles.label, variant === "default" ? styles.defaultLabel : styles.outlineLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  default: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  outline: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  defaultLabel: {
    color: "#f8fafc",
  },
  outlineLabel: {
    color: "#0f172a",
  },
  disabled: {
    opacity: 0.6,
  },
});
