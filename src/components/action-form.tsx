"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
};

/** A form bound to a server action that shows the action's success or error message under it. */
export function ActionForm({ action, children, className }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && <p className="basis-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="basis-full text-sm text-green-700 dark:text-green-400">{state.ok}</p>}
    </form>
  );
}
