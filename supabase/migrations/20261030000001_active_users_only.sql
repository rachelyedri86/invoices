-- Only active users that an admin added may touch app data.
-- A self-registered account (or any profile not yet activated) gets an inactive profile
-- and is blocked from every table and from the invoice files, even if sign-up is left on.

alter table public.profiles alter column active set default false;

-- Restrictive policies are ANDed with the existing ones.
create policy "active users only" on public.invoices as restrictive for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy "active users only" on public.invoice_items as restrictive for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy "active users only" on public.invoice_history as restrictive for all to authenticated
  using (public.app_role() is not null);
create policy "active users only" on public.departments as restrictive for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy "active users only" on public.categories as restrictive for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy "active users only" on public.currencies as restrictive for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
create policy "active users only" on public.settings as restrictive for all to authenticated
  using (public.app_role() is not null) with check (public.app_role() is not null);
-- An inactive user may still read their own profile row (the app then signs them out).
create policy "active users only" on public.profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or public.app_role() is not null)
  with check (public.app_role() is not null);

create policy "active users only" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'invoices' or public.app_role() is not null)
  with check (bucket_id <> 'invoices' or public.app_role() is not null);
