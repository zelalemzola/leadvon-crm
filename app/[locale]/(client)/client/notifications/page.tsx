import { requireCustomerOrg } from "@/lib/server/client/guard";
import { ClientNotifications } from "@/components/client/client-notifications";

export default async function ClientNotificationsPage() {
  await requireCustomerOrg();
  return <ClientNotifications />;
}
