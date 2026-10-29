-- =====================================================================
-- Invoices app: tables, workflow functions, row level security, storage
-- =====================================================================

-- ---------- Types ----------
create type public.user_role as enum ('employee', 'manager', 'accounting', 'admin');
create type public.invoice_status as enum ('draft', 'pending', 'pending_second', 'approved', 'rejected', 'paid');
create type public.doc_type as enum ('tax_invoice', 'tax_invoice_receipt', 'receipt');

-- ---------- Reference tables ----------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  rate_to_ils numeric(12, 6) not null check (rate_to_ils > 0),
  updated_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Profiles (one row per auth user) ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.user_role not null default 'employee',
  department_id uuid references public.departments (id) on delete set null,
  manager_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_not_own_manager check (manager_id is null or manager_id <> id)
);
create index profiles_manager_idx on public.profiles (manager_id);

-- ---------- Invoices ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  status public.invoice_status not null default 'draft',

  -- uploaded file (private storage bucket "invoices")
  file_path text,
  file_mime text,

  -- extracted fields (null = not found)
  supplier_name text,
  supplier_tax_id text,
  doc_type public.doc_type,
  invoice_number text,
  invoice_date date,
  allocation_number text,
  amount_before_vat numeric(14, 2),
  vat_amount numeric(14, 2),
  total_amount numeric(14, 2),
  currency text not null default 'ILS' references public.currencies (code),
  extraction_raw jsonb,

  -- added by the employee
  category_id uuid references public.categories (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  project text,
  notes text,

  -- workflow (changed only through the functions below)
  total_ils numeric(14, 2),
  current_approver_id uuid references public.profiles (id) on delete set null,
  first_approver_id uuid references public.profiles (id) on delete set null,
  first_approved_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_employee_idx on public.invoices (employee_id, created_at desc);
create index invoices_approver_idx on public.invoices (current_approver_id) where current_approver_id is not null;
create index invoices_status_idx on public.invoices (status);

-- Supplier identity for duplicate detection: tax id digits, otherwise the normalized name.
create function public.supplier_key(p_tax_id text, p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g'), ''),
    nullif(lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')), '')
  )
$$;

-- The same supplier + invoice number can be submitted only once (drafts are not counted).
create unique index invoices_no_duplicates
  on public.invoices (public.supplier_key(supplier_tax_id, supplier_name), lower(trim(invoice_number)))
  where status <> 'draft' and invoice_number is not null;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position int not null default 0,
  description text,
  quantity numeric(12, 3),
  amount numeric(14, 2)
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

create table public.invoice_history (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  from_status public.invoice_status,
  to_status public.invoice_status not null,
  note text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index invoice_history_invoice_idx on public.invoice_history (invoice_id, created_at);

-- =====================================================================
-- Helper functions (security definer so policies don't recurse)
-- =====================================================================
create function public.app_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create function public.is_accounting()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.app_role() in ('accounting', 'admin'), false)
$$;

-- True when the current user is the direct manager, or the manager's manager, of p_employee.
create function public.manages(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles e
    left join public.profiles m on m.id = e.manager_id
    where e.id = p_employee
      and (e.manager_id = (select auth.uid()) or m.manager_id = (select auth.uid()))
  )
$$;

-- True when p_profile is the current user's manager or manager's manager (their approvers).
create function public.is_my_approver(p_profile uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles me
    left join public.profiles m on m.id = me.manager_id
    where me.id = (select auth.uid())
      and (me.manager_id = p_profile or m.manager_id = p_profile)
  )
$$;

create function public.setting_numeric(p_key text, p_default numeric)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default)
$$;

-- =====================================================================
-- Triggers
-- =====================================================================
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- New auth user -> profile row (role "employee"; an admin changes it later).
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only an admin may change role, manager, department or active status.
-- (No auth.uid() means a server-side service call, e.g. the seed script.)
create function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and (
       new.role is distinct from old.role
    or new.manager_id is distinct from old.manager_id
    or new.department_id is distinct from old.department_id
    or new.active is distinct from old.active
    or new.email is distinct from old.email
  ) then
    raise exception 'רק אדמין יכול לשנות תפקיד, מנהל, מחלקה או סטטוס';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- History: every status change, and every edit of a rejected invoice.
create function public.log_invoice_history()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('app.history_note', true), '');
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.invoice_history (invoice_id, actor_id, from_status, to_status, note)
    values (new.id, (select auth.uid()), null, new.status, v_note);
  elsif new.status is distinct from old.status then
    insert into public.invoice_history (invoice_id, actor_id, from_status, to_status, note)
    values (new.id, (select auth.uid()), old.status, new.status, v_note);
  elsif old.status = 'rejected' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changes
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
      and n.key not in ('updated_at', 'extraction_raw');
    if v_changes is not null then
      insert into public.invoice_history (invoice_id, actor_id, from_status, to_status, note, changes)
      values (new.id, (select auth.uid()), old.status, new.status, 'עריכה', v_changes);
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_history after insert or update on public.invoices
  for each row execute function public.log_invoice_history();

-- =====================================================================
-- Workflow functions (the only way to change an invoice's status)
-- =====================================================================

-- Employee: draft/rejected -> pending
create function public.submit_invoice(p_invoice_id uuid)
returns public.invoice_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_manager uuid;
  v_rate numeric;
begin
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
create function public.approve_invoice(p_invoice_id uuid, p_note text default null)
returns public.invoice_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_me uuid := (select auth.uid());
  v_next uuid;
  v_new public.invoice_status;
begin
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
create function public.reject_invoice(p_invoice_id uuid, p_reason text)
returns public.invoice_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_me uuid := (select auth.uid());
begin
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

-- Accounting: approved -> paid
create function public.mark_invoices_paid(p_invoice_ids uuid[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_accounting() then
    raise exception 'רק הנהלת חשבונות יכולה לסמן תשלום';
  end if;
  update public.invoices set
    status = 'paid',
    paid_at = now(),
    paid_by = (select auth.uid())
  where id = any (p_invoice_ids) and status = 'approved';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Soft duplicate check for the UI (before submitting). Returns only yes/no.
create function public.invoice_duplicate_exists(
  p_supplier_tax_id text, p_supplier_name text, p_invoice_number text, p_exclude_id uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.invoices
    where status <> 'draft'
      and (p_exclude_id is null or id <> p_exclude_id)
      and invoice_number is not null
      and lower(trim(invoice_number)) = lower(trim(p_invoice_number))
      and public.supplier_key(supplier_tax_id, supplier_name) = public.supplier_key(p_supplier_tax_id, p_supplier_name)
  )
$$;

-- Functions are callable only by signed-in users (helpers stay usable inside policies).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- =====================================================================
-- Privileges: users may write only the editable columns; workflow columns
-- change exclusively through the functions above.
-- =====================================================================
revoke all on public.invoices from anon, authenticated;
grant select, delete on public.invoices to authenticated;
grant insert (
  file_path, file_mime, supplier_name, supplier_tax_id, doc_type, invoice_number, invoice_date,
  allocation_number, amount_before_vat, vat_amount, total_amount, currency, extraction_raw,
  category_id, department_id, project, notes
) on public.invoices to authenticated;
grant update (
  file_path, file_mime, supplier_name, supplier_tax_id, doc_type, invoice_number, invoice_date,
  allocation_number, amount_before_vat, vat_amount, total_amount, currency, extraction_raw,
  category_id, department_id, project, notes
) on public.invoices to authenticated;

revoke all on public.invoice_history from anon, authenticated;
grant select on public.invoice_history to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role, department_id, manager_id, active) on public.profiles to authenticated;

revoke all on public.departments, public.categories, public.currencies, public.settings, public.invoice_items from anon;

-- =====================================================================
-- Row level security
-- =====================================================================
alter table public.departments enable row level security;
alter table public.categories enable row level security;
alter table public.currencies enable row level security;
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_history enable row level security;

-- Reference tables: every signed-in user reads, only admins write.
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "admin writes departments" on public.departments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read categories" on public.categories for select to authenticated using (true);
create policy "admin writes categories" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read currencies" on public.currencies for select to authenticated using (true);
create policy "admin writes currencies" on public.currencies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "read settings" on public.settings for select to authenticated using (true);
create policy "admin writes settings" on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: yourself, your approvers, people you manage, accounting and admins.
create policy "read profiles" on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or public.is_my_approver(id)
  or public.manages(id)
  or public.is_accounting()
);
create policy "update own profile or admin" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- Invoices
create policy "read invoices" on public.invoices for select to authenticated using (
  employee_id = (select auth.uid())
  or current_approver_id = (select auth.uid())
  or first_approver_id = (select auth.uid())
  or decided_by = (select auth.uid())
  or (status <> 'draft' and public.manages(employee_id))
  or (status in ('approved', 'paid') and public.is_accounting())
  or public.is_admin()
);
create policy "create own invoices" on public.invoices for insert to authenticated
  with check (employee_id = (select auth.uid()));
create policy "edit own draft or rejected" on public.invoices for update to authenticated
  using (employee_id = (select auth.uid()) and status in ('draft', 'rejected'))
  with check (employee_id = (select auth.uid()) and status in ('draft', 'rejected'));
create policy "delete own draft" on public.invoices for delete to authenticated
  using (employee_id = (select auth.uid()) and status = 'draft');

-- Invoice items follow their invoice.
create policy "read items" on public.invoice_items for select to authenticated using (
  exists (select 1 from public.invoices i where i.id = invoice_id)
);
create policy "write own editable items" on public.invoice_items for all to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and i.employee_id = (select auth.uid()) and i.status in ('draft', 'rejected')))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id
                      and i.employee_id = (select auth.uid()) and i.status in ('draft', 'rejected')));

-- History: readable whenever the invoice is readable; written only by the trigger.
create policy "read history" on public.invoice_history for select to authenticated using (
  exists (select 1 from public.invoices i where i.id = invoice_id)
);

-- =====================================================================
-- Storage: private bucket, files under "<user id>/..."
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "upload own invoice files" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "replace own invoice files" on storage.objects for update to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "delete own invoice files" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Read: your own files, or the file of any invoice you are allowed to see.
create policy "read invoice files" on storage.objects for select to authenticated using (
  bucket_id = 'invoices' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.invoices i where i.file_path = name)
  )
);
