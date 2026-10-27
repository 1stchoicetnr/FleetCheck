"use client";

import type { ReactNode } from "react";
import { BetaNotice } from "@/components/beta-notice";
import { CheckoutFeedbackProvider } from "@/components/checkout-feedback";

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <CheckoutFeedbackProvider>
      <div className="checkout-beta-slot">
        <div className="beta-notice-slot mx-auto w-full max-w-lg px-4 pt-2">
          <BetaNotice />
        </div>
        {children}
      </div>
    </CheckoutFeedbackProvider>
  );
}
