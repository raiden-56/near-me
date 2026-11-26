-- ════════════════════════════════════════════════════════════════════════════════════════════
-- NearMe · 0005 · Storage buckets and storage.objects policies
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Re-runnable. Requires Supabase Storage (schema `storage`); RLS on storage.objects is already
-- enabled by Supabase and is owned by the storage service, so it is not altered here.
--
-- Object naming convention (enforced by the policies):
--
--     <auth.uid()>/<anything>.<ext>
--
--   review-photos       <uid>/<review id>/<n>.jpg          public bucket
--   business-photos     <uid>/<business id>/<n>.jpg        public bucket
--   verification-docs   <uid>/<business id>/<file>.pdf     PRIVATE bucket
--
-- The first path segment is the uploader's user id. A user can create, replace, list and
-- delete objects only under their own id; that is the whole write rule for all three buckets.
-- What makes a file *appear in the app* is a row in review_photos / business_photos /
-- business_claims, and those tables have their own RLS (and require the path to start with the
-- caller's id), so uploading a file somewhere else achieves nothing.
--
-- Limits are enforced by Storage itself from the bucket row: 5 MB per object and an allow-list
-- of MIME types (JPEG / PNG / WebP — the same as IMAGE_TYPES / MAX_IMAGE_BYTES in
-- src/lib/schemas.ts; verification documents may also be PDF).
-- ════════════════════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('review-photos',     'review-photos',     true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('business-photos',   'business-photos',   true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop this app's policies (recognisable by the "nearme: " prefix) so the file can be re-run.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'nearme: %'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$$;

-- Reading.
-- The two photo buckets are public: files are served by URL without any policy. No SELECT
-- policy is granted to `anon`, so nobody can *list* other people's uploads through the API.
-- Signed-in users can read (and therefore list / overwrite) what is in their own folder.
create policy "nearme: read own objects" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Verification documents are private: besides the uploader, only administrators can read them
-- (the admin UI should use short-lived signed URLs). The same policy lets administrators see
-- objects in the photo buckets, which the Storage API requires before it lets them delete one.
create policy "nearme: admins read objects" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (select public.is_admin())
  );

-- Writing: only inside the caller's own <uid>/ folder.
create policy "nearme: upload into own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "nearme: replace own objects" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "nearme: delete own objects" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Moderation: administrators can remove any photo or document in these buckets.
create policy "nearme: admins delete objects" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('review-photos', 'business-photos', 'verification-docs')
    and (select public.is_admin())
  );
