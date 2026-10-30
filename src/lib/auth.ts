import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Role = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  managerId: string | null;
  departmentId: string | null;
};

/** The signed-in user with their profile, or null. Read once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, manager_id, department_id, active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || !profile.active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    role: profile.role,
    managerId: profile.manager_id,
    departmentId: profile.department_id,
  };
});

/** Use at the top of every protected page or server action. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Signed in but no active profile (e.g. deactivated): show /auth/inactive, which signs out with a
  // POST (sign-out no longer accepts GET). Going straight to /login would bounce back here.
  if (!user) redirect("/auth/inactive");
  return user;
}

/** Like requireUser, but also checks the role (admins pass every check). */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin" && !roles.includes(user.role)) redirect("/");
  return user;
}
