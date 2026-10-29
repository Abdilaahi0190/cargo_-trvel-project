-- Rename abbreviated schema to readable names (tables, columns, dependent functions/matviews).
-- Triggers themselves do not need to be dropped/recreated: Postgres tracks them by OID, so
-- RENAME TABLE / RENAME COLUMN keeps triggers correctly attached automatically. Only trigger
-- FUNCTION BODIES that reference renamed identifiers by name need rewriting (see below).
BEGIN;

-- ==================== TABLE RENAMES ====================
ALTER TABLE public.accounts_transfer RENAME TO account_transfers;
ALTER TABLE public.address RENAME TO addresses;
ALTER TABLE public.branch RENAME TO branches;
ALTER TABLE public.employee_branch RENAME TO employee_branches;
ALTER TABLE public.employee_schedule RENAME TO employee_schedules;
ALTER TABLE public.employee_type RENAME TO employee_types;
ALTER TABLE public.expense_badged RENAME TO expense_badges;
ALTER TABLE public.expense_charged_badged RENAME TO expense_charged_badges;
ALTER TABLE public.salary RENAME TO salary_records;
ALTER TABLE public.salary_type RENAME TO salary_types;
ALTER TABLE public.shift RENAME TO shifts;
ALTER TABLE public.user_branch RENAME TO user_branches;
ALTER TABLE public.user_privilege RENAME TO user_privileges;

-- ==================== COLUMN RENAMES ====================
ALTER TABLE public.accounts RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.account_transfers RENAME COLUMN acc_tr_id TO account_transfer_id;
ALTER TABLE public.account_transfers RENAME COLUMN acc_from TO from_account_id;
ALTER TABLE public.account_transfers RENAME COLUMN acc_to TO to_account_id;
ALTER TABLE public.account_transfers RENAME COLUMN reasons TO reason;
ALTER TABLE public.addresses RENAME COLUMN add_id TO address_id;
ALTER TABLE public.branches RENAME COLUMN br_id TO branch_id;
ALTER TABLE public.branches RENAME COLUMN add_id TO address_id;
ALTER TABLE public.cargo RENAME COLUMN tracking_no TO tracking_number;
ALTER TABLE public.cargo RENAME COLUMN from_branch TO from_branch_id;
ALTER TABLE public.cargo RENAME COLUMN to_branch TO to_branch_id;
ALTER TABLE public.cargo RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.cargo_history RENAME COLUMN add_id TO address_id;
ALTER TABLE public.cargo_history RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.cargo_items RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.customers RENAME COLUMN add_id TO address_id;
ALTER TABLE public.customers RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.days RENAME COLUMN name TO day_name;
ALTER TABLE public.employee_attendance RENAME COLUMN emp_att_id TO employee_attendance_id;
ALTER TABLE public.employee_attendance RENAME COLUMN emp_sch_id TO employee_schedule_id;
ALTER TABLE public.employee_attendance RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.employee_branches RENAME COLUMN sh_id TO shift_id;
ALTER TABLE public.employee_branches RENAME COLUMN salary TO salary_amount;
ALTER TABLE public.employee_branches RENAME COLUMN sal_t_id TO salary_type_id;
ALTER TABLE public.employee_branches RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.employee_schedules RENAME COLUMN emp_sch_id TO employee_schedule_id;
ALTER TABLE public.employee_schedules RENAME COLUMN emp_id TO employee_id;
ALTER TABLE public.employee_schedules RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.employee_types RENAME COLUMN emp_t_id TO employee_type_id;
ALTER TABLE public.employee_types RENAME COLUMN type TO type_name;
ALTER TABLE public.employees RENAME COLUMN amount TO base_salary;
ALTER TABLE public.employees RENAME COLUMN emp_t_id TO employee_type_id;
ALTER TABLE public.employees RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.expense_badges RENAME COLUMN exp_bd_id TO expense_badge_id;
ALTER TABLE public.expense_badges RENAME COLUMN exp_type_id TO expense_type_id;
ALTER TABLE public.expense_charged_badges RENAME COLUMN exp_ch_bd_id TO expense_charged_badge_id;
ALTER TABLE public.expense_charged_badges RENAME COLUMN exp_bd_id TO expense_badge_id;
ALTER TABLE public.expense_charged_badges RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.expense_charges RENAME COLUMN exp_charge_id TO expense_charge_id;
ALTER TABLE public.expense_charges RENAME COLUMN exp_type_id TO expense_type_id;
ALTER TABLE public.expense_charges RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.expense_payments RENAME COLUMN exp_payment_id TO expense_payment_id;
ALTER TABLE public.expense_payments RENAME COLUMN exp_charge_id TO expense_charge_id;
ALTER TABLE public.expense_payments RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.expense_types RENAME COLUMN exp_type_id TO expense_type_id;
ALTER TABLE public.jobs RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.menu_privileges RENAME COLUMN li_pr_id TO menu_privilege_id;
ALTER TABLE public.menu_privileges RENAME COLUMN pr_id TO privilege_id;
ALTER TABLE public.menu_privileges RENAME COLUMN name TO menu_name;
ALTER TABLE public.menu_privileges RENAME COLUMN href TO menu_url;
ALTER TABLE public.payments RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.privileges RENAME COLUMN pr_id TO privilege_id;
ALTER TABLE public.privileges RENAME COLUMN icon TO icon_class;
ALTER TABLE public.routes RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.salary_records RENAME COLUMN sal_id TO salary_id;
ALTER TABLE public.salary_records RENAME COLUMN emp_id TO employee_id;
ALTER TABLE public.salary_records RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.salary_charges RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.salary_payments RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.salary_types RENAME COLUMN sal_t_id TO salary_type_id;
ALTER TABLE public.salary_types RENAME COLUMN type TO type_name;
ALTER TABLE public.shifts RENAME COLUMN sh_id TO shift_id;
ALTER TABLE public.shifts RENAME COLUMN shift TO shift_name;
ALTER TABLE public.sub_privileges RENAME COLUMN sub_pr_id TO sub_privilege_id;
ALTER TABLE public.sub_privileges RENAME COLUMN li_pr_id TO menu_privilege_id;
ALTER TABLE public.sub_privileges RENAME COLUMN name TO action_name;
ALTER TABLE public.sub_privileges RENAME COLUMN code TO action_key;
ALTER TABLE public.trip_cargo RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.trips RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.user_branches RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.user_branches RENAME COLUMN u_id TO user_id;
ALTER TABLE public.user_branches RENAME COLUMN br_id TO branch_id;
ALTER TABLE public.user_privileges RENAME COLUMN u_pr_id TO user_privilege_id;
ALTER TABLE public.user_privileges RENAME COLUMN sub_pr_id TO sub_privilege_id;
ALTER TABLE public.user_privileges RENAME COLUMN u_br_id TO user_branch_id;
ALTER TABLE public.users RENAME COLUMN u_id TO user_id;
ALTER TABLE public.users RENAME COLUMN name TO full_name;

-- ==================== MATERIALIZED VIEWS (must drop before function rewrite is irrelevant, but must drop before ref'd columns disappear from underlying query plan cache; drop+recreate regardless) ====================
DROP MATERIALIZED VIEW IF EXISTS public.mv_daily_revenue;
DROP MATERIALIZED VIEW IF EXISTS public.mv_monthly_branch_profit;

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
 SELECT date(p.created_at) AS day,
    b.branch_id,
    b.branch_name,
    count(DISTINCT c.cargo_id) AS total_cargo,
    COALESCE(sum(p.amount), (0)::numeric) AS total_revenue
   FROM ((payments p
     JOIN cargo c ON ((c.cargo_id = p.cargo_id)))
     JOIN branches b ON ((b.branch_id = c.from_branch_id)))
  WHERE ((p.deleted = false) AND (c.deleted = false) AND (b.deleted = false))
  GROUP BY (date(p.created_at)), b.branch_id, b.branch_name;

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk ON public.mv_daily_revenue (day, branch_id);

CREATE MATERIALIZED VIEW public.mv_monthly_branch_profit AS
 WITH monthly_revenue AS (
         SELECT (date_trunc('month'::text, p.created_at))::date AS month,
            c.from_branch_id AS branch_id,
            sum(p.amount) AS total_revenue
           FROM (payments p
             JOIN cargo c ON ((c.cargo_id = p.cargo_id)))
          WHERE ((p.deleted = false) AND (c.deleted = false))
          GROUP BY ((date_trunc('month'::text, p.created_at))::date), c.from_branch_id
        ), monthly_expenses AS (
         SELECT (date_trunc('month'::text, ec.created_at))::date AS month,
            ub.branch_id,
            sum(ec.amount) AS total_expenses
           FROM (expense_charges ec
             JOIN user_branches ub ON ((ub.user_branch_id = ec.user_branch_id)))
          WHERE (ec.deleted = false)
          GROUP BY ((date_trunc('month'::text, ec.created_at))::date), ub.branch_id
        )
 SELECT r.month,
    r.branch_id,
    b.branch_name,
    COALESCE(r.total_revenue, (0)::numeric) AS total_revenue,
    COALESCE(e.total_expenses, (0)::numeric) AS total_expenses,
    (COALESCE(r.total_revenue, (0)::numeric) - COALESCE(e.total_expenses, (0)::numeric)) AS profit
   FROM ((monthly_revenue r
     JOIN branches b ON ((b.branch_id = r.branch_id)))
     LEFT JOIN monthly_expenses e ON (((e.branch_id = r.branch_id) AND (e.month = r.month))))
  WHERE (b.deleted = false);

CREATE UNIQUE INDEX idx_mv_monthly_branch_profit_pk ON public.mv_monthly_branch_profit (month, branch_id);

-- ==================== FUNCTION REWRITES ====================
-- Only functions whose SQL body references renamed identifiers by name need updating.
-- (fn_audit_generic, fn_auto_create_invoice, fn_cargo_soft_delete_cascade, fn_set_created_by,
--  fn_set_update_time, fn_set_updated_at, current_app_user_id do not reference any renamed
--  identifier and are left untouched.)

CREATE OR REPLACE FUNCTION public.fn_branch_profit(p_branch_id integer, p_month date DEFAULT NULL::date) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT
    COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      JOIN cargo c ON c.cargo_id = p.cargo_id
      WHERE c.from_branch_id = p_branch_id
        AND p.deleted = FALSE
        AND (p_month IS NULL OR date_trunc('month', p.created_at) = date_trunc('month', p_month::timestamptz))
    ), 0)
    - COALESCE((
      SELECT SUM(ec.amount)
      FROM expense_charges ec
      JOIN user_branches ub ON ub.user_branch_id = ec.user_branch_id
      WHERE ub.branch_id = p_branch_id
        AND ec.deleted = FALSE
        AND (p_month IS NULL OR date_trunc('month', ec.created_at) = date_trunc('month', p_month::timestamptz))
    ), 0);
$$;

CREATE OR REPLACE FUNCTION public.fn_daily_revenue(p_date date DEFAULT NULL::date) RETURNS TABLE(day date, branch_id integer, branch_name text, total_cargo bigint, total_revenue numeric)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    date(p.created_at)             AS day,
    b.branch_id                    AS branch_id,
    b.branch_name::TEXT            AS branch_name,
    COUNT(DISTINCT c.cargo_id)     AS total_cargo,
    COALESCE(SUM(p.amount), 0)     AS total_revenue
  FROM payments p
  JOIN cargo  c ON c.cargo_id  = p.cargo_id
  JOIN branches b ON b.branch_id = c.from_branch_id
  WHERE p.deleted = FALSE
    AND c.deleted = FALSE
    AND b.deleted = FALSE
    AND (p_date IS NULL OR date(p.created_at) = p_date)
  GROUP BY date(p.created_at), b.branch_id, b.branch_name
  ORDER BY day DESC, branch_name;
$$;

CREATE OR REPLACE FUNCTION public.fn_notify_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        INSERT INTO notifications(user_id, cargo_id, title, message, channel_id)
        SELECT ub.user_id, NEW.cargo_id, 'Cargo Status Update',
               format('Your cargo %s has a new status update.',
                      (SELECT tracking_number FROM cargo WHERE cargo_id = NEW.cargo_id)),
               (SELECT channel_id FROM notification_channels WHERE name = 'email' LIMIT 1)
        FROM cargo c
        JOIN user_branches ub ON c.user_branch_id = ub.user_branch_id
        WHERE c.cargo_id = NEW.cargo_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_user_has_privilege(p_u_id integer, p_permission_code character varying) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_privileges up
        JOIN sub_privileges sp ON up.sub_privilege_id = sp.sub_privilege_id
        JOIN user_branches    ub ON up.user_branch_id  = ub.user_branch_id
        WHERE ub.user_id  = p_u_id
          AND sp.action_key = p_permission_code
          AND up.state   = 'active'
          AND up.deleted = FALSE
          AND ub.deleted = FALSE
    );
$$;

COMMIT;
