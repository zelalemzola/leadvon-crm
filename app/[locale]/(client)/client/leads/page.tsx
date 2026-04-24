import { ClientLeads } from "@/components/client/client-leads";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Leads · LeadVon Client",
};

export default async function ClientLeadsPage() {
  await requireCustomerOrg();
  return <ClientLeads />;
}
