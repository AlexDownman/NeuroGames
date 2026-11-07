-- =============================================================================
-- Storage access for uploaded collection resources: RLS policies on the
-- Collection-Resources bucket so a teacher can only upload, read and delete
-- objects under their own collections' folders ({collection_id}/...).
-- The bucket already exists on the live project; the insert is a no-op there.
-- =============================================================================

-- Uploaded learning materials are kept in the private Collection-Resources
-- bucket at {collection_id}/{uuid}/{filename}. The backend reads and writes
-- objects as the calling teacher (their JWT, never a service key), so these
-- policies are the access control: a teacher can only touch objects under
-- their own collections' folders. Students have no access.
insert into storage.buckets (id, name, public, file_size_limit)
values ('Collection-Resources', 'Collection-Resources', false, 26214400)
on conflict (id) do nothing;

-- True if the object's first path segment is a collection the caller owns.
-- A first segment that isn't a uuid is simply "not yours", not an error.
create or replace function private.owns_collection_resource(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_collection_id uuid;
begin
  begin
    v_collection_id := split_part(object_name, '/', 1)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return private.owns_collection(v_collection_id);
end;
$$;

revoke execute on function private.owns_collection_resource(text) from public;
grant execute on function private.owns_collection_resource(text) to authenticated;

drop policy if exists "collection_resources_select_owner" on storage.objects;
drop policy if exists "collection_resources_insert_owner" on storage.objects;
drop policy if exists "collection_resources_delete_owner" on storage.objects;

create policy "collection_resources_select_owner" on storage.objects
  for select to authenticated
  using (bucket_id = 'Collection-Resources' and private.owns_collection_resource(name));

create policy "collection_resources_insert_owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'Collection-Resources' and private.owns_collection_resource(name));

create policy "collection_resources_delete_owner" on storage.objects
  for delete to authenticated
  using (bucket_id = 'Collection-Resources' and private.owns_collection_resource(name));
