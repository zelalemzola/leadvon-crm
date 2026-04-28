import { redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n/messages";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "en";
  redirect(`/${safeLocale}/landing`);
}
