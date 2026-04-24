import { SignupForm } from "@/components/auth/signup-form";

export const metadata = {
  title: "Sign up · LeadVon",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <SignupForm />
    </div>
  );
}
