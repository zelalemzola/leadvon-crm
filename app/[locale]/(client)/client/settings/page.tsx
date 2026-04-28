import { ClientSettings } from "@/components/client/client-settings";
import { requireCustomerAdmin } from "@/lib/server/client/guard";

export const metadata = {
  title: "Settings · LeadVon Client",
};

export default async function ClientSettingsPage() {
  await requireCustomerAdmin();
  return <ClientSettings />;
}
