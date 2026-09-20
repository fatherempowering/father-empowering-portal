"use server";

import { redirect } from "next/navigation";

import { signInCoachWithPassword } from "@/lib/auth/coach-sign-in";
import { M1ContractError } from "@/lib/contracts/m1";

export async function signInCoachAction(formData: FormData) {
  let destination = "/verify-email";
  try {
    const result = await signInCoachWithPassword({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    destination = result.destination;
  } catch (error) {
    if (
      error instanceof M1ContractError &&
      error.code === "TEMPORARILY_UNAVAILABLE"
    ) {
      redirect("/login?error=unavailable");
    }
    redirect("/login?error=invalid");
  }
  redirect(destination);
}
