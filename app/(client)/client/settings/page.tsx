import { ClientSettings } from "@/components/client/client-settings";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Settings · LeadVon Client",
};

export default async function ClientSettingsPage() {
  await requireCustomerOrg();
  return <ClientSettings />;
}
