"use server";

import { redirect } from "next/navigation";

import { signInCoachWithPassword } from "@/lib/auth/coach-sign-in";

export async function signInCoachAction(formData: FormData) {
  let destination = "/mfa";
  try {
    const result = await signInCoachWithPassword({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    destination = result.destination;
  } catch {
    redirect("/login?error=invalid");
  }
  redirect(destination);
}
