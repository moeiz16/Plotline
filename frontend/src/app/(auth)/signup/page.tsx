import type { Metadata } from "next";
import { SignUpForm } from "./form";

export const metadata: Metadata = { title: "Start your atlas" };

export default function SignUpPage() {
  return <SignUpForm />;
}
