import { ClientSupport } from "@/components/client/client-support";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Support · LeadVon Client",
};

export default async function ClientSupportPage() {
  await requireCustomerOrg();
  return <ClientSupport />;
}
