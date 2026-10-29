-- Display order for departments and categories (lower first; "אחר" goes last).
alter table public.departments add column position int not null default 100;
alter table public.categories add column position int not null default 100;

update public.departments set position = case name
  when 'הנהלה' then 10 when 'עיתונאים' then 20 when 'גיוס משאבים' then 30 when 'סטודנטים' then 40 when 'אחר' then 999
  else position end;
update public.categories set position = 999 where name = 'אחר';
