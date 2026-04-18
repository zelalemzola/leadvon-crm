import { ClientDashboard } from "@/components/client/client-dashboard";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Dashboard · LeadVon Client",
};

export default async function ClientDashboardPage() {
  await requireCustomerOrg();
  return <ClientDashboard />;
}
