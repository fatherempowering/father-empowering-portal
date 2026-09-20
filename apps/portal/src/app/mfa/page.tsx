import { redirect } from "next/navigation";

export default function LegacyMfaPage() {
  redirect("/verify-email");
}
