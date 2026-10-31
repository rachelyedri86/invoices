"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

/** A submit button that says what is happening while the action runs. */
export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={buttonClass} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
