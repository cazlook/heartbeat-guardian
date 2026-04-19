-- Drop the broad SELECT policy: when bucket is marked public, files
-- remain reachable via /object/public/avatars/... without any policy,
-- but listing the bucket via storage.objects SELECT is now disallowed.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;