/** What a form's server action returns: a message to show, or null before the first submit. */
export type ActionResult = { ok?: string; error?: string } | null;

/** Turns a database error into a short Hebrew message. */
export function dbError(error: { code?: string; message: string }): ActionResult {
  if (error.code === "23505") return { error: "הערך הזה כבר קיים." };
  if (error.code === "23503") return { error: "אי אפשר למחוק: הפריט נמצא בשימוש." };
  if (error.code === "42501") return { error: "אין לך הרשאה לפעולה הזו." };
  if (error.code === "P0001") return { error: error.message };
  return { error: "הפעולה נכשלה. נסו שוב." };
}
