import { ClientBilling } from "@/components/client/client-billing";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Billing · LeadVon Client",
};

export default async function ClientBillingPage() {
  await requireCustomerOrg();
  return <ClientBilling />;
}
