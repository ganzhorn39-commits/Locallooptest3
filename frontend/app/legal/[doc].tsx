import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/theme";
import { useI18n } from "@/src/i18n";
import { LEGAL_DOCS, LEGAL_IS_TEMPLATE, LegalDoc, legalText } from "@/src/legal/content";

// Impressum, Datenschutzerklärung, Nutzungsbedingungen. Reachable without an account (login screen).
export default function LegalScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const key: LegalDoc = LEGAL_DOCS.includes(doc as LegalDoc) ? (doc as LegalDoc) : "impressum";
  const text = legalText(key, lang);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID={`legal-${key}`}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="legal-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={8} style={{ width: 26 }}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.onSurface }]} numberOfLines={1}>{text.title}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        {LEGAL_IS_TEMPLATE && (
          <View testID="legal-template-note" style={[styles.note, { borderColor: colors.warning }]}>
            <Ionicons name="construct-outline" size={16} color={colors.warning} />
            <Text style={[styles.noteText, { color: colors.warning }]}>{t("legal_template_note")}</Text>
          </View>
        )}
        {text.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            {!!s.heading && <Text style={[styles.heading, { color: colors.onSurface }]}>{s.heading}</Text>}
            <Text selectable style={[styles.text, { color: colors.onSurfaceSecondary }]}>{s.body}</Text>
          </View>
        ))}
        <Text style={[styles.updated, { color: colors.onSurfaceTertiary }]}>{text.updated}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: "800", flex: 1, textAlign: "center" },
  body: { padding: 18, gap: 18 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  noteText: { fontSize: 13, fontWeight: "600", flex: 1, lineHeight: 18 },
  section: { gap: 6 },
  heading: { fontSize: 16, fontWeight: "800" },
  text: { fontSize: 14, lineHeight: 21 },
  updated: { fontSize: 12, marginTop: 4 },
});
