import { SetupForm } from "@/components/auth/setup-form";

export const metadata = {
  title: "First admin setup · LeadVon",
};

export default function SetupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <SetupForm />
    </div>
  );
}
