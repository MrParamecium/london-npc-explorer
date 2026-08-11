import { ExplorerShell } from "@/components/explorer/explorer-shell";
import { env } from "@/lib/config/env";

export default function Home() {
  return <ExplorerShell providerMode={env.providerMode} />;
}
