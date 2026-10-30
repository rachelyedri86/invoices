-- =====================================================================
-- Security hardening (review of 2026-10-30), on top of 20261030000001_active_users_only:
--   1. (there) New profiles are inactive by default; restrictive "active users only"
--      policies block inactive users on every table and on the invoice files
--   2. invoices.file_path must be inside the employee's own storage folder
--   3. Deactivated users cannot act through the workflow functions either (they are
--      security definer, so RLS policies do not apply inside them)
--   4. Admin changes to profiles are audited
-- =====================================================================

-- ---------- 2. file_path lives in the employee's own folder ----------
-- Fail loudly instead of silently nulling data: existing rows must be fixed by hand first.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.invoices
  where file_path is not null
    and split_part(file_path, '/', 1) <> employee_id::text;
  if v_count > 0 then
    raise exception 'יש % חשבוניות שהקובץ שלהן אינו בתיקייה של העובד. יש לתקן אותן לפני החלת המיגרציה.', v_count;
  end if;
end;
$$;

alter table public.invoices add constraint invoices_file_path_owner
  check (file_path is null or split_part(file_path, '/', 1) = employee_id::text);

-- Read: your own files, or the file of an invoice you are allowed to see, and only when the
-- file is in that invoice's employee folder (so a draft cannot point at someone else's file).
drop policy "read invoice files" on storage.objects;
create policy "read invoice files" on storage.objects for select to authenticated using (
  bucket_id = 'invoices' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.invoices i
      where i.file_path = name
        and split_part(name, '/', 1) = i.employee_id::text
    )
  )
);

-- ---------- 3. Deactivated users cannot act ----------
-- app_role() is null for a user without an active profile, so these return false for them.

-- True when the current (active) user is the direct manager, or the manager's manager, of p_employee.
create or replace function public.manages(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.app_role() is not null and exists (
    select 1
    from public.profiles e
    left join public.profiles m on m.id = e.manager_id
    where e.id = p_employee
      and (e.manager_id = (select auth.uid()) or m.manager_id = (select auth.uid()))
  )
$$;

-- True when p_profile is the current (active) user's manager or manager's manager (their approvers).
create or replace function public.is_my_approver(p_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.app_role() is not null and exists (
    select 1
    from public.profiles me
    left join public.profiles m on m.id = me.manager_id
    where me.id = (select auth.uid())
      and (me.manager_id = p_profile or m.manager_id = p_profile)
  )
$$;

-- (Reading invoices as an inactive user is already blocked by the restrictive policy
-- "active users only" from 20261030000001.)

-- Employee: draft/rejected -> pending
create or replace function public.submit_invoice(p_invoice_id uuid)
returns public.invoice_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_manager uuid;
  v_rate numeric;
begin
  if public.app_role() is null then
    raise exception 'המשתמש אינו פעיל';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or v_inv.employee_id <> (select auth.uid()) then
    raise exception 'החשבונית לא נמצאה';
  end if;
  if v_inv.status not in ('draft', 'rejected') then
    raise exception 'אפשר להגיש רק טיוטה או חשבונית שנדחתה';
  end if;
  if v_inv.file_path is null or v_inv.supplier_name is null or v_inv.invoice_number is null
     or v_inv.invoice_date is null or v_inv.total_amount is null then
    raise exception 'חסרים שדות חובה: קובץ, ספק, מספר חשבונית, תאריך וסכום כולל';
  end if;

  select manager_id into v_manager from public.profiles where id = v_inv.employee_id;
  if v_manager is null then
    raise exception 'לא הוגדר לך מנהל מאשר. פנה לאדמין.';
  end if;

  select rate_to_ils into v_rate from public.currencies where code = v_inv.currency;

  perform set_config('app.history_note', case when v_inv.status = 'rejected' then 'הוגשה מחדש' else 'הוגשה' end, true);
  update public.invoices set
    status = 'pending',
    total_ils = round(v_inv.total_amount * v_rate, 2),
    current_approver_id = v_manager,
    first_approver_id = null,
    first_approved_at = null,
    rejection_reason = null,
    decided_at = null,
    decided_by = null,
    submitted_at = now()
  where id = p_invoice_id;
  perform set_config('app.history_note', '', true);

  return 'pending';
end;
$$;

-- Approver: pending -> pending_second (above threshold, if there is a second-level manager) or approved
create or replace function public.approve_invoice(p_invoice_id uuid, p_note text default null)
returns public.invoice_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_me uuid := (select auth.uid());
  v_next uuid;
  v_new public.invoice_status;
begin
  if public.app_role() is null then
    raise exception 'המשתמש אינו פעיל';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or v_inv.current_approver_id is distinct from v_me
     or v_inv.status not in ('pending', 'pending_second') then
    raise exception 'אין לך הרשאה לאשר חשבונית זו';
  end if;

  if v_inv.status = 'pending'
     and v_inv.total_ils > public.setting_numeric('second_approval_threshold_ils', 5000) then
    select manager_id into v_next from public.profiles where id = v_me;
    if v_next = v_inv.employee_id then
      v_next := null;
    end if;
  end if;

  perform set_config('app.history_note', coalesce(p_note, ''), true);
  if v_next is not null then
    v_new := 'pending_second';
    update public.invoices set
      status = v_new,
      first_approver_id = v_me,
      first_approved_at = now(),
      current_approver_id = v_next
    where id = p_invoice_id;
  else
    v_new := 'approved';
    update public.invoices set
      status = v_new,
      first_approver_id = coalesce(first_approver_id, v_me),
      first_approved_at = coalesce(first_approved_at, now()),
      current_approver_id = null,
      decided_at = now(),
      decided_by = v_me
    where id = p_invoice_id;
  end if;
  perform set_config('app.history_note', '', true);

  return v_new;
end;
$$;

-- Approver: pending/pending_second -> rejected (reason required)
create or replace function public.reject_invoice(p_invoice_id uuid, p_reason text)
returns public.invoice_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_me uuid := (select auth.uid());
begin
  if public.app_role() is null then
    raise exception 'המשתמש אינו פעיל';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'חובה לכתוב סיבת דחייה';
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or v_inv.current_approver_id is distinct from v_me
     or v_inv.status not in ('pending', 'pending_second') then
    raise exception 'אין לך הרשאה לדחות חשבונית זו';
  end if;

  perform set_config('app.history_note', trim(p_reason), true);
  update public.invoices set
    status = 'rejected',
    rejection_reason = trim(p_reason),
    current_approver_id = null,
    decided_at = now(),
    decided_by = v_me
  where id = p_invoice_id;
  perform set_config('app.history_note', '', true);

  return 'rejected';
end;
$$;

-- (mark_invoices_paid already requires is_accounting(), which goes through app_role().)

-- ---------- 4. Audit of admin changes to profiles ----------
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  target_id uuid not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index admin_audit_target_idx on public.admin_audit (target_id, created_at);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;

-- Readable only by admins; written only by the trigger below.
create policy "admin reads audit" on public.admin_audit for select to authenticated
  using (public.is_admin());

-- Records who changed role, manager, department, active status or email, and from what to what.
-- (No auth.uid() means a server-side service call, e.g. the seed script: actor_id is null.)
create function public.log_profile_admin_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.key in ('role', 'manager_id', 'department_id', 'active', 'email')
    and n.value is distinct from o.value;
  if v_changes is not null then
    insert into public.admin_audit (actor_id, target_id, changes)
    values ((select auth.uid()), new.id, v_changes);
  end if;
  return new;
end;
$$;

create trigger profiles_admin_audit after update on public.profiles
  for each row execute function public.log_profile_admin_changes();

-- Same function privileges as the rest of the schema: signed-in users only.
revoke execute on function public.log_profile_admin_changes() from public, anon;
grant execute on function public.log_profile_admin_changes() to authenticated, service_role;
