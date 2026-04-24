import { ClientActivity } from "@/components/client/client-activity";
import { requireCustomerOrg } from "@/lib/server/client/guard";

export const metadata = {
  title: "Activity · LeadVon Client",
};

export default async function ClientActivityPage() {
  await requireCustomerOrg();
  return <ClientActivity />;
}
