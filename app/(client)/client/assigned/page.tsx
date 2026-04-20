import { ClientAssignedLeads } from "@/components/client/client-assigned";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Assigned · LeadVon Client",
};

export default async function ClientAssignedPage() {
  await requireCustomerOrg();
  return <ClientAssignedLeads />;
}

