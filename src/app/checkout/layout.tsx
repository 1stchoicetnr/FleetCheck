"use client";

import type { ReactNode } from "react";
import { CheckoutFeedbackProvider } from "@/components/checkout-feedback";

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return <CheckoutFeedbackProvider>{children}</CheckoutFeedbackProvider>;
}
