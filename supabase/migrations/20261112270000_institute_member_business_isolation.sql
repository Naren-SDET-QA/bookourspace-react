-- Business-scope every institute member and make the central institute helper
-- require active membership in the institute's business. Branch checks remain.
alter table public.institute_members add column if not exists business_id uuid references public.businesses(id) on delete restrict;
update public.institute_members m set business_id=i.business_id from public.institutes i where i.id=m.institute_id and m.business_id is distinct from i.business_id;

insert into public.business_members (business_id,user_id,role,status,accepted_at)
select i.business_id, m.user_id,
       case m.role when 'institute_owner' then 'owner' when 'manager' then 'manager' when 'accountant' then 'accountant' else 'staff' end,
       'active', now()
  from public.institute_members m join public.institutes i on i.id=m.institute_id
 where i.business_id is not null and m.status='active'
on conflict (business_id,user_id) do nothing;

create or replace function public.institute_can_access(p_institute_id uuid, p_branch_id uuid default null, p_permission text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
      from public.institute_members m
      join public.institutes i on i.id=m.institute_id
     where m.institute_id=p_institute_id
       and m.user_id=auth.uid()
       and m.status='active'
       and (i.business_id is null or exists (
         select 1 from public.business_members bm
          where bm.business_id=i.business_id and bm.user_id=auth.uid() and bm.status='active'
       ))
       and (p_branch_id is null or m.branch_id is null or m.branch_id=p_branch_id)
       and (
         p_permission is null
         or m.role in ('institute_owner','manager','branch_admin')
         or (m.role='accountant' and p_permission in ('manage_fees','read_fees'))
         or (m.role='receptionist' and p_permission in ('manage_admissions','manage_enquiries','manage_students'))
         or (m.role='faculty' and p_permission in ('manage_attendance','manage_exams'))
         or m.permissions ? p_permission
       )
  ) or exists (
    select 1 from public.institutes i
     where i.id=p_institute_id
       and i.owner_id=auth.uid()
       and (i.business_id is null or exists (
         select 1 from public.business_members bm where bm.business_id=i.business_id and bm.user_id=auth.uid() and bm.status='active'
       ))
       and (p_permission is null or p_permission <> 'admin_only')
  );
$$;
