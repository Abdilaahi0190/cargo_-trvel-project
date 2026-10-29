-- Remove the dormant fine-grained per-user privilege system.
--
-- `privileges` / `menu_privileges` / `sub_privileges` / `user_privileges` and
-- fn_user_has_privilege() were leftover scaffolding from a pre-simplification RBAC
-- design. The application now uses a two-role (Admin/Employee) model driven entirely
-- by ROLE_PRIVILEGES in backend/src/config/rbac.js + frontend/src/config/rbac.js —
-- checkPrivilege() never consults these tables, and fn_user_has_privilege() is never
-- called from application code. Two of the three JS endpoints that touched this system
-- (assignPrivilege/revokePrivilege) called Postgres functions sp_assign_privilege /
-- sp_revoke_privilege that do not exist on this database, so they were already broken.
--
-- Dropped bottom-up through the FK chain: user_privileges -> sub_privileges ->
-- menu_privileges -> privileges.
BEGIN;

DROP TABLE IF EXISTS public.user_privileges;
DROP TABLE IF EXISTS public.sub_privileges;
DROP TABLE IF EXISTS public.menu_privileges;
DROP TABLE IF EXISTS public.privileges;

DROP FUNCTION IF EXISTS public.fn_user_has_privilege(integer, character varying);

COMMIT;
