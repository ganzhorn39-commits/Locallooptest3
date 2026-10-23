import { useRouter } from "expo-router";
import CreateEventScreen from "@/src/screens/CreateEventScreen";
import GuestGate from "@/src/components/GuestGate";
import { useAuth } from "@/src/auth/AuthContext";
import { useI18n } from "@/src/i18n";

export default function CreateTab() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user) return <GuestGate icon="add-circle-outline" message={t("guest_create")} />;
  return <CreateEventScreen inTabs onDone={() => router.push("/(tabs)/explore")} />;
}
