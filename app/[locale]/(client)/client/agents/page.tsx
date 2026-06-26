import { ClientAgentPerformance } from "@/components/client/client-agent-performance";
import { requireCustomerAdmin } from "@/lib/server/client/guard";

export const metadata = {
  title: "Agent Performance · LeadVon Client",
};

export default async function ClientAgentsPage() {
  await requireCustomerAdmin();
  return <ClientAgentPerformance />;
}
