import { AuthAwareExplorer } from "@/components/auth/auth-aware-explorer";
import { env } from "@/lib/config/env";

export default function Home() {
  return (
    <AuthAwareExplorer
      authEnabled={env.clerkEnabled}
      providerMode={env.providerMode}
    />
  );
}
