--
-- PostgreSQL database dump
--

\restrict hu7S0gns1XisfgE6f8EOtsBwItrAjkSUFDXiexqIqTGbqDyssPOvfZ4lTYDlDt7

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gin; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;


--
-- Name: EXTENSION btree_gin; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gin IS 'support for indexing common datatypes in GIN';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: employee_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employee_status_enum AS ENUM (
    'active',
    'inactive'
);


--
-- Name: expense_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expense_status_enum AS ENUM (
    'pending',
    'paid'
);


--
-- Name: payment_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_type_enum AS ENUM (
    'cash',
    'bank',
    'mobile'
);


--
-- Name: privilege_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.privilege_state AS ENUM (
    'active',
    'inactive'
);


--
-- Name: provider_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.provider_status_enum AS ENUM (
    'active',
    'inactive'
);


--
-- Name: provider_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.provider_type_enum AS ENUM (
    'truck',
    'ship',
    'plane'
);


--
-- Name: salary_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.salary_status_enum AS ENUM (
    'pending',
    'paid'
);


--
-- Name: sub_privilege_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sub_privilege_state AS ENUM (
    'active',
    'inactive'
);


--
-- Name: trip_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trip_status_enum AS ENUM (
    'planned',
    'ongoing',
    'completed',
    'cancelled'
);


--
-- Name: user_privilege_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_privilege_state AS ENUM (
    'active',
    'revoked'
);


--
-- Name: user_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_state AS ENUM (
    'active',
    'inactive'
);


--
-- Name: current_app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user_id() RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT NULLIF(current_setting('myapp.user_id', TRUE), '')::INT;
$$;


--
-- Name: fn_audit_generic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_audit_generic() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
    pk_col       TEXT;
    v_record_id  INT;
    v_user_id    INT := current_app_user_id();
    v_desc       TEXT;
BEGIN
    SELECT a.attname INTO pk_col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = TG_RELID AND i.indisprimary
    LIMIT 1;

    IF TG_OP = 'DELETE' THEN
        EXECUTE format('SELECT ($1).%I', pk_col) INTO v_record_id USING OLD;
        v_desc := format('DELETE: %s', row_to_json(OLD));
        INSERT INTO system_logs(user_id, action, table_name, record_id, description, ip_address)
        VALUES (v_user_id, 'DELETE', TG_TABLE_NAME, v_record_id, v_desc, inet_client_addr()::varchar);
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        EXECUTE format('SELECT ($1).%I', pk_col) INTO v_record_id USING NEW;
        v_desc := format('INSERT: %s', row_to_json(NEW));
    ELSE
        EXECUTE format('SELECT ($1).%I', pk_col) INTO v_record_id USING NEW;
        v_desc := format('OLD: %s NEW: %s', row_to_json(OLD), row_to_json(NEW));
    END IF;

    INSERT INTO system_logs(user_id, action, table_name, record_id, description, ip_address)
    VALUES (v_user_id, TG_OP, TG_TABLE_NAME, v_record_id, v_desc, inet_client_addr()::varchar);
    RETURN NEW;
END;
$_$;


--
-- Name: fn_auto_create_invoice(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_auto_create_invoice() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO invoices(cargo_id, due_date, subtotal, tax_amount, total_amount)
    VALUES (NEW.cargo_id, CURRENT_DATE + 7, COALESCE(NEW.price, 0), 0, COALESCE(NEW.price, 0));
    RETURN NEW;
END;
$$;


--
-- Name: fn_branch_profit(integer, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_branch_profit(p_branch_id integer, p_month date DEFAULT NULL::date) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT
    COALESCE((
      SELECT SUM(p.amount)
      FROM payments p
      JOIN cargo c ON c.cargo_id = p.cargo_id
      WHERE c.from_branch = p_branch_id
        AND p.deleted = FALSE
        AND (p_month IS NULL OR date_trunc('month', p.created_at) = date_trunc('month', p_month::timestamptz))
    ), 0)
    - COALESCE((
      SELECT SUM(ec.amount)
      FROM expense_charges ec
      JOIN user_branch ub ON ub.u_br_id = ec.u_br_id
      WHERE ub.br_id = p_branch_id
        AND ec.deleted = FALSE
        AND (p_month IS NULL OR date_trunc('month', ec.created_at) = date_trunc('month', p_month::timestamptz))
    ), 0);
$$;


--
-- Name: fn_cargo_soft_delete_cascade(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_cargo_soft_delete_cascade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.deleted = TRUE AND OLD.deleted = FALSE THEN
        UPDATE cargo_items SET deleted = TRUE WHERE cargo_id = NEW.cargo_id;
        UPDATE trip_cargo SET deleted = TRUE WHERE cargo_id = NEW.cargo_id;
        UPDATE cargo_tracking SET note = COALESCE(note,'') || ' [DELETED]'
        WHERE cargo_id = NEW.cargo_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_daily_revenue(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_daily_revenue(p_date date DEFAULT NULL::date) RETURNS TABLE(day date, branch_id integer, branch_name text, total_cargo bigint, total_revenue numeric)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    date(p.created_at)             AS day,
    b.br_id                        AS branch_id,
    b.branch_name::TEXT            AS branch_name,
    COUNT(DISTINCT c.cargo_id)     AS total_cargo,
    COALESCE(SUM(p.amount), 0)     AS total_revenue
  FROM payments p
  JOIN cargo  c ON c.cargo_id  = p.cargo_id
  JOIN branch b ON b.br_id     = c.from_branch
  WHERE p.deleted = FALSE
    AND c.deleted = FALSE
    AND b.deleted = FALSE
    AND (p_date IS NULL OR date(p.created_at) = p_date)
  GROUP BY date(p.created_at), b.br_id, b.branch_name
  ORDER BY day DESC, branch_name;
$$;


--
-- Name: fn_notify_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_notify_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
        INSERT INTO notifications(user_id, cargo_id, title, message, channel_id)
        SELECT ub.u_id, NEW.cargo_id, 'Cargo Status Update',
               format('Your cargo %s has a new status update.',
                      (SELECT tracking_no FROM cargo WHERE cargo_id = NEW.cargo_id)),
               (SELECT channel_id FROM notification_channels WHERE name = 'email' LIMIT 1)
        FROM cargo c
        JOIN user_branch ub ON c.u_br_id = ub.u_br_id
        WHERE c.cargo_id = NEW.cargo_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_set_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_created_by() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.created_by IS NULL THEN
        NEW.created_by := current_app_user_id();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: fn_set_update_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_update_time() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.update_time = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: fn_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: fn_user_has_privilege(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_user_has_privilege(p_u_id integer, p_permission_code character varying) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_privilege up
        JOIN sub_privileges sp ON up.sub_pr_id = sp.sub_pr_id
        JOIN user_branch    ub ON up.u_br_id   = ub.u_br_id
        WHERE ub.u_id    = p_u_id
          AND sp.code    = p_permission_code
          AND up.state   = 'active'
          AND up.deleted = FALSE
          AND ub.deleted = FALSE
    );
$$;


--
-- Name: refresh_reporting_mviews(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_reporting_mviews() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_branch_profit;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    account_id integer NOT NULL,
    name character varying(100) NOT NULL,
    institution_type character varying(50),
    balance numeric(15,2) DEFAULT 0 NOT NULL,
    branch_id integer NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: accounts_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accounts ALTER COLUMN account_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.accounts_account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: accounts_transfer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts_transfer (
    acc_tr_id integer NOT NULL,
    acc_from integer NOT NULL,
    acc_to integer NOT NULL,
    amount numeric(15,2) NOT NULL,
    reasons text,
    user_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT accounts_transfer_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: accounts_transfer_acc_tr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.accounts_transfer ALTER COLUMN acc_tr_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.accounts_transfer_acc_tr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.address (
    add_id integer NOT NULL,
    city_id integer NOT NULL,
    location_name character varying(200),
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: address_add_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.address ALTER COLUMN add_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.address_add_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: api_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_logs (
    log_id integer NOT NULL,
    user_id integer,
    endpoint character varying(255) NOT NULL,
    method character varying(10) NOT NULL,
    request_body text,
    response_status integer,
    response_body text,
    ip_address inet,
    duration_ms integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: api_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.api_logs ALTER COLUMN log_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.api_logs_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: branch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branch (
    br_id integer NOT NULL,
    branch_name character varying(100) NOT NULL,
    manager_name character varying(100),
    manager_tel character varying(20),
    banner_tel character varying(20),
    add_id integer NOT NULL,
    br_email character varying(100),
    fg_message text,
    banner_img character varying(255),
    logo_img character varying(255),
    latitude numeric(10,6),
    longitude numeric(10,6),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: branch_br_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.branch ALTER COLUMN br_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.branch_br_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: seq_tracking_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_tracking_no
    START WITH 100000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cargo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo (
    cargo_id integer NOT NULL,
    tracking_no character varying(50) DEFAULT concat('CRG', nextval('public.seq_tracking_no'::regclass)) NOT NULL,
    sender_id integer NOT NULL,
    receiver_id integer,
    from_branch integer NOT NULL,
    to_branch integer NOT NULL,
    weight numeric(10,2),
    price numeric(12,2),
    rate_type character varying(10),
    rate_per_kg numeric(10,2),
    extra_charges numeric(10,2) DEFAULT 0 NOT NULL,
    paid_origin numeric(10,2) DEFAULT 0 NOT NULL,
    payment_received_amount numeric(12,2) DEFAULT 0 NOT NULL,
    shipment_date date,
    fly_name character varying(120),
    fly_awb_no character varying(100),
    mark character varying(100),
    pcs integer DEFAULT 1 NOT NULL,
    description text,
    current_status_id integer NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    receiver_name_manual character varying(150),
    receiver_phone_manual character varying(30),
    receiver_address_manual text,
    receiver_city_manual character varying(100),
    receiver_country_manual character varying(100),
    CONSTRAINT cargo_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT cargo_receiver_required CHECK (((receiver_id IS NOT NULL) OR (receiver_name_manual IS NOT NULL))),
    CONSTRAINT cargo_weight_check CHECK ((weight > (0)::numeric))
);


--
-- Name: cargo_cargo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo ALTER COLUMN cargo_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_cargo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_charges (
    charge_id integer NOT NULL,
    cargo_id integer NOT NULL,
    charge_name character varying(150) NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT cargo_charges_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: cargo_charges_charge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo_charges ALTER COLUMN charge_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_charges_charge_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_history (
    history_id integer NOT NULL,
    cargo_id integer NOT NULL,
    status_id integer NOT NULL,
    add_id integer,
    u_br_id integer NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
)
PARTITION BY RANGE (created_at);


--
-- Name: cargo_history_2025; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_history_2025 (
    history_id integer CONSTRAINT cargo_history_history_id_not_null NOT NULL,
    cargo_id integer CONSTRAINT cargo_history_cargo_id_not_null NOT NULL,
    status_id integer CONSTRAINT cargo_history_status_id_not_null NOT NULL,
    add_id integer,
    u_br_id integer CONSTRAINT cargo_history_u_br_id_not_null NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT cargo_history_created_at_not_null NOT NULL
);


--
-- Name: cargo_history_2026; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_history_2026 (
    history_id integer CONSTRAINT cargo_history_history_id_not_null NOT NULL,
    cargo_id integer CONSTRAINT cargo_history_cargo_id_not_null NOT NULL,
    status_id integer CONSTRAINT cargo_history_status_id_not_null NOT NULL,
    add_id integer,
    u_br_id integer CONSTRAINT cargo_history_u_br_id_not_null NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT cargo_history_created_at_not_null NOT NULL
);


--
-- Name: cargo_history_2027; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_history_2027 (
    history_id integer CONSTRAINT cargo_history_history_id_not_null NOT NULL,
    cargo_id integer CONSTRAINT cargo_history_cargo_id_not_null NOT NULL,
    status_id integer CONSTRAINT cargo_history_status_id_not_null NOT NULL,
    add_id integer,
    u_br_id integer CONSTRAINT cargo_history_u_br_id_not_null NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT cargo_history_created_at_not_null NOT NULL
);


--
-- Name: cargo_history_2028; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_history_2028 (
    history_id integer CONSTRAINT cargo_history_history_id_not_null NOT NULL,
    cargo_id integer CONSTRAINT cargo_history_cargo_id_not_null NOT NULL,
    status_id integer CONSTRAINT cargo_history_status_id_not_null NOT NULL,
    add_id integer,
    u_br_id integer CONSTRAINT cargo_history_u_br_id_not_null NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT cargo_history_created_at_not_null NOT NULL
);


--
-- Name: cargo_history_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_history_archive (
    history_id integer CONSTRAINT cargo_history_history_id_not_null NOT NULL,
    cargo_id integer CONSTRAINT cargo_history_cargo_id_not_null NOT NULL,
    status_id integer CONSTRAINT cargo_history_status_id_not_null NOT NULL,
    add_id integer,
    u_br_id integer CONSTRAINT cargo_history_u_br_id_not_null NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT cargo_history_created_at_not_null NOT NULL
);


--
-- Name: cargo_history_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo_history ALTER COLUMN history_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_history_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_insurance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_insurance (
    insurance_id integer NOT NULL,
    cargo_id integer NOT NULL,
    provider_id integer NOT NULL,
    policy_number character varying(50),
    insured_value numeric(12,2) NOT NULL,
    premium_paid numeric(12,2) NOT NULL,
    claim_status character varying(20) DEFAULT 'none'::character varying NOT NULL,
    claim_amount numeric(12,2),
    claim_date date,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cargo_insurance_insurance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo_insurance ALTER COLUMN insurance_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_insurance_insurance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_items (
    item_id integer NOT NULL,
    cargo_id integer NOT NULL,
    item_name character varying(100),
    quantity integer DEFAULT 1 NOT NULL,
    weight numeric(10,2),
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT cargo_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: cargo_items_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo_items ALTER COLUMN item_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_items_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_status (
    status_id integer NOT NULL,
    status_name character varying(50) NOT NULL
);


--
-- Name: cargo_status_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo_status ALTER COLUMN status_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_status_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cargo_tracking (
    track_id integer NOT NULL,
    cargo_id integer NOT NULL,
    status_id integer NOT NULL,
    branch_id integer NOT NULL,
    location character varying(255),
    note text,
    updated_by integer,
    update_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: cargo_tracking_track_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cargo_tracking ALTER COLUMN track_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cargo_tracking_track_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    city_id integer NOT NULL,
    city_name character varying(100) NOT NULL,
    state_region character varying(100),
    country character varying(100) DEFAULT 'Somalia'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: cities_city_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cities ALTER COLUMN city_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cities_city_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    customer_id integer NOT NULL,
    full_name character varying(150) NOT NULL,
    phone character varying(20) NOT NULL,
    add_id integer,
    u_br_id integer NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, (((full_name)::text || ' '::text) || (COALESCE(phone, ''::character varying))::text))) STORED,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    customer_type character varying(20) DEFAULT 'regular'::character varying NOT NULL
);


--
-- Name: COLUMN customers.customer_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.customer_type IS 'regular, one_time, vip';


--
-- Name: customers_customer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.customers ALTER COLUMN customer_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.customers_customer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.days (
    day_id integer NOT NULL,
    name character varying(20) NOT NULL,
    day_of_week integer NOT NULL,
    code character varying(10) NOT NULL,
    CONSTRAINT days_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7)))
);


--
-- Name: days_day_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.days ALTER COLUMN day_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.days_day_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dispute_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_types (
    dispute_type_id integer NOT NULL,
    name character varying(50) NOT NULL
);


--
-- Name: dispute_types_dispute_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.dispute_types ALTER COLUMN dispute_type_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dispute_types_dispute_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disputes (
    dispute_id integer NOT NULL,
    cargo_id integer NOT NULL,
    customer_id integer NOT NULL,
    dispute_type_id integer NOT NULL,
    description text NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    resolution text,
    refund_amount numeric(12,2),
    resolved_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: disputes_dispute_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.disputes ALTER COLUMN dispute_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.disputes_dispute_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employee_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_attendance (
    emp_att_id integer NOT NULL,
    emp_sch_id integer,
    day_id integer,
    time_in time without time zone,
    time_out time without time zone,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    attendance_date date NOT NULL,
    status character varying(20) DEFAULT 'present'::character varying NOT NULL,
    notes text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    employee_id integer NOT NULL,
    CONSTRAINT chk_ea_status CHECK (((status)::text = ANY ((ARRAY['present'::character varying, 'late'::character varying, 'absent'::character varying, 'leave'::character varying, 'sick_leave'::character varying, 'overtime'::character varying])::text[])))
);


--
-- Name: employee_attendance_emp_att_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employee_attendance ALTER COLUMN emp_att_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employee_attendance_emp_att_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employee_branch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_branch (
    employee_branch_id integer NOT NULL,
    employee_id integer NOT NULL,
    branch_id integer NOT NULL,
    sh_id integer,
    salary numeric(12,2),
    sal_t_id integer,
    status public.employee_status_enum DEFAULT 'active'::public.employee_status_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    CONSTRAINT chk_eb_effective_dates CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)))
);


--
-- Name: employee_branch_employee_branch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employee_branch ALTER COLUMN employee_branch_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employee_branch_employee_branch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employee_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_schedule (
    emp_sch_id integer NOT NULL,
    emp_id integer NOT NULL,
    day_id integer NOT NULL,
    time_in time without time zone,
    time_out time without time zone,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    break_start time without time zone,
    break_end time without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: employee_schedule_emp_sch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employee_schedule ALTER COLUMN emp_sch_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employee_schedule_emp_sch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employee_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_type (
    emp_t_id integer NOT NULL,
    type character varying(50) NOT NULL
);


--
-- Name: employee_type_emp_t_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employee_type ALTER COLUMN emp_t_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employee_type_emp_t_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    employee_id integer NOT NULL,
    phone character varying(20),
    email character varying(100),
    job_id integer NOT NULL,
    amount numeric(12,2),
    sl_t_id integer,
    emp_t_id integer,
    hire_date date,
    status public.employee_status_enum DEFAULT 'active'::public.employee_status_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    full_name character varying(150) GENERATED ALWAYS AS ((((first_name)::text || ' '::text) || (last_name)::text)) STORED
);


--
-- Name: employees_employee_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.employees ALTER COLUMN employee_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.employees_employee_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expense_badged; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_badged (
    exp_bd_id integer NOT NULL,
    exp_type_id integer NOT NULL,
    amount numeric(12,2),
    user_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: expense_badged_exp_bd_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expense_badged ALTER COLUMN exp_bd_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expense_badged_exp_bd_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expense_charged_badged; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_charged_badged (
    exp_ch_bd_id integer NOT NULL,
    exp_bd_id integer NOT NULL,
    charge_month date,
    description text,
    status public.expense_status_enum DEFAULT 'pending'::public.expense_status_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: expense_charged_badged_exp_ch_bd_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expense_charged_badged ALTER COLUMN exp_ch_bd_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expense_charged_badged_exp_ch_bd_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expense_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_charges (
    exp_charge_id integer NOT NULL,
    exp_type_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    charge_month date NOT NULL,
    description text,
    status public.expense_status_enum DEFAULT 'pending'::public.expense_status_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT expense_charges_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: expense_charges_exp_charge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expense_charges ALTER COLUMN exp_charge_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expense_charges_exp_charge_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expense_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_payments (
    exp_payment_id integer NOT NULL,
    exp_charge_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    phone character varying(20),
    account_id integer NOT NULL,
    description text,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT expense_payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: expense_payments_exp_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expense_payments ALTER COLUMN exp_payment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expense_payments_exp_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: expense_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_types (
    exp_type_id integer NOT NULL,
    name character varying(100) NOT NULL
);


--
-- Name: expense_types_exp_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.expense_types ALTER COLUMN exp_type_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.expense_types_exp_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: insurance_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_providers (
    provider_id integer NOT NULL,
    name character varying(100) NOT NULL,
    contact_phone character varying(20),
    rate_percent numeric(5,2)
);


--
-- Name: insurance_providers_provider_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.insurance_providers ALTER COLUMN provider_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.insurance_providers_provider_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: seq_invoice_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_invoice_no
    START WITH 50000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    invoice_id integer NOT NULL,
    cargo_id integer NOT NULL,
    invoice_number character varying(30) DEFAULT concat('INV-', nextval('public.seq_invoice_no'::regclass)),
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    tax_percent numeric(5,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'unpaid'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.invoices ALTER COLUMN invoice_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.invoices_invoice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    job_id integer NOT NULL,
    job_title character varying(100) NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    job_code character varying(20) NOT NULL,
    description text,
    min_salary numeric(12,2),
    max_salary numeric(12,2),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer
);


--
-- Name: jobs_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.jobs ALTER COLUMN job_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.jobs_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: menu_privileges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_privileges (
    li_pr_id integer NOT NULL,
    pr_id integer NOT NULL,
    name character varying(100) NOT NULL,
    href character varying(255),
    state public.privilege_state DEFAULT 'active'::public.privilege_state NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: menu_privileges_li_pr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.menu_privileges ALTER COLUMN li_pr_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.menu_privileges_li_pr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    payment_id integer NOT NULL,
    cargo_id integer NOT NULL,
    account_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_type public.payment_type_enum DEFAULT 'cash'::public.payment_type_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: mv_daily_revenue; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_revenue AS
 SELECT date(p.created_at) AS day,
    b.br_id AS branch_id,
    b.branch_name,
    count(DISTINCT c.cargo_id) AS total_cargo,
    COALESCE(sum(p.amount), (0)::numeric) AS total_revenue
   FROM ((public.payments p
     JOIN public.cargo c ON ((c.cargo_id = p.cargo_id)))
     JOIN public.branch b ON ((b.br_id = c.from_branch)))
  WHERE ((p.deleted = false) AND (c.deleted = false) AND (b.deleted = false))
  GROUP BY (date(p.created_at)), b.br_id, b.branch_name
  WITH NO DATA;


--
-- Name: user_branch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_branch (
    u_br_id integer NOT NULL,
    u_id integer NOT NULL,
    br_id integer NOT NULL,
    state public.user_state DEFAULT 'active'::public.user_state NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: mv_monthly_branch_profit; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_monthly_branch_profit AS
 WITH monthly_revenue AS (
         SELECT (date_trunc('month'::text, p.created_at))::date AS month,
            c.from_branch AS branch_id,
            sum(p.amount) AS total_revenue
           FROM (public.payments p
             JOIN public.cargo c ON ((c.cargo_id = p.cargo_id)))
          WHERE ((p.deleted = false) AND (c.deleted = false))
          GROUP BY ((date_trunc('month'::text, p.created_at))::date), c.from_branch
        ), monthly_expenses AS (
         SELECT (date_trunc('month'::text, ec.created_at))::date AS month,
            ub.br_id AS branch_id,
            sum(ec.amount) AS total_expenses
           FROM (public.expense_charges ec
             JOIN public.user_branch ub ON ((ub.u_br_id = ec.u_br_id)))
          WHERE (ec.deleted = false)
          GROUP BY ((date_trunc('month'::text, ec.created_at))::date), ub.br_id
        )
 SELECT r.month,
    r.branch_id,
    b.branch_name,
    COALESCE(r.total_revenue, (0)::numeric) AS total_revenue,
    COALESCE(e.total_expenses, (0)::numeric) AS total_expenses,
    (COALESCE(r.total_revenue, (0)::numeric) - COALESCE(e.total_expenses, (0)::numeric)) AS profit
   FROM ((monthly_revenue r
     JOIN public.branch b ON ((b.br_id = r.branch_id)))
     LEFT JOIN monthly_expenses e ON (((e.branch_id = r.branch_id) AND (e.month = r.month))))
  WHERE (b.deleted = false)
  WITH NO DATA;


--
-- Name: notification_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_channels (
    channel_id integer NOT NULL,
    name character varying(20) NOT NULL
);


--
-- Name: notification_channels_channel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notification_channels ALTER COLUMN channel_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notification_channels_channel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    notification_id integer NOT NULL,
    user_id integer,
    cargo_id integer,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    channel_id integer,
    sent boolean DEFAULT false NOT NULL,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notifications ALTER COLUMN notification_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notifications_notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payments ALTER COLUMN payment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: privileges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privileges (
    pr_id integer NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(50),
    state public.privilege_state DEFAULT 'active'::public.privilege_state NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: privileges_pr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.privileges ALTER COLUMN pr_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.privileges_pr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    role_id integer NOT NULL,
    role_name character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: roles_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles ALTER COLUMN role_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.roles_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    route_id integer NOT NULL,
    from_branch_id integer NOT NULL,
    to_branch_id integer NOT NULL,
    distance_km numeric(8,2),
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_routes_different_branches CHECK ((from_branch_id <> to_branch_id)),
    CONSTRAINT routes_branch_check CHECK ((from_branch_id <> to_branch_id))
);


--
-- Name: routes_route_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.routes ALTER COLUMN route_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.routes_route_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary (
    sal_id integer NOT NULL,
    emp_id integer NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: salary_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_adjustments (
    adjustment_id integer NOT NULL,
    employee_branch_id integer NOT NULL,
    month date NOT NULL,
    overtime_hours numeric(5,2) DEFAULT 0 NOT NULL,
    overtime_rate numeric(10,2) DEFAULT 0 NOT NULL,
    bonus numeric(12,2) DEFAULT 0 NOT NULL,
    penalty numeric(12,2) DEFAULT 0 NOT NULL,
    notes text
);


--
-- Name: salary_adjustments_adjustment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.salary_adjustments ALTER COLUMN adjustment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.salary_adjustments_adjustment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salary_charges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_charges (
    salary_charge_id integer NOT NULL,
    employee_branch_id integer NOT NULL,
    salary_month date NOT NULL,
    salary_amount numeric(12,2) NOT NULL,
    commission numeric(12,2) DEFAULT 0 NOT NULL,
    decrease numeric(12,2) DEFAULT 0 NOT NULL,
    status public.salary_status_enum DEFAULT 'pending'::public.salary_status_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: salary_charges_salary_charge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.salary_charges ALTER COLUMN salary_charge_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.salary_charges_salary_charge_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_payments (
    salary_payment_id integer NOT NULL,
    salary_charge_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    send_phone character varying(20),
    account_id integer NOT NULL,
    description text,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: salary_payments_salary_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.salary_payments ALTER COLUMN salary_payment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.salary_payments_salary_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salary_sal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.salary ALTER COLUMN sal_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.salary_sal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salary_tax_brackets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_tax_brackets (
    bracket_id integer NOT NULL,
    min_amount numeric(12,2) NOT NULL,
    max_amount numeric(12,2) NOT NULL,
    tax_rate numeric(5,2) NOT NULL
);


--
-- Name: salary_tax_brackets_bracket_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.salary_tax_brackets ALTER COLUMN bracket_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.salary_tax_brackets_bracket_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: salary_type; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_type (
    sal_t_id integer NOT NULL,
    type character varying(50) NOT NULL
);


--
-- Name: salary_type_sal_t_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.salary_type ALTER COLUMN sal_t_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.salary_type_sal_t_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: seq_trip_no; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_trip_no
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift (
    sh_id integer NOT NULL,
    shift character varying(50) NOT NULL
);


--
-- Name: shift_sh_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shift ALTER COLUMN sh_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shift_sh_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sub_privileges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sub_privileges (
    sub_pr_id integer NOT NULL,
    li_pr_id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(50),
    state public.sub_privilege_state DEFAULT 'active'::public.sub_privilege_state NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sub_privileges_sub_pr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.sub_privileges ALTER COLUMN sub_pr_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.sub_privileges_sub_pr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: system_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs (
    log_id integer NOT NULL,
    user_id integer,
    action character varying(50) NOT NULL,
    table_name character varying(100),
    record_id integer,
    description text,
    ip_address character varying(45),
    log_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
)
PARTITION BY RANGE (log_time);


--
-- Name: system_logs_2025; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs_2025 (
    log_id integer CONSTRAINT system_logs_log_id_not_null NOT NULL,
    user_id integer,
    action character varying(50) CONSTRAINT system_logs_action_not_null NOT NULL,
    table_name character varying(100),
    record_id integer,
    description text,
    ip_address character varying(45),
    log_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT system_logs_log_time_not_null NOT NULL
);


--
-- Name: system_logs_2026; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs_2026 (
    log_id integer CONSTRAINT system_logs_log_id_not_null NOT NULL,
    user_id integer,
    action character varying(50) CONSTRAINT system_logs_action_not_null NOT NULL,
    table_name character varying(100),
    record_id integer,
    description text,
    ip_address character varying(45),
    log_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT system_logs_log_time_not_null NOT NULL
);


--
-- Name: system_logs_2027; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs_2027 (
    log_id integer CONSTRAINT system_logs_log_id_not_null NOT NULL,
    user_id integer,
    action character varying(50) CONSTRAINT system_logs_action_not_null NOT NULL,
    table_name character varying(100),
    record_id integer,
    description text,
    ip_address character varying(45),
    log_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT system_logs_log_time_not_null NOT NULL
);


--
-- Name: system_logs_2028; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_logs_2028 (
    log_id integer CONSTRAINT system_logs_log_id_not_null NOT NULL,
    user_id integer,
    action character varying(50) CONSTRAINT system_logs_action_not_null NOT NULL,
    table_name character varying(100),
    record_id integer,
    description text,
    ip_address character varying(45),
    log_time timestamp without time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT system_logs_log_time_not_null NOT NULL
);


--
-- Name: system_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.system_logs ALTER COLUMN log_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.system_logs_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: transport_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transport_providers (
    provider_id integer NOT NULL,
    name character varying(100) NOT NULL,
    provider_type public.provider_type_enum DEFAULT 'truck'::public.provider_type_enum NOT NULL,
    phone character varying(20),
    status public.provider_status_enum DEFAULT 'active'::public.provider_status_enum NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: transport_providers_provider_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transport_providers ALTER COLUMN provider_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.transport_providers_provider_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: trip_cargo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_cargo (
    trip_cargo_id integer NOT NULL,
    trip_id integer NOT NULL,
    cargo_id integer NOT NULL,
    transport_cost numeric(12,2),
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: trip_cargo_trip_cargo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.trip_cargo ALTER COLUMN trip_cargo_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.trip_cargo_trip_cargo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    trip_id integer NOT NULL,
    provider_id integer NOT NULL,
    route_id integer NOT NULL,
    trip_date date NOT NULL,
    departure_time time without time zone,
    arrival_time time without time zone,
    total_cost numeric(12,2) DEFAULT 0 NOT NULL,
    status public.trip_status_enum DEFAULT 'planned'::public.trip_status_enum NOT NULL,
    u_br_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL,
    notes text
);


--
-- Name: trips_trip_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.trips ALTER COLUMN trip_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.trips_trip_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_branch_u_br_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_branch ALTER COLUMN u_br_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_branch_u_br_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_privilege; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_privilege (
    u_pr_id integer NOT NULL,
    sub_pr_id integer NOT NULL,
    u_br_id integer NOT NULL,
    granted_by integer,
    state public.user_privilege_state DEFAULT 'active'::public.user_privilege_state NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: user_privilege_u_pr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_privilege ALTER COLUMN u_pr_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_privilege_u_pr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    u_id integer NOT NULL,
    external_id character varying(50),
    name character varying(100) NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    phone character varying(20),
    role_id integer NOT NULL,
    state public.user_state DEFAULT 'active'::public.user_state NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer,
    updated_by integer,
    deleted boolean DEFAULT false NOT NULL
);


--
-- Name: users_u_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.users ALTER COLUMN u_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.users_u_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cargo_history_2025; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history ATTACH PARTITION public.cargo_history_2025 FOR VALUES FROM ('2025-01-01 00:00:00') TO ('2026-01-01 00:00:00');


--
-- Name: cargo_history_2026; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history ATTACH PARTITION public.cargo_history_2026 FOR VALUES FROM ('2026-01-01 00:00:00') TO ('2027-01-01 00:00:00');


--
-- Name: cargo_history_2027; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history ATTACH PARTITION public.cargo_history_2027 FOR VALUES FROM ('2027-01-01 00:00:00') TO ('2028-01-01 00:00:00');


--
-- Name: cargo_history_2028; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history ATTACH PARTITION public.cargo_history_2028 FOR VALUES FROM ('2028-01-01 00:00:00') TO ('2029-01-01 00:00:00');


--
-- Name: system_logs_2025; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs ATTACH PARTITION public.system_logs_2025 FOR VALUES FROM ('2025-01-01 00:00:00') TO ('2026-01-01 00:00:00');


--
-- Name: system_logs_2026; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs ATTACH PARTITION public.system_logs_2026 FOR VALUES FROM ('2026-01-01 00:00:00') TO ('2027-01-01 00:00:00');


--
-- Name: system_logs_2027; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs ATTACH PARTITION public.system_logs_2027 FOR VALUES FROM ('2027-01-01 00:00:00') TO ('2028-01-01 00:00:00');


--
-- Name: system_logs_2028; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs ATTACH PARTITION public.system_logs_2028 FOR VALUES FROM ('2028-01-01 00:00:00') TO ('2029-01-01 00:00:00');


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts (account_id, name, institution_type, balance, branch_id, u_br_id, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
2	Bank Account	Bank	5000.00	1	1	2026-06-11 08:04:41.746673	2026-06-11 08:04:41.746673	1	\N	f
1	Cash Account	Bank	10010.00	1	1	2026-06-11 08:04:41.746673	2026-06-25 13:22:46.683549	1	\N	f
\.


--
-- Data for Name: accounts_transfer; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts_transfer (acc_tr_id, acc_from, acc_to, amount, reasons, user_id, created_at) FROM stdin;
1	1	2	1000.00	Initial transfer	1	2026-06-11 08:04:41.746673
\.


--
-- Data for Name: address; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.address (add_id, city_id, location_name, description, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
34	34	\N	\N	2026-06-23 05:22:46.159019	2026-06-23 10:59:10.116182	\N	\N	t
35	35	Dubai Branch Location	Waafi Cargo Dubai Office	2026-06-23 10:59:10.116182	2026-06-23 10:59:10.116182	\N	\N	f
36	36	\N	\N	2026-06-23 11:02:59.418003	2026-06-23 11:06:53.332386	\N	\N	t
1	1	Mogadishu Branch Location	Central office in Mogadishu	2026-06-11 08:04:41.746673	2026-06-23 11:06:53.332386	1	1	f
37	1	Airport Area	Near main airport terminal	2026-06-26 08:36:51.915532	2026-06-26 08:36:51.915532	\N	\N	f
38	94	Westlands	\N	2026-06-27 00:39:38.408793	2026-06-27 00:39:38.408793	\N	\N	f
\.


--
-- Data for Name: api_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.api_logs (log_id, user_id, endpoint, method, request_body, response_status, response_body, ip_address, duration_ms, created_at) FROM stdin;
1	\N	/api/auth/login	POST	\N	401	\N	::1	99	2026-06-19 09:42:17.679307
2	\N	/api/auth/login	POST	\N	401	\N	::1	41	2026-06-19 09:43:39.735419
3	\N	/api/auth/login	POST	\N	401	\N	::1	54	2026-06-19 09:44:51.622261
4	\N	/api/auth/login	POST	\N	401	\N	::1	42	2026-06-19 09:56:55.941432
5	\N	/api/auth/login	POST	\N	401	\N	::1	59	2026-06-19 09:57:21.081043
6	\N	/api/auth/login	POST	\N	401	\N	::1	44	2026-06-19 10:06:25.015493
7	\N	/api/auth/login	POST	\N	403	\N	::1	47	2026-06-19 10:32:49.212905
8	\N	/api/auth/login	POST	\N	401	\N	::1	176	2026-06-19 10:34:10.142912
9	\N	/api/auth/login	POST	\N	401	\N	::1	58	2026-06-19 10:54:01.133337
10	\N	/api/auth/login	POST	\N	401	\N	::1	49	2026-06-19 10:54:40.946438
11	\N	/api/auth/login	POST	\N	401	\N	::1	53	2026-06-19 10:56:48.631969
12	\N	/api/auth/login	POST	\N	401	\N	::1	22	2026-06-19 11:00:44.271731
13	\N	/api/auth/login	POST	\N	401	\N	::1	12	2026-06-19 11:00:49.359266
14	\N	/api/auth/login	POST	\N	401	\N	::1	67	2026-06-19 11:01:22.692224
15	\N	/api/auth/login	POST	\N	401	\N	::1	61	2026-06-19 11:05:19.224324
16	\N	/api/auth/login	POST	\N	401	\N	::1	172	2026-06-19 11:05:37.129263
17	\N	/api/auth/login	POST	\N	401	\N	::1	74	2026-06-19 11:13:35.521977
18	\N	/api/auth/login	POST	\N	401	\N	::1	53	2026-06-19 11:18:05.395758
19	\N	/api/auth/login	POST	\N	401	\N	::1	52	2026-06-19 11:18:27.205668
20	\N	/api/auth/login	POST	\N	401	\N	::1	10	2026-06-19 11:18:37.33986
21	\N	/api/auth/login	POST	\N	401	\N	::1	54	2026-06-19 11:24:25.7276
22	\N	/api/auth/login	POST	\N	401	\N	::1	15	2026-06-19 11:24:27.572975
23	\N	/api/auth/login	POST	\N	401	\N	::1	54	2026-06-19 11:35:37.545848
24	\N	/api/auth/login	POST	\N	401	\N	::1	158	2026-06-19 11:36:48.102385
25	\N	/api/auth/login	POST	\N	401	\N	::1	150	2026-06-19 11:39:31.052249
26	\N	/api/auth/login	POST	\N	401	\N	::1	47	2026-06-19 11:43:55.658211
27	\N	/api/auth/login	POST	\N	401	\N	::1	51	2026-06-19 11:53:21.533118
28	\N	/api/auth/login	POST	\N	401	\N	::1	72	2026-06-19 12:52:42.398582
29	\N	/api/auth/login	POST	\N	401	\N	::1	75	2026-06-19 12:53:51.982535
30	\N	/api/auth/login	POST	\N	200	\N	::1	138	2026-06-19 12:55:51.833015
31	\N	/api/auth/login	POST	\N	200	\N	::1	133	2026-06-19 13:02:04.366423
32	\N	/api/auth/login	POST	\N	200	\N	::1	404	2026-06-19 13:04:03.119834
33	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	50	2026-06-19 13:04:03.22221
34	1	/api/employees?limit=1&page=1	GET	\N	400	\N	::1	10	2026-06-19 13:04:03.290007
35	1	/api/cargo?limit=5&page=1	GET	\N	400	\N	::1	160	2026-06-19 13:04:03.346938
36	1	/api/payments?limit=100&page=1	GET	\N	400	\N	::1	167	2026-06-19 13:04:03.350783
37	1	/api/v1/transport/providers?limit=100	GET	\N	200	\N	::1	185	2026-06-19 13:04:03.37038
38	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	25	2026-06-19 13:04:03.388607
39	1	/api/dashboard/overview	GET	\N	400	\N	::1	206	2026-06-19 13:04:03.396213
40	1	/api/customers?page=1&limit=1	GET	\N	400	\N	::1	212	2026-06-19 13:04:03.403453
41	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	400	\N	::1	125	2026-06-19 13:04:03.429791
42	1	/api/cargo?limit=100	GET	\N	400	\N	::1	70	2026-06-19 13:04:13.846701
43	1	/api/trips?status=ongoing&limit=100	GET	\N	400	\N	::1	88	2026-06-19 13:04:13.867494
44	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	102	2026-06-19 13:04:13.883523
45	1	/api/trips?status=ongoing&limit=100	GET	\N	400	\N	::1	2	2026-06-19 13:04:14.888755
46	1	/api/trips?status=ongoing&limit=100	GET	\N	400	\N	::1	3	2026-06-19 13:04:16.9103
47	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	6	2026-06-19 13:04:17.30262
48	1	/api/cargo?page=1&limit=10	GET	\N	400	\N	::1	4	2026-06-19 13:04:20.463619
49	1	/api/branches	GET	\N	200	\N	::1	11	2026-06-19 13:04:20.469081
50	1	/api/cargo?page=1&limit=10	GET	\N	400	\N	::1	2	2026-06-19 13:04:21.484336
51	1	/api/cargo?page=1&limit=10	GET	\N	400	\N	::1	3	2026-06-19 13:04:23.497055
52	1	/api/customers?limit=200	GET	\N	400	\N	::1	3	2026-06-19 13:04:24.335066
53	1	/api/branches	GET	\N	304	\N	::1	11	2026-06-19 13:04:24.337728
54	1	/api/customers?limit=200	GET	\N	400	\N	::1	2	2026-06-19 13:04:25.347726
55	1	/api/customers?limit=200	GET	\N	400	\N	::1	3	2026-06-19 13:04:27.358601
56	1	/api/customers?limit=200	GET	\N	400	\N	::1	4	2026-06-19 13:04:31.384218
57	1	/api/v1/users/roles	GET	\N	200	\N	::1	13	2026-06-19 13:04:34.009623
58	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	23	2026-06-19 13:04:34.017689
59	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	7	2026-06-19 13:04:39.692427
60	1	/api/v1/users/branch/assign	POST	\N	201	\N	::1	14	2026-06-19 13:04:43.401034
61	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	9	2026-06-19 13:04:43.418784
62	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	20	2026-06-19 13:04:45.985694
63	1	/api/v1/users/roles	GET	\N	304	\N	::1	80	2026-06-19 13:04:46.045662
64	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	89	2026-06-19 13:04:46.053865
65	1	/api/cargo?limit=5&page=1	GET	\N	400	\N	::1	12	2026-06-19 13:04:47.932074
66	1	/api/payments?limit=100&page=1	GET	\N	400	\N	::1	12	2026-06-19 13:04:47.933291
67	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	29	2026-06-19 13:04:47.964798
68	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	400	\N	::1	27	2026-06-19 13:04:47.970611
69	1	/api/dashboard/overview	GET	\N	400	\N	::1	83	2026-06-19 13:04:48.017768
70	1	/api/customers?page=1&limit=1	GET	\N	400	\N	::1	100	2026-06-19 13:04:48.03679
71	1	/api/employees?limit=1&page=1	GET	\N	400	\N	::1	102	2026-06-19 13:04:48.041065
72	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	111	2026-06-19 13:04:48.046217
73	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-19 13:05:06.764147
74	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	96	2026-06-19 13:07:30.483257
75	1	/api/v1/users/roles	GET	\N	304	\N	::1	118	2026-06-19 13:07:30.511275
76	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	126	2026-06-19 13:07:30.513867
77	1	/api/cargo?limit=5&page=1	GET	\N	400	\N	::1	13	2026-06-19 13:07:34.07021
78	1	/api/payments?limit=100&page=1	GET	\N	400	\N	::1	12	2026-06-19 13:07:34.075205
79	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	400	\N	::1	12	2026-06-19 13:07:34.102153
1355	\N	/api/auth/login	POST	\N	403	\N	::1	188	2026-06-26 10:11:12.677516
1405	37	/api/cargo	GET	\N	403	\N	::1	3	2026-06-26 10:15:28.52028
1407	36	/api/customers	GET	\N	403	\N	::1	3	2026-06-26 10:15:28.546552
1409	1	/api/payments	GET	\N	200	\N	::1	3	2026-06-26 10:15:28.556342
1411	35	/api/payments	GET	\N	403	\N	::1	5	2026-06-26 10:15:28.572158
1413	37	/api/payments	GET	\N	403	\N	::1	2	2026-06-26 10:15:28.590694
1415	35	/api/employees	GET	\N	403	\N	::1	2	2026-06-26 10:15:28.60962
1416	36	/api/employees	GET	\N	403	\N	::1	2	2026-06-26 10:15:28.613695
1418	1	/api/salary	GET	\N	404	\N	::1	3	2026-06-26 10:15:28.639829
1419	35	/api/salary	GET	\N	404	\N	::1	3	2026-06-26 10:15:28.644559
1422	1	/api/reports/cargo	GET	\N	200	\N	::1	4	2026-06-26 10:15:28.656249
1424	36	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 10:15:28.682623
1464	1	/api/customers?customer_type=vip	GET	\N	200	\N	::1	48	2026-06-26 10:23:50.796604
1466	1	/api/customers/49	DELETE	\N	200	\N	::1	5	2026-06-26 10:23:50.837839
1533	\N	/api/auth/login	POST	\N	200	\N	::1	301	2026-06-26 11:02:30.228451
1534	\N	/api/auth/login	POST	\N	200	\N	::1	362	2026-06-26 11:02:30.526832
1535	36	/api/accounts	GET	\N	400	\N	::1	15	2026-06-26 11:02:30.559417
1536	36	/api/expenses	GET	\N	400	\N	::1	4	2026-06-26 11:02:30.588498
1537	36	/api/reports/branch-summary	GET	\N	400	\N	::1	3	2026-06-26 11:02:30.594752
1538	36	/api/salary/charges	GET	\N	400	\N	::1	6	2026-06-26 11:02:30.607095
1565	1	/api/salary/charges	GET	\N	200	\N	::1	18	2026-06-26 11:05:12.92566
1567	36	/api/expenses	GET	\N	403	\N	::1	5	2026-06-26 11:05:12.962448
1569	36	/api/cargo	GET	\N	200	\N	::1	19	2026-06-26 11:05:12.994675
1571	36	/api/payments	GET	\N	200	\N	::1	7	2026-06-26 11:05:13.030491
1600	\N	/api/auth/login	POST	\N	200	\N	::1	286	2026-06-26 11:08:44.181883
1602	1	/api/salary/charges	GET	\N	200	\N	::1	20	2026-06-26 11:08:44.227114
1603	36	/api/accounts	GET	\N	403	\N	::1	4	2026-06-26 11:08:44.23731
1606	36	/api/cargo	GET	\N	200	\N	::1	22	2026-06-26 11:08:44.299837
1608	36	/api/payments	GET	\N	200	\N	::1	6	2026-06-26 11:08:44.328215
1611	36	/api/cargo	GET	\N	403	\N	::1	6	2026-06-26 11:08:44.378943
1635	\N	/api/auth/login	POST	\N	401	\N	::1	9	2026-06-26 11:15:59.76019
1668	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	256	2026-06-26 11:27:39.307936
1673	1	/api/cargo/37/items	GET	\N	304	\N	::1	24	2026-06-26 11:27:48.16481
1674	1	/api/cargo/37	GET	\N	200	\N	::1	41	2026-06-26 11:27:48.180152
1688	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	181	2026-06-26 11:29:33.438444
1706	\N	/api/payments?limit=100&page=1	GET	\N	401	\N	::1	1	2026-06-26 13:51:41.528151
1713	3	/api/customers?limit=1	GET	\N	200	\N	::1	19	2026-06-26 13:51:48.249002
1723	3	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	5	2026-06-26 13:52:01.037938
1724	3	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	53	2026-06-26 13:52:01.085795
1748	38	/api/payments?limit=1	GET	\N	304	\N	::1	45	2026-06-26 13:56:22.450581
1783	38	/api/branches	GET	\N	403	\N	::1	9	2026-06-26 14:02:26.304217
1784	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 14:02:26.314167
1785	38	/api/branches	GET	\N	403	\N	::ffff:127.0.0.1	5	2026-06-26 14:02:27.729564
1786	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::ffff:127.0.0.1	2	2026-06-26 14:02:27.743936
1828	38	/api/customers?limit=200	GET	\N	304	\N	::1	127	2026-06-26 14:13:42.105939
1829	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 14:13:42.366826
1830	38	/api/branches	GET	\N	403	\N	::1	2	2026-06-26 14:13:43.648282
1832	38	/api/customers?limit=200	GET	\N	304	\N	::1	7	2026-06-26 14:13:43.653895
1858	38	/api/customers/42	GET	\N	304	\N	::1	47	2026-06-26 14:15:49.243534
1860	38	/api/customers?limit=200	GET	\N	304	\N	::1	7	2026-06-26 14:15:55.912229
1887	38	/api/customers/45	GET	\N	200	\N	::1	53	2026-06-26 14:20:36.908608
1896	\N	/api/branches	GET	\N	401	\N	::1	3	2026-06-27 00:31:10.077241
1926	36	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	6	2026-06-27 00:33:26.949001
1929	36	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	15	2026-06-27 00:33:39.371667
1930	36	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-27 00:33:48.949032
1974	1	/api/v1/setup/addresses	POST	\N	201	\N	::1	54	2026-06-27 00:39:38.419773
1975	1	/api/v1/setup/branches	POST	\N	201	\N	::1	12	2026-06-27 00:39:38.438995
1976	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	200	\N	::1	8	2026-06-27 00:39:38.453613
1999	1	/api/employees?limit=200	GET	\N	304	\N	::1	56	2026-06-27 01:13:16.237807
2032	1	/api/employees/1/schedule	GET	\N	200	\N	::1	8	2026-06-27 01:53:30.050453
2033	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	8	2026-06-27 01:53:30.059395
2035	1	/api/employees/1	GET	\N	200	\N	::1	11	2026-06-27 01:53:30.082184
2065	1	/api/employees/attendance	POST	\N	422	\N	::1	7	2026-06-27 01:57:30.825303
2080	\N	/api/auth/login	POST	\N	200	\N	::1	80	2026-06-27 03:05:26.040459
2098	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	41	2026-06-27 03:09:41.404184
2121	1	/api/salary/attendance-summary?employee_id=34&month=2026-06	GET	\N	200	\N	::1	36	2026-06-27 03:16:39.882298
2123	1	/api/salary/attendance-summary?employee_id=38&month=2026-06	GET	\N	200	\N	::1	19	2026-06-27 03:16:49.778153
2125	1	/api/salary/attendance-summary?employee_id=1&month=2026-06	GET	\N	200	\N	::1	19	2026-06-27 03:16:56.061261
80	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	50	2026-06-19 13:07:34.113724
81	1	/api/dashboard/overview	GET	\N	400	\N	::1	70	2026-06-19 13:07:34.134115
82	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	78	2026-06-19 13:07:34.146154
83	1	/api/employees?limit=1&page=1	GET	\N	400	\N	::1	71	2026-06-19 13:07:34.148106
84	1	/api/customers?page=1&limit=1	GET	\N	400	\N	::1	77	2026-06-19 13:07:34.158307
85	1	/api/payments?limit=100&page=1	GET	\N	400	\N	::1	125	2026-06-19 13:12:56.934434
86	1	/api/dashboard/overview	GET	\N	400	\N	::1	135	2026-06-19 13:12:56.951714
87	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	163	2026-06-19 13:12:56.962594
88	1	/api/employees?limit=1&page=1	GET	\N	400	\N	::1	166	2026-06-19 13:12:56.984734
89	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	198	2026-06-19 13:12:57.012863
90	1	/api/cargo?limit=5&page=1	GET	\N	400	\N	::1	264	2026-06-19 13:12:57.066959
91	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	400	\N	::1	131	2026-06-19 13:12:57.09179
92	1	/api/customers?page=1&limit=1	GET	\N	400	\N	::1	156	2026-06-19 13:12:57.095425
93	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	160	2026-06-19 13:12:57.125919
94	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	176	2026-06-19 13:15:52.436689
95	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	16	2026-06-19 13:15:53.17338
96	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	5	2026-06-19 13:15:53.18226
97	1	/api/cargo?limit=5&page=1	GET	\N	400	\N	::1	85	2026-06-19 13:15:53.247802
98	1	/api/dashboard/overview	GET	\N	400	\N	::1	80	2026-06-19 13:15:53.250578
99	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	91	2026-06-19 13:15:53.268323
100	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	400	\N	::1	18	2026-06-19 13:15:53.270341
101	1	/api/payments?limit=100&page=1	GET	\N	400	\N	::1	121	2026-06-19 13:15:53.28678
102	1	/api/employees?limit=1&page=1	GET	\N	400	\N	::1	117	2026-06-19 13:15:53.287931
103	1	/api/customers?page=1&limit=1	GET	\N	400	\N	::1	119	2026-06-19 13:15:53.304543
104	\N	/	GET	\N	404	\N	::1	7	2026-06-22 04:55:59.789268
105	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	4	2026-06-22 04:56:04.30248
106	\N	/api/dashboard/overview	GET	\N	401	\N	::1	1	2026-06-22 04:56:04.314211
107	\N	/api/cargo?limit=5&page=1	GET	\N	401	\N	::1	1	2026-06-22 04:56:04.434836
108	\N	/api/payments?limit=100&page=1	GET	\N	401	\N	::1	1	2026-06-22 04:56:04.434473
109	\N	/api/customers?page=1&limit=1	GET	\N	401	\N	::1	1	2026-06-22 04:56:04.444983
110	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	0	2026-06-22 04:56:04.455483
111	\N	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	401	\N	::1	1	2026-06-22 04:56:04.461322
112	\N	/api/employees?limit=1&page=1	GET	\N	401	\N	::1	3	2026-06-22 04:56:04.467643
113	\N	/api/v1/transport/providers?limit=100	GET	\N	401	\N	::1	1	2026-06-22 04:56:04.483267
114	\N	/api/auth/login	POST	\N	401	\N	::1	198	2026-06-22 04:56:21.88846
115	\N	/api/auth/login	POST	\N	401	\N	::1	122	2026-06-22 05:08:01.776596
116	\N	/api/auth/login	POST	\N	200	\N	::1	138	2026-06-22 05:08:05.466354
117	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	44	2026-06-22 05:08:05.587941
118	1	/api/payments?limit=100&page=1	GET	\N	200	\N	::1	95	2026-06-22 05:08:05.641429
119	1	/api/v1/transport/providers?limit=100	GET	\N	200	\N	::1	101	2026-06-22 05:08:05.657333
120	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	120	2026-06-22 05:08:05.664011
121	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	22	2026-06-22 05:08:05.675305
122	1	/api/employees?limit=1&page=1	GET	\N	200	\N	::1	123	2026-06-22 05:08:05.679815
123	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	47	2026-06-22 05:08:05.690677
124	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	95	2026-06-22 05:08:05.692413
125	1	/api/dashboard/overview	GET	\N	200	\N	::1	177	2026-06-22 05:08:05.724442
126	1	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	34	2026-06-22 05:08:20.83671
127	1	/api/cargo?limit=100	GET	\N	200	\N	::1	17	2026-06-22 05:08:30.238539
128	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	63	2026-06-22 05:08:30.246012
129	1	/api/cargo/1	GET	\N	200	\N	::1	8	2026-06-22 05:08:30.276613
130	1	/api/cargo/1/items	GET	\N	200	\N	::1	50	2026-06-22 05:08:30.279584
131	1	/api/trips?status=ongoing&limit=100	GET	\N	200	\N	::1	209	2026-06-22 05:08:30.393266
132	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	9	2026-06-22 05:08:32.745105
133	1	/api/v1/setup/cities?limit=200	GET	\N	200	\N	::1	8	2026-06-22 05:08:38.919274
134	1	/api/v1/setup/addresses?limit=500	GET	\N	200	\N	::1	10	2026-06-22 05:08:38.922444
135	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	14	2026-06-22 05:08:38.923666
136	1	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	13	2026-06-22 05:08:38.924882
137	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	48	2026-06-22 05:08:50.217613
138	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	49	2026-06-22 05:08:50.219448
139	1	/api/customers/1	GET	\N	200	\N	::1	77	2026-06-22 05:08:50.2435
140	1	/api/v1/customers/1/cargo?page=1&limit=500	GET	\N	200	\N	::1	53	2026-06-22 05:08:50.247792
141	1	/api/customers?page=1&limit=100	GET	\N	200	\N	::1	154	2026-06-22 05:08:50.321912
142	1	/api/branches	GET	\N	200	\N	::1	7	2026-06-22 05:09:00.325867
143	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	11	2026-06-22 05:09:00.331332
144	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	8	2026-06-22 05:09:07.928301
145	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	7	2026-06-22 05:09:07.950337
146	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	70	2026-06-22 05:09:07.977725
147	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	23	2026-06-22 05:09:07.983667
148	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	10	2026-06-22 05:09:07.984874
149	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	76	2026-06-22 05:09:07.98853
150	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	89	2026-06-22 05:09:07.998918
151	1	/api/dashboard/overview	GET	\N	304	\N	::1	121	2026-06-22 05:09:08.029663
152	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	49	2026-06-22 05:11:45.14113
153	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	70	2026-06-22 05:11:45.165564
154	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	83	2026-06-22 05:11:45.184026
155	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	19	2026-06-22 05:11:45.183881
156	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	22	2026-06-22 05:11:45.188279
157	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	86	2026-06-22 05:11:45.192046
158	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	58	2026-06-22 05:11:45.195578
159	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	56	2026-06-22 05:11:45.201707
160	1	/api/dashboard/overview	GET	\N	304	\N	::1	215	2026-06-22 05:11:45.318808
161	1	/api/v1/invoices?page=1&limit=20	GET	\N	200	\N	::1	145	2026-06-22 05:14:36.24501
162	1	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	4	2026-06-22 05:14:38.753448
163	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	7	2026-06-22 05:14:41.134009
164	1	/api/accounts?page=1&limit=20	GET	\N	200	\N	::1	12	2026-06-22 05:14:41.137887
165	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	4	2026-06-22 05:14:43.443922
166	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	200	\N	::1	4	2026-06-22 05:14:43.445342
167	1	/api/employees/jobs	GET	\N	200	\N	::1	45	2026-06-22 05:14:44.552273
168	1	/api/employees?page=1&limit=20	GET	\N	200	\N	::1	7	2026-06-22 05:14:44.656996
169	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	4	2026-06-22 05:14:52.215317
170	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	10	2026-06-22 05:14:52.22029
171	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	12	2026-06-22 05:14:52.22417
172	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	157	2026-06-22 05:14:52.366155
173	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	6	2026-06-22 05:14:55.03444
174	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	5	2026-06-22 05:14:55.035161
175	1	/api/v1/insurance/providers	GET	\N	200	\N	::1	9	2026-06-22 05:14:57.188644
176	1	/api/v1/insurance?page=1&limit=20	GET	\N	200	\N	::1	16	2026-06-22 05:14:57.194737
177	1	/api/branches	GET	\N	304	\N	::1	7	2026-06-22 05:15:01.323478
178	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	14	2026-06-22 05:15:01.331642
179	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	3	2026-06-22 05:15:04.953318
180	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	4	2026-06-22 05:15:07.232685
181	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	13	2026-06-22 05:15:07.246092
182	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	8	2026-06-22 05:15:07.260241
183	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	55	2026-06-22 05:15:07.288351
184	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	70	2026-06-22 05:15:07.30876
185	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	78	2026-06-22 05:15:07.31406
186	1	/api/dashboard/overview	GET	\N	304	\N	::1	109	2026-06-22 05:15:07.343386
187	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	159	2026-06-22 05:15:07.394537
188	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	52	2026-06-22 05:19:03.318589
189	1	/api/cargo/1/items	GET	\N	304	\N	::1	8	2026-06-22 05:19:03.366748
190	1	/api/cargo?limit=100	GET	\N	304	\N	::1	58	2026-06-22 05:19:03.373033
191	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	113	2026-06-22 05:19:03.381372
192	1	/api/cargo/1	GET	\N	304	\N	::1	5	2026-06-22 05:19:03.401821
193	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	16	2026-06-22 05:19:05.115959
194	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-22 05:19:08.302611
195	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	10	2026-06-22 05:19:13.393768
196	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	200	\N	::1	35	2026-06-22 05:19:25.424763
197	1	/api/v1/setup/addresses?limit=200	GET	\N	200	\N	::1	2	2026-06-22 05:19:28.307251
198	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	135	2026-06-22 05:19:42.877201
199	1	/api/v1/transport/providers?limit=200	GET	\N	200	\N	::1	44	2026-06-22 05:19:43.639069
200	1	/api/v1/routes?limit=200	GET	\N	200	\N	::1	46	2026-06-22 05:19:43.642032
201	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	53	2026-06-22 05:19:43.644631
202	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 05:19:46.89698
203	1	/api/v1/users/roles	GET	\N	200	\N	::1	8	2026-06-22 05:19:47.82875
204	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	12	2026-06-22 05:19:47.833225
205	1	/api/reports/revenue	GET	\N	200	\N	::1	83	2026-06-22 05:20:00.08055
206	1	/api/reports/cargo	GET	\N	200	\N	::1	83	2026-06-22 05:20:00.081193
207	1	/api/reports/branch-summary	GET	\N	200	\N	::1	85	2026-06-22 05:20:00.082873
208	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	142	2026-06-22 05:20:00.137714
209	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	5	2026-06-22 05:20:05.704737
210	1	/api/employees/jobs	GET	\N	304	\N	::1	38	2026-06-22 05:20:14.389614
211	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 05:20:14.494219
213	1	/api/branches	GET	\N	304	\N	::1	12	2026-06-22 05:20:16.798672
212	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	10	2026-06-22 05:20:16.797956
214	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	6	2026-06-22 05:20:18.146154
215	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	32	2026-06-22 05:20:18.177345
216	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	6	2026-06-22 05:20:18.185348
217	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	11	2026-06-22 05:20:18.197746
218	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	74	2026-06-22 05:20:18.21504
219	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	75	2026-06-22 05:20:18.215704
220	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	10	2026-06-22 05:20:18.220177
221	1	/api/dashboard/overview	GET	\N	304	\N	::1	87	2026-06-22 05:20:18.226697
222	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 05:20:27.10379
223	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	52	2026-06-22 05:21:48.866143
224	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	4	2026-06-22 05:21:49.976566
225	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	146	2026-06-22 05:21:50.119342
226	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-22 05:21:51.034252
227	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	72	2026-06-22 05:22:08.40439
228	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	75	2026-06-22 05:22:08.40997
229	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	13	2026-06-22 05:22:08.441155
230	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	92	2026-06-22 05:22:08.448421
231	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	31	2026-06-22 05:22:08.44858
232	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	116	2026-06-22 05:22:08.454364
233	1	/api/dashboard/overview	GET	\N	304	\N	::1	150	2026-06-22 05:22:08.483512
234	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	163	2026-06-22 05:22:08.494272
235	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	45	2026-06-22 05:27:10.098744
236	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	56	2026-06-22 05:27:10.11372
237	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	8	2026-06-22 05:27:10.124847
238	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	69	2026-06-22 05:27:10.126787
239	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	16	2026-06-22 05:27:10.133451
240	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	78	2026-06-22 05:27:10.141176
241	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	57	2026-06-22 05:27:10.157097
242	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	50	2026-06-22 05:27:10.160455
243	1	/api/dashboard/overview	GET	\N	304	\N	::1	124	2026-06-22 05:27:10.183771
244	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	55	2026-06-22 05:27:50.045189
245	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	66	2026-06-22 05:27:50.057331
246	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	72	2026-06-22 05:27:50.073059
247	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	3	2026-06-22 05:27:50.078893
248	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	74	2026-06-22 05:27:50.08041
249	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	23	2026-06-22 05:27:50.082661
250	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	61	2026-06-22 05:27:50.108745
251	1	/api/dashboard/overview	GET	\N	304	\N	::1	125	2026-06-22 05:27:50.12054
252	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	156	2026-06-22 05:27:50.148497
253	1	/api/branches	GET	\N	304	\N	::1	7	2026-06-22 05:27:55.293318
254	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	12	2026-06-22 05:27:55.299404
255	1	/api/accounts?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 05:27:58.413106
256	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	7	2026-06-22 05:27:58.414737
257	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 05:27:59.787194
258	1	/api/v1/expense-types	GET	\N	200	\N	::1	8	2026-06-22 05:28:00.79077
259	1	/api/expenses?page=1&limit=20	GET	\N	200	\N	::1	12	2026-06-22 05:28:00.793327
260	1	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 05:28:01.643732
261	1	/api/salary/charges?page=1&limit=20	GET	\N	200	\N	::1	11	2026-06-22 05:28:02.894699
262	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	61	2026-06-22 05:29:25.438246
263	1	/api/cargo?limit=100	GET	\N	304	\N	::1	63	2026-06-22 05:29:25.468896
264	1	/api/cargo/1/items	GET	\N	304	\N	::1	4	2026-06-22 05:29:25.475399
265	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	94	2026-06-22 05:29:25.478439
266	1	/api/cargo/1	GET	\N	304	\N	::1	10	2026-06-22 05:29:25.481188
267	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	5	2026-06-22 05:29:27.938015
268	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	5	2026-06-22 05:29:30.549059
269	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	16	2026-06-22 05:29:30.577287
270	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	34	2026-06-22 05:29:30.590464
271	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	31	2026-06-22 05:29:30.591143
272	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	41	2026-06-22 05:29:30.607627
273	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	10	2026-06-22 05:29:30.616061
274	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	72	2026-06-22 05:29:30.624538
275	1	/api/dashboard/overview	GET	\N	304	\N	::1	86	2026-06-22 05:29:30.635649
276	1	/api/branches	GET	\N	304	\N	::1	44	2026-06-22 05:34:33.162321
277	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	48	2026-06-22 05:34:33.298419
278	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	55	2026-06-22 05:35:57.938645
279	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	66	2026-06-22 05:35:57.950004
280	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	155	2026-06-22 05:36:08.535955
281	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	7	2026-06-22 05:36:15.262559
282	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	68	2026-06-22 05:36:15.322445
283	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	158	2026-06-22 05:36:15.413841
284	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	3	2026-06-22 05:36:16.185481
285	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	10	2026-06-22 05:36:16.192849
286	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	4	2026-06-22 05:36:17.154246
287	1	/api/employees/jobs	GET	\N	304	\N	::1	3	2026-06-22 05:36:18.064787
288	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 05:36:18.070072
290	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-22 05:36:20.974385
292	1	/api/v1/expense-types	GET	\N	304	\N	::1	4	2026-06-22 05:36:23.833009
1356	\N	/api/auth/login	POST	\N	200	\N	::1	296	2026-06-26 10:12:52.190152
1410	1	/api/cargo	GET	\N	200	\N	::1	17	2026-06-26 10:15:28.561742
1412	36	/api/payments	GET	\N	200	\N	::1	7	2026-06-26 10:15:28.580117
1414	1	/api/employees	GET	\N	200	\N	::1	7	2026-06-26 10:15:28.599176
1417	37	/api/employees	GET	\N	200	\N	::1	4	2026-06-26 10:15:28.629656
1420	36	/api/salary	GET	\N	404	\N	::1	2	2026-06-26 10:15:28.647628
1421	37	/api/salary	GET	\N	404	\N	::1	1	2026-06-26 10:15:28.650406
1423	35	/api/reports/cargo	GET	\N	200	\N	::1	6	2026-06-26 10:15:28.670752
1425	37	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 10:15:28.692903
1467	\N	/api/auth/login	POST	\N	200	\N	::1	162	2026-06-26 10:33:14.648864
1539	\N	/api/auth/login	POST	\N	200	\N	::1	346	2026-06-26 11:02:45.168121
1575	\N	/api/auth/login	POST	\N	200	\N	::1	332	2026-06-26 11:05:55.426605
1601	1	/api/expenses	GET	\N	200	\N	::1	92	2026-06-26 11:08:44.202342
1612	36	/api/cargo/1	DELETE	\N	403	\N	::1	3	2026-06-26 11:08:44.417706
1636	\N	/api/auth/login	POST	\N	200	\N	::1	363	2026-06-26 11:16:50.235357
1669	1	/api/dashboard/overview	GET	\N	304	\N	::1	443	2026-06-26 11:27:39.323021
1689	1	/api/customers/45	PUT	\N	200	\N	::1	131	2026-06-26 11:29:46.29489
1707	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	1	2026-06-26 13:51:41.535143
1749	\N	/api/auth/login	POST	\N	200	\N	::1	168	2026-06-26 13:56:22.454295
1787	38	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	61	2026-06-26 14:02:27.786501
1788	38	/api/customers?limit=200	GET	\N	304	\N	::1	78	2026-06-26 14:02:27.804209
1789	38	/api/branches	GET	\N	403	\N	::1	5	2026-06-26 14:02:28.82265
1790	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 14:02:28.83267
1791	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 14:02:30.848478
1792	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 14:02:30.857126
1793	38	/api/branches	GET	\N	403	\N	::1	2	2026-06-26 14:02:39.020482
1794	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:02:39.030177
1831	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	5	2026-06-26 14:13:43.652445
1833	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	1	2026-06-26 14:13:43.867184
1834	38	/api/branches	GET	\N	403	\N	::1	1	2026-06-26 14:13:44.879151
1835	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:13:44.885463
1859	38	/api/customers?page=1&limit=100	GET	\N	304	\N	::1	47	2026-06-26 14:15:49.245036
1888	38	/api/customers?page=1&limit=100	GET	\N	304	\N	::1	53	2026-06-26 14:20:36.911164
1889	38	/api/branches	GET	\N	304	\N	::1	10	2026-06-26 14:20:38.504646
1894	\N	/api/customers?limit=200	GET	\N	401	\N	::1	1	2026-06-27 00:31:10.088774
1895	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	16	2026-06-27 00:31:10.075772
1897	\N	/api/v1/setup/branches?limit=200	GET	\N	401	\N	::1	2	2026-06-27 00:31:10.216192
1931	36	/api/auth/logout	POST	\N	200	\N	::1	42	2026-06-27 00:34:11.048617
1977	1	/api/employees/jobs	GET	\N	304	\N	::1	91	2026-06-27 00:39:56.068173
1978	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	146	2026-06-27 00:39:56.122226
1979	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	11	2026-06-27 00:40:02.318767
1981	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	10	2026-06-27 00:40:07.294337
1982	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	8	2026-06-27 00:40:12.567737
1986	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	4	2026-06-27 00:40:18.002328
1987	1	/api/employees/jobs	GET	\N	304	\N	::1	10	2026-06-27 00:40:18.006973
1988	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	16	2026-06-27 00:40:18.013006
2000	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	24	2026-06-27 01:13:44.572806
2001	1	/api/employees?limit=200	GET	\N	500	\N	::1	62	2026-06-27 01:13:44.620367
2003	1	/api/employees?limit=200	GET	\N	500	\N	::1	7	2026-06-27 01:13:45.696513
2005	1	/api/employees?limit=200	GET	\N	500	\N	::1	10	2026-06-27 01:13:56.430036
2007	1	/api/employees?limit=200&branch_id=1	GET	\N	500	\N	::1	6	2026-06-27 01:14:02.261944
2011	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	500	\N	::1	11	2026-06-27 01:14:14.050747
2012	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-27 01:14:15.27945
2013	1	/api/v1/setup/countries	GET	\N	304	\N	::1	5	2026-06-27 01:14:25.20288
2037	\N	/api/auth/login	POST	\N	200	\N	::1	101	2026-06-27 01:54:31.402478
2039	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	12	2026-06-27 01:54:31.480307
2041	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	3	2026-06-27 01:54:31.631422
2042	1	/api/employees/1	GET	\N	200	\N	::1	9	2026-06-27 01:54:31.641249
2044	1	/api/employees/branch/assign	POST	\N	201	\N	::1	6	2026-06-27 01:54:31.658741
2066	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	14	2026-06-27 01:57:33.421908
2081	\N	/api/auth/login	POST	\N	401	\N	::1	71	2026-06-27 03:05:26.159589
2100	\N	/api/auth/login	POST	\N	200	\N	::1	105	2026-06-27 03:09:55.927698
2127	1	/api/salary/attendance-summary?employee_id=41&month=2026-06	GET	\N	200	\N	::1	16	2026-06-27 03:17:01.0849
2128	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	19	2026-06-27 03:17:06.356062
2129	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	12	2026-06-27 03:17:08.657336
2134	1	/api/employees?limit=200	GET	\N	304	\N	::1	14	2026-06-27 03:17:12.935049
2148	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	181	2026-06-27 03:24:05.031364
2170	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	156	2026-06-27 03:25:51.149589
2174	1	/api/v1/insurance/providers	GET	\N	304	\N	::1	11	2026-06-27 03:26:06.046946
289	1	/api/accounts?page=1&limit=20	GET	\N	304	\N	::1	3	2026-06-22 05:36:20.969641
291	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 05:36:22.019642
1357	\N	/api/auth/login	POST	\N	200	\N	::1	234	2026-06-26 10:12:52.504741
1358	\N	/api/auth/login	POST	\N	200	\N	::1	432	2026-06-26 10:12:52.906496
1426	\N	/api/auth/login	POST	\N	200	\N	::1	206	2026-06-26 10:15:50.962096
1427	\N	/api/salaries	GET	\N	404	\N	::1	0	2026-06-26 10:15:51.008698
1468	\N	/api/auth/login	POST	\N	200	\N	::1	103	2026-06-26 10:33:49.993962
1540	36	/api/accounts	GET	\N	400	\N	::1	59	2026-06-26 11:02:45.223212
1541	36	/api/expenses	GET	\N	400	\N	::1	3	2026-06-26 11:02:45.260166
1542	36	/api/salary/charges	GET	\N	400	\N	::1	4	2026-06-26 11:02:45.270062
1576	\N	/api/auth/login	POST	\N	200	\N	::1	207	2026-06-26 11:05:55.714791
1577	\N	/api/auth/login	POST	\N	200	\N	::1	362	2026-06-26 11:05:56.013885
1604	36	/api/expenses	GET	\N	403	\N	::1	11	2026-06-26 11:08:44.262998
1605	36	/api/salary/charges	GET	\N	403	\N	::1	3	2026-06-26 11:08:44.27154
1607	36	/api/customers	GET	\N	200	\N	::1	13	2026-06-26 11:08:44.317063
1609	36	/api/trips	GET	\N	200	\N	::1	19	2026-06-26 11:08:44.351307
1610	36	/api/v1/invoices	GET	\N	200	\N	::1	10	2026-06-26 11:08:44.366088
1637	\N	/api/auth/login	POST	\N	200	\N	::1	286	2026-06-26 11:16:50.605776
1670	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	33	2026-06-26 11:27:47.61037
1690	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	19	2026-06-26 11:29:46.32776
1691	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	24	2026-06-26 11:29:50.639368
1692	1	/api/employees?page=1&limit=20	GET	\N	200	\N	::1	35	2026-06-26 11:29:50.65408
1693	1	/api/employees/jobs	GET	\N	200	\N	::1	91	2026-06-26 11:29:50.711467
1694	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	12	2026-06-26 11:29:58.360818
1708	\N	/api/v1/transport/providers?limit=100	GET	\N	401	\N	::1	1	2026-06-26 13:51:41.548134
1714	3	/api/cargo?limit=1	GET	\N	200	\N	::1	22	2026-06-26 13:51:48.250811
1715	3	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 13:51:54.70253
1716	3	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:51:54.716125
1722	3	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	5	2026-06-26 13:52:01.036079
1750	38	/api/customers?limit=1	GET	\N	304	\N	::1	92	2026-06-26 13:56:22.458108
1795	38	/api/branches	GET	\N	403	\N	::1	38	2026-06-26 14:02:51.541656
1796	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:02:51.551859
1836	38	/api/branches	GET	\N	200	\N	::1	23	2026-06-26 14:13:54.536177
1837	38	/api/branches	GET	\N	304	\N	::1	12	2026-06-26 14:13:56.150772
1839	38	/api/customers?limit=200	GET	\N	304	\N	::1	53	2026-06-26 14:13:56.196233
1844	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	4	2026-06-26 14:14:07.963241
1861	38	/api/cargo	POST	\N	201	\N	::1	53	2026-06-26 14:17:09.183436
1890	38	/api/customers?limit=200	GET	\N	304	\N	::1	11	2026-06-26 14:20:38.507664
1898	\N	/api/auth/login	POST	\N	200	\N	::1	385	2026-06-27 00:31:42.474057
1899	42	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	42	2026-06-27 00:31:42.576583
1900	42	/api/customers?limit=1	GET	\N	200	\N	::1	89	2026-06-27 00:31:42.625773
1932	\N	/api/auth/login	POST	\N	200	\N	::1	261	2026-06-27 00:34:23.369255
1933	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	22	2026-06-27 00:34:23.503436
1980	1	/api/employees/branch/assign	POST	\N	201	\N	::1	49	2026-06-27 00:40:07.276377
1983	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-27 00:40:12.569731
2002	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	70	2026-06-27 01:13:44.625506
2004	1	/api/employees?limit=200	GET	\N	500	\N	::1	8	2026-06-27 01:13:47.71423
2006	1	/api/employees?limit=200&branch_id=1	GET	\N	500	\N	::1	5	2026-06-27 01:14:01.248369
2008	1	/api/employees?limit=200&branch_id=1	GET	\N	500	\N	::1	7	2026-06-27 01:14:11.220084
2009	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	10	2026-06-27 01:14:12.984029
2038	1	/api/employees	GET	\N	200	\N	::1	40	2026-06-27 01:54:31.459555
2067	1	/api/employees/attendance/4	PUT	\N	200	\N	::1	74	2026-06-27 01:57:54.503931
2082	\N	/api/auth/login	POST	\N	200	\N	::1	101	2026-06-27 03:05:40.16226
2083	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=	GET	\N	400	\N	::1	6	2026-06-27 03:05:40.193051
2101	1	/api/salary/attendance-summary?employee_id=34&month=2026-06	GET	\N	200	\N	::1	151	2026-06-27 03:09:56.099729
2133	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	117	2026-06-27 03:17:10.055071
2135	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	24	2026-06-27 03:17:12.939883
2149	1	/api/employees/attendance/bulk	POST	\N	422	\N	::1	89	2026-06-27 03:24:32.970085
2150	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	50	2026-06-27 03:24:38.872935
2152	1	/api/reports/branch-summary	GET	\N	200	\N	::1	181	2026-06-27 03:24:38.99512
2176	1	/api/cargo?page=1&limit=200	GET	\N	200	\N	::1	17	2026-06-27 03:26:10.043301
2188	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	186	2026-06-27 03:27:39.294818
2209	1	/api/employees/schedule	POST	\N	201	\N	::1	243	2026-06-27 03:34:46.776882
2211	1	/api/employees/schedule	POST	\N	201	\N	::1	8	2026-06-27 03:34:46.823096
2213	1	/api/employees/schedule	POST	\N	201	\N	::1	8	2026-06-27 03:34:46.854256
2224	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	65	2026-06-27 06:24:58.137028
2233	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	18	2026-06-27 06:28:10.580791
2248	1	/api/salary/attendance-summary?employee_id=34&month=2026-05	GET	\N	200	\N	::1	192	2026-06-27 06:29:28.425317
2255	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	79	2026-06-27 06:30:13.826833
2261	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	53	2026-06-27 06:30:48.610281
2263	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	61	2026-06-27 06:30:48.623034
2271	1	/api/cargo/37	PUT	\N	200	\N	::1	104	2026-06-27 07:01:48.201394
293	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 05:36:23.834827
294	1	/api/v1/expense-types	GET	\N	304	\N	::1	53	2026-06-22 05:42:31.897704
295	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	93	2026-06-22 05:42:31.938188
296	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	158	2026-06-22 05:42:32.000906
297	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	105	2026-06-22 05:43:00.107301
298	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	119	2026-06-22 05:43:00.12262
299	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	138	2026-06-22 05:43:00.138561
300	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	93	2026-06-22 05:43:00.14319
301	1	/api/employees/jobs	GET	\N	304	\N	::1	8	2026-06-22 05:43:03.062737
302	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	16	2026-06-22 05:43:03.069819
303	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-22 05:44:05.160847
304	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	142	2026-06-22 05:44:25.655793
305	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	10	2026-06-22 05:44:26.758368
306	\N	/api/auth/login	POST	\N	200	\N	::1	287	2026-06-22 05:45:35.213502
307	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	20	2026-06-22 05:45:35.27658
308	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	72	2026-06-22 05:45:35.330318
309	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	69	2026-06-22 05:45:35.331289
310	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	15	2026-06-22 05:45:35.349602
311	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	92	2026-06-22 05:45:35.352741
312	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	102	2026-06-22 05:45:35.370737
313	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	97	2026-06-22 05:45:35.378496
314	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	26	2026-06-22 05:45:35.411554
315	1	/api/dashboard/overview	GET	\N	304	\N	::1	149	2026-06-22 05:45:35.413477
316	1	/api/branches	GET	\N	304	\N	::1	52	2026-06-22 05:45:58.773227
317	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	63	2026-06-22 05:45:58.785813
318	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	52	2026-06-22 05:50:24.493348
319	1	/api/branches	GET	\N	304	\N	::1	9	2026-06-22 05:50:27.198632
320	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	24	2026-06-22 05:50:27.216691
321	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	57	2026-06-22 05:50:27.247595
322	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	57	2026-06-22 05:51:12.091177
323	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	48	2026-06-22 05:51:29.915537
324	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	61	2026-06-22 05:53:46.072792
325	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	74	2026-06-22 05:54:01.003621
326	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	85	2026-06-22 05:54:01.022341
327	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	101	2026-06-22 05:54:01.031703
328	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	128	2026-06-22 05:54:01.055028
329	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	9	2026-06-22 05:54:06.593668
330	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	48	2026-06-22 05:55:38.975804
331	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	52	2026-06-22 05:55:38.976597
332	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-22 06:02:36.752108
333	1	/api/reports/revenue	GET	\N	304	\N	::1	97	2026-06-22 06:02:36.794242
334	1	/api/reports/cargo	GET	\N	304	\N	::1	101	2026-06-22 06:02:36.799796
335	1	/api/reports/branch-summary	GET	\N	304	\N	::1	107	2026-06-22 06:02:36.8049
336	1	/api/v1/users/roles	GET	\N	304	\N	::1	5	2026-06-22 06:02:37.575554
337	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	10	2026-06-22 06:02:37.579695
338	1	/api/v1/disputes/types	GET	\N	200	\N	::1	8	2026-06-22 06:02:38.933986
339	1	/api/v1/disputes?page=1&limit=20	GET	\N	200	\N	::1	12	2026-06-22 06:02:38.937458
340	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	6	2026-06-22 06:02:40.912553
341	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	10	2026-06-22 06:02:40.916567
342	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	15	2026-06-22 06:02:40.918743
343	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	15	2026-06-22 06:02:40.922701
344	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-22 06:02:42.683802
345	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-22 06:04:15.731823
346	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-22 06:04:15.736132
347	1	/api/v1/transport/routes?page=1&limit=20	GET	\N	200	\N	::1	13	2026-06-22 06:04:18.472215
348	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	104	2026-06-22 06:12:36.717035
349	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	110	2026-06-22 06:12:36.720163
350	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	121	2026-06-22 06:12:36.735954
351	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	47	2026-06-22 06:15:07.022412
352	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	48	2026-06-22 06:15:07.024969
353	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	56	2026-06-22 06:15:07.032812
354	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	53	2026-06-22 06:15:29.127033
355	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	64	2026-06-22 06:15:29.13541
356	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	165	2026-06-22 06:15:29.237439
357	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	7	2026-06-22 06:15:38.661596
358	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	32	2026-06-22 06:15:38.715252
359	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	54	2026-06-22 06:15:38.728963
360	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	14	2026-06-22 06:15:38.74084
361	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	97	2026-06-22 06:15:38.752595
362	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	104	2026-06-22 06:15:38.759659
363	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	35	2026-06-22 06:15:38.769754
364	1	/api/dashboard/overview	GET	\N	304	\N	::1	142	2026-06-22 06:15:38.797182
365	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	11	2026-06-22 06:15:45.841116
366	1	/api/cargo?limit=100	GET	\N	304	\N	::1	16	2026-06-22 06:15:45.84333
367	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	20	2026-06-22 06:15:45.851031
369	1	/api/cargo/1	GET	\N	304	\N	::1	20	2026-06-22 06:15:45.949745
1359	\N	/api/auth/login	POST	\N	200	\N	::1	243	2026-06-26 10:12:53.201036
1428	1	/api/salary	GET	\N	404	\N	::1	6	2026-06-26 10:15:51.031547
1469	\N	/api/auth/login	POST	\N	200	\N	::1	77	2026-06-26 10:33:50.132361
1470	\N	/api/auth/login	POST	\N	200	\N	::1	103	2026-06-26 10:33:50.215393
1543	\N	/api/auth/login	POST	\N	200	\N	::1	356	2026-06-26 11:03:37.319894
1578	36	/api/cargo	GET	\N	403	\N	::1	7	2026-06-26 11:05:56.134834
1579	39	/api/cargo	GET	\N	200	\N	::1	86	2026-06-26 11:05:56.194005
1581	36	/api/customers	POST	\N	422	\N	::1	13	2026-06-26 11:05:56.243156
1583	36	/api/trips	GET	\N	200	\N	::1	17	2026-06-26 11:05:56.305853
1613	\N	/api/auth/login	POST	\N	200	\N	::1	367	2026-06-26 11:15:45.435831
1638	\N	/api/auth/login	POST	\N	200	\N	::1	416	2026-06-26 11:17:48.920764
1639	36	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	23	2026-06-26 11:17:49.523096
1640	36	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	21	2026-06-26 11:17:49.643054
1641	36	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	12	2026-06-26 11:17:49.663181
1642	36	/api/payments?limit=100&page=1	GET	\N	200	\N	::1	203	2026-06-26 11:17:49.832354
1671	1	/api/cargo?limit=100	GET	\N	200	\N	::1	41	2026-06-26 11:27:47.618632
1695	1	/api/employees/branch/assign	POST	\N	422	\N	::1	7	2026-06-26 11:30:01.916341
1709	\N	/api/dashboard/overview	GET	\N	401	\N	::1	0	2026-06-26 13:51:41.551798
1717	3	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	19	2026-06-26 13:51:54.719776
1718	3	/api/branches	GET	\N	403	\N	::1	1	2026-06-26 13:51:55.73307
1719	3	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:51:55.741173
1720	3	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 13:51:57.759156
1721	3	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:51:57.767477
1726	3	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	2	2026-06-26 13:52:02.202955
1729	3	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:52:04.217552
1751	38	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	39	2026-06-26 13:56:32.710869
1797	38	/api/branches	GET	\N	403	\N	::1	64	2026-06-26 14:06:48.826099
1838	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	49	2026-06-26 14:13:56.189261
1841	38	/api/v1/setup/addresses?limit=500	GET	\N	200	\N	::1	17	2026-06-26 14:14:01.510368
1862	38	/api/branches	GET	\N	304	\N	::1	6	2026-06-26 14:17:09.202612
1863	38	/api/cargo/39	GET	\N	200	\N	::1	16	2026-06-26 14:17:09.210975
1864	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	7	2026-06-26 14:17:14.757526
1865	38	/api/cargo?limit=1	GET	\N	200	\N	::1	9	2026-06-26 14:17:14.761067
1866	38	/api/payments?limit=1	GET	\N	304	\N	::1	146	2026-06-26 14:17:14.898486
1891	38	/api/customers?limit=200	GET	\N	304	\N	::1	288	2026-06-26 14:21:57.274361
1901	42	/api/cargo?limit=1	GET	\N	200	\N	::1	94	2026-06-27 00:31:42.630163
1934	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	58	2026-06-27 00:34:23.542233
1935	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	67	2026-06-27 00:34:23.553019
1937	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	70	2026-06-27 00:34:23.574364
1938	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	96	2026-06-27 00:34:23.583129
1984	1	/api/employees/jobs	GET	\N	304	\N	::1	43	2026-06-27 00:40:14.988248
2010	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	500	\N	::1	54	2026-06-27 01:14:13.029394
2040	1	/api/employees/1/schedule	GET	\N	200	\N	::1	145	2026-06-27 01:54:31.626005
2043	1	/api/employees/jobs	GET	\N	200	\N	::1	4	2026-06-27 01:54:31.651275
2045	1	/api/employees/attendance	POST	\N	201	\N	::1	5	2026-06-27 01:54:31.665757
2068	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	18	2026-06-27 01:57:54.529056
2084	\N	/api/auth/login	POST	\N	200	\N	::1	70	2026-06-27 03:05:47.905769
2102	\N	/api/auth/login	POST	\N	200	\N	::1	173	2026-06-27 03:11:48.302899
2104	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	12	2026-06-27 03:11:48.440731
2106	1	/api/employees/34/attendance?month=2026-06	GET	\N	200	\N	::1	16	2026-06-27 03:11:48.493255
2108	1	/api/employees/34/schedule	GET	\N	200	\N	::1	5	2026-06-27 03:11:48.519606
2136	1	/api/employees/41/schedule	GET	\N	200	\N	::1	141	2026-06-27 03:17:29.830152
2151	1	/api/reports/cargo	GET	\N	200	\N	::1	161	2026-06-27 03:24:38.968247
2177	1	/api/v1/insurance	POST	\N	201	\N	::1	112	2026-06-27 03:26:55.149011
2178	1	/api/v1/insurance?page=1&limit=20	GET	\N	200	\N	::1	11	2026-06-27 03:26:55.179156
2189	\N	/api/auth/login	POST	\N	200	\N	::1	147	2026-06-27 03:27:55.990193
2190	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	72	2026-06-27 03:27:56.015392
2210	1	/api/employees/schedule	POST	\N	201	\N	::1	18	2026-06-27 03:34:46.805671
2212	1	/api/employees/schedule	POST	\N	201	\N	::1	8	2026-06-27 03:34:46.838192
2214	1	/api/employees/38/schedule	GET	\N	200	\N	::1	9	2026-06-27 03:34:46.874854
2225	1	/api/employees?limit=200	GET	\N	304	\N	::1	111	2026-06-27 06:24:58.1854
2234	1	/api/employees?limit=200	GET	\N	304	\N	::1	222	2026-06-27 06:28:25.30822
2236	1	/api/employees/schedule	POST	\N	201	\N	::1	13	2026-06-27 06:28:44.1581
2238	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-27 06:28:44.179064
2240	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-27 06:28:44.199994
2262	1	/api/branches	GET	\N	304	\N	::1	58	2026-06-27 06:30:48.618351
368	1	/api/cargo/1/items	GET	\N	304	\N	::1	7	2026-06-22 06:15:45.93499
370	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	4	2026-06-22 06:15:56.357632
371	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-22 06:16:30.250141
372	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-22 06:16:33.16905
373	1	/api/employees/jobs	GET	\N	304	\N	::1	51	2026-06-22 06:16:33.177187
374	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-22 06:16:36.364301
375	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	4	2026-06-22 06:16:37.211652
376	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	10	2026-06-22 06:16:37.217732
377	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	51	2026-06-22 06:16:37.258298
378	1	/api/accounts?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-22 06:16:40.597839
379	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	8	2026-06-22 06:16:40.599152
380	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 06:16:42.875787
381	1	/api/v1/expense-types	GET	\N	304	\N	::1	6	2026-06-22 06:16:43.639191
382	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 06:16:43.64146
383	1	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 06:16:44.301838
384	1	/api/salary/charges?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 06:16:44.725356
385	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	14	2026-06-22 06:16:46.234453
386	1	/api/reports/revenue	GET	\N	304	\N	::1	52	2026-06-22 06:16:46.272999
387	1	/api/reports/cargo	GET	\N	304	\N	::1	54	2026-06-22 06:16:46.275627
388	1	/api/reports/branch-summary	GET	\N	304	\N	::1	61	2026-06-22 06:16:46.287217
389	1	/api/v1/users/roles	GET	\N	304	\N	::1	47	2026-06-22 06:16:58.72198
390	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	153	2026-06-22 06:16:58.826976
391	1	/api/v1/disputes?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-22 06:17:31.504541
392	1	/api/v1/disputes/types	GET	\N	304	\N	::1	153	2026-06-22 06:17:31.604154
393	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 06:17:33.840191
394	1	/api/branches	GET	\N	304	\N	::1	62	2026-06-22 06:20:39.414855
395	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	69	2026-06-22 06:20:39.423059
396	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 06:20:44.987632
397	1	/api/cargo?page=1&limit=200	GET	\N	200	\N	::1	11	2026-06-22 06:20:47.638294
398	1	/api/accounts?limit=100	GET	\N	200	\N	::1	6	2026-06-22 06:20:47.640008
399	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	67	2026-06-22 06:23:20.315462
400	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	93	2026-06-22 06:23:20.34062
401	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	101	2026-06-22 06:23:20.356011
402	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	123	2026-06-22 06:23:20.386385
403	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	77	2026-06-22 06:23:20.40333
404	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	94	2026-06-22 06:23:20.41293
405	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	98	2026-06-22 06:23:20.428465
406	1	/api/dashboard/overview	GET	\N	304	\N	::1	190	2026-06-22 06:23:20.439213
407	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 06:23:28.55615
408	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-22 06:23:28.559099
409	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	74	2026-06-22 06:26:34.476384
410	1	/api/cargo/1	GET	\N	304	\N	::1	16	2026-06-22 06:26:34.524431
411	1	/api/cargo?limit=100	GET	\N	304	\N	::1	71	2026-06-22 06:26:34.524777
412	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	134	2026-06-22 06:26:34.536321
413	1	/api/cargo/1/items	GET	\N	304	\N	::1	8	2026-06-22 06:26:34.562991
414	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	9	2026-06-22 06:26:36.179332
415	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 06:26:43.832857
416	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	13	2026-06-22 06:26:48.471201
417	1	/api/reports/revenue	GET	\N	304	\N	::1	52	2026-06-22 06:26:48.511828
418	1	/api/reports/branch-summary	GET	\N	304	\N	::1	54	2026-06-22 06:26:48.517559
419	1	/api/reports/cargo	GET	\N	304	\N	::1	197	2026-06-22 06:26:48.657872
420	1	/api/v1/users/roles	GET	\N	304	\N	::1	5	2026-06-22 06:26:53.7876
421	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-22 06:26:53.793403
422	1	/api/v1/users/roles	GET	\N	304	\N	::1	138	2026-06-22 06:38:22.183658
423	1	/api/v1/users/roles	GET	\N	200	\N	::1	5	2026-06-22 06:38:22.681011
424	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-22 06:38:22.698682
425	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	83	2026-06-22 06:38:22.768908
426	1	/api/v1/users/roles	GET	\N	304	\N	::1	380	2026-06-22 11:08:50.465484
427	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	385	2026-06-22 11:08:50.46791
428	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	395	2026-06-22 11:08:50.480066
429	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	10	2026-06-22 11:08:56.100052
430	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	17	2026-06-22 11:08:56.120116
431	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	34	2026-06-22 11:08:56.122585
432	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	14	2026-06-22 11:08:56.129021
433	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	65	2026-06-22 11:08:56.158527
434	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	17	2026-06-22 11:08:56.159649
435	1	/api/dashboard/overview	GET	\N	304	\N	::1	109	2026-06-22 11:08:56.19843
436	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	173	2026-06-22 11:08:56.269623
438	1	/api/cargo?limit=100	GET	\N	304	\N	::1	11	2026-06-22 11:08:57.3425
437	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-22 11:08:57.341936
439	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	14	2026-06-22 11:08:57.34786
443	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	6	2026-06-22 11:09:03.512068
1360	\N	/api/auth/login	POST	\N	200	\N	::1	339	2026-06-26 10:14:32.470146
1429	1	/api/salary/list	GET	\N	404	\N	::1	3	2026-06-26 10:15:51.048051
1471	\N	/api/auth/login	POST	\N	200	\N	::1	72	2026-06-26 10:33:50.327031
1472	1	/api/dashboard	GET	\N	404	\N	::1	36	2026-06-26 10:33:50.352427
1475	37	/api/dashboard	GET	\N	404	\N	::1	2	2026-06-26 10:33:50.379102
1477	35	/api/cargo	GET	\N	200	\N	::1	10	2026-06-26 10:33:50.413624
1479	1	/api/customers	GET	\N	200	\N	::1	6	2026-06-26 10:33:50.428639
1481	36	/api/customers	GET	\N	403	\N	::1	1	2026-06-26 10:33:50.446606
1483	1	/api/payments	GET	\N	200	\N	::1	3	2026-06-26 10:33:50.4545
1485	35	/api/payments	GET	\N	403	\N	::1	2	2026-06-26 10:33:50.469636
1487	1	/api/employees	GET	\N	200	\N	::1	6	2026-06-26 10:33:50.47923
1489	35	/api/employees	GET	\N	403	\N	::1	2	2026-06-26 10:33:50.497277
1491	1	/api/salary/charges	GET	\N	200	\N	::1	5	2026-06-26 10:33:50.506133
1493	37	/api/salary/charges	GET	\N	200	\N	::1	2	2026-06-26 10:33:50.523975
1495	1	/api/accounts	GET	\N	200	\N	::1	3	2026-06-26 10:33:50.536253
1497	35	/api/accounts	GET	\N	403	\N	::1	2	2026-06-26 10:33:50.554114
1499	1	/api/reports/cargo	GET	\N	200	\N	::1	2	2026-06-26 10:33:50.561466
1501	36	/api/reports/cargo	GET	\N	200	\N	::1	2	2026-06-26 10:33:50.58009
1503	1	/api/cargo/track	GET	\N	500	\N	::1	2	2026-06-26 10:33:50.595188
1505	36	/api/cargo/track	GET	\N	500	\N	::1	2	2026-06-26 10:33:50.603266
1544	36	/api/accounts	GET	\N	403	\N	::1	10	2026-06-26 11:03:37.435856
1546	36	/api/cargo	GET	\N	200	\N	::1	37	2026-06-26 11:03:37.48012
1550	36	/api/payments	GET	\N	200	\N	::1	21	2026-06-26 11:03:37.550185
1580	36	/api/cargo	GET	\N	200	\N	::1	25	2026-06-26 11:05:56.212958
1582	36	/api/customers?limit=1	GET	\N	200	\N	::1	20	2026-06-26 11:05:56.274811
1614	\N	/api/auth/login	POST	\N	200	\N	::1	288	2026-06-26 11:15:45.911526
1615	\N	/api/auth/login	POST	\N	200	\N	::1	422	2026-06-26 11:15:46.177358
1643	36	/api/dashboard/overview	GET	\N	200	\N	::1	338	2026-06-26 11:17:49.96341
1645	36	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	34	2026-06-26 11:17:54.829902
1646	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	6	2026-06-26 11:17:59.307556
1647	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	6	2026-06-26 11:17:59.310642
1648	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	5	2026-06-26 11:18:00.594178
1649	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	5	2026-06-26 11:18:00.602039
1650	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	5	2026-06-26 11:18:02.616953
1651	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	8	2026-06-26 11:18:02.623614
1652	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	6	2026-06-26 11:18:06.650524
1653	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	12	2026-06-26 11:18:06.65953
1675	1	/api/branches	GET	\N	304	\N	::1	115	2026-06-26 11:28:03.755451
1676	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	138	2026-06-26 11:28:03.7845
1696	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	694	2026-06-26 11:40:53.713513
1710	\N	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	401	\N	::1	1	2026-06-26 13:51:41.58397
1711	3	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	14	2026-06-26 13:51:48.241155
1752	38	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	4	2026-06-26 13:56:39.905319
1753	38	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	18	2026-06-26 13:56:39.917919
1754	38	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	56	2026-06-26 13:56:39.958407
1756	38	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-26 13:56:47.088847
1757	38	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-26 13:56:51.888291
1798	38	/api/customers?limit=200	GET	\N	304	\N	::1	109	2026-06-26 14:06:48.869716
1799	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	4	2026-06-26 14:06:48.987013
1800	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 14:06:50.999143
1801	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 14:06:51.01041
1802	38	/api/branches	GET	\N	403	\N	::1	5	2026-06-26 14:06:51.774425
1804	38	/api/customers?limit=200	GET	\N	304	\N	::1	10	2026-06-26 14:06:51.782033
1840	38	/api/v1/setup/cities?limit=200	GET	\N	200	\N	::1	17	2026-06-26 14:14:01.509183
1846	38	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	15	2026-06-26 14:14:07.971555
1867	38	/api/customers?limit=1	GET	\N	304	\N	::1	154	2026-06-26 14:17:14.906554
1892	38	/api/customers?limit=200	GET	\N	304	\N	::1	172	2026-06-26 14:23:32.157464
1902	42	/api/payments?limit=1	GET	\N	200	\N	::1	74	2026-06-27 00:31:42.652777
1936	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	14	2026-06-27 00:34:23.569235
1985	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-27 00:40:15.087192
2014	\N	/api/auth/login	POST	\N	401	\N	::1	122	2026-06-27 01:48:05.422705
2046	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	59	2026-06-27 01:55:48.041676
2050	1	/api/employees/34/schedule	GET	\N	200	\N	::1	10	2026-06-27 01:55:51.848623
2069	1	/api/employees/attendance	POST	\N	422	\N	::1	39	2026-06-27 01:58:13.723034
2070	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	17	2026-06-27 01:58:18.057336
2071	1	/api/v1/setup/countries	GET	\N	304	\N	::1	5	2026-06-27 01:58:21.841531
2085	\N	/api/auth/login	POST	\N	200	\N	::1	99	2026-06-27 03:06:06.56801
2103	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=1	GET	\N	200	\N	::1	70	2026-06-27 03:11:48.399275
2105	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=1	GET	\N	200	\N	::1	6	2026-06-27 03:11:48.451733
2107	1	/api/salary/attendance-summary?employee_id=34&month=2026-06	GET	\N	200	\N	::1	11	2026-06-27 03:11:48.506509
2191	1	/api/branches	GET	\N	304	\N	::1	138	2026-06-27 03:33:52.475734
440	1	/api/cargo/1/items	GET	\N	304	\N	::1	5	2026-06-22 11:08:57.490328
441	1	/api/cargo/1	GET	\N	304	\N	::1	14	2026-06-22 11:08:57.499312
442	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	4	2026-06-22 11:08:58.9031
1361	\N	/api/auth/login	POST	\N	200	\N	::1	168	2026-06-26 10:14:32.694667
1362	\N	/api/auth/login	POST	\N	200	\N	::1	242	2026-06-26 10:14:32.913492
1430	\N	/api/auth/login	POST	\N	200	\N	::1	231	2026-06-26 10:17:20.006988
1473	35	/api/dashboard	GET	\N	404	\N	::1	5	2026-06-26 10:33:50.369937
1474	36	/api/dashboard	GET	\N	404	\N	::1	2	2026-06-26 10:33:50.375388
1476	1	/api/cargo	GET	\N	200	\N	::1	11	2026-06-26 10:33:50.391745
1478	37	/api/cargo	GET	\N	403	\N	::1	1	2026-06-26 10:33:50.421302
1480	35	/api/customers	GET	\N	200	\N	::1	5	2026-06-26 10:33:50.439208
1482	37	/api/customers	GET	\N	403	\N	::1	2	2026-06-26 10:33:50.449755
1484	36	/api/payments	GET	\N	200	\N	::1	2	2026-06-26 10:33:50.462956
1486	37	/api/payments	GET	\N	403	\N	::1	1	2026-06-26 10:33:50.472345
1488	37	/api/employees	GET	\N	200	\N	::1	5	2026-06-26 10:33:50.490142
1490	36	/api/employees	GET	\N	403	\N	::1	2	2026-06-26 10:33:50.499722
1492	36	/api/salary/charges	GET	\N	200	\N	::1	6	2026-06-26 10:33:50.516571
1494	35	/api/salary/charges	GET	\N	403	\N	::1	1	2026-06-26 10:33:50.532271
1496	36	/api/accounts	GET	\N	200	\N	::1	4	2026-06-26 10:33:50.544986
1498	37	/api/accounts	GET	\N	403	\N	::1	1	2026-06-26 10:33:50.557567
1500	35	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 10:33:50.571684
1502	37	/api/reports/cargo	GET	\N	200	\N	::1	1	2026-06-26 10:33:50.587121
1504	35	/api/cargo/track	GET	\N	500	\N	::1	3	2026-06-26 10:33:50.599584
1506	37	/api/cargo/track	GET	\N	403	\N	::1	1	2026-06-26 10:33:50.606491
1545	36	/api/expenses	GET	\N	403	\N	::1	6	2026-06-26 11:03:37.471519
1549	36	/api/customers	GET	\N	200	\N	::1	36	2026-06-26 11:03:37.522855
1551	36	/api/trips	GET	\N	200	\N	::1	20	2026-06-26 11:03:37.574286
1552	\N	/api/invoices	GET	\N	404	\N	::1	2	2026-06-26 11:03:37.580336
1584	\N	/api/auth/login	POST	\N	200	\N	::1	465	2026-06-26 11:06:22.302311
1616	\N	/api/auth/login	POST	\N	200	\N	::1	278	2026-06-26 11:15:46.522741
1617	\N	/api/auth/login	POST	\N	200	\N	::1	345	2026-06-26 11:15:46.808303
1644	36	/api/v1/insurance/providers	GET	\N	304	\N	::1	11	2026-06-26 11:17:54.808616
1654	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	21	2026-06-26 11:18:11.398364
1677	1	/api/v1/insurance/providers	GET	\N	304	\N	::1	87	2026-06-26 11:28:18.16788
1679	1	/api/v1/setup/cities?limit=200	GET	\N	200	\N	::1	47	2026-06-26 11:28:21.723628
1697	1	/api/employees/jobs	GET	\N	304	\N	::1	513	2026-06-26 11:40:53.719736
1725	3	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	147	2026-06-26 13:52:01.176298
1727	3	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	4	2026-06-26 13:52:02.204923
1728	3	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	3	2026-06-26 13:52:04.21702
1755	38	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	139	2026-06-26 13:56:40.040864
1803	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-26 14:06:51.780333
1805	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 14:06:52.008036
1806	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 14:06:53.045277
1807	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:06:53.052567
1808	38	/api/branches	GET	\N	403	\N	::1	2	2026-06-26 14:06:55.066317
1809	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:06:55.073681
1810	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 14:06:59.095389
1811	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:06:59.102991
1842	38	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	53	2026-06-26 14:14:01.543395
1843	38	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	168	2026-06-26 14:14:01.662492
1868	38	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	10	2026-06-26 14:17:20.147664
1893	38	/api/customers?limit=200	GET	\N	304	\N	::1	75	2026-06-26 14:24:45.374345
1903	42	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	60	2026-06-27 00:31:57.016077
1939	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	18	2026-06-27 00:34:23.606188
1989	1	/api/employees?limit=200	GET	\N	304	\N	::1	50	2026-06-27 00:41:08.74048
2015	\N	/api/auth/login	POST	\N	200	\N	::1	79	2026-06-27 01:48:05.682718
2047	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	67	2026-06-27 01:55:48.049196
2048	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	7	2026-06-27 01:55:50.048251
2072	1	/api/employees?page=1&limit=20	GET	\N	200	\N	::1	69	2026-06-27 01:58:28.224789
2086	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=1	GET	\N	200	\N	::1	42	2026-06-27 03:06:06.634125
2109	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	82	2026-06-27 03:15:04.660579
2110	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	138	2026-06-27 03:15:04.750384
2137	1	/api/employees/schedule	POST	\N	201	\N	::1	146	2026-06-27 03:22:24.57645
2153	1	/api/reports/revenue	GET	\N	200	\N	::1	359	2026-06-27 03:24:39.169158
2179	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	112	2026-06-27 03:27:22.870652
2186	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	355	2026-06-27 03:27:27.305431
2192	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	153	2026-06-27 03:33:52.559251
2194	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	36	2026-06-27 03:33:57.168811
2215	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	189	2026-06-27 06:15:50.976205
2226	1	/api/employees/34/schedule	GET	\N	304	\N	::1	14	2026-06-27 06:24:59.480037
2235	1	/api/employees/40/schedule	GET	\N	200	\N	::1	11	2026-06-27 06:28:34.713288
2237	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-27 06:28:44.170784
2239	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-27 06:28:44.188333
444	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	10	2026-06-22 11:09:03.51334
1363	\N	/api/auth/login	POST	\N	200	\N	::1	200	2026-06-26 10:14:33.156104
1370	36	/api/customers	GET	\N	400	\N	::1	5	2026-06-26 10:14:33.215876
1374	36	/api/payments	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.227137
1375	37	/api/payments	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.230698
1378	36	/api/accounts	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.240759
1381	35	/api/employees	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.264988
1383	37	/api/employees	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.311925
1384	1	/api/salary	GET	\N	400	\N	::1	3	2026-06-26 10:14:33.317578
1387	37	/api/salary	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.325311
1388	1	/api/reports	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.329239
1390	36	/api/reports	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.334825
1391	37	/api/reports	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.338058
1392	1	/api/cargo/track	GET	\N	400	\N	::1	3	2026-06-26 10:14:33.342228
1394	36	/api/cargo/track	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.34721
1431	\N	/api/auth/login	POST	\N	200	\N	::1	217	2026-06-26 10:17:20.285817
1432	\N	/api/auth/login	POST	\N	200	\N	::1	262	2026-06-26 10:17:20.5245
1507	\N	/api/auth/login	POST	\N	200	\N	::1	115	2026-06-26 10:34:23.170185
1547	36	/api/salary/charges	GET	\N	403	\N	::1	7	2026-06-26 11:03:37.494139
1585	36	/api/customers?limit=3	GET	\N	200	\N	::1	129	2026-06-26 11:06:22.488636
1618	\N	/api/auth/login	POST	\N	200	\N	::1	269	2026-06-26 11:15:47.13912
1619	\N	/api/auth/login	POST	\N	200	\N	::1	347	2026-06-26 11:15:47.430642
1655	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	10	2026-06-26 11:18:11.538641
1678	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	99	2026-06-26 11:28:18.175488
1698	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	475	2026-06-26 11:40:53.833914
1730	3	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	45	2026-06-26 13:52:28.836842
1733	3	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	2	2026-06-26 13:52:29.857524
1734	3	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	3	2026-06-26 13:52:31.876474
1736	3	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	7	2026-06-26 13:52:32.986033
1737	3	/api/v1/invoices?page=1&limit=20	GET	\N	200	\N	::1	8	2026-06-26 13:52:35.818612
1758	38	/api/customers/42	PUT	\N	200	\N	::1	183	2026-06-26 13:58:03.440358
1760	38	/api/customers/42	GET	\N	200	\N	::1	12	2026-06-26 13:58:09.334388
1762	38	/api/customers?page=1&limit=100	GET	\N	200	\N	::1	54	2026-06-26 13:58:09.381559
1764	38	/api/v1/customers/42/cargo?page=1&limit=500	GET	\N	200	\N	::1	63	2026-06-26 13:58:09.391352
1765	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:58:10.403009
1768	38	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	1	2026-06-26 13:58:12.416805
1769	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 13:58:16.436088
1812	38	/api/branches	GET	\N	403	\N	::1	59	2026-06-26 14:09:50.711987
1813	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:09:50.729766
1845	38	/api/v1/routes?limit=200	GET	\N	304	\N	::1	8	2026-06-26 14:14:07.965317
1869	38	/api/v1/invoices?page=1&limit=20	GET	\N	200	\N	::1	138	2026-06-26 14:17:37.075082
1904	42	/api/branches	GET	\N	304	\N	::1	75	2026-06-27 00:32:09.863083
1906	42	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	29	2026-06-27 00:32:16.043253
1940	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	77	2026-06-27 00:34:23.607232
1941	1	/api/dashboard/overview	GET	\N	200	\N	::1	181	2026-06-27 00:34:23.675849
1942	1	/api/branches	GET	\N	304	\N	::1	12	2026-06-27 00:34:31.760941
1943	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	15	2026-06-27 00:34:31.765401
1945	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	16	2026-06-27 00:34:39.596494
1948	1	/api/employees/jobs	GET	\N	304	\N	::1	13	2026-06-27 00:34:48.230963
1949	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	23	2026-06-27 00:34:48.238643
1951	1	/api/employees/1/schedule	GET	\N	304	\N	::1	14	2026-06-27 00:34:53.727263
1953	1	/api/employees/35/schedule	GET	\N	200	\N	::1	5	2026-06-27 00:35:01.545324
1955	1	/api/employees/37/schedule	GET	\N	200	\N	::1	4	2026-06-27 00:35:04.078476
1957	1	/api/employees/attendance	POST	\N	201	\N	::1	11	2026-06-27 00:35:18.745771
1959	1	/api/employees/34/schedule	GET	\N	304	\N	::1	3	2026-06-27 00:35:27.193997
1961	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-27 00:35:29.495979
1963	1	/api/employees/schedule	POST	\N	201	\N	::1	3	2026-06-27 00:35:29.512873
1965	1	/api/employees/34/schedule	GET	\N	200	\N	::1	4	2026-06-27 00:35:29.533364
1966	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-27 00:35:34.220921
1990	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	52	2026-06-27 00:55:33.835323
2016	\N	/api/auth/login	POST	\N	200	\N	::1	102	2026-06-27 01:48:21.900233
2017	\N	/api/employees	GET	\N	401	\N	::1	1	2026-06-27 01:48:21.968825
2018	\N	/api/employees/attendance/daily?date=2026-06-27	GET	\N	401	\N	::1	1	2026-06-27 01:48:21.988546
2049	1	/api/employees?limit=200	GET	\N	200	\N	::1	157	2026-06-27 01:55:50.184689
2051	1	/api/employees/37/schedule	GET	\N	200	\N	::1	6	2026-06-27 01:55:57.617698
2073	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	70	2026-06-27 01:58:28.226063
2087	\N	/api/auth/login	POST	\N	200	\N	::1	98	2026-06-27 03:06:20.290415
2089	1	/api/salary/attendance-summary?employee_id=34&month=2026-06	GET	\N	200	\N	::1	17	2026-06-27 03:06:20.561468
2111	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	117	2026-06-27 03:15:35.386546
2138	1	/api/employees/schedule	POST	\N	201	\N	::1	76	2026-06-27 03:22:24.661545
2139	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-27 03:22:24.67784
2141	1	/api/employees/schedule	POST	\N	201	\N	::1	9	2026-06-27 03:22:24.719483
445	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	10	2026-06-22 11:09:03.515325
446	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	13	2026-06-22 11:09:03.518026
447	1	/api/v1/disputes/types	GET	\N	304	\N	::1	52	2026-06-22 11:09:51.105623
448	1	/api/v1/disputes?page=1&limit=20	GET	\N	304	\N	::1	53	2026-06-22 11:09:51.106095
449	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 11:09:53.029732
450	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	75	2026-06-22 11:15:06.662812
451	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 11:15:07.957485
452	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	194	2026-06-22 11:15:08.144787
453	1	/api/v1/users/roles	GET	\N	304	\N	::1	4	2026-06-22 11:15:10.767133
454	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-22 11:15:10.770616
455	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	12	2026-06-22 11:15:11.969867
456	1	/api/reports/cargo	GET	\N	304	\N	::1	50	2026-06-22 11:15:12.01024
457	1	/api/reports/revenue	GET	\N	304	\N	::1	58	2026-06-22 11:15:12.017507
458	1	/api/reports/branch-summary	GET	\N	304	\N	::1	57	2026-06-22 11:15:12.018549
459	1	/api/reports/revenue	GET	\N	304	\N	::1	90	2026-06-22 11:16:22.921772
460	1	/api/reports/cargo	GET	\N	304	\N	::1	95	2026-06-22 11:16:22.927831
461	1	/api/reports/branch-summary	GET	\N	304	\N	::1	161	2026-06-22 11:16:22.994815
462	1	/api/accounts?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 11:16:25.700738
463	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-22 11:16:25.70439
464	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 11:16:27.111494
465	1	/api/v1/expense-types	GET	\N	304	\N	::1	5	2026-06-22 11:16:28.343139
466	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 11:16:28.345884
467	1	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 11:16:29.559215
468	1	/api/salary/charges?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-22 11:16:33.296933
469	1	/api/employees/jobs	GET	\N	304	\N	::1	4	2026-06-22 11:16:37.693452
470	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-22 11:16:37.695367
471	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 11:16:39.256635
472	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 11:16:43.21264
473	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-22 11:16:43.217783
474	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	2	2026-06-22 11:16:45.379857
475	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	7	2026-06-22 11:16:45.382342
476	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	47	2026-06-22 11:16:45.422659
477	1	/api/trips	POST	\N	500	\N	::1	191	2026-06-22 11:17:06.62232
478	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	160	2026-06-22 11:20:10.145288
479	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	30	2026-06-22 11:20:15.244655
480	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	57	2026-06-22 11:20:15.28612
481	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	66	2026-06-22 11:20:15.288524
482	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	82	2026-06-22 11:20:15.300239
483	\N	/	GET	\N	404	\N	::1	2	2026-06-22 11:20:18.987797
484	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	71	2026-06-22 11:20:32.951419
485	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	76	2026-06-22 11:20:32.962608
486	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	85	2026-06-22 11:20:32.968633
487	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	115	2026-06-22 11:20:32.99765
488	1	/api/trips	POST	\N	500	\N	::1	94	2026-06-22 11:20:52.566671
489	1	/api/trips	POST	\N	500	\N	::1	13	2026-06-22 11:20:55.313667
490	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	67	2026-06-22 11:28:09.907867
491	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	108	2026-06-22 11:28:09.946765
492	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	161	2026-06-22 11:28:10.004159
493	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	8	2026-06-22 11:28:11.224257
494	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	15	2026-06-22 11:28:11.231487
495	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	24	2026-06-22 11:28:11.237245
496	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	66	2026-06-22 11:28:11.277899
497	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	14	2026-06-22 11:28:15.309042
498	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	28	2026-06-22 11:28:15.325934
499	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	29	2026-06-22 11:28:15.340185
500	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	42	2026-06-22 11:28:15.340597
501	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	30	2026-06-22 11:28:15.357259
502	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	44	2026-06-22 11:28:15.366163
503	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	87	2026-06-22 11:28:15.388301
504	1	/api/dashboard/overview	GET	\N	304	\N	::1	186	2026-06-22 11:28:15.484443
505	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-22 11:28:19.75885
506	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	13	2026-06-22 11:28:19.76164
507	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	67	2026-06-22 11:35:28.733273
508	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	78	2026-06-22 11:35:28.745459
509	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	200	\N	::1	9	2026-06-22 11:35:29.111372
510	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	16	2026-06-22 11:35:29.118834
511	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	52	2026-06-22 11:35:29.156602
512	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 11:35:29.747362
513	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-22 11:35:29.750113
514	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-22 11:35:29.750942
515	1	/api/v1/transport/routes?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 11:35:31.379244
1364	1	/api/cargo	GET	\N	400	\N	::1	40	2026-06-26 10:14:33.178466
1365	35	/api/cargo	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.19534
1366	36	/api/cargo	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.197846
1367	37	/api/cargo	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.201831
1368	1	/api/customers	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.206233
1369	35	/api/customers	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.209699
1371	37	/api/customers	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.218902
1372	1	/api/payments	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.221414
1373	35	/api/payments	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.223895
1376	1	/api/accounts	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.233471
1377	35	/api/accounts	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.237693
1379	37	/api/accounts	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.244098
1380	1	/api/employees	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.26227
1433	\N	/api/auth/login	POST	\N	200	\N	::1	226	2026-06-26 10:17:20.786496
1434	1	/api/cargo	GET	\N	200	\N	::1	50	2026-06-26 10:17:20.830163
1436	36	/api/cargo	GET	\N	200	\N	::1	6	2026-06-26 10:17:20.870677
1438	1	/api/customers	GET	\N	200	\N	::1	7	2026-06-26 10:17:20.897789
1440	36	/api/customers	GET	\N	403	\N	::1	3	2026-06-26 10:17:20.920587
1442	1	/api/payments	GET	\N	200	\N	::1	3	2026-06-26 10:17:20.928677
1444	36	/api/payments	GET	\N	200	\N	::1	2	2026-06-26 10:17:20.944057
1446	1	/api/employees	GET	\N	200	\N	::1	6	2026-06-26 10:17:20.971437
1448	36	/api/employees	GET	\N	403	\N	::1	1	2026-06-26 10:17:20.98443
1449	37	/api/employees	GET	\N	200	\N	::1	3	2026-06-26 10:17:20.988709
1451	35	/api/salary/charges	GET	\N	403	\N	::1	3	2026-06-26 10:17:21.013522
1453	37	/api/salary/charges	GET	\N	200	\N	::1	7	2026-06-26 10:17:21.033236
1455	35	/api/accounts	GET	\N	403	\N	::1	2	2026-06-26 10:17:21.055435
1457	37	/api/accounts	GET	\N	403	\N	::1	2	2026-06-26 10:17:21.068569
1508	\N	/api/auth/login	POST	\N	200	\N	::1	93	2026-06-26 10:34:23.32421
1509	\N	/api/auth/login	POST	\N	200	\N	::1	227	2026-06-26 10:34:23.529395
1548	36	/api/reports/branch-summary	GET	\N	403	\N	::1	7	2026-06-26 11:03:37.50865
1586	\N	/api/auth/login	POST	\N	200	\N	::1	359	2026-06-26 11:08:08.231569
1620	\N	/api/auth/login	POST	\N	401	\N	::1	10	2026-06-26 11:15:47.503983
1621	\N	/api/auth/login	POST	\N	401	\N	::1	62	2026-06-26 11:15:47.518748
1656	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	118	2026-06-26 11:26:06.123091
1658	36	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	3	2026-06-26 11:26:08.140608
1659	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	17	2026-06-26 11:26:08.150958
1680	1	/api/v1/setup/addresses?limit=500	GET	\N	200	\N	::1	105	2026-06-26 11:28:21.771589
1699	\N	/api/auth/login	POST	\N	200	\N	::1	473	2026-06-26 11:42:21.829999
1731	3	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	45	2026-06-26 13:52:28.837344
1732	3	/api/v1/setup/cities?limit=200	GET	\N	403	\N	::1	3	2026-06-26 13:52:29.857107
1735	3	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	3	2026-06-26 13:52:31.877087
1759	38	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	13	2026-06-26 13:58:03.462077
1814	38	/api/customers?limit=200	GET	\N	304	\N	::1	112	2026-06-26 14:09:50.765487
1815	38	/api/branches	GET	\N	403	\N	::1	4	2026-06-26 14:09:51.740893
1816	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:09:51.749365
1817	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 14:09:54.85434
1818	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	1	2026-06-26 14:09:54.863541
1820	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	12	2026-06-26 14:09:55.913711
1847	38	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	53	2026-06-26 14:14:21.187084
1870	38	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	36	2026-06-26 14:18:06.111834
1875	38	/api/payments?limit=1	GET	\N	304	\N	::1	50	2026-06-26 14:18:17.435018
1905	42	/api/cargo/39	GET	\N	304	\N	::1	71	2026-06-27 00:32:09.895102
1914	42	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	25	2026-06-27 00:32:25.948888
1915	42	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-27 00:32:27.190426
1916	42	/api/auth/logout	POST	\N	200	\N	::1	8	2026-06-27 00:32:35.802957
1944	1	/api/v1/insurance/providers	GET	\N	304	\N	::1	10	2026-06-27 00:34:39.591272
1991	1	/api/employees?limit=200	GET	\N	304	\N	::1	57	2026-06-27 00:55:33.986549
2019	\N	/api/auth/login	POST	\N	200	\N	::1	74	2026-06-27 01:48:31.435733
2052	1	/api/employees/schedule	POST	\N	201	\N	::1	83	2026-06-27 01:56:07.861354
2053	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-27 01:56:07.870982
2056	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-27 01:56:07.905109
2058	1	/api/employees/35/schedule	GET	\N	200	\N	::1	6	2026-06-27 01:56:13.243669
2059	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	12	2026-06-27 01:56:21.00057
2074	1	/api/employees/jobs	GET	\N	200	\N	::1	99	2026-06-27 01:58:28.255413
2088	1	/api/employees/attendance/bulk	POST	\N	500	\N	::1	148	2026-06-27 03:06:20.467322
2112	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	137	2026-06-27 03:15:35.411128
2140	1	/api/employees/schedule	POST	\N	201	\N	::1	18	2026-06-27 03:22:24.704174
2142	1	/api/employees/schedule	POST	\N	201	\N	::1	10	2026-06-27 03:22:24.735148
2154	1	/api/v1/users/roles	GET	\N	304	\N	::1	101	2026-06-27 03:24:57.69189
2180	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	240	2026-06-27 03:27:27.102154
2193	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	26	2026-06-27 03:33:57.162268
2216	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	182	2026-06-27 06:15:50.974422
516	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	11	2026-06-22 11:35:39.758919
517	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-22 11:35:39.801315
518	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	150	2026-06-22 11:35:39.898976
519	1	/api/trips	POST	\N	500	\N	::1	86	2026-06-22 11:35:59.049346
520	1	/api/trips	POST	\N	500	\N	::1	184	2026-06-22 11:36:18.772925
521	\N	/api/health	GET	\N	404	\N	::1	4	2026-06-22 11:38:29.324697
522	\N	/api/auth/login	POST	\N	422	\N	::1	3	2026-06-22 11:38:55.183013
523	\N	/api/auth/login	POST	\N	422	\N	::1	0	2026-06-22 11:38:55.265221
524	\N	/api/auth/login	POST	\N	200	\N	::1	86	2026-06-22 11:39:04.322192
525	\N	/api/auth/login	POST	\N	200	\N	::1	254	2026-06-22 11:39:13.741724
526	1	/api/trips	POST	\N	201	\N	::1	49	2026-06-22 11:39:13.865705
527	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	141	2026-06-22 11:39:25.730798
528	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	57	2026-06-22 11:39:27.559494
529	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	101	2026-06-22 11:39:27.60992
530	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	112	2026-06-22 11:39:27.616251
531	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	132	2026-06-22 11:39:27.629425
532	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	94	2026-06-22 11:40:45.422501
533	1	/api/cargo?page=1&limit=200&status=Pending	GET	\N	200	\N	::1	107	2026-06-22 11:41:10.925269
534	1	/api/trips/34/cargo	POST	\N	200	\N	::1	43	2026-06-22 11:41:19.790136
535	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	23	2026-06-22 11:41:19.822143
536	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	49	2026-06-22 11:41:38.939521
537	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	59	2026-06-22 11:41:38.951795
538	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-22 11:41:41.990676
539	1	/api/employees/jobs	GET	\N	304	\N	::1	45	2026-06-22 11:41:43.432301
540	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-22 11:41:43.432767
541	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	191	2026-06-22 11:44:36.653471
542	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	73	2026-06-22 11:44:40.161743
543	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	75	2026-06-22 11:44:40.165208
544	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	79	2026-06-22 11:44:40.166779
545	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	83	2026-06-22 11:44:40.176016
546	1	/api/customers?page=1&limit=10&city=Mogadishu	GET	\N	200	\N	::1	15	2026-06-22 11:44:46.70908
547	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	52	2026-06-22 11:44:58.465902
548	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	55	2026-06-22 11:44:58.470673
549	1	/api/v1/setup/addresses?limit=500&city_id=1	GET	\N	200	\N	::1	49	2026-06-22 11:45:13.022174
550	1	/api/customers	POST	\N	500	\N	::1	46	2026-06-22 11:45:17.45512
551	\N	/api/auth/login	POST	\N	200	\N	::1	113	2026-06-22 11:53:56.14902
552	1	/api/customers	POST	\N	500	\N	::1	33	2026-06-22 11:53:56.238646
553	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	61	2026-06-22 11:54:30.399843
554	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	64	2026-06-22 11:54:30.403328
555	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	64	2026-06-22 11:54:30.404322
556	\N	/api/auth/login	POST	\N	200	\N	::1	103	2026-06-22 11:55:15.202153
557	1	/api/customers	POST	\N	500	\N	::1	34	2026-06-22 11:55:15.305458
558	\N	/api/auth/login	POST	\N	200	\N	::1	90	2026-06-22 11:57:36.148232
559	1	/api/customers	POST	\N	201	\N	::1	102	2026-06-22 11:57:36.324034
560	\N	/api/auth/login	POST	\N	200	\N	::1	105	2026-06-22 11:57:54.483815
561	1	/api/cargo	POST	\N	400	\N	::1	63	2026-06-22 11:57:54.517917
562	1	/api/trips	POST	\N	201	\N	::1	26	2026-06-22 11:57:54.630336
563	\N	/api/auth/login	POST	\N	200	\N	::1	104	2026-06-22 11:58:05.151721
564	1	/api/branches	GET	\N	200	\N	::1	41	2026-06-22 11:58:05.163321
565	\N	/api/auth/login	POST	\N	200	\N	::1	75	2026-06-22 11:58:10.975074
566	1	/api/cargo	POST	\N	409	\N	::1	19	2026-06-22 11:58:11.246884
567	\N	/api/auth/login	POST	\N	200	\N	::1	86	2026-06-22 11:59:52.985395
568	1	/api/customers	POST	\N	201	\N	::1	44	2026-06-22 11:59:53.075787
569	1	/api/cargo	POST	\N	201	\N	::1	52	2026-06-22 11:59:53.199846
570	1	/api/trips	POST	\N	201	\N	::1	9	2026-06-22 11:59:53.279253
571	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	106	2026-06-22 12:00:52.953287
572	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	120	2026-06-22 12:00:52.971527
573	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	126	2026-06-22 12:00:52.980426
574	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	8	2026-06-22 12:00:54.879369
575	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	14	2026-06-22 12:00:54.882924
576	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	13	2026-06-22 12:00:54.885985
577	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	17	2026-06-22 12:00:57.331984
578	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	30	2026-06-22 12:00:57.345722
579	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	50	2026-06-22 12:00:57.361466
580	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	74	2026-06-22 12:00:57.393667
581	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	100	2026-06-22 12:00:57.435048
582	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	113	2026-06-22 12:00:57.436255
583	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	91	2026-06-22 12:00:57.455731
584	1	/api/dashboard/overview	GET	\N	200	\N	::1	142	2026-06-22 12:00:57.462108
585	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	98	2026-06-22 12:01:08.837966
586	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	163	2026-06-22 12:01:08.902054
587	1	/api/cargo?limit=100	GET	\N	200	\N	::1	169	2026-06-22 12:01:08.906406
588	1	/api/cargo/36/items	GET	\N	200	\N	::1	9	2026-06-22 12:01:08.931144
1382	36	/api/employees	GET	\N	400	\N	::1	42	2026-06-26 10:14:33.308058
1385	35	/api/salary	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.319963
1386	36	/api/salary	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.32251
1389	35	/api/reports	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.332142
1393	35	/api/cargo/track	GET	\N	400	\N	::1	2	2026-06-26 10:14:33.344999
1395	37	/api/cargo/track	GET	\N	400	\N	::1	1	2026-06-26 10:14:33.349231
1435	35	/api/cargo	GET	\N	200	\N	::1	13	2026-06-26 10:17:20.857315
1437	37	/api/cargo	GET	\N	403	\N	::1	2	2026-06-26 10:17:20.881345
1439	35	/api/customers	GET	\N	200	\N	::1	8	2026-06-26 10:17:20.911779
1441	37	/api/customers	GET	\N	403	\N	::1	2	2026-06-26 10:17:20.924189
1443	35	/api/payments	GET	\N	403	\N	::1	3	2026-06-26 10:17:20.939858
1445	37	/api/payments	GET	\N	403	\N	::1	3	2026-06-26 10:17:20.962794
1447	35	/api/employees	GET	\N	403	\N	::1	2	2026-06-26 10:17:20.9811
1450	1	/api/salary/charges	GET	\N	200	\N	::1	6	2026-06-26 10:17:21.002424
1452	36	/api/salary/charges	GET	\N	200	\N	::1	4	2026-06-26 10:17:21.01882
1454	1	/api/accounts	GET	\N	200	\N	::1	4	2026-06-26 10:17:21.044793
1456	36	/api/accounts	GET	\N	200	\N	::1	3	2026-06-26 10:17:21.059618
1510	\N	/api/auth/login	POST	\N	200	\N	::1	83	2026-06-26 10:34:23.658033
1553	\N	/api/auth/login	POST	\N	200	\N	::1	443	2026-06-26 11:04:50.253538
1554	36	/api/v1/invoices	GET	\N	200	\N	::1	17	2026-06-26 11:04:50.297623
1555	\N	/api/v1/cargo	GET	\N	404	\N	::1	1	2026-06-26 11:04:50.334546
1587	\N	/api/auth/login	POST	\N	200	\N	::1	293	2026-06-26 11:08:08.608573
1588	36	/api/customers	POST	\N	201	\N	::1	71	2026-06-26 11:08:08.666556
1590	36	/api/customers?limit=5	GET	\N	200	\N	::1	12	2026-06-26 11:08:08.716538
1592	36	/api/cargo/38	GET	\N	200	\N	::1	14	2026-06-26 11:08:08.788065
1594	\N	/api/auth/login	POST	\N	200	\N	::1	298	2026-06-26 11:08:09.114527
1622	\N	/api/auth/login	POST	\N	401	\N	::1	65	2026-06-26 11:15:58.922643
1623	\N	/api/auth/login	POST	\N	401	\N	::1	169	2026-06-26 11:15:59.050822
1624	\N	/api/auth/login	POST	\N	401	\N	::1	178	2026-06-26 11:15:59.231624
1657	36	/api/accounts?page=1&limit=20	GET	\N	403	\N	::1	108	2026-06-26 11:26:06.195865
1681	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	139	2026-06-26 11:28:21.795544
1682	1	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	138	2026-06-26 11:28:21.808429
1700	\N	/api/auth/login	POST	\N	200	\N	::1	373	2026-06-26 11:42:48.158506
1738	3	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	153	2026-06-26 13:54:00.989899
1761	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	47	2026-06-26 13:58:09.376392
1819	38	/api/branches	GET	\N	403	\N	::1	5	2026-06-26 14:09:55.907388
1848	38	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	53	2026-06-26 14:14:21.188486
1849	38	/api/v1/customers/1/cargo?page=1&limit=500	GET	\N	200	\N	::1	58	2026-06-26 14:14:21.194752
1850	38	/api/customers/1	GET	\N	200	\N	::1	154	2026-06-26 14:14:21.287278
1871	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-26 14:18:12.2309
1872	38	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	4	2026-06-26 14:18:14.052107
1873	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	4	2026-06-26 14:18:17.388455
1874	38	/api/cargo?limit=1	GET	\N	304	\N	::1	15	2026-06-26 14:18:17.399636
1876	38	/api/customers?limit=1	GET	\N	304	\N	::1	51	2026-06-26 14:18:17.435911
1907	42	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	72	2026-06-27 00:32:16.08247
1912	42	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	12	2026-06-27 00:32:25.940702
1946	1	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	60	2026-06-27 00:34:43.20302
1992	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	52	2026-06-27 01:05:07.260531
2020	\N	/api/auth/login	POST	\N	200	\N	::1	115	2026-06-27 01:48:43.856575
2022	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	500	\N	::1	8	2026-06-27 01:48:44.056856
2054	1	/api/employees/schedule	POST	\N	201	\N	::1	10	2026-06-27 01:56:07.885183
2055	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-27 01:56:07.895992
2057	1	/api/employees/37/schedule	GET	\N	200	\N	::1	6	2026-06-27 01:56:07.917629
2075	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	96	2026-06-27 01:58:47.61392
2090	\N	/api/auth/login	POST	\N	200	\N	::1	101	2026-06-27 03:07:00.433396
2092	1	/api/employees/attendance/bulk	POST	\N	500	\N	::1	7	2026-06-27 03:07:00.505497
2113	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	210	2026-06-27 03:15:35.487127
2143	1	/api/employees/41/schedule	GET	\N	200	\N	::1	11	2026-06-27 03:22:24.755675
2155	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	114	2026-06-27 03:24:57.707415
2181	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	307	2026-06-27 03:27:27.175005
2184	1	/api/employees?limit=1&page=1	GET	\N	200	\N	::1	392	2026-06-27 03:27:27.257133
2195	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	106	2026-06-27 03:33:57.244691
2197	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	8	2026-06-27 03:34:02.907093
2217	1	/api/employees/38/schedule	GET	\N	304	\N	::1	217	2026-06-27 06:15:51.003172
2227	1	/api/employees/34/schedule	GET	\N	304	\N	::1	80	2026-06-27 06:26:12.787682
2228	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	33	2026-06-27 06:26:15.714393
2241	1	/api/employees/schedule	POST	\N	201	\N	::1	7	2026-06-27 06:28:44.211219
2243	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	12	2026-06-27 06:28:47.408836
2249	1	/api/salary/attendance-summary?employee_id=34&month=2026-12	GET	\N	200	\N	::1	87	2026-06-27 06:29:39.962929
2254	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	69	2026-06-27 06:30:13.826562
2257	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	41	2026-06-27 06:30:13.862713
2259	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	141	2026-06-27 06:30:13.876427
589	1	/api/cargo/36	GET	\N	200	\N	::1	14	2026-06-22 12:01:08.93499
590	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	6	2026-06-22 12:01:14.09654
591	1	/api/branches	GET	\N	304	\N	::1	6	2026-06-22 12:01:21.535091
592	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	52	2026-06-22 12:01:21.582577
593	1	/api/branches	GET	\N	304	\N	::1	5	2026-06-22 12:01:27.345053
594	1	/api/cargo/36	GET	\N	304	\N	::1	8	2026-06-22 12:01:27.383919
595	1	/api/cargo/36/status	PUT	\N	200	\N	::1	33	2026-06-22 12:01:36.377177
596	1	/api/cargo/36	GET	\N	200	\N	::1	4	2026-06-22 12:01:36.38632
597	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	53	2026-06-22 12:01:52.475227
598	1	/api/cargo/36	GET	\N	304	\N	::1	18	2026-06-22 12:01:58.071077
599	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	6	2026-06-22 12:02:02.863109
600	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	152	2026-06-22 12:03:11.196734
601	1	/api/branches	GET	\N	304	\N	::1	15	2026-06-22 12:03:16.203559
602	1	/api/customers?limit=200	GET	\N	200	\N	::1	43	2026-06-22 12:03:16.231982
603	1	/api/customers?limit=200	GET	\N	304	\N	::1	110	2026-06-22 12:04:50.273718
604	1	/api/customers?limit=200	GET	\N	304	\N	::1	101	2026-06-22 12:07:12.490064
605	1	/api/branches	GET	\N	304	\N	::1	66	2026-06-22 12:09:11.448148
606	1	/api/customers?limit=200	GET	\N	304	\N	::1	119	2026-06-22 12:09:11.502507
607	1	/api/customers?limit=200	GET	\N	304	\N	::1	93	2026-06-22 12:10:03.188633
608	1	/api/customers?limit=200	GET	\N	304	\N	::1	205	2026-06-22 12:10:47.218292
609	1	/api/customers?limit=200	GET	\N	304	\N	::1	176	2026-06-22 12:11:27.942341
610	1	/api/customers?limit=200	GET	\N	304	\N	::1	169	2026-06-22 12:12:38.151019
611	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	97	2026-06-22 12:12:55.880551
612	1	/api/customers?limit=200	GET	\N	304	\N	::1	157	2026-06-22 12:13:08.667103
613	1	/api/branches	GET	\N	304	\N	::1	109	2026-06-22 12:15:22.242556
614	1	/api/customers?limit=200	GET	\N	304	\N	::1	183	2026-06-22 12:15:22.321317
615	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	82	2026-06-22 12:18:35.583136
616	1	/api/customers?limit=200	GET	\N	304	\N	::1	161	2026-06-22 12:18:35.664511
617	1	/api/branches	GET	\N	304	\N	::1	146	2026-06-22 12:20:44.306372
618	1	/api/customers?limit=200	GET	\N	304	\N	::1	226	2026-06-22 12:20:44.388606
619	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	18	2026-06-22 12:20:46.365466
620	1	/api/customers?limit=200	GET	\N	304	\N	::1	18	2026-06-22 12:20:46.386554
621	1	/api/branches	GET	\N	304	\N	::1	23	2026-06-22 12:20:46.389766
622	1	/api/customers?limit=200	GET	\N	304	\N	::1	316	2026-06-22 12:21:23.0417
623	1	/api/branches	GET	\N	304	\N	::1	123	2026-06-22 12:27:47.671703
624	1	/api/customers?limit=200	GET	\N	304	\N	::1	140	2026-06-22 12:27:47.691016
625	1	/api/customers?limit=200	GET	\N	304	\N	::1	352	2026-06-22 12:30:31.761841
626	\N	/api/auth/login	POST	\N	200	\N	::1	282	2026-06-22 14:48:28.68938
627	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	37	2026-06-22 14:48:28.797634
628	1	/api/employees?limit=1&page=1	GET	\N	200	\N	::1	97	2026-06-22 14:48:28.860413
629	1	/api/v1/transport/providers?limit=100	GET	\N	200	\N	::1	111	2026-06-22 14:48:28.871178
630	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	4	2026-06-22 14:48:28.893891
631	1	/api/payments?limit=100&page=1	GET	\N	200	\N	::1	140	2026-06-22 14:48:28.900582
632	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	53	2026-06-22 14:48:28.919534
633	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	166	2026-06-22 14:48:28.921395
634	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	134	2026-06-22 14:48:28.932859
635	1	/api/dashboard/overview	GET	\N	200	\N	::1	236	2026-06-22 14:48:28.99605
636	1	/api/cargo?limit=100	GET	\N	200	\N	::1	13	2026-06-22 14:48:34.699785
637	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	14	2026-06-22 14:48:34.701577
638	1	/api/trips?status=ongoing&limit=100	GET	\N	200	\N	::1	35	2026-06-22 14:48:34.724249
639	1	/api/cargo/36/items	GET	\N	200	\N	::1	10	2026-06-22 14:48:34.730853
640	1	/api/cargo/36	GET	\N	200	\N	::1	15	2026-06-22 14:48:34.734696
641	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	2	2026-06-22 14:48:35.826042
642	1	/api/cargo/1	GET	\N	200	\N	::1	77	2026-06-22 14:48:54.635861
643	1	/api/cargo/1/items	GET	\N	200	\N	::1	71	2026-06-22 14:48:54.661718
644	1	/api/branches	GET	\N	200	\N	::1	49	2026-06-22 14:49:11.770915
645	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	52	2026-06-22 14:49:11.807429
646	1	/api/v1/insurance/providers	GET	\N	200	\N	::1	11	2026-06-22 14:49:21.673661
647	1	/api/v1/insurance?page=1&limit=20	GET	\N	200	\N	::1	18	2026-06-22 14:49:21.680142
648	1	/api/v1/setup/cities?limit=200	GET	\N	200	\N	::1	7	2026-06-22 14:49:28.151771
649	1	/api/v1/setup/addresses?limit=500	GET	\N	200	\N	::1	49	2026-06-22 14:49:28.195238
650	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	57	2026-06-22 14:49:28.200774
651	1	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	61	2026-06-22 14:49:28.206547
652	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-22 14:49:47.468966
653	1	/api/reports/cargo	GET	\N	200	\N	::1	89	2026-06-22 14:49:47.504121
654	1	/api/reports/branch-summary	GET	\N	200	\N	::1	153	2026-06-22 14:49:47.566469
655	1	/api/reports/revenue	GET	\N	200	\N	::1	186	2026-06-22 14:49:47.600327
656	1	/api/v1/users/roles	GET	\N	200	\N	::1	7	2026-06-22 14:49:53.068181
657	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	15	2026-06-22 14:49:53.074955
658	1	/api/v1/disputes/types	GET	\N	200	\N	::1	13	2026-06-22 14:49:54.070997
659	1	/api/v1/disputes?page=1&limit=20	GET	\N	200	\N	::1	18	2026-06-22 14:49:54.07602
660	1	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	4	2026-06-22 14:49:55.1102
661	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	84	2026-06-22 14:51:04.95773
662	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	14	2026-06-22 14:51:04.978086
663	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	102	2026-06-22 14:51:04.986973
664	1	/api/dashboard/overview	GET	\N	304	\N	::1	113	2026-06-22 14:51:04.991173
665	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	71	2026-06-22 14:51:05.0167
666	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	85	2026-06-22 14:51:05.023217
667	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	75	2026-06-22 14:51:05.02432
668	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	155	2026-06-22 14:51:05.031864
669	1	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	43	2026-06-22 14:51:28.796178
670	1	/api/v1/expense-types	GET	\N	200	\N	::1	7	2026-06-22 14:51:32.847395
671	1	/api/expenses?page=1&limit=20	GET	\N	200	\N	::1	51	2026-06-22 14:51:32.890769
672	1	/api/v1/invoices?page=1&limit=20	GET	\N	200	\N	::1	14	2026-06-22 14:51:34.463741
673	1	/api/salary/charges?page=1&limit=20	GET	\N	200	\N	::1	84	2026-06-22 14:52:21.926113
674	1	/api/reports/cargo	GET	\N	304	\N	::1	52	2026-06-22 14:52:31.151546
675	1	/api/reports/revenue	GET	\N	304	\N	::1	54	2026-06-22 14:52:31.152544
676	1	/api/reports/branch-summary	GET	\N	304	\N	::1	61	2026-06-22 14:52:31.159997
677	1	/api/reports/cargo?branch_id=1	GET	\N	200	\N	::1	79	2026-06-22 14:52:42.247604
678	1	/api/reports/revenue?branch_id=1	GET	\N	200	\N	::1	81	2026-06-22 14:52:42.248245
679	\N	/api/auth/login	POST	\N	200	\N	::1	109	2026-06-22 14:53:13.752825
680	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	13	2026-06-22 14:53:13.819274
681	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	65	2026-06-22 14:53:13.876141
682	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	76	2026-06-22 14:53:13.888836
683	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	82	2026-06-22 14:53:13.892036
684	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	10	2026-06-22 14:53:13.904668
685	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	28	2026-06-22 14:53:13.905986
686	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	112	2026-06-22 14:53:13.920894
687	1	/api/dashboard/overview	GET	\N	304	\N	::1	121	2026-06-22 14:53:13.928092
688	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	154	2026-06-22 14:53:13.975238
689	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-22 14:53:17.314112
690	1	/api/v1/users/3/password	PATCH	\N	200	\N	::1	181	2026-06-22 14:53:40.056996
691	\N	/api/auth/login	POST	\N	403	\N	::1	37	2026-06-22 14:53:52.341717
692	\N	/api/auth/login	POST	\N	403	\N	::1	4	2026-06-22 14:53:58.595554
693	\N	/api/auth/login	POST	\N	403	\N	::1	37	2026-06-22 14:54:18.088008
694	\N	/api/auth/login	POST	\N	200	\N	::1	108	2026-06-22 14:58:11.943832
695	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	16	2026-06-22 14:58:11.97858
696	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	68	2026-06-22 14:58:12.042311
697	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	13	2026-06-22 14:58:12.05585
698	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	94	2026-06-22 14:58:12.064992
699	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	4	2026-06-22 14:58:12.068971
700	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	105	2026-06-22 14:58:12.071028
701	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	112	2026-06-22 14:58:12.079214
702	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	109	2026-06-22 14:58:12.08962
703	1	/api/dashboard/overview	GET	\N	304	\N	::1	253	2026-06-22 14:58:12.217035
704	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	10	2026-06-22 14:58:14.083761
705	1	/api/cargo?limit=100	GET	\N	304	\N	::1	16	2026-06-22 14:58:14.087585
706	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	16	2026-06-22 14:58:14.089795
707	1	/api/cargo/36/items	GET	\N	304	\N	::1	6	2026-06-22 14:58:14.112457
708	1	/api/cargo/36	GET	\N	304	\N	::1	15	2026-06-22 14:58:14.121259
709	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	3	2026-06-22 14:58:14.836672
710	\N	/api/auth/login	POST	\N	200	\N	::1	299	2026-06-22 14:58:53.382078
711	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	15	2026-06-22 14:58:53.484155
712	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	73	2026-06-22 14:58:53.545039
713	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	78	2026-06-22 14:58:53.552181
714	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	110	2026-06-22 14:58:53.598026
715	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	46	2026-06-22 14:58:53.607639
716	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	145	2026-06-22 14:58:53.619887
717	1	/api/dashboard/overview	GET	\N	200	\N	::1	164	2026-06-22 14:58:53.637078
718	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	92	2026-06-22 14:58:53.650868
719	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	199	2026-06-22 14:58:53.667539
720	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	11	2026-06-22 14:58:55.686942
721	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	14	2026-06-22 14:58:55.688402
722	1	/api/cargo?limit=100	GET	\N	200	\N	::1	18	2026-06-22 14:58:55.692491
723	1	/api/cargo/36/items	GET	\N	304	\N	::1	5	2026-06-22 14:58:55.784893
724	1	/api/cargo/36	GET	\N	304	\N	::1	9	2026-06-22 14:58:55.789568
725	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	50	2026-06-22 15:00:18.675067
726	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-22 15:00:27.293372
727	1	/api/v1/insurance/providers	GET	\N	304	\N	::1	51	2026-06-22 15:00:27.333494
728	1	/api/branches	GET	\N	304	\N	::1	10	2026-06-22 15:00:29.644648
729	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	14	2026-06-22 15:00:29.649903
732	\N	/api/cargo?page=1&limit=10	GET	\N	401	\N	::1	22	2026-06-23 04:36:48.327347
731	\N	/api/branches	GET	\N	401	\N	::1	3	2026-06-23 04:36:48.323325
730	\N	/api/v1/setup/branches?limit=200	GET	\N	401	\N	::1	1	2026-06-23 04:36:48.360133
733	\N	/api/auth/login	POST	\N	200	\N	::1	501	2026-06-23 04:37:02.507375
734	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	141	2026-06-23 04:37:02.807298
735	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	150	2026-06-23 04:37:02.817831
736	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	150	2026-06-23 04:37:02.821102
737	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	165	2026-06-23 04:37:02.830018
738	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	70	2026-06-23 04:37:02.841481
739	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	20	2026-06-23 04:37:02.844761
740	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	113	2026-06-23 04:37:02.861139
741	1	/api/dashboard/overview	GET	\N	200	\N	::1	218	2026-06-23 04:37:02.895201
742	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	155	2026-06-23 04:37:02.965684
743	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	11	2026-06-23 04:37:06.731018
744	1	/api/cargo?limit=100	GET	\N	304	\N	::1	18	2026-06-23 04:37:06.737048
745	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	21	2026-06-23 04:37:06.741711
746	1	/api/cargo/36/items	GET	\N	304	\N	::1	9	2026-06-23 04:37:06.808709
747	1	/api/cargo/36	GET	\N	304	\N	::1	16	2026-06-23 04:37:06.813896
748	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	7	2026-06-23 04:37:08.784968
749	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	112	2026-06-23 04:43:35.600781
750	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	118	2026-06-23 04:43:35.634105
751	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	137	2026-06-23 04:43:35.636351
752	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	156	2026-06-23 04:43:35.642074
753	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	44	2026-06-23 04:43:35.664101
754	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	35	2026-06-23 04:43:35.670665
755	1	/api/dashboard/overview	GET	\N	304	\N	::1	194	2026-06-23 04:43:35.682553
756	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	197	2026-06-23 04:43:35.687694
757	1	/api/branches	GET	\N	304	\N	::1	58	2026-06-23 04:43:51.498308
758	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	75	2026-06-23 04:43:51.517599
759	1	/api/v1/insurance/providers	GET	\N	304	\N	::1	9	2026-06-23 04:44:00.934923
760	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-23 04:44:00.93962
761	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	62	2026-06-23 04:44:14.281348
762	1	/api/branches	GET	\N	304	\N	::1	73	2026-06-23 04:52:03.824855
763	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	78	2026-06-23 04:52:03.832042
764	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	7	2026-06-23 04:52:07.257372
765	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	10	2026-06-23 04:52:07.329902
766	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	90	2026-06-23 04:52:07.336496
767	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	25	2026-06-23 04:52:07.343624
768	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	110	2026-06-23 04:52:07.354297
769	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	117	2026-06-23 04:52:07.357064
770	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	100	2026-06-23 04:52:07.362073
771	1	/api/dashboard/overview	GET	\N	304	\N	::1	141	2026-06-23 04:52:07.380863
772	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-23 04:52:17.111297
773	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	11	2026-06-23 04:52:17.113854
774	1	/api/cargo?limit=100	GET	\N	304	\N	::1	14	2026-06-23 04:52:17.115125
775	1	/api/cargo/36	GET	\N	304	\N	::1	22	2026-06-23 04:52:17.20096
776	1	/api/cargo/36/items	GET	\N	304	\N	::1	21	2026-06-23 04:52:17.203678
777	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	3	2026-06-23 04:52:21.604246
778	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	7	2026-06-23 04:52:27.878681
779	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	56	2026-06-23 04:52:27.927833
780	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	62	2026-06-23 04:53:18.799692
781	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	74	2026-06-23 04:53:18.80602
782	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	156	2026-06-23 04:53:18.887096
783	1	/api/cargo?page=1&limit=200&status=Pending	GET	\N	304	\N	::1	51	2026-06-23 04:53:29.116085
784	1	/api/trips/34/cancel	PUT	\N	200	\N	::1	103	2026-06-23 04:53:42.099552
785	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	14	2026-06-23 04:53:42.11947
786	1	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	6	2026-06-23 04:53:45.240993
787	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-23 04:53:49.283446
788	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	8	2026-06-23 04:53:49.286343
789	1	/api/v1/disputes/types	GET	\N	304	\N	::1	7	2026-06-23 04:53:53.038167
790	1	/api/v1/disputes?page=1&limit=20	GET	\N	304	\N	::1	12	2026-06-23 04:53:53.04327
791	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-23 04:54:00.831957
792	1	/api/cargo?limit=100	GET	\N	304	\N	::1	17	2026-06-23 04:54:00.852579
793	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	64	2026-06-23 04:54:00.887914
794	1	/api/cargo/36/items	GET	\N	304	\N	::1	8	2026-06-23 04:54:00.954863
795	1	/api/cargo/36	GET	\N	304	\N	::1	12	2026-06-23 04:54:00.957988
796	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	4	2026-06-23 04:54:03.654847
797	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	10	2026-06-23 04:54:03.660797
798	1	/api/v1/transport/providers	POST	\N	201	\N	::1	58	2026-06-23 04:54:33.348031
799	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	200	\N	::1	5	2026-06-23 04:54:33.361049
800	1	/api/v1/transport/routes?page=1&limit=20	GET	\N	304	\N	::1	149	2026-06-23 04:54:46.376449
801	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-23 04:55:01.232894
802	1	/api/v1/setup/addresses?limit=200	GET	\N	304	\N	::1	4	2026-06-23 04:55:05.2553
803	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	57	2026-06-23 04:56:49.013187
804	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	70	2026-06-23 04:57:54.6377
805	1	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	72	2026-06-23 04:58:01.127051
806	1	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	83	2026-06-23 04:58:01.136218
807	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	83	2026-06-23 04:58:01.137216
808	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	91	2026-06-23 04:58:01.143369
809	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-23 04:58:06.585323
810	1	/api/employees/jobs	GET	\N	304	\N	::1	10	2026-06-23 04:58:06.586497
811	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	150	2026-06-23 05:00:27.697869
812	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	50	2026-06-23 05:03:04.357006
813	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	61	2026-06-23 05:12:37.875861
814	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	65	2026-06-23 05:12:37.880687
815	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	156	2026-06-23 05:16:03.494034
816	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-23 05:16:05.72442
817	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	45	2026-06-23 05:16:05.764885
818	1	/api/v1/setup/addresses?limit=200	GET	\N	304	\N	::1	8	2026-06-23 05:16:08.257938
819	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	35	2026-06-23 05:18:16.339695
820	1	/api/employees?limit=200&page=1	GET	\N	200	\N	::1	56	2026-06-23 05:18:36.963745
821	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	53	2026-06-23 05:20:04.05808
822	1	/api/v1/setup/cities	POST	\N	201	\N	::1	80	2026-06-23 05:22:46.143935
823	1	/api/v1/setup/addresses	POST	\N	201	\N	::1	14	2026-06-23 05:22:46.168741
824	1	/api/v1/setup/addresses?limit=200	GET	\N	200	\N	::1	10	2026-06-23 05:22:46.188835
825	1	/api/v1/setup/branches	POST	\N	201	\N	::1	158	2026-06-23 05:22:58.33346
826	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	200	\N	::1	7	2026-06-23 05:22:58.345429
827	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	55	2026-06-23 05:27:25.408894
828	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	17	2026-06-23 05:27:27.693546
829	1	/api/employees/jobs	GET	\N	304	\N	::1	155	2026-06-23 05:27:27.795825
830	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	10	2026-06-23 05:27:31.371741
831	1	/api/employees/branch/assign	POST	\N	422	\N	::1	5	2026-06-23 05:27:34.762567
832	1	/api/v1/setup/addresses?limit=200	GET	\N	304	\N	::1	66	2026-06-23 05:27:50.209384
833	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	64	2026-06-23 05:30:11.346899
834	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	56	2026-06-23 05:33:27.691203
835	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	48	2026-06-23 05:37:58.23888
836	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	56	2026-06-23 05:37:58.247555
837	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	52	2026-06-23 05:44:00.860601
838	1	/api/accounts?page=1&limit=20	GET	\N	304	\N	::1	12	2026-06-23 05:44:06.23232
839	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	53	2026-06-23 05:44:06.24099
840	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-23 05:44:12.973458
841	1	/api/v1/expense-types	GET	\N	304	\N	::1	5	2026-06-23 05:44:14.251205
842	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	14	2026-06-23 05:44:14.259251
843	1	/api/v1/invoices?page=1&limit=20	GET	\N	200	\N	::1	8	2026-06-23 05:44:15.419112
844	1	/api/salary/charges?page=1&limit=20	GET	\N	304	\N	::1	10	2026-06-23 05:44:21.15074
845	1	/api/employees/jobs	GET	\N	304	\N	::1	47	2026-06-23 05:44:27.464026
846	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-23 05:44:27.464178
847	1	/api/employees/1/schedule	GET	\N	200	\N	::1	15	2026-06-23 05:44:31.999559
848	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	12	2026-06-23 05:44:39.16898
849	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	58	2026-06-23 05:47:28.746146
850	1	/api/employees/1/attendance?month=2026-06	GET	\N	304	\N	::1	11	2026-06-23 05:47:35.724458
851	1	/api/employees/attendance	POST	\N	201	\N	::1	199	2026-06-23 05:48:27.267425
852	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	12	2026-06-23 05:48:27.285735
853	1	/api/employees/1/attendance?month=2026-07	GET	\N	200	\N	::1	88	2026-06-23 05:49:02.109173
854	1	/api/employees/1/attendance?month=2026-06	GET	\N	304	\N	::1	10	2026-06-23 05:49:09.123742
855	1	/api/employees/attendance	POST	\N	201	\N	::1	95	2026-06-23 05:49:37.397854
856	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	14	2026-06-23 05:49:37.420176
857	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	35	2026-06-23 05:49:45.732785
858	1	/api/employees/1/schedule	GET	\N	304	\N	::1	118	2026-06-23 05:49:45.73632
859	1	/api/employees/jobs	GET	\N	304	\N	::1	120	2026-06-23 05:49:45.737315
860	1	/api/employees/schedule	POST	\N	201	\N	::1	80	2026-06-23 05:50:04.677224
861	1	/api/employees/schedule	POST	\N	201	\N	::1	9	2026-06-23 05:50:04.689636
862	1	/api/employees/schedule	POST	\N	201	\N	::1	13	2026-06-23 05:50:04.709621
863	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-23 05:50:04.719162
864	1	/api/employees/schedule	POST	\N	201	\N	::1	7	2026-06-23 05:50:04.730238
865	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-23 05:50:04.737629
866	1	/api/employees/1/schedule	GET	\N	200	\N	::1	6	2026-06-23 05:50:04.751667
867	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	49	2026-06-23 05:50:14.910175
868	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-23 05:50:16.196706
869	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	47	2026-06-23 05:50:16.239465
1396	\N	/api/auth/login	POST	\N	200	\N	::1	228	2026-06-26 10:14:46.657674
1397	1	/api/cargo	GET	\N	400	\N	::1	5	2026-06-26 10:14:46.690609
1458	\N	/api/auth/login	POST	\N	200	\N	::1	200	2026-06-26 10:22:13.264277
1460	1	/api/customers?customer_type=one_time	GET	\N	200	\N	::1	11	2026-06-26 10:22:13.382875
1511	1	/api/dashboard/overview	GET	\N	200	\N	::1	187	2026-06-26 10:34:23.831929
1513	36	/api/dashboard/overview	GET	\N	200	\N	::1	8	2026-06-26 10:34:23.87915
1516	1	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 10:34:23.963656
1518	36	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 10:34:23.987404
1520	1	/api/trips	GET	\N	200	\N	::1	8	2026-06-26 10:34:24.017431
1522	36	/api/trips	GET	\N	200	\N	::1	5	2026-06-26 10:34:24.04777
1556	36	/api/cargo	GET	\N	200	\N	::1	22	2026-06-26 11:04:50.389283
1589	36	/api/customers/50	GET	\N	200	\N	::1	16	2026-06-26 11:08:08.696684
1591	36	/api/cargo	POST	\N	201	\N	::1	34	2026-06-26 11:08:08.768742
1593	36	/api/cargo/38	DELETE	\N	403	\N	::1	5	2026-06-26 11:08:08.798418
1625	\N	/api/auth/login	POST	\N	401	\N	::1	10	2026-06-26 11:15:59.301673
1626	\N	/api/auth/login	POST	\N	401	\N	::1	64	2026-06-26 11:15:59.311247
1660	\N	/api/auth/login	POST	\N	200	\N	::1	428	2026-06-26 11:27:38.352895
1661	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	69	2026-06-26 11:27:38.950877
1672	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	44	2026-06-26 11:27:47.622674
1683	1	/api/customers/43	PUT	\N	200	\N	::1	135	2026-06-26 11:28:56.285142
1701	\N	/api/auth/login	POST	\N	200	\N	::1	398	2026-06-26 11:42:59.675208
1739	3	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	42	2026-06-26 13:55:34.716553
1740	3	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	4	2026-06-26 13:55:36.357249
1742	3	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	10	2026-06-26 13:55:39.695534
1763	38	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	55	2026-06-26 13:58:09.385666
1821	38	/api/customers?limit=200	GET	\N	304	\N	::1	46	2026-06-26 14:09:55.951199
1822	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	4	2026-06-26 14:09:56.085138
1851	38	/api/customers?page=1&limit=100	GET	\N	304	\N	::1	158	2026-06-26 14:14:21.290859
1877	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	46	2026-06-26 14:20:21.314957
1878	38	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	153	2026-06-26 14:20:21.422594
1880	38	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	15	2026-06-26 14:20:35.599169
1884	38	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	6	2026-06-26 14:20:36.865116
1908	42	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	21	2026-06-27 00:32:16.089518
1910	42	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	8	2026-06-27 00:32:21.765599
1911	42	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	15	2026-06-27 00:32:22.916234
1947	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	9	2026-06-27 00:34:43.292002
1950	1	/api/employees?limit=200	GET	\N	200	\N	::1	8	2026-06-27 00:34:51.226677
1952	1	/api/employees/34/schedule	GET	\N	200	\N	::1	7	2026-06-27 00:34:55.958626
1954	1	/api/employees/36/schedule	GET	\N	200	\N	::1	5	2026-06-27 00:35:02.949391
1956	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	10	2026-06-27 00:35:09.731453
1958	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	5	2026-06-27 00:35:18.756122
1960	1	/api/employees/schedule	POST	\N	201	\N	::1	10	2026-06-27 00:35:29.487735
1962	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-27 00:35:29.505717
1964	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-27 00:35:29.524631
1993	1	/api/employees?limit=200	GET	\N	304	\N	::1	54	2026-06-27 01:05:07.298371
2021	1	/api/employees	GET	\N	200	\N	::1	156	2026-06-27 01:48:44.032538
2060	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	60	2026-06-27 01:56:21.046943
2077	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	70	2026-06-27 02:53:57.884884
2091	1	/api/employees/attendance	POST	\N	500	\N	::1	35	2026-06-27 03:07:00.48186
2114	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=37	GET	\N	200	\N	::1	148	2026-06-27 03:15:51.453744
2116	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=1	GET	\N	200	\N	::1	13	2026-06-27 03:15:57.406256
2117	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	18	2026-06-27 03:16:02.628134
2144	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	120	2026-06-27 03:22:48.963915
2156	1	/api/v1/users/42	PUT	\N	200	\N	::1	91	2026-06-27 03:25:24.407289
2157	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	15	2026-06-27 03:25:24.437027
2158	1	/api/v1/disputes?page=1&limit=20	GET	\N	304	\N	::1	32	2026-06-27 03:25:29.588768
2160	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	15	2026-06-27 03:25:35.011471
2165	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	26	2026-06-27 03:25:40.051802
2167	1	/api/salary/charges?page=1&limit=20	GET	\N	304	\N	::1	36	2026-06-27 03:25:43.679727
2171	1	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	163	2026-06-27 03:25:51.165476
2172	1	/api/branches	GET	\N	200	\N	::1	15	2026-06-27 03:25:59.082297
2173	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	33	2026-06-27 03:25:59.104571
2175	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	19	2026-06-27 03:26:06.05427
2182	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	79	2026-06-27 03:27:27.190038
2196	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	42	2026-06-27 03:34:02.886613
2218	1	/api/employees?limit=200	GET	\N	304	\N	::1	227	2026-06-27 06:15:51.012152
2229	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	75	2026-06-27 06:26:15.757123
2242	1	/api/employees/40/schedule	GET	\N	200	\N	::1	6	2026-06-27 06:28:44.223534
2250	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	53	2026-06-27 06:29:59.08281
870	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	8	2026-06-23 05:50:18.012965
871	1	/api/v1/transport/providers?limit=200	GET	\N	200	\N	::1	56	2026-06-23 05:50:18.062097
872	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	60	2026-06-23 05:50:18.064314
873	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	77	2026-06-23 06:00:38.203632
874	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	77	2026-06-23 06:00:38.204781
875	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	80	2026-06-23 06:00:38.208267
876	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	124	2026-06-23 06:00:38.250982
877	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	68	2026-06-23 06:06:20.271623
878	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	70	2026-06-23 06:06:20.274592
879	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	102	2026-06-23 06:06:20.30404
880	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	49	2026-06-23 06:06:35.911476
881	1	/api/employees/jobs	GET	\N	304	\N	::1	85	2026-06-23 06:06:35.914141
882	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	51	2026-06-23 06:10:04.067383
883	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	55	2026-06-23 06:11:18.498165
884	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	53	2026-06-23 06:11:18.533219
885	1	/api/employees/jobs	GET	\N	304	\N	::1	78	2026-06-23 06:11:39.470393
886	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	47	2026-06-23 06:12:56.223442
887	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	102	2026-06-23 06:15:11.541278
888	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	63	2026-06-23 06:27:44.998916
889	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	85	2026-06-23 06:27:45.018648
890	1	/api/employees/jobs	GET	\N	304	\N	::1	121	2026-06-23 06:27:45.055744
891	1	/api/employees/jobs	GET	\N	304	\N	::1	217	2026-06-23 08:11:50.613155
892	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	194	2026-06-23 08:11:50.721792
893	1	/api/employees?page=1&limit=20	GET	\N	200	\N	::1	12	2026-06-23 08:11:50.8675
894	1	/api/employees/jobs	GET	\N	200	\N	::1	44	2026-06-23 08:11:50.869905
895	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	45	2026-06-23 08:11:50.870687
896	1	/api/employees?limit=200	GET	\N	200	\N	::1	8	2026-06-23 08:11:52.557855
897	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	404	\N	::1	6	2026-06-23 08:11:55.655054
898	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	404	\N	::1	2	2026-06-23 08:11:56.696312
899	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	404	\N	::1	2	2026-06-23 08:11:58.708941
900	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-23 08:11:59.715499
901	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	18	2026-06-23 08:12:22.391997
902	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	55	2026-06-23 08:12:22.434813
903	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	200	\N	::1	64	2026-06-23 08:12:24.015146
904	1	/api/employees?limit=200	GET	\N	304	\N	::1	47	2026-06-23 08:12:34.421866
905	1	/api/employees/1/schedule	GET	\N	304	\N	::1	31	2026-06-23 08:12:36.862744
906	1	/api/employees/jobs	GET	\N	304	\N	::1	2440	2026-06-23 08:13:01.44328
907	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	2417	2026-06-23 08:13:01.449697
908	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	2974	2026-06-23 08:13:01.450927
909	1	/api/employees/schedule	POST	\N	201	\N	::1	75	2026-06-23 08:13:14.47097
910	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-23 08:13:14.480302
911	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 08:13:14.489868
912	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-23 08:13:14.498926
913	1	/api/employees/schedule	POST	\N	201	\N	::1	3	2026-06-23 08:13:14.504765
914	1	/api/employees/1/schedule	GET	\N	200	\N	::1	6	2026-06-23 08:13:14.516523
915	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	51	2026-06-23 08:14:59.262455
916	1	/api/employees?limit=200	GET	\N	304	\N	::1	51	2026-06-23 08:14:59.294689
917	1	/api/employees/1/schedule	GET	\N	304	\N	::1	11	2026-06-23 08:15:00.579487
918	1	/api/employees/schedule	POST	\N	201	\N	::1	10	2026-06-23 08:15:06.948538
919	1	/api/employees/schedule	POST	\N	201	\N	::1	8	2026-06-23 08:15:06.962706
920	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 08:15:06.972858
921	1	/api/employees/schedule	POST	\N	201	\N	::1	7	2026-06-23 08:15:06.98482
922	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-23 08:15:06.994425
923	1	/api/employees/1/schedule	GET	\N	304	\N	::1	5	2026-06-23 08:15:07.005849
924	1	/api/employees/1/schedule	GET	\N	304	\N	::1	78	2026-06-23 08:15:37.853171
925	1	/api/employees/1/schedule	GET	\N	304	\N	::1	189	2026-06-23 08:16:38.006664
926	1	/api/employees?limit=200	GET	\N	304	\N	::1	169	2026-06-23 08:18:23.658862
927	1	/api/employees/1/schedule	GET	\N	304	\N	::1	202	2026-06-23 08:18:23.663449
928	1	/api/employees/1/schedule	GET	\N	304	\N	::1	204	2026-06-23 08:19:17.189931
929	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	546	2026-06-23 10:21:10.254356
930	1	/api/employees/1/schedule	GET	\N	304	\N	::1	685	2026-06-23 10:21:10.393833
931	1	/api/employees?limit=200	GET	\N	304	\N	::1	569	2026-06-23 10:21:10.446425
932	1	/api/employees/1/schedule	GET	\N	304	\N	::1	61	2026-06-23 10:29:02.651036
933	1	/api/employees?limit=200	GET	\N	304	\N	::1	43	2026-06-23 10:29:02.743177
934	1	/api/employees?limit=200	GET	\N	304	\N	::1	9	2026-06-23 10:29:07.984498
935	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	20	2026-06-23 10:29:07.988218
936	1	/api/employees/1/schedule	GET	\N	304	\N	::1	84	2026-06-23 10:29:31.381285
937	1	/api/employees/schedule	POST	\N	201	\N	::1	202	2026-06-23 10:30:17.391103
938	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 10:30:17.404314
939	1	/api/employees/schedule	POST	\N	201	\N	::1	16	2026-06-23 10:30:17.426874
940	1	/api/employees/schedule	POST	\N	201	\N	::1	7	2026-06-23 10:30:17.439687
942	1	/api/employees/1/schedule	GET	\N	304	\N	::1	9	2026-06-23 10:30:17.472075
1398	\N	/api/auth/login	POST	\N	200	\N	::1	266	2026-06-26 10:15:27.149469
1459	1	/api/customers?limit=5	GET	\N	200	\N	::1	47	2026-06-26 10:22:13.339068
1512	35	/api/dashboard/overview	GET	\N	200	\N	::1	13	2026-06-26 10:34:23.862227
1514	37	/api/dashboard/overview	GET	\N	200	\N	::1	4	2026-06-26 10:34:23.89066
1515	\N	/api/cargo/track/WAAFI999	GET	\N	404	\N	::1	3	2026-06-26 10:34:23.901651
1517	35	/api/reports/cargo	GET	\N	200	\N	::1	2	2026-06-26 10:34:23.973858
1519	37	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 10:34:23.999403
1521	35	/api/trips	GET	\N	200	\N	::1	10	2026-06-26 10:34:24.035231
1523	37	/api/trips	GET	\N	403	\N	::1	1	2026-06-26 10:34:24.056461
1524	1	/api/v1/invoices	GET	\N	200	\N	::1	4	2026-06-26 10:34:24.06784
1525	36	/api/v1/invoices	GET	\N	200	\N	::1	3	2026-06-26 10:34:24.079419
1526	35	/api/v1/invoices	GET	\N	200	\N	::1	2	2026-06-26 10:34:24.090266
1527	37	/api/v1/invoices	GET	\N	403	\N	::1	1	2026-06-26 10:34:24.099939
1557	\N	/api/auth/login	POST	\N	200	\N	::1	357	2026-06-26 11:05:11.16622
1595	1	/api/customers/50	DELETE	\N	200	\N	::1	68	2026-06-26 11:08:09.184951
1627	\N	/api/auth/login	POST	\N	401	\N	::1	72	2026-06-26 11:15:59.466713
1662	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	260	2026-06-26 11:27:39.154315
1663	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	326	2026-06-26 11:27:39.225949
1665	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	356	2026-06-26 11:27:39.244271
1684	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	28	2026-06-26 11:28:56.333933
1702	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	4	2026-06-26 13:51:41.468685
1741	3	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	46	2026-06-26 13:55:36.400461
1743	3	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	5	2026-06-26 13:55:49.16143
1766	38	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	2	2026-06-26 13:58:10.403823
1767	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:58:12.416398
1770	38	/api/v1/setup/addresses?limit=500	GET	\N	403	\N	::1	2	2026-06-26 13:58:16.437097
1771	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 13:58:24.498339
1772	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:58:24.51022
1823	38	/api/branches	GET	\N	403	\N	::1	36	2026-06-26 14:12:10.750138
1824	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 14:12:10.759877
1852	38	/api/customers/42	GET	\N	304	\N	::1	75	2026-06-26 14:14:32.107911
1854	38	/api/customers?limit=200	GET	\N	304	\N	::1	10	2026-06-26 14:14:37.812961
1879	38	/api/cargo/39	GET	\N	304	\N	::1	10	2026-06-26 14:20:25.582715
1883	38	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	53	2026-06-26 14:20:35.633378
1909	42	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	153	2026-06-27 00:32:16.167885
1913	42	/api/v1/routes?limit=200	GET	\N	304	\N	::1	16	2026-06-27 00:32:25.943288
1967	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	154	2026-06-27 00:35:53.764057
1994	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	70	2026-06-27 01:13:01.764622
1996	1	/api/employees?limit=200	GET	\N	304	\N	::1	77	2026-06-27 01:13:01.773663
2023	\N	/api/auth/login	POST	\N	200	\N	::1	128	2026-06-27 01:52:05.584773
2025	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	13	2026-06-27 01:52:05.670708
2027	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	5	2026-06-27 01:52:05.699595
2061	1	/api/employees?limit=200	GET	\N	304	\N	::1	78	2026-06-27 01:56:32.916911
2076	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	59	2026-06-27 02:53:57.874996
2093	\N	/api/auth/login	POST	\N	200	\N	::1	132	2026-06-27 03:08:15.022669
2095	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	8	2026-06-27 03:08:15.111561
2115	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=35	GET	\N	200	\N	::1	32	2026-06-27 03:15:54.14899
2119	1	/api/salary/attendance-summary?employee_id=37&month=2026-06	GET	\N	200	\N	::1	33	2026-06-27 03:16:09.025884
2145	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	221	2026-06-27 03:22:49.075791
2159	1	/api/v1/disputes/types	GET	\N	304	\N	::1	114	2026-06-27 03:25:29.673127
2162	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-27 03:25:37.948846
2164	1	/api/v1/expense-types	GET	\N	304	\N	::1	14	2026-06-27 03:25:40.042113
2183	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	65	2026-06-27 03:27:27.191335
2198	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	241	2026-06-27 03:34:18.073936
2200	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	20	2026-06-27 03:34:22.756225
2204	1	/api/employees/34/schedule	GET	\N	304	\N	::1	22	2026-06-27 03:34:29.810729
2206	1	/api/employees/35/schedule	GET	\N	304	\N	::1	10	2026-06-27 03:34:34.625917
2208	1	/api/employees/38/schedule	GET	\N	200	\N	::1	7	2026-06-27 03:34:36.466217
2219	1	/api/employees/38/schedule	GET	\N	304	\N	::1	144	2026-06-27 06:17:16.778984
2220	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	12	2026-06-27 06:17:18.033345
2230	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	92	2026-06-27 06:27:19.664342
2244	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	55	2026-06-27 06:29:05.74462
2251	1	/api/employees/jobs	GET	\N	304	\N	::1	87	2026-06-27 06:29:59.11801
2256	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	28	2026-06-27 06:30:13.858352
2264	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	92	2026-06-27 07:01:15.237656
2272	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	11	2026-06-27 07:01:48.21541
2275	1	/api/cargo/37	PUT	\N	200	\N	::1	58	2026-06-27 07:02:36.327659
2278	1	/api/cargo/36	PUT	\N	200	\N	::1	51	2026-06-27 07:03:18.307368
941	1	/api/employees/schedule	POST	\N	201	\N	::1	9	2026-06-23 10:30:17.455447
943	1	/api/employees/1/schedule	GET	\N	304	\N	::1	94	2026-06-23 10:30:55.707011
944	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	24	2026-06-23 10:30:57.846001
945	1	/api/employees/attendance	POST	\N	201	\N	::1	10	2026-06-23 10:31:04.023698
946	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	200	\N	::1	5	2026-06-23 10:31:04.037547
947	1	/api/employees?limit=200	GET	\N	304	\N	::1	48	2026-06-23 10:31:16.861109
948	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	23	2026-06-23 10:31:17.718016
949	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	198	2026-06-23 10:32:00.191018
950	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	167	2026-06-23 10:35:41.697859
951	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	240	2026-06-23 10:36:49.533992
952	1	/api/employees/attendance/3	PUT	\N	404	\N	::1	43	2026-06-23 10:37:19.326052
953	1	/api/employees/attendance/3	PUT	\N	404	\N	::1	37	2026-06-23 10:37:32.098492
954	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	14	2026-06-23 10:37:36.600664
955	1	/api/employees/attendance/3	PUT	\N	404	\N	::1	38	2026-06-23 10:38:03.701779
956	1	/api/employees/attendance/3	PUT	\N	404	\N	::1	43	2026-06-23 10:38:16.588291
957	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	91	2026-06-23 10:38:35.015648
958	1	/api/employees?limit=200	GET	\N	304	\N	::1	14	2026-06-23 10:38:37.695062
959	1	/api/employees/1/schedule	GET	\N	304	\N	::1	5	2026-06-23 10:38:38.941051
960	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-23 10:38:45.722619
961	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-23 10:38:45.734608
962	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 10:38:45.745638
963	1	/api/employees/1/schedule/4	DELETE	\N	404	\N	::1	4	2026-06-23 10:38:45.756716
964	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-23 10:38:49.648741
965	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-23 10:38:49.659222
966	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 10:38:49.670567
967	1	/api/employees/1/schedule/4	DELETE	\N	404	\N	::1	3	2026-06-23 10:38:49.678984
968	1	/api/employees/1/schedule	GET	\N	304	\N	::1	84	2026-06-23 10:39:10.074572
969	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	62	2026-06-23 10:39:35.844619
970	1	/api/employees?limit=200	GET	\N	304	\N	::1	68	2026-06-23 10:39:35.853727
971	1	/api/employees?limit=200	GET	\N	304	\N	::1	93	2026-06-23 10:45:48.31808
972	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	22	2026-06-23 10:45:53.132875
973	1	/api/employees?limit=200	GET	\N	304	\N	::1	11	2026-06-23 10:45:53.301186
974	1	/api/employees/1/schedule	GET	\N	304	\N	::1	12	2026-06-23 10:45:57.144217
975	1	/api/employees/schedule	POST	\N	201	\N	::1	13	2026-06-23 10:46:03.852602
976	1	/api/employees/schedule	POST	\N	201	\N	::1	7	2026-06-23 10:46:03.86639
977	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 10:46:03.878624
978	1	/api/employees/1/schedule/4	DELETE	\N	200	\N	::1	9	2026-06-23 10:46:03.894464
979	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-23 10:46:03.90484
980	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-23 10:46:03.916928
981	1	/api/employees/1/schedule	GET	\N	200	\N	::1	7	2026-06-23 10:46:03.931461
982	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	304	\N	::1	14	2026-06-23 10:46:07.337825
983	1	/api/employees/attendance/3	PUT	\N	200	\N	::1	90	2026-06-23 10:46:34.46223
984	1	/api/employees/attendance/daily?date=2026-06-23	GET	\N	200	\N	::1	19	2026-06-23 10:46:34.492702
985	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	62	2026-06-23 10:47:01.920061
986	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	60	2026-06-23 10:49:04.907187
987	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	200	\N	::1	76	2026-06-23 11:01:13.187996
988	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-23 11:01:15.094772
989	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	59	2026-06-23 11:01:15.14142
990	1	/api/v1/setup/addresses?limit=200	GET	\N	200	\N	::1	8	2026-06-23 11:01:18.091608
991	1	/api/employees?limit=200&page=1	GET	\N	304	\N	::1	14	2026-06-23 11:01:18.099851
992	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	56	2026-06-23 11:02:34.801449
993	1	/api/v1/setup/cities	POST	\N	201	\N	::1	49	2026-06-23 11:02:59.40917
994	1	/api/v1/setup/addresses	POST	\N	201	\N	::1	7	2026-06-23 11:02:59.42308
995	1	/api/v1/setup/addresses?limit=200	GET	\N	200	\N	::1	6	2026-06-23 11:02:59.436059
996	1	/api/v1/setup/branches	POST	\N	201	\N	::1	52	2026-06-23 11:03:53.283902
997	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	200	\N	::1	9	2026-06-23 11:03:53.303565
998	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	48	2026-06-23 11:04:18.060375
999	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	51	2026-06-23 11:04:18.064184
1000	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	200	\N	::1	52	2026-06-23 11:06:56.504555
1001	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	61	2026-06-23 11:08:16.904813
1002	1	/api/v1/setup/addresses?limit=200	GET	\N	200	\N	::1	13	2026-06-23 11:08:18.382319
1003	1	/api/employees?limit=200&page=1	GET	\N	304	\N	::1	67	2026-06-23 11:08:18.439147
1004	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	105	2026-06-23 11:13:16.023903
1005	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	121	2026-06-23 11:13:16.047934
1006	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	68	2026-06-23 11:15:59.676971
1007	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-23 11:16:01.714248
1008	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	56	2026-06-23 11:16:01.764909
1009	1	/api/v1/setup/addresses?limit=200	GET	\N	304	\N	::1	8	2026-06-23 11:16:03.698873
1010	1	/api/employees?limit=200&page=1	GET	\N	304	\N	::1	11	2026-06-23 11:16:03.703189
1012	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	2	2026-06-25 06:33:37.085041
1011	\N	/api/v1/setup/branches?page=1&limit=20	GET	\N	401	\N	::1	2	2026-06-25 06:33:37.081893
1013	\N	/api/v1/auth/login	POST	\N	200	\N	::1	344	2026-06-25 13:14:03.846798
1014	1	/api/v1/auth/me	GET	\N	200	\N	::1	56	2026-06-25 13:14:21.53595
1015	\N	/api/v1/auth/login	POST	\N	401	\N	::1	204	2026-06-25 13:14:21.849237
1016	\N	/api/v1/setup/branches	GET	\N	401	\N	::1	2	2026-06-25 13:14:21.906123
1017	1	/api/v1/setup/countries	GET	\N	200	\N	::1	57	2026-06-25 13:14:47.062856
1018	1	/api/v1/setup/cities?country=Somalia&limit=5	GET	\N	200	\N	::1	12	2026-06-25 13:14:47.183561
1019	1	/api/v1/setup/branches	GET	\N	200	\N	::1	11	2026-06-25 13:14:47.319798
1020	1	/api/v1/setup/branches/1	GET	\N	200	\N	::1	5	2026-06-25 13:14:47.448597
1021	1	/api/v1/customers?limit=3	GET	\N	400	\N	::1	45	2026-06-25 13:15:17.32786
1022	\N	/api/v1/cargo?limit=3	GET	\N	404	\N	::1	2	2026-06-25 13:15:17.414902
1023	\N	/api/v1/cargo/statuses	GET	\N	404	\N	::1	2	2026-06-25 13:15:17.593001
1024	1	/api/v1/customers?limit=3	GET	\N	200	\N	::1	95	2026-06-25 13:15:53.933019
1025	1	/api/cargo?limit=3	GET	\N	200	\N	::1	20	2026-06-25 13:15:54.046747
1026	1	/api/dashboard	GET	\N	404	\N	::1	4	2026-06-25 13:15:54.17295
1027	1	/api/trips?limit=3	GET	\N	200	\N	::1	16	2026-06-25 13:15:54.322858
1028	1	/api/payments?limit=3	GET	\N	200	\N	::1	8	2026-06-25 13:15:54.446658
1029	\N	/api/v1/dashboard	GET	\N	404	\N	::1	1	2026-06-25 13:16:15.968155
1030	1	/api/dashboard	GET	\N	404	\N	::1	47	2026-06-25 13:16:16.007289
1031	1	/api/expenses?limit=3	GET	\N	200	\N	::1	15	2026-06-25 13:16:16.159691
1032	1	/api/accounts?limit=3	GET	\N	200	\N	::1	13	2026-06-25 13:16:16.30665
1033	1	/api/employees?limit=3	GET	\N	200	\N	::1	16	2026-06-25 13:16:16.450463
1034	1	/api/salary?limit=3	GET	\N	404	\N	::1	2	2026-06-25 13:16:16.580669
1035	1	/api/reports	GET	\N	404	\N	::1	4	2026-06-25 13:16:16.749444
1036	1	/api/dashboard/overview	GET	\N	200	\N	::1	100	2026-06-25 13:16:44.610104
1037	1	/api/salary/charges	GET	\N	200	\N	::1	22	2026-06-25 13:16:44.730246
1038	1	/api/salary/tax-brackets	GET	\N	200	\N	::1	8	2026-06-25 13:16:44.862515
1039	1	/api/reports/revenue	GET	\N	200	\N	::1	9	2026-06-25 13:16:45.003457
1040	1	/api/reports/branch-summary	GET	\N	200	\N	::1	8	2026-06-25 13:16:45.138128
1041	1	/api/v1/transport/providers?limit=5	GET	\N	200	\N	::1	48	2026-06-25 13:17:01.989278
1042	1	/api/v1/routes	GET	\N	200	\N	::1	8	2026-06-25 13:17:02.095514
1043	1	/api/v1/invoices?limit=3	GET	\N	200	\N	::1	9	2026-06-25 13:17:02.215508
1044	1	/api/v1/disputes?limit=3	GET	\N	200	\N	::1	10	2026-06-25 13:17:02.346366
1045	1	/api/v1/users?limit=3	GET	\N	200	\N	::1	9	2026-06-25 13:17:02.481998
1046	1	/api/v1/notifications	GET	\N	200	\N	::1	7	2026-06-25 13:17:02.624958
1047	1	/api/v1/customers	POST	\N	201	\N	::1	123	2026-06-25 13:18:13.047288
1048	1	/api/cargo/1	GET	\N	200	\N	::1	14	2026-06-25 13:18:13.169831
1049	1	/api/cargo/1/timeline	GET	\N	200	\N	::1	31	2026-06-25 13:18:13.365885
1050	\N	/api/cargo/track/CRG100001	GET	\N	200	\N	::1	6	2026-06-25 13:18:13.556131
1051	1	/api/cargo	POST	\N	201	\N	::1	79	2026-06-25 13:18:32.426656
1052	1	/api/cargo	POST	\N	422	\N	::1	10	2026-06-25 13:18:32.502227
1053	1	/api/cargo/1/status	PUT	\N	422	\N	::1	4	2026-06-25 13:18:32.62077
1054	1	/api/payments?cargo_id=1	GET	\N	200	\N	::1	48	2026-06-25 13:19:25.194192
1055	1	/api/payments	GET	\N	200	\N	::1	12	2026-06-25 13:19:25.252616
1056	1	/api/v1/expense-types	GET	\N	200	\N	::1	6	2026-06-25 13:19:25.383391
1057	1	/api/v1/insurance/providers	GET	\N	200	\N	::1	6	2026-06-25 13:19:25.507487
1058	1	/api/v1/setup/addresses?limit=5	GET	\N	200	\N	::1	9	2026-06-25 13:19:25.654805
1059	1	/api/payments/cargo/1	GET	\N	200	\N	::1	49	2026-06-25 13:21:14.825352
1060	1	/api/expenses?limit=3	GET	\N	200	\N	::1	15	2026-06-25 13:21:14.886208
1061	1	/api/expense-payments?limit=3	GET	\N	404	\N	::1	4	2026-06-25 13:21:15.037082
1062	1	/api/branches	GET	\N	200	\N	::1	9	2026-06-25 13:21:15.17625
1063	1	/api/trips/35	GET	\N	200	\N	::1	11	2026-06-25 13:21:15.2985
1064	1	/api/cargo/1/status	PUT	\N	200	\N	::1	75	2026-06-25 13:22:46.582526
1065	1	/api/payments	POST	\N	201	\N	::1	31	2026-06-25 13:22:46.705684
1066	1	/api/v1/setup/cities	POST	\N	201	\N	::1	15	2026-06-25 13:22:46.861026
1067	1	/api/v1/setup/cities	POST	\N	201	\N	::1	17	2026-06-25 13:22:47.009209
1068	1	/api/v1/customers/42	PUT	\N	200	\N	::1	13	2026-06-25 13:22:47.175524
1069	1	/api/v1/customers?limit=3	GET	\N	200	\N	::1	94	2026-06-25 13:24:50.888495
1070	1	/api/v1/customers?limit=3	GET	\N	200	\N	::1	15	2026-06-25 13:24:51.05051
1071	1	/api/cargo/1	GET	\N	404	\N	::1	11	2026-06-25 13:24:51.193909
1072	1	/api/v1/setup/branches/999	DELETE	\N	404	\N	::1	5	2026-06-25 13:24:51.321068
1073	1	/api/cargo/99999	GET	\N	404	\N	::1	7	2026-06-25 13:24:51.468619
1074	\N	/api/v1/auth/me	GET	\N	401	\N	::1	1	2026-06-25 13:24:51.600397
1075	\N	/api/auth/login	POST	\N	200	\N	::1	274	2026-06-25 13:26:06.477445
1076	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	24	2026-06-25 13:26:06.780526
1077	1	/api/v1/transport/providers?limit=100	GET	\N	200	\N	::1	114	2026-06-25 13:26:06.879586
1078	1	/api/payments?limit=100&page=1	GET	\N	200	\N	::1	128	2026-06-25 13:26:06.890614
1079	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-25 13:26:06.911994
1080	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	19	2026-06-25 13:26:06.913533
1081	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	177	2026-06-25 13:26:06.937835
1082	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	162	2026-06-25 13:26:06.946301
1083	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	153	2026-06-25 13:26:06.987963
1084	1	/api/dashboard/overview	GET	\N	200	\N	::1	227	2026-06-25 13:26:06.991762
1085	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	71	2026-06-25 13:26:17.588782
1086	1	/api/cargo?limit=100	GET	\N	200	\N	::1	69	2026-06-25 13:26:17.627643
1087	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	121	2026-06-25 13:26:17.637549
1088	1	/api/cargo/37/items	GET	\N	200	\N	::1	7	2026-06-25 13:26:17.923758
1089	1	/api/cargo/37	GET	\N	200	\N	::1	22	2026-06-25 13:26:17.940745
1090	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	10	2026-06-25 13:26:25.054108
1091	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	18	2026-06-25 13:26:31.842241
1092	1	/api/branches	GET	\N	200	\N	::1	57	2026-06-25 13:26:31.852139
1093	1	/api/branches	GET	\N	304	\N	::1	71	2026-06-25 13:26:51.98595
1094	1	/api/cargo/37	GET	\N	304	\N	::1	69	2026-06-25 13:26:52.013478
1095	1	/api/cargo/37/status	PUT	\N	200	\N	::1	89	2026-06-25 13:26:59.693598
1096	1	/api/cargo/37	GET	\N	200	\N	::1	5	2026-06-25 13:26:59.706888
1097	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	16	2026-06-25 13:27:03.353802
1098	1	/api/v1/insurance/providers	GET	\N	304	\N	::1	48	2026-06-25 13:27:15.686133
1099	1	/api/v1/insurance?page=1&limit=20	GET	\N	304	\N	::1	176	2026-06-25 13:27:15.812148
1100	1	/api/v1/setup/cities?limit=200	GET	\N	200	\N	::1	77	2026-06-25 13:27:32.969572
1101	1	/api/v1/setup/addresses?limit=500	GET	\N	200	\N	::1	85	2026-06-25 13:27:32.979336
1102	1	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	91	2026-06-25 13:27:32.988588
1103	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	100	2026-06-25 13:27:32.991961
1104	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	59	2026-06-25 13:27:45.518465
1105	1	/api/employees/jobs	GET	\N	304	\N	::1	39	2026-06-25 13:27:45.571726
1106	1	/api/employees?limit=200	GET	\N	304	\N	::1	14	2026-06-25 13:27:47.415701
1107	1	/api/employees/1/schedule	GET	\N	304	\N	::1	9	2026-06-25 13:27:50.012516
1108	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-25 13:27:56.717959
1109	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-25 13:27:56.727419
1110	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-25 13:27:56.737468
1111	1	/api/employees/schedule	POST	\N	201	\N	::1	5	2026-06-25 13:27:56.748125
1112	1	/api/employees/schedule	POST	\N	201	\N	::1	4	2026-06-25 13:27:56.759047
1113	1	/api/employees/1/schedule	GET	\N	304	\N	::1	4	2026-06-25 13:27:56.770043
1114	1	/api/employees/attendance/daily?date=2026-06-25	GET	\N	200	\N	::1	11	2026-06-25 13:27:59.984279
1115	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-25 13:28:04.833461
1116	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	5	2026-06-25 13:28:07.062773
1117	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-25 13:28:07.068462
1118	1	/api/v1/routes?limit=200	GET	\N	200	\N	::1	10	2026-06-25 13:28:10.096902
1119	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	48	2026-06-25 13:28:10.135934
1120	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	54	2026-06-25 13:28:10.140685
1121	1	/api/cargo?page=1&limit=200&status=Pending	GET	\N	200	\N	::1	14	2026-06-25 13:28:16.079535
1122	1	/api/trips/35/complete	PUT	\N	200	\N	::1	5	2026-06-25 13:28:23.788421
1123	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	11	2026-06-25 13:28:23.813032
1124	1	/api/trips/36/complete	PUT	\N	200	\N	::1	4	2026-06-25 13:28:26.097289
1125	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	5	2026-06-25 13:28:26.106414
1126	1	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	7	2026-06-25 13:28:28.266987
1127	1	/api/v1/disputes/types	GET	\N	304	\N	::1	5	2026-06-25 13:28:35.932835
1128	1	/api/v1/disputes?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-25 13:28:35.937463
1129	1	/api/v1/users/roles	GET	\N	304	\N	::1	8	2026-06-25 13:28:38.41386
1130	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	11	2026-06-25 13:28:38.415598
1131	1	/api/auth/logout	POST	\N	200	\N	::1	5	2026-06-25 13:28:47.965534
1132	\N	/api/auth/login	POST	\N	403	\N	::1	3	2026-06-25 13:28:53.116551
1133	\N	/api/v1/setup/cities	POST	\N	401	\N	::1	7	2026-06-26 08:36:22.804702
1134	\N	/api/v1/setup/addresses	POST	\N	401	\N	::1	2	2026-06-26 08:36:22.887588
1135	\N	/api/v1/auth/login	POST	\N	200	\N	::1	781	2026-06-26 08:36:28.29631
1136	1	/api/v1/setup/cities	POST	\N	201	\N	::1	161	2026-06-26 08:36:51.830371
1137	1	/api/v1/setup/addresses	POST	\N	201	\N	::1	15	2026-06-26 08:36:51.926383
1138	1	/api/payments?limit=5	GET	\N	200	\N	::1	12	2026-06-26 08:36:52.102072
1139	1	/api/trips?limit=3	GET	\N	200	\N	::1	20	2026-06-26 08:36:52.222625
1140	1	/api/cargo?limit=1	GET	\N	200	\N	::1	14	2026-06-26 08:36:52.397748
1141	1	/api/cargo/37/status	PUT	\N	400	\N	::1	16	2026-06-26 08:36:52.503324
1142	1	/api/cargo/37/status	PUT	\N	200	\N	::1	70	2026-06-26 08:39:09.318919
1143	1	/api/cargo/37/status	PUT	\N	200	\N	::1	14	2026-06-26 08:39:09.328089
1144	1	/api/cargo/37/status	PUT	\N	200	\N	::1	32	2026-06-26 08:39:09.459437
1145	1	/api/cargo/37/status	PUT	\N	200	\N	::1	26	2026-06-26 08:39:09.571348
1146	1	/api/cargo	POST	\N	422	\N	::1	49	2026-06-26 08:39:46.780065
1147	1	/api/payments	POST	\N	422	\N	::1	9	2026-06-26 08:39:46.857223
1148	1	/api/cargo	POST	\N	422	\N	::1	5	2026-06-26 08:39:46.953602
1149	1	/api/cargo/37/status	PUT	\N	422	\N	::1	4	2026-06-26 08:39:47.107764
1150	1	/api/v1/customers	POST	\N	422	\N	::1	4	2026-06-26 08:39:47.251781
1151	1	/api/v1/customers	POST	\N	201	\N	::1	29	2026-06-26 08:39:47.384774
1152	1	/api/v1/customers	POST	\N	201	\N	::1	10	2026-06-26 08:39:47.534464
1153	1	/api/accounts?limit=3	GET	\N	200	\N	::1	48	2026-06-26 08:40:27.767539
1154	1	/api/employees?limit=3	GET	\N	200	\N	::1	13	2026-06-26 08:40:27.852354
1155	1	/api/salary/charges?limit=3	GET	\N	200	\N	::1	9	2026-06-26 08:40:27.98808
1156	1	/api/reports/cargo-summary	GET	\N	404	\N	::1	5	2026-06-26 08:40:28.11496
1399	\N	/api/auth/login	POST	\N	200	\N	::1	278	2026-06-26 10:15:27.396036
1400	\N	/api/auth/login	POST	\N	200	\N	::1	299	2026-06-26 10:15:27.472864
1401	\N	/api/auth/login	POST	\N	200	\N	::1	912	2026-06-26 10:15:28.393904
1404	1	/api/customers	GET	\N	200	\N	::1	14	2026-06-26 10:15:28.516817
1406	35	/api/customers	GET	\N	200	\N	::1	9	2026-06-26 10:15:28.534613
1408	37	/api/customers	GET	\N	403	\N	::1	3	2026-06-26 10:15:28.550864
1461	\N	/api/auth/login	POST	\N	200	\N	::1	228	2026-06-26 10:23:38.942853
1528	\N	/health	GET	\N	404	\N	::1	6	2026-06-26 11:00:54.907805
1529	\N	/api/auth/login	POST	\N	200	\N	::1	179	2026-06-26 11:00:55.066678
1558	\N	/api/auth/login	POST	\N	200	\N	::1	295	2026-06-26 11:05:11.551157
1559	\N	/api/auth/login	POST	\N	200	\N	::1	353	2026-06-26 11:05:11.848326
1596	\N	/api/auth/login	POST	\N	200	\N	::1	353	2026-06-26 11:08:43.148962
1628	\N	/api/auth/login	POST	\N	401	\N	::1	10	2026-06-26 11:15:59.486869
1629	\N	/api/auth/login	POST	\N	401	\N	::1	78	2026-06-26 11:15:59.494092
1630	\N	/api/auth/login	POST	\N	401	\N	::1	8	2026-06-26 11:15:59.504435
1664	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	342	2026-06-26 11:27:39.227379
1685	1	/api/customers/44	PUT	\N	200	\N	::1	252	2026-06-26 11:29:16.0445
1703	\N	/api/customers?page=1&limit=1	GET	\N	401	\N	::1	0	2026-06-26 13:51:41.483091
1744	3	/api/v1/routes?limit=200	GET	\N	304	\N	::1	40	2026-06-26 13:55:49.197062
1773	38	/api/customers?limit=200	GET	\N	200	\N	::1	45	2026-06-26 13:58:24.542526
1774	38	/api/branches	GET	\N	403	\N	::1	4	2026-06-26 13:58:25.527372
1775	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:58:25.534503
1776	38	/api/branches	GET	\N	403	\N	::1	3	2026-06-26 13:58:27.548282
1777	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:58:27.55519
1778	38	/api/branches	GET	\N	403	\N	::1	2	2026-06-26 13:58:33.282734
1779	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	2	2026-06-26 13:58:33.291428
1825	38	/api/customers?limit=200	GET	\N	304	\N	::1	75	2026-06-26 14:12:10.790296
1853	38	/api/v1/customers/42/cargo?page=1&limit=500	GET	\N	304	\N	::1	47	2026-06-26 14:14:32.111975
1881	38	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	45	2026-06-26 14:20:35.623468
1885	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	8	2026-06-26 14:20:36.86592
1917	\N	/api/auth/login	POST	\N	200	\N	::1	262	2026-06-27 00:32:57.356649
1918	36	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-27 00:32:57.431931
1919	36	/api/customers?limit=1	GET	\N	200	\N	::1	59	2026-06-27 00:32:57.481625
1920	36	/api/cargo?limit=1	GET	\N	200	\N	::1	64	2026-06-27 00:32:57.486981
1922	36	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	21	2026-06-27 00:33:05.331256
1924	36	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	8	2026-06-27 00:33:17.464833
1968	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	14	2026-06-27 00:35:57.309589
1995	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	75	2026-06-27 01:13:01.770202
2024	1	/api/employees	GET	\N	200	\N	::1	42	2026-06-27 01:52:05.646689
2026	1	/api/employees/1/schedule	GET	\N	500	\N	::1	6	2026-06-27 01:52:05.686981
2028	1	/api/employees/branch/assign	POST	\N	201	\N	::1	5	2026-06-27 01:52:05.707125
2062	1	/api/employees/attendance	POST	\N	201	\N	::1	78	2026-06-27 01:57:08.457997
2078	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	119	2026-06-27 02:53:57.933778
2094	1	/api/employees/attendance	POST	\N	201	\N	::1	47	2026-06-27 03:08:15.097715
2096	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=1	GET	\N	200	\N	::1	11	2026-06-27 03:08:15.143955
2118	1	/api/employees?limit=200	GET	\N	304	\N	::1	147	2026-06-27 03:16:02.751804
2146	1	/api/employees/attendance/bulk	POST	\N	422	\N	::1	101	2026-06-27 03:23:26.934832
2161	1	/api/accounts?page=1&limit=20	GET	\N	200	\N	::1	22	2026-06-27 03:25:35.085539
2163	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	24	2026-06-27 03:25:37.957579
2166	1	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	14	2026-06-27 03:25:42.032564
2168	1	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	40	2026-06-27 03:25:51.054488
2185	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	267	2026-06-27 03:27:27.298555
2199	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	32	2026-06-27 03:34:18.118402
2201	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	12	2026-06-27 03:34:22.780897
2202	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	17	2026-06-27 03:34:28.169739
2221	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	15	2026-06-27 06:17:18.038281
2222	1	/api/employees?limit=200	GET	\N	304	\N	::1	65	2026-06-27 06:17:18.088509
2231	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	17	2026-06-27 06:27:19.689767
2245	1	/api/employees?limit=200	GET	\N	304	\N	::1	52	2026-06-27 06:29:07.221982
2247	1	/api/salary/attendance-summary?employee_id=34&month=2026-06	GET	\N	304	\N	::1	14	2026-06-27 06:29:11.612148
2252	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	101	2026-06-27 06:29:59.130082
2258	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	136	2026-06-27 06:30:13.869873
2265	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	81	2026-06-27 07:01:15.277709
2267	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	23	2026-06-27 07:01:19.394138
2269	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	22	2026-06-27 07:01:20.584612
2270	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	20	2026-06-27 07:01:20.590818
2273	1	/api/cargo/37	PUT	\N	200	\N	::1	53	2026-06-27 07:02:20.437927
2276	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	10	2026-06-27 07:02:36.342107
2279	1	/api/cargo/36	PUT	\N	200	\N	::1	155	2026-06-27 07:03:53.772646
2281	1	/api/cargo/1	PUT	\N	200	\N	::1	57	2026-06-27 07:04:59.915267
2396	\N	/api/auth/login	POST	\N	200	\N	::1	372	2026-06-27 09:57:00.408206
1157	1	/api/dashboard	GET	\N	404	\N	::1	4	2026-06-26 08:40:28.231292
1158	1	/api/v1/disputes?limit=3	GET	\N	200	\N	::1	13	2026-06-26 08:40:28.3737
1159	1	/api/v1/invoices?limit=3	GET	\N	200	\N	::1	6	2026-06-26 08:40:28.489096
1160	\N	/api/v1/setup/routes?limit=3	GET	\N	404	\N	::1	2	2026-06-26 08:40:28.622636
1161	\N	/api/v1/setup/transport-providers?limit=3	GET	\N	404	\N	::1	1	2026-06-26 08:40:28.734078
1162	1	/api/reports/cargo-summary	GET	\N	404	\N	::1	41	2026-06-26 08:40:51.902628
1163	1	/api/dashboard	GET	\N	404	\N	::1	9	2026-06-26 08:40:51.978397
1164	\N	/api/v1/setup/routes?limit=3	GET	\N	404	\N	::1	1	2026-06-26 08:40:52.086049
1165	\N	/api/v1/setup/transport-providers?limit=3	GET	\N	404	\N	::1	1	2026-06-26 08:40:52.194324
1166	1	/api/reports/cargo	GET	\N	200	\N	::1	83	2026-06-26 08:41:24.388715
1167	1	/api/reports/revenue	GET	\N	200	\N	::1	15	2026-06-26 08:41:24.485303
1168	1	/api/reports/daily-revenue	GET	\N	500	\N	::1	8	2026-06-26 08:41:24.627055
1169	1	/api/dashboard/overview	GET	\N	200	\N	::1	61	2026-06-26 08:41:24.78332
1170	1	/api/v1/transport/providers	GET	\N	200	\N	::1	7	2026-06-26 08:41:24.850016
1171	1	/api/v1/transport/routes	GET	\N	200	\N	::1	7	2026-06-26 08:41:24.969903
1172	1	/api/v1/routes	GET	\N	200	\N	::1	4	2026-06-26 08:41:25.085519
1173	1	/api/reports/daily-revenue	GET	\N	500	\N	::1	72	2026-06-26 08:41:38.510667
1174	1	/api/reports/daily-revenue	GET	\N	200	\N	::1	191	2026-06-26 08:45:19.04843
1175	1	/api/reports/branch-profit?branch_id=1	GET	\N	200	\N	::1	14	2026-06-26 08:45:19.144761
1176	1	/api/reports/mv/daily-revenue	GET	\N	200	\N	::1	7	2026-06-26 08:45:19.282389
1177	1	/api/reports/mv/monthly-profit	GET	\N	200	\N	::1	7	2026-06-26 08:45:19.436086
1178	1	/api/reports/refresh-mviews	POST	\N	200	\N	::1	114	2026-06-26 08:45:19.678687
1179	1	/api/v1/auth/me	GET	\N	200	\N	::1	144	2026-06-26 08:46:29.682772
1180	1	/api/v1/users/sessions	GET	\N	500	\N	::1	12	2026-06-26 08:46:29.906728
1181	1	/api/v1/setup/cities?limit=2	GET	\N	200	\N	::1	6	2026-06-26 08:46:30.22678
1182	1	/api/v1/setup/addresses?limit=2	GET	\N	200	\N	::1	8	2026-06-26 08:46:30.451985
1183	1	/api/v1/setup/branches?limit=2	GET	\N	200	\N	::1	6	2026-06-26 08:46:30.688277
1184	1	/api/v1/customers?limit=2	GET	\N	200	\N	::1	37	2026-06-26 08:46:30.909153
1185	1	/api/v1/customers/40	GET	\N	200	\N	::1	6	2026-06-26 08:46:31.139381
1186	1	/api/cargo?limit=2	GET	\N	200	\N	::1	8	2026-06-26 08:46:31.360997
1187	1	/api/cargo/36	GET	\N	200	\N	::1	9	2026-06-26 08:46:31.578675
1188	1	/api/cargo/36/tracking	GET	\N	404	\N	::1	2	2026-06-26 08:46:31.836578
1189	1	/api/trips?limit=2	GET	\N	200	\N	::1	9	2026-06-26 08:46:32.155723
1190	1	/api/payments?limit=2	GET	\N	200	\N	::1	4	2026-06-26 08:46:32.38902
1191	1	/api/accounts?limit=2	GET	\N	200	\N	::1	4	2026-06-26 08:46:32.622161
1192	1	/api/employees?limit=2	GET	\N	200	\N	::1	7	2026-06-26 08:46:32.862325
1193	1	/api/salary/charges?limit=2	GET	\N	200	\N	::1	7	2026-06-26 08:46:33.187245
1194	1	/api/salary/tax-brackets	GET	\N	200	\N	::1	5	2026-06-26 08:46:33.445212
1195	1	/api/reports/cargo	GET	\N	200	\N	::1	3	2026-06-26 08:46:33.704461
1196	1	/api/reports/revenue	GET	\N	200	\N	::1	3	2026-06-26 08:46:33.935199
1197	1	/api/reports/daily-revenue	GET	\N	200	\N	::1	3	2026-06-26 08:46:34.181103
1198	1	/api/reports/branch-summary	GET	\N	200	\N	::1	3	2026-06-26 08:46:34.415265
1199	1	/api/reports/mv/daily-revenue	GET	\N	200	\N	::1	4	2026-06-26 08:46:34.671135
1200	1	/api/reports/mv/monthly-profit	GET	\N	200	\N	::1	5	2026-06-26 08:46:34.923654
1201	1	/api/dashboard/overview	GET	\N	200	\N	::1	48	2026-06-26 08:46:35.214253
1202	1	/api/v1/disputes?limit=2	GET	\N	200	\N	::1	8	2026-06-26 08:46:35.493598
1203	1	/api/v1/invoices?limit=2	GET	\N	200	\N	::1	4	2026-06-26 08:46:35.722793
1204	1	/api/v1/transport/providers?limit=2	GET	\N	200	\N	::1	4	2026-06-26 08:46:36.005378
1205	1	/api/v1/transport/routes?limit=2	GET	\N	200	\N	::1	4	2026-06-26 08:46:36.245711
1206	1	/api/employees?limit=2	GET	\N	200	\N	::1	43	2026-06-26 08:46:53.941341
1207	1	/api/cargo/36/tracking	GET	\N	404	\N	::1	8	2026-06-26 08:46:54.016643
1208	1	/api/cargo/tracking/36	GET	\N	404	\N	::1	5	2026-06-26 08:46:54.143359
1209	1	/api/v1/users/sessions	GET	\N	500	\N	::1	5	2026-06-26 08:46:54.217284
1210	\N	/api/cargo/track/CRG100001	GET	\N	200	\N	::1	42	2026-06-26 08:47:54.782989
1211	1	/api/cargo/36/timeline	GET	\N	200	\N	::1	11	2026-06-26 08:47:54.926866
1212	1	/api/employees?limit=2	GET	\N	200	\N	::1	13	2026-06-26 08:47:54.986894
1213	1	/api/employees?limit=2	GET	\N	200	\N	::1	77	2026-06-26 08:49:58.4661
1214	\N	/api/v1/auth/login	POST	\N	200	\N	::1	327	2026-06-26 09:23:10.733264
1215	35	/api/cargo?limit=2	GET	\N	200	\N	::1	32	2026-06-26 09:23:10.879116
1216	35	/api/v1/users	GET	\N	403	\N	::1	8	2026-06-26 09:23:10.93709
1217	35	/api/salary/charges	GET	\N	403	\N	::1	3	2026-06-26 09:23:11.046087
1218	\N	/api/v1/auth/login	POST	\N	200	\N	::1	198	2026-06-26 09:23:11.405786
1219	36	/api/payments?limit=2	GET	\N	200	\N	::1	9	2026-06-26 09:23:11.531379
1220	36	/api/employees?limit=2	GET	\N	403	\N	::1	7	2026-06-26 09:23:11.608044
1221	\N	/api/v1/auth/login	POST	\N	200	\N	::1	208	2026-06-26 09:23:11.950708
1222	41	/api/employees?limit=5	GET	\N	200	\N	::1	13	2026-06-26 09:23:12.212907
1223	41	/api/employees?limit=5	GET	\N	403	\N	::1	5	2026-06-26 09:23:12.229074
1224	\N	/api/v1/auth/login	POST	\N	200	\N	::1	265	2026-06-26 09:23:42.900001
1225	1	/api/v1/customers	POST	\N	201	\N	::1	74	2026-06-26 09:23:43.030524
1226	1	/api/v1/customers	POST	\N	201	\N	::1	22	2026-06-26 09:23:43.151855
1227	1	/api/v1/customers?limit=3	GET	\N	200	\N	::1	11	2026-06-26 09:23:43.268611
1228	1	/api/v1/customers?customer_type=vip	GET	\N	200	\N	::1	10	2026-06-26 09:23:43.397276
1229	1	/api/v1/customers?customer_type=vip&limit=1	GET	\N	200	\N	::1	7	2026-06-26 09:23:43.505217
1230	1	/api/v1/customers/45	PUT	\N	200	\N	::1	9	2026-06-26 09:23:43.634697
1231	\N	/api/auth/login	POST	\N	200	\N	::1	270	2026-06-26 09:30:37.760422
1232	\N	/api/auth/login	POST	\N	200	\N	::1	267	2026-06-26 09:30:48.148316
1233	\N	/api/auth/login	POST	\N	200	\N	::1	210	2026-06-26 09:30:48.412255
1234	\N	/api/auth/login	POST	\N	200	\N	::1	277	2026-06-26 09:30:48.657445
1235	\N	/api/auth/login	POST	\N	403	\N	::1	4	2026-06-26 09:30:48.919632
1236	\N	/api/auth/login	POST	\N	200	\N	::1	244	2026-06-26 09:30:48.924982
1237	\N	/api/auth/login	POST	\N	200	\N	::1	214	2026-06-26 09:30:49.374526
1238	\N	/api/auth/login	POST	\N	200	\N	::1	235	2026-06-26 09:30:49.378473
1239	\N	/api/auth/login	POST	\N	403	\N	::1	5	2026-06-26 09:30:49.420778
1240	\N	/api/auth/login	POST	\N	200	\N	::1	230	2026-06-26 09:31:17.73894
1241	\N	/api/auth/login	POST	\N	200	\N	::1	340	2026-06-26 09:31:17.971986
1242	\N	/api/auth/login	POST	\N	200	\N	::1	204	2026-06-26 09:31:18.215758
1243	\N	/api/auth/login	POST	\N	200	\N	::1	245	2026-06-26 09:31:18.424622
1244	\N	/api/auth/login	POST	\N	200	\N	::1	236	2026-06-26 09:31:18.696524
1245	35	/api/cargo?page=1&limit=5	GET	\N	200	\N	::1	163	2026-06-26 09:31:18.84534
1246	35	/api/customers?page=1&limit=5	GET	\N	200	\N	::1	12	2026-06-26 09:31:19.06887
1247	\N	/api/tracking?page=1&limit=5	GET	\N	404	\N	::1	1	2026-06-26 09:31:19.077717
1248	\N	/api/users?page=1&limit=5	GET	\N	404	\N	::1	0	2026-06-26 09:31:19.151989
1249	35	/api/salary?page=1&limit=5	GET	\N	404	\N	::1	3	2026-06-26 09:31:19.15949
1250	36	/api/payments?page=1&limit=5	GET	\N	200	\N	::1	6	2026-06-26 09:31:19.17078
1251	36	/api/cargo?page=1&limit=5	GET	\N	200	\N	::1	5	2026-06-26 09:31:19.179105
1252	36	/api/employees?page=1&limit=5	GET	\N	403	\N	::1	2	2026-06-26 09:31:19.185261
1253	\N	/api/users?page=1&limit=5	GET	\N	404	\N	::1	1	2026-06-26 09:31:19.190657
1254	37	/api/employees?page=1&limit=5	GET	\N	200	\N	::1	9	2026-06-26 09:31:19.203944
1255	37	/api/payments?page=1&limit=5	GET	\N	403	\N	::1	3	2026-06-26 09:31:19.21101
1256	\N	/api/users?page=1&limit=5	GET	\N	404	\N	::1	0	2026-06-26 09:31:19.216075
1257	41	/api/employees?page=1&limit=5	GET	\N	403	\N	::1	4	2026-06-26 09:31:19.223227
1258	41	/api/employees?page=1&limit=5	GET	\N	200	\N	::1	9	2026-06-26 09:31:19.268975
1259	\N	/api/auth/login	POST	\N	200	\N	::1	234	2026-06-26 09:32:38.478574
1260	35	/api/cargo?page=1&limit=5	GET	\N	200	\N	::1	16	2026-06-26 09:32:38.541007
1261	\N	/api/auth/login	POST	\N	200	\N	::1	256	2026-06-26 09:33:55.714509
1262	\N	/api/auth/login	POST	\N	200	\N	::1	213	2026-06-26 09:33:55.975722
1263	\N	/api/auth/login	POST	\N	200	\N	::1	256	2026-06-26 09:33:56.19911
1264	\N	/api/auth/login	POST	\N	200	\N	::1	235	2026-06-26 09:33:56.470799
1265	\N	/api/auth/login	POST	\N	200	\N	::1	285	2026-06-26 09:33:56.722666
1266	\N	/api/auth/login	POST	\N	200	\N	::1	248	2026-06-26 09:33:56.972201
1267	35	/api/cargo?limit=3	GET	\N	200	\N	::1	13	2026-06-26 09:33:57.028772
1268	35	/api/customers?limit=3	GET	\N	200	\N	::1	49	2026-06-26 09:33:57.051186
1269	\N	/api/tracking?limit=3	GET	\N	404	\N	::1	1	2026-06-26 09:33:57.054613
1270	35	/api/payments?limit=3	GET	\N	403	\N	::1	4	2026-06-26 09:33:57.070066
1271	35	/api/employees?limit=3	GET	\N	403	\N	::1	5	2026-06-26 09:33:57.078409
1272	35	/api/salary?limit=3	GET	\N	404	\N	::1	3	2026-06-26 09:33:57.084116
1273	35	/api/reports/branch?limit=3	GET	\N	404	\N	::1	3	2026-06-26 09:33:57.090436
1274	36	/api/payments?limit=3	GET	\N	200	\N	::1	6	2026-06-26 09:33:57.099052
1275	36	/api/cargo?limit=3	GET	\N	200	\N	::1	9	2026-06-26 09:33:57.110564
1276	36	/api/reports/daily-revenue	GET	\N	200	\N	::1	6	2026-06-26 09:33:57.119092
1277	36	/api/employees?limit=3	GET	\N	403	\N	::1	3	2026-06-26 09:33:57.124253
1278	36	/api/salary?limit=3	GET	\N	404	\N	::1	3	2026-06-26 09:33:57.129672
1279	37	/api/employees?limit=3	GET	\N	200	\N	::1	8	2026-06-26 09:33:57.140764
1280	37	/api/salary?limit=3	GET	\N	404	\N	::1	2	2026-06-26 09:33:57.145265
1281	37	/api/payments?limit=3	GET	\N	403	\N	::1	3	2026-06-26 09:33:57.151292
1282	37	/api/reports/daily-revenue	GET	\N	200	\N	::1	5	2026-06-26 09:33:57.157553
1283	41	/api/employees?limit=3	GET	\N	403	\N	::1	4	2026-06-26 09:33:57.164197
1284	41	/api/employees?limit=3	GET	\N	200	\N	::1	3	2026-06-26 09:33:57.170308
1285	39	/api/cargo?limit=3	GET	\N	200	\N	::1	15	2026-06-26 09:33:57.189112
1286	39	/api/cargo?limit=3	GET	\N	403	\N	::1	3	2026-06-26 09:33:57.193925
1287	\N	/api/auth/login	POST	\N	200	\N	::1	303	2026-06-26 09:35:24.825851
1288	\N	/api/auth/login	POST	\N	200	\N	::1	250	2026-06-26 09:35:25.138344
1289	35	/api/cargo/1/timeline	GET	\N	200	\N	::1	56	2026-06-26 09:35:25.168987
1290	35	/api/payments?limit=3	GET	\N	403	\N	::1	10	2026-06-26 09:35:25.191812
1291	37	/api/salary/charges	GET	\N	200	\N	::1	16	2026-06-26 09:35:25.251425
1292	37	/api/reports/revenue	GET	\N	200	\N	::1	7	2026-06-26 09:35:25.260899
1293	\N	/api/auth/login	POST	\N	200	\N	::1	227	2026-06-26 09:36:50.047436
1294	1	/api/customers	POST	\N	201	\N	::1	51	2026-06-26 09:36:50.109275
1295	1	/api/customers	POST	\N	201	\N	::1	12	2026-06-26 09:36:50.12624
1296	1	/api/customers?customer_type=vip&limit=5	GET	\N	200	\N	::1	7	2026-06-26 09:36:50.135902
1297	1	/api/customers?customer_type=one_time&limit=5	GET	\N	200	\N	::1	6	2026-06-26 09:36:50.148779
1298	1	/api/customers/47	PUT	\N	200	\N	::1	6	2026-06-26 09:36:50.157496
1299	1	/api/customers/47	GET	\N	200	\N	::1	6	2026-06-26 09:36:50.164538
1300	1	/api/customers/47	DELETE	\N	200	\N	::1	6	2026-06-26 09:36:50.17342
1301	1	/api/customers/48	DELETE	\N	200	\N	::1	3	2026-06-26 09:36:50.177605
1302	1	/api/customers	POST	\N	422	\N	::1	5	2026-06-26 09:36:50.185843
1303	\N	/api/auth/login	POST	\N	200	\N	::1	622	2026-06-26 09:37:02.320574
1304	1	/api/cargo?limit=3	GET	\N	200	\N	::1	15	2026-06-26 09:37:02.377257
1305	1	/api/customers?limit=3	GET	\N	200	\N	::1	46	2026-06-26 09:37:02.394138
1306	1	/api/payments?limit=3	GET	\N	200	\N	::1	4	2026-06-26 09:37:02.438428
1307	1	/api/employees?limit=3	GET	\N	200	\N	::1	10	2026-06-26 09:37:02.445909
1308	1	/api/salary/charges	GET	\N	200	\N	::1	45	2026-06-26 09:37:02.461033
1309	1	/api/reports/daily-revenue	GET	\N	200	\N	::1	8	2026-06-26 09:37:02.471783
1312	1	/api/expense-payments?limit=3	GET	\N	404	\N	::1	3	2026-06-26 09:37:02.495881
1402	35	/api/cargo	GET	\N	200	\N	::1	8	2026-06-26 10:15:28.483331
1462	1	/api/customers	POST	\N	201	\N	::1	55	2026-06-26 10:23:39.03458
1530	\N	/api/auth/login	POST	\N	200	\N	::1	426	2026-06-26 11:02:29.111971
1560	\N	/api/auth/login	POST	\N	200	\N	::1	295	2026-06-26 11:05:12.205015
1561	\N	/api/auth/login	POST	\N	200	\N	::1	343	2026-06-26 11:05:12.492375
1597	\N	/api/auth/login	POST	\N	200	\N	::1	241	2026-06-26 11:08:43.481993
1598	\N	/api/auth/login	POST	\N	200	\N	::1	297	2026-06-26 11:08:43.715842
1631	\N	/api/auth/login	POST	\N	401	\N	::1	8	2026-06-26 11:15:59.577166
1632	\N	/api/auth/login	POST	\N	401	\N	::1	74	2026-06-26 11:15:59.593019
1666	1	/api/employees?limit=1&page=1	GET	\N	200	\N	::1	72	2026-06-26 11:27:39.263123
1686	1	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	22	2026-06-26 11:29:16.07847
1704	\N	/api/employees?limit=1&page=1	GET	\N	401	\N	::1	1	2026-06-26 13:51:41.488462
1745	3	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	46	2026-06-26 13:55:49.202141
1746	3	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	8	2026-06-26 13:55:53.411753
1780	38	/api/branches	GET	\N	403	\N	::1	49	2026-06-26 14:02:12.786918
1781	38	/api/v1/setup/branches?limit=200	GET	\N	403	\N	::1	1	2026-06-26 14:02:12.798321
1826	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	147	2026-06-26 14:12:10.85791
1855	38	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	50	2026-06-26 14:15:44.870395
1856	38	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	157	2026-06-26 14:15:44.941648
1882	38	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	55	2026-06-26 14:20:35.632399
1921	36	/api/payments?limit=1	GET	\N	200	\N	::1	53	2026-06-27 00:32:57.510999
1923	36	/api/cargo/39	GET	\N	304	\N	::1	12	2026-06-27 00:33:10.126586
1969	1	/api/v1/setup/countries	GET	\N	200	\N	::1	50	2026-06-27 00:36:23.117597
1970	1	/api/employees?limit=200&page=1	GET	\N	200	\N	::1	59	2026-06-27 00:36:23.127532
1971	1	/api/v1/setup/cities?country=Solomon+Islands&limit=500	GET	\N	200	\N	::1	6	2026-06-27 00:36:31.942993
1972	1	/api/v1/setup/cities?country=Kenya&limit=500	GET	\N	200	\N	::1	7	2026-06-27 00:36:35.688407
1997	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	54	2026-06-27 01:13:16.079188
2029	1	/api/employees	GET	\N	200	\N	::1	60	2026-06-27 01:53:29.984795
2034	1	/api/employees/branch/assign	POST	\N	201	\N	::1	5	2026-06-27 01:53:30.068811
2036	1	/api/employees/jobs	GET	\N	500	\N	::1	4	2026-06-27 01:53:30.089184
2063	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	43	2026-06-27 01:57:08.507963
2079	\N	/api/auth/login	POST	\N	401	\N	::1	109	2026-06-27 03:05:16.18434
2097	\N	/api/auth/login	POST	\N	200	\N	::1	89	2026-06-27 03:09:41.342931
2099	1	/api/employees/attendance/daily?date=2026-06-27&branch_id=1	GET	\N	200	\N	::1	12	2026-06-27 03:09:41.421019
2120	1	/api/salary/attendance-summary?employee_id=35&month=2026-06	GET	\N	200	\N	::1	166	2026-06-27 03:16:35.26558
2122	1	/api/salary/attendance-summary?employee_id=36&month=2026-06	GET	\N	200	\N	::1	19	2026-06-27 03:16:46.923779
2124	1	/api/salary/attendance-summary?employee_id=39&month=2026-06	GET	\N	200	\N	::1	16	2026-06-27 03:16:52.798265
2126	1	/api/salary/attendance-summary?employee_id=40&month=2026-06	GET	\N	200	\N	::1	19	2026-06-27 03:16:58.655233
2130	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	18	2026-06-27 03:17:08.665367
2131	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	18	2026-06-27 03:17:09.951364
2132	1	/api/employees/jobs	GET	\N	304	\N	::1	111	2026-06-27 03:17:10.051239
2147	1	/api/employees/attendance/bulk	POST	\N	422	\N	::1	22	2026-06-27 03:23:33.849247
2169	1	/api/v1/setup/addresses?limit=500	GET	\N	200	\N	::1	137	2026-06-27 03:25:51.138926
2187	1	/api/dashboard/overview	GET	\N	200	\N	::1	528	2026-06-27 03:27:27.384743
2203	1	/api/employees?limit=200	GET	\N	304	\N	::1	103	2026-06-27 03:34:28.25944
2205	1	/api/employees/37/schedule	GET	\N	304	\N	::1	18	2026-06-27 03:34:33.588674
2207	1	/api/employees/36/schedule	GET	\N	200	\N	::1	9	2026-06-27 03:34:35.513269
2223	1	/api/employees?limit=200	GET	\N	304	\N	::1	208	2026-06-27 06:21:45.658995
2232	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	87	2026-06-27 06:28:10.553368
2246	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	53	2026-06-27 06:29:07.222637
2253	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	68	2026-06-27 06:30:13.804074
2260	1	/api/dashboard/overview	GET	\N	304	\N	::1	154	2026-06-27 06:30:13.887185
2266	1	/api/branches	GET	\N	304	\N	::1	165	2026-06-27 07:01:15.332812
2268	1	/api/branches	GET	\N	304	\N	::1	11	2026-06-27 07:01:20.579138
2274	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	9	2026-06-27 07:02:20.45345
2277	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	9	2026-06-27 07:03:18.216132
2280	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	9	2026-06-27 07:03:53.781333
2282	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	8	2026-06-27 07:04:59.928156
2283	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	55	2026-06-27 07:05:27.391135
2284	1	/api/employees/jobs	GET	\N	304	\N	::1	60	2026-06-27 07:05:27.399345
2285	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	64	2026-06-27 07:05:27.404164
2286	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	102	2026-06-27 07:05:27.43964
2287	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	13	2026-06-27 07:05:30.528165
2288	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	16	2026-06-27 07:05:30.53334
2289	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	8	2026-06-27 07:05:34.93042
1310	1	/api/reports/branch-summary	GET	\N	200	\N	::1	9	2026-06-26 09:37:02.482942
1311	1	/api/reports/revenue	GET	\N	200	\N	::1	6	2026-06-26 09:37:02.490183
1313	1	/api/cargo/1/timeline	GET	\N	200	\N	::1	9	2026-06-26 09:37:02.51645
1314	\N	/api/auth/login	POST	\N	200	\N	::1	328	2026-06-26 09:37:43.481108
1315	1	/api/expenses?limit=3	GET	\N	200	\N	::1	154	2026-06-26 09:37:43.647643
1316	1	/api/expense-payments?limit=3	GET	\N	404	\N	::1	5	2026-06-26 09:37:43.660749
1317	\N	/api/health	GET	\N	404	\N	::1	1	2026-06-26 10:02:39.611782
1318	\N	/api/auth/login	POST	\N	200	\N	::1	232	2026-06-26 10:02:57.266957
1319	\N	/api/auth/login	POST	\N	200	\N	::1	212	2026-06-26 10:03:05.187529
1320	\N	/api/auth/login	POST	\N	200	\N	::1	247	2026-06-26 10:03:24.454745
1321	\N	/api/auth/login	POST	\N	200	\N	::1	228	2026-06-26 10:03:24.744022
1322	\N	/api/auth/login	POST	\N	401	\N	::1	244	2026-06-26 10:03:24.964
1323	\N	/api/auth/login	POST	\N	200	\N	::1	225	2026-06-26 10:03:25.27928
1324	\N	/api/auth/login	POST	\N	200	\N	::1	263	2026-06-26 10:03:25.521123
1325	\N	/api/auth/login	POST	\N	401	\N	::1	200	2026-06-26 10:03:25.758386
1326	\N	/api/auth/login	POST	\N	200	\N	::1	232	2026-06-26 10:04:58.778986
1327	\N	/api/auth/login	POST	\N	200	\N	::1	216	2026-06-26 10:06:10.531035
1328	\N	/api/auth/login	POST	\N	200	\N	::1	223	2026-06-26 10:06:10.827893
1329	\N	/api/auth/login	POST	\N	200	\N	::1	321	2026-06-26 10:06:11.1215
1330	\N	/api/auth/login	POST	\N	200	\N	::1	195	2026-06-26 10:06:11.363433
1331	\N	/api/auth/login	POST	\N	200	\N	::1	259	2026-06-26 10:06:11.594956
1332	\N	/api/auth/login	POST	\N	200	\N	::1	201	2026-06-26 10:06:11.839099
1333	\N	/api/auth/login	POST	\N	403	\N	::1	41	2026-06-26 10:06:11.854581
1334	\N	/api/auth/login	POST	\N	403	\N	::1	5	2026-06-26 10:06:11.900144
1335	\N	/api/auth/login	POST	\N	200	\N	::1	224	2026-06-26 10:06:12.09207
1336	\N	/api/auth/login	POST	\N	403	\N	::1	37	2026-06-26 10:06:26.821457
1337	\N	/api/auth/login	POST	\N	403	\N	::1	40	2026-06-26 10:06:26.834356
1338	\N	/api/auth/login	POST	\N	403	\N	::1	7	2026-06-26 10:06:26.878065
1339	\N	/api/auth/login	POST	\N	403	\N	::1	37	2026-06-26 10:06:26.883486
1340	\N	/api/auth/login	POST	\N	403	\N	::1	6	2026-06-26 10:06:26.932495
1341	\N	/api/auth/login	POST	\N	403	\N	::1	49	2026-06-26 10:06:26.94388
1342	\N	/api/auth/login	POST	\N	403	\N	::1	7	2026-06-26 10:06:26.990388
1343	\N	/api/auth/login	POST	\N	403	\N	::1	40	2026-06-26 10:06:26.995662
1344	\N	/api/auth/login	POST	\N	403	\N	::1	36	2026-06-26 10:09:14.632955
1345	\N	/api/auth/login	POST	\N	403	\N	::1	38	2026-06-26 10:09:14.643051
1346	\N	/api/auth/login	POST	\N	403	\N	::1	6	2026-06-26 10:09:14.684767
1347	\N	/api/auth/login	POST	\N	403	\N	::1	40	2026-06-26 10:09:14.693574
1348	\N	/api/auth/login	POST	\N	403	\N	::1	6	2026-06-26 10:09:14.734428
1349	\N	/api/auth/login	POST	\N	403	\N	::1	36	2026-06-26 10:09:14.739605
1350	\N	/api/auth/login	POST	\N	403	\N	::1	6	2026-06-26 10:09:14.780666
1351	\N	/api/auth/login	POST	\N	403	\N	::1	39	2026-06-26 10:09:14.7886
1352	\N	/api/auth/login	POST	\N	403	\N	::1	37	2026-06-26 10:09:14.909573
1353	\N	/api/auth/login	POST	\N	403	\N	::1	5	2026-06-26 10:09:14.93755
1354	\N	/api/auth/login	POST	\N	403	\N	::1	38	2026-06-26 10:09:14.972578
1403	36	/api/cargo	GET	\N	200	\N	::1	7	2026-06-26 10:15:28.508641
1463	\N	/api/auth/login	POST	\N	200	\N	::1	237	2026-06-26 10:23:50.732186
1465	1	/api/customers/49	PUT	\N	200	\N	::1	11	2026-06-26 10:23:50.824514
1531	\N	/api/auth/login	POST	\N	200	\N	::1	304	2026-06-26 11:02:29.525347
1532	\N	/api/auth/login	POST	\N	200	\N	::1	371	2026-06-26 11:02:29.851422
1562	\N	/api/auth/login	POST	\N	200	\N	::1	294	2026-06-26 11:05:12.85395
1563	1	/api/accounts	GET	\N	200	\N	::1	72	2026-06-26 11:05:12.880297
1564	1	/api/expenses	GET	\N	200	\N	::1	18	2026-06-26 11:05:12.904303
1566	36	/api/accounts	GET	\N	403	\N	::1	5	2026-06-26 11:05:12.939784
1568	36	/api/salary/charges	GET	\N	403	\N	::1	4	2026-06-26 11:05:12.970762
1570	36	/api/customers	GET	\N	200	\N	::1	16	2026-06-26 11:05:13.016703
1572	36	/api/trips	GET	\N	200	\N	::1	16	2026-06-26 11:05:13.049653
1573	36	/api/v1/invoices	GET	\N	200	\N	::1	7	2026-06-26 11:05:13.060155
1574	36	/api/v1/notifications	GET	\N	200	\N	::1	7	2026-06-26 11:05:13.071991
1599	1	/api/accounts	GET	\N	200	\N	::1	73	2026-06-26 11:08:44.174666
1633	\N	/api/auth/login	POST	\N	401	\N	::1	11	2026-06-26 11:15:59.66664
1634	\N	/api/auth/login	POST	\N	401	\N	::1	70	2026-06-26 11:15:59.680437
1667	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	76	2026-06-26 11:27:39.275173
1687	1	/api/customers/46	PUT	\N	200	\N	::1	199	2026-06-26 11:29:33.231732
1705	\N	/api/cargo?limit=5&page=1	GET	\N	401	\N	::1	0	2026-06-26 13:51:41.489394
1712	3	/api/payments?limit=1	GET	\N	200	\N	::1	14	2026-06-26 13:51:48.243831
1747	38	/api/cargo?limit=1	GET	\N	304	\N	::1	52	2026-06-26 13:56:22.417646
1782	38	/api/customers?limit=200	GET	\N	304	\N	::1	99	2026-06-26 14:02:12.838221
1827	38	/api/branches	GET	\N	403	\N	::1	57	2026-06-26 14:13:42.037376
1857	38	/api/v1/customers/42/cargo?page=1&limit=500	GET	\N	304	\N	::1	6	2026-06-26 14:15:49.240752
1886	38	/api/v1/customers/45/cargo?page=1&limit=500	GET	\N	200	\N	::1	10	2026-06-26 14:20:36.901589
1925	36	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	57	2026-06-27 00:33:26.848384
1927	36	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	10	2026-06-27 00:33:31.994709
1928	36	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-27 00:33:36.611938
1973	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	62	2026-06-27 00:38:04.376802
1998	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	170	2026-06-27 01:13:16.193653
2030	\N	/api/auth/login	POST	\N	200	\N	::1	103	2026-06-27 01:53:29.997302
2031	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	44	2026-06-27 01:53:30.030087
2064	1	/api/employees/attendance	POST	\N	422	\N	::1	42	2026-06-27 01:57:24.001267
2290	1	/api/employees/schedules	GET	\N	200	\N	::1	11	2026-06-27 07:05:34.934524
2291	1	/api/employees?limit=200	GET	\N	304	\N	::1	13	2026-06-27 07:05:34.936367
2292	1	/api/employees/schedule	POST	\N	201	\N	::1	84	2026-06-27 07:05:47.915828
2293	1	/api/employees/schedules	GET	\N	200	\N	::1	11	2026-06-27 07:05:47.934603
2294	1	/api/employees/schedule	POST	\N	201	\N	::1	84	2026-06-27 07:06:38.325028
2295	1	/api/employees/schedules	GET	\N	200	\N	::1	13	2026-06-27 07:06:38.34401
2296	1	/api/employees/schedule	POST	\N	201	\N	::1	82	2026-06-27 07:06:52.193728
2297	1	/api/employees/schedules	GET	\N	200	\N	::1	12	2026-06-27 07:06:52.212199
2298	1	/api/employees/schedule	POST	\N	201	\N	::1	77	2026-06-27 07:07:18.077272
2299	1	/api/employees/schedules	GET	\N	200	\N	::1	42	2026-06-27 07:07:18.128014
2300	1	/api/employees/schedule	POST	\N	201	\N	::1	80	2026-06-27 07:07:42.631219
2301	1	/api/employees/schedules	GET	\N	200	\N	::1	14	2026-06-27 07:07:42.651535
2302	1	/api/employees/schedule	POST	\N	201	\N	::1	75	2026-06-27 07:08:11.668109
2303	1	/api/employees/schedules	GET	\N	200	\N	::1	14	2026-06-27 07:08:11.688997
2304	1	/api/employees/schedules?branch_id=37	GET	\N	200	\N	::1	87	2026-06-27 07:08:30.7993
2305	1	/api/employees?limit=200&branch_id=37	GET	\N	200	\N	::1	161	2026-06-27 07:08:30.870456
2306	1	/api/employees/schedule	POST	\N	201	\N	::1	124	2026-06-27 07:08:57.575786
2307	1	/api/employees/schedules?branch_id=37	GET	\N	200	\N	::1	19	2026-06-27 07:08:57.605378
2308	1	/api/employees/schedule	POST	\N	201	\N	::1	188	2026-06-27 07:09:19.311934
2309	1	/api/employees/schedules?branch_id=37	GET	\N	200	\N	::1	14	2026-06-27 07:09:19.333366
2310	1	/api/employees/schedule	POST	\N	201	\N	::1	74	2026-06-27 07:09:34.875927
2311	1	/api/employees/schedules?branch_id=37	GET	\N	200	\N	::1	14	2026-06-27 07:09:34.898801
2312	1	/api/employees/schedule	POST	\N	201	\N	::1	6	2026-06-27 07:09:44.72325
2313	1	/api/employees/schedules?branch_id=37	GET	\N	200	\N	::1	5	2026-06-27 07:09:44.733277
2314	1	/api/employees/schedule	POST	\N	201	\N	::1	80	2026-06-27 07:10:08.424239
2315	1	/api/employees/schedules?branch_id=37	GET	\N	200	\N	::1	16	2026-06-27 07:10:08.448046
2316	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	15	2026-06-27 07:10:16.68007
2317	1	/api/employees/attendance/bulk	POST	\N	201	\N	::1	19	2026-06-27 07:10:24.793931
2318	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	200	\N	::1	7	2026-06-27 07:10:24.815614
2319	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	53	2026-06-27 07:18:22.406564
2320	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	84	2026-06-27 07:18:22.439609
2321	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	198	2026-06-27 07:20:00.890646
2322	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	13	2026-06-27 07:20:03.122469
2323	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	48	2026-06-27 07:20:03.161985
2324	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	53	2026-06-27 07:20:03.16658
2325	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	59	2026-06-27 07:20:14.605811
2326	1	/api/employees/schedules	GET	\N	200	\N	::1	110	2026-06-27 07:20:14.659764
2327	1	/api/employees?limit=200	GET	\N	304	\N	::1	115	2026-06-27 07:20:14.662994
2328	1	/api/v1/setup/branches?page=1&limit=20	GET	\N	304	\N	::1	55	2026-06-27 07:20:49.100309
2329	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	47	2026-06-27 07:20:49.715534
2330	1	/api/employees?limit=200	GET	\N	304	\N	::1	159	2026-06-27 07:20:49.823915
2331	1	/api/employees?limit=200&branch_id=37	GET	\N	304	\N	::1	146	2026-06-27 07:21:16.950605
2332	1	/api/salary/attendance-summary?employee_id=37&month=2026-06	GET	\N	200	\N	::1	21	2026-06-27 07:21:18.706853
2333	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	148	2026-06-27 07:21:53.383788
2334	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	61	2026-06-27 07:22:29.52391
2335	1	/api/employees?limit=200	GET	\N	304	\N	::1	106	2026-06-27 07:22:29.567085
2336	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	161	2026-06-27 07:22:29.620178
2337	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	404	2026-06-27 07:28:10.091628
2338	1	/api/employees?limit=200	GET	\N	304	\N	::1	475	2026-06-27 07:28:10.159431
2339	1	/api/v1/setup/branches?limit=200	GET	\N	200	\N	::1	27	2026-06-27 07:28:10.3982
2340	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	84	2026-06-27 07:28:10.456069
2341	1	/api/employees?limit=200	GET	\N	200	\N	::1	141	2026-06-27 07:28:10.510213
2342	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	57	2026-06-27 07:28:28.095903
2343	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	59	2026-06-27 07:28:28.102989
2344	1	/api/employees?limit=200	GET	\N	304	\N	::1	198	2026-06-27 07:28:28.238884
2345	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	53	2026-06-27 07:29:17.375116
2346	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	66	2026-06-27 07:29:17.390189
2347	1	/api/employees?limit=200	GET	\N	304	\N	::1	221	2026-06-27 07:29:17.54348
2348	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	49	2026-06-27 07:31:02.84628
2349	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	63	2026-06-27 07:31:02.863072
2350	1	/api/employees?limit=200	GET	\N	304	\N	::1	68	2026-06-27 07:31:02.86791
2351	1	/api/salary/attendance-summary?employee_id=34&month=2026-06	GET	\N	200	\N	::1	85	2026-06-27 07:32:36.315697
2352	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	20	2026-06-27 07:32:44.00102
2353	1	/api/employees?limit=200	GET	\N	304	\N	::1	60	2026-06-27 07:32:44.044892
2354	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	60	2026-06-27 07:32:44.04583
2355	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	50	2026-06-27 07:36:23.502948
2356	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-27 07:36:23.511925
2357	1	/api/employees?limit=200	GET	\N	304	\N	::1	96	2026-06-27 07:36:23.549524
2358	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	53	2026-06-27 07:37:11.599792
2359	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	59	2026-06-27 07:37:11.608698
2360	1	/api/employees?limit=200	GET	\N	304	\N	::1	88	2026-06-27 07:37:11.635695
2361	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	51	2026-06-27 07:37:32.90718
2362	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-27 07:37:32.917211
2363	1	/api/employees?limit=200	GET	\N	304	\N	::1	94	2026-06-27 07:37:32.952465
2364	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	59	2026-06-27 07:38:28.04584
2365	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	150	2026-06-27 07:38:28.139224
2366	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	15	2026-06-27 07:38:31.101427
2367	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	54	2026-06-27 07:38:31.142228
2368	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	149	2026-06-27 07:38:31.238765
2369	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	67	2026-06-27 07:39:39.752114
2370	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	194	2026-06-27 07:39:39.881901
2371	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	112	2026-06-27 07:40:15.128246
2372	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	18	2026-06-27 07:40:18.037251
2373	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	61	2026-06-27 07:40:18.082307
2374	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	55	2026-06-27 07:40:18.085244
2375	1	/api/employees?limit=200	GET	\N	304	\N	::1	181	2026-06-27 07:41:01.525094
2376	1	/api/employees/34/attendance?month=2026-06	GET	\N	200	\N	::1	18	2026-06-27 07:41:04.361579
2377	1	/api/employees/37/attendance?month=2026-06	GET	\N	200	\N	::1	82	2026-06-27 07:41:18.185514
2378	1	/api/employees/1/attendance?month=2026-06	GET	\N	200	\N	::1	14	2026-06-27 07:41:25.215708
2379	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	101	2026-06-27 07:50:49.344624
2380	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	106	2026-06-27 07:50:49.355076
2381	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	209	2026-06-27 07:50:49.460766
2382	1	/api/employees/attendance/daily?date=2026-06-27	GET	\N	304	\N	::1	98	2026-06-27 08:20:08.838771
2383	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	155	2026-06-27 08:20:08.869901
2384	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	172	2026-06-27 08:20:08.889053
2385	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	9	2026-06-27 08:20:17.112335
2386	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	12	2026-06-27 08:20:17.11301
2387	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	21	2026-06-27 08:20:17.120722
2388	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	88	2026-06-27 08:21:35.557969
2389	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	13	2026-06-27 08:21:38.22282
2390	1	/api/v1/routes?limit=200	GET	\N	304	\N	::1	67	2026-06-27 08:21:38.278823
2391	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	67	2026-06-27 08:21:38.28358
2392	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	80	2026-06-27 08:21:38.287334
2395	\N	/api/trips?page=1&limit=20	GET	\N	401	\N	::1	1	2026-06-27 09:44:07.907054
2394	\N	/api/v1/transport/providers?limit=200	GET	\N	401	\N	::1	1	2026-06-27 09:44:07.907159
2393	\N	/api/v1/routes?limit=200	GET	\N	401	\N	::1	12	2026-06-27 09:44:07.906908
2397	38	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	25	2026-06-27 09:57:00.692
2398	38	/api/customers?limit=1	GET	\N	304	\N	::1	77	2026-06-27 09:57:00.747997
2399	38	/api/payments?limit=1	GET	\N	304	\N	::1	86	2026-06-27 09:57:00.758774
2400	38	/api/cargo?limit=1	GET	\N	200	\N	::1	80	2026-06-27 09:57:00.793965
2401	38	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	42	2026-06-27 09:57:05.699065
2402	38	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	28	2026-06-27 09:57:05.702372
2403	38	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	28	2026-06-27 09:57:05.704185
2404	38	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	52	2026-06-27 09:57:05.707836
2405	38	/api/customers?page=1&limit=10&customer_type=regular	GET	\N	200	\N	::1	87	2026-06-27 09:57:25.251369
2406	38	/api/customers?page=1&limit=10&customer_type=one_time	GET	\N	200	\N	::1	17	2026-06-27 09:57:28.484036
2407	38	/api/customers?page=1&limit=10&customer_type=vip	GET	\N	200	\N	::1	7	2026-06-27 09:57:30.781404
2408	38	/api/customers/46	PUT	\N	200	\N	::1	145	2026-06-27 09:57:44.893918
2409	38	/api/customers?page=1&limit=10&customer_type=vip	GET	\N	200	\N	::1	46	2026-06-27 09:57:44.947859
2410	38	/api/customers/45	PUT	\N	200	\N	::1	19	2026-06-27 09:57:51.74479
2411	38	/api/customers?page=1&limit=10&customer_type=vip	GET	\N	200	\N	::1	6	2026-06-27 09:57:51.760016
2412	38	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	6	2026-06-27 09:57:55.415427
2413	38	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	47	2026-06-27 09:58:06.948286
2414	38	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	11	2026-06-27 09:58:08.479646
2415	38	/api/v1/routes?limit=200	GET	\N	304	\N	::1	10	2026-06-27 09:58:11.814306
2416	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	183	2026-06-27 09:58:11.988099
2417	38	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	188	2026-06-27 09:58:11.991342
2418	38	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	12	2026-06-27 09:58:17.263523
2419	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	7	2026-06-27 09:58:19.431134
2420	38	/api/cargo?limit=1	GET	\N	304	\N	::1	20	2026-06-27 09:58:19.445044
2421	38	/api/payments?limit=1	GET	\N	304	\N	::1	5	2026-06-27 09:58:19.477099
2422	38	/api/customers?limit=1	GET	\N	200	\N	::1	59	2026-06-27 09:58:19.485463
2423	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	47	2026-06-27 10:10:54.746774
2424	38	/api/cargo?limit=1	GET	\N	304	\N	::1	145	2026-06-27 10:10:54.855528
2425	38	/api/customers?limit=1	GET	\N	304	\N	::1	152	2026-06-27 10:10:54.870065
2426	38	/api/payments?limit=1	GET	\N	304	\N	::1	134	2026-06-27 10:10:54.904412
2427	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	94	2026-06-27 10:11:19.262252
2428	38	/api/cargo?limit=1	GET	\N	304	\N	::1	96	2026-06-27 10:11:19.270031
2429	38	/api/payments?limit=1	GET	\N	304	\N	::1	82	2026-06-27 10:11:19.295555
2430	38	/api/customers?limit=1	GET	\N	304	\N	::1	132	2026-06-27 10:11:19.305898
2431	38	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	56	2026-06-27 10:11:35.444747
2432	38	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	23	2026-06-27 10:11:42.448371
2433	38	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	53	2026-06-27 10:11:42.478972
2434	38	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	65	2026-06-27 10:11:42.486672
2435	38	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	65	2026-06-27 10:11:42.492825
2436	38	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-27 10:11:46.460175
2437	38	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	8	2026-06-27 10:11:47.504047
2438	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	9	2026-06-27 10:11:49.850775
2439	38	/api/v1/routes?limit=200	GET	\N	304	\N	::1	12	2026-06-27 10:11:49.852252
2440	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	16	2026-06-27 10:11:49.855243
2441	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	87	2026-06-27 10:12:30.66886
2442	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	104	2026-06-27 10:13:03.568096
2443	\N	/api/v1/branches?limit=200	GET	\N	404	\N	::1	3	2026-06-27 10:21:49.0533
2444	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	109	2026-06-27 10:21:49.066117
2445	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	127	2026-06-27 10:21:49.067926
2446	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	149	2026-06-27 10:21:49.092408
2447	\N	/api/v1/branches?limit=200	GET	\N	404	\N	::1	1	2026-06-27 10:22:02.940489
2448	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	86	2026-06-27 10:27:53.076009
2449	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	98	2026-06-27 10:27:53.084452
2450	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	170	2026-06-27 10:27:53.174043
2451	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	8	2026-06-27 10:28:00.488749
2452	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	8	2026-06-27 10:28:00.492934
2453	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	16	2026-06-27 10:28:00.494662
2454	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	69	2026-06-27 10:28:00.549513
2455	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	57	2026-06-27 10:45:48.336207
2456	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	81	2026-06-27 10:45:48.363105
2457	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	84	2026-06-27 10:45:48.364776
2458	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	120	2026-06-27 10:45:48.400525
2459	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	4	2026-06-27 10:45:54.882398
2460	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-27 10:45:54.887004
2461	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	15	2026-06-27 10:45:54.89064
2462	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	20	2026-06-27 10:45:54.897435
2463	38	/api/trips	POST	\N	422	\N	::1	58	2026-06-27 10:46:36.084744
2464	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	186	2026-06-27 10:46:59.632877
2465	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	92	2026-06-27 10:54:14.176175
2466	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	99	2026-06-27 10:54:14.187136
2467	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	175	2026-06-27 10:54:14.26019
2468	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	209	2026-06-27 10:54:14.296055
2469	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	174	2026-06-27 10:55:02.090273
2470	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	107	2026-06-27 10:55:48.760029
2471	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	12	2026-06-27 10:55:50.443899
2472	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	49	2026-06-27 10:55:50.48439
2473	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	56	2026-06-27 10:55:50.49063
2474	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	70	2026-06-27 10:55:50.500175
2475	38	/api/trips	POST	\N	422	\N	::1	44	2026-06-27 10:56:13.712588
2476	38	/api/trips	POST	\N	422	\N	::1	41	2026-06-27 10:56:27.330535
2477	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	74	2026-06-27 11:04:30.849587
2478	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	90	2026-06-27 11:04:30.857871
2479	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	116	2026-06-27 11:04:30.868078
2480	38	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	6	2026-06-27 11:04:36.406847
2481	38	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	25	2026-06-27 11:04:36.42019
2482	38	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	32	2026-06-27 11:04:36.429962
2483	38	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	74	2026-06-27 11:04:36.472324
2484	38	/api/trips	POST	\N	201	\N	::1	94	2026-06-27 11:06:24.758306
2485	38	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	21	2026-06-27 11:06:24.789518
2486	38	/api/auth/logout	POST	\N	200	\N	::1	5	2026-06-27 11:06:33.461092
2487	\N	/api/auth/login	POST	\N	200	\N	::1	248	2026-06-27 11:06:40.483776
2488	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	27	2026-06-27 11:06:40.661052
2489	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	93	2026-06-27 11:06:40.730439
2490	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	31	2026-06-27 11:06:40.771036
2491	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	128	2026-06-27 11:06:40.777738
2492	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	142	2026-06-27 11:06:40.800311
2493	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	36	2026-06-27 11:06:40.816636
2494	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	170	2026-06-27 11:06:40.825102
2495	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	173	2026-06-27 11:06:40.835332
2496	1	/api/dashboard/overview	GET	\N	200	\N	::1	215	2026-06-27 11:06:40.85426
2497	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	58	2026-06-27 11:10:59.248109
2498	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	64	2026-06-27 11:10:59.256788
2499	1	/api/trips?page=1&limit=20	GET	\N	200	\N	::1	117	2026-06-27 11:10:59.307569
2500	1	/api/v1/transport/providers?limit=200	GET	\N	304	\N	::1	4	2026-06-27 11:11:00.185007
2501	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	8	2026-06-27 11:11:00.188026
2502	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	14	2026-06-27 11:11:00.189905
2503	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	49	2026-06-27 11:11:00.227285
2504	1	/api/trips?page=1&limit=20	GET	\N	304	\N	::1	301	2026-06-27 11:13:19.017409
2505	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	19	2026-06-27 11:13:21.743372
2506	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	30	2026-06-27 11:13:21.756192
2507	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	13	2026-06-27 11:13:21.778747
2508	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	5	2026-06-27 11:13:21.78764
2509	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	83	2026-06-27 11:13:21.810223
2510	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	85	2026-06-27 11:13:21.819811
2511	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	95	2026-06-27 11:13:21.838773
2512	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	99	2026-06-27 11:13:21.848566
2513	1	/api/dashboard/overview	GET	\N	304	\N	::1	151	2026-06-27 11:13:21.879974
2514	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	11	2026-06-27 11:13:25.048991
2515	1	/api/cargo?limit=100	GET	\N	200	\N	::1	16	2026-06-27 11:13:25.054409
2516	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	17	2026-06-27 11:13:25.05693
2517	1	/api/cargo/39	GET	\N	304	\N	::1	8	2026-06-27 11:13:25.332554
2518	1	/api/cargo/39/items	GET	\N	200	\N	::1	13	2026-06-27 11:13:25.336885
2519	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	7	2026-06-28 09:22:40.604345
2520	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	2	2026-06-28 09:22:44.052967
2521	\N	/api/v1/transport/providers?limit=100	GET	\N	401	\N	::1	2	2026-06-28 09:22:44.062687
2522	\N	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	401	\N	::1	1	2026-06-28 09:22:44.154008
2523	\N	/api/cargo?limit=5&page=1	GET	\N	401	\N	::1	2	2026-06-28 09:22:44.169974
2524	\N	/api/employees?limit=1&page=1	GET	\N	401	\N	::1	2	2026-06-28 09:22:44.171764
2525	\N	/api/customers?page=1&limit=1	GET	\N	401	\N	::1	1	2026-06-28 09:22:44.17396
2526	\N	/api/payments?limit=100&page=1	GET	\N	401	\N	::1	1	2026-06-28 09:22:44.178117
2527	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	1	2026-06-28 09:22:44.178409
2528	\N	/api/dashboard/overview	GET	\N	401	\N	::1	1	2026-06-28 09:22:44.180335
2529	\N	/api/auth/login	POST	\N	200	\N	::1	321	2026-06-28 09:26:59.801702
2530	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	36	2026-06-28 09:27:00.164556
2531	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	112	2026-06-28 09:27:00.244793
2532	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	137	2026-06-28 09:27:00.267579
2533	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	41	2026-06-28 09:27:00.29033
2534	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	163	2026-06-28 09:27:00.294107
2607	40	/api/cargo/39	GET	\N	200	\N	::1	12	2026-06-28 09:59:45.88027
2535	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	42	2026-06-28 09:27:00.317614
2537	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	276	2026-06-28 09:27:00.444196
2536	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	291	2026-06-28 09:27:00.440573
2538	1	/api/dashboard/overview	GET	\N	304	\N	::1	362	2026-06-28 09:27:00.50695
2540	1	/api/branches	GET	\N	304	\N	::1	117	2026-06-28 09:36:22.001132
2539	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	114	2026-06-28 09:36:21.995256
2541	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	119	2026-06-28 09:36:22.04542
2542	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	26	2026-06-28 09:36:26.117196
2543	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	79	2026-06-28 09:42:34.254375
2544	1	/api/branches	GET	\N	304	\N	::1	87	2026-06-28 09:42:34.263871
2545	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	96	2026-06-28 09:42:34.332804
2546	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	32	2026-06-28 09:42:39.241067
2547	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-28 09:42:41.305389
2548	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	11	2026-06-28 09:42:41.307227
2549	1	/api/branches	GET	\N	304	\N	::1	13	2026-06-28 09:42:41.310092
2550	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	58	2026-06-28 09:43:03.299073
2551	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	177	2026-06-28 09:43:26.620526
2552	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	64	2026-06-28 09:44:29.022091
2553	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	12	2026-06-28 09:44:30.909463
2554	1	/api/branches	GET	\N	304	\N	::1	12	2026-06-28 09:44:30.911235
2555	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	67	2026-06-28 09:44:30.967772
2556	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	9	2026-06-28 09:44:34.684102
2557	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	58	2026-06-28 09:47:16.177912
2558	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	26	2026-06-28 09:47:20.137717
2559	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	11	2026-06-28 09:47:21.880553
2560	1	/api/branches	GET	\N	304	\N	::1	12	2026-06-28 09:47:21.882433
2561	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	64	2026-06-28 09:47:21.936446
2562	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	9	2026-06-28 09:47:29.835685
2563	1	/api/cargo?page=1&limit=10&payment_status=Partial	GET	\N	200	\N	::1	62	2026-06-28 09:47:53.182938
2564	1	/api/cargo?page=1&limit=10&payment_status=Paid	GET	\N	200	\N	::1	17	2026-06-28 09:47:54.011309
2565	1	/api/cargo?page=1&limit=10&payment_status=last_mile	GET	\N	200	\N	::1	8	2026-06-28 09:47:55.085316
2566	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	6	2026-06-28 09:47:56.358575
2567	1	/api/cargo?page=1&limit=10&payment_status=Paid	GET	\N	304	\N	::1	54	2026-06-28 09:49:15.259027
2568	1	/api/cargo?page=1&limit=10&payment_status=last_mile	GET	\N	304	\N	::1	14	2026-06-28 09:49:16.123048
2569	1	/api/cargo?page=1&limit=10&payment_status=delayed	GET	\N	200	\N	::1	8	2026-06-28 09:49:17.681518
2570	1	/api/cargo?page=1&limit=10&payment_status=awaiting_pickup	GET	\N	200	\N	::1	8	2026-06-28 09:49:18.518034
2571	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	7	2026-06-28 09:49:20.090408
2572	1	/api/cargo?page=1&limit=10&payment_status=awaiting_pickup	GET	\N	304	\N	::1	9	2026-06-28 09:49:21.499317
2573	1	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	8	2026-06-28 09:49:24.671699
2574	1	/api/branches	GET	\N	304	\N	::1	57	2026-06-28 09:49:39.446308
2575	1	/api/customers?limit=200	GET	\N	200	\N	::1	103	2026-06-28 09:49:39.494305
2576	1	/api/auth/logout	POST	\N	200	\N	::1	42	2026-06-28 09:50:02.030722
2577	\N	/api/auth/login	POST	\N	200	\N	::1	260	2026-06-28 09:50:26.202434
2578	40	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	14	2026-06-28 09:50:26.345505
2579	40	/api/customers?limit=1	GET	\N	200	\N	::1	77	2026-06-28 09:50:26.408323
2580	40	/api/cargo?limit=1	GET	\N	200	\N	::1	68	2026-06-28 09:50:26.480311
2581	40	/api/payments?limit=1	GET	\N	200	\N	::1	69	2026-06-28 09:50:26.511181
2582	40	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	20	2026-06-28 09:50:30.360824
2583	40	/api/customers?limit=200	GET	\N	200	\N	::1	17	2026-06-28 09:50:32.184566
2584	40	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	67	2026-06-28 09:50:43.30864
2585	40	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	114	2026-06-28 09:50:43.358894
2586	40	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	130	2026-06-28 09:50:43.36592
2587	40	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	159	2026-06-28 09:50:43.385945
2588	40	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	7	2026-06-28 09:50:50.8327
2589	40	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	18	2026-06-28 09:50:50.841777
2590	40	/api/v1/setup/addresses?limit=500&city_id=35	GET	\N	200	\N	::1	43	2026-06-28 09:51:13.386639
2591	40	/api/customers	POST	\N	201	\N	::1	78	2026-06-28 09:51:17.318776
2592	40	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	71	2026-06-28 09:51:17.447642
2593	40	/api/v1/customers/51/cargo?page=1&limit=500	GET	\N	200	\N	::1	82	2026-06-28 09:51:17.457316
2594	40	/api/customers?page=1&limit=100	GET	\N	200	\N	::1	87	2026-06-28 09:51:17.459042
2595	40	/api/customers/51	GET	\N	200	\N	::1	96	2026-06-28 09:51:17.467167
2596	40	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	92	2026-06-28 09:51:17.470054
2597	40	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	47	2026-06-28 09:51:33.50078
2598	40	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	58	2026-06-28 09:59:05.746573
2599	40	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	65	2026-06-28 09:59:13.286231
2600	40	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	75	2026-06-28 09:59:13.298699
2601	40	/api/customers?page=1&limit=10	GET	\N	200	\N	::1	89	2026-06-28 09:59:13.307843
2602	40	/api/cargo?page=1&limit=100	GET	\N	304	\N	::1	85	2026-06-28 09:59:13.311048
2603	40	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	53	2026-06-28 09:59:28.933603
2604	40	/api/branches	GET	\N	304	\N	::1	59	2026-06-28 09:59:39.394066
2605	40	/api/cargo/39	GET	\N	304	\N	::1	64	2026-06-28 09:59:39.432018
2606	40	/api/cargo/39/status	PUT	\N	200	\N	::1	41	2026-06-28 09:59:45.861396
2608	40	/api/cargo/39/status	PUT	\N	200	\N	::1	17	2026-06-28 09:59:52.343823
2610	40	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	9	2026-06-28 09:59:55.089032
2609	40	/api/cargo/39	GET	\N	200	\N	::1	4	2026-06-28 09:59:52.355635
2611	40	/api/cargo/39	GET	\N	304	\N	::1	164	2026-06-28 10:00:08.721629
2612	40	/api/cargo/39/status	PUT	\N	200	\N	::1	20	2026-06-28 10:00:14.809568
2613	40	/api/cargo/39	GET	\N	200	\N	::1	4	2026-06-28 10:00:14.820868
2614	40	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	9	2026-06-28 10:00:16.8533
2615	40	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	7	2026-06-28 10:00:24.356101
2616	40	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	6	2026-06-28 10:00:24.395562
2617	40	/api/branches	GET	\N	304	\N	::1	8	2026-06-28 10:00:28.686441
2618	40	/api/cargo/39	GET	\N	304	\N	::1	16	2026-06-28 10:00:28.69393
2619	40	/api/cargo/39/status	PUT	\N	200	\N	::1	60	2026-06-28 10:00:41.547963
2620	40	/api/cargo/39	GET	\N	200	\N	::1	6	2026-06-28 10:00:41.56849
2621	40	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	29	2026-06-28 10:00:45.185062
2622	40	/api/v1/setup/cities?limit=200	GET	\N	304	\N	::1	26	2026-06-28 10:00:53.340541
2623	40	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	74	2026-06-28 10:00:53.389083
2624	40	/api/customers?page=1&limit=10	GET	\N	304	\N	::1	82	2026-06-28 10:00:53.393055
2625	40	/api/cargo?page=1&limit=100	GET	\N	200	\N	::1	88	2026-06-28 10:00:53.403472
2626	40	/api/cargo?page=1&limit=10	GET	\N	304	\N	::1	16	2026-06-28 10:00:56.653954
2627	40	/api/cargo?limit=1	GET	\N	200	\N	::1	8	2026-06-28 10:00:59.036008
2628	40	/api/payments?limit=1	GET	\N	304	\N	::1	9	2026-06-28 10:00:59.039284
2629	40	/api/customers?limit=1	GET	\N	200	\N	::1	12	2026-06-28 10:00:59.040575
2630	40	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	8	2026-06-28 10:01:09.089636
2631	40	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	15	2026-06-28 10:01:10.948466
2632	40	/api/v1/setup/addresses?limit=500	GET	\N	304	\N	::1	86	2026-06-28 10:01:30.878384
2633	40	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	92	2026-06-28 10:01:30.88671
2634	40	/api/v1/customers/51/cargo?page=1&limit=500	GET	\N	304	\N	::1	75	2026-06-28 10:01:30.908513
2635	40	/api/customers?page=1&limit=100	GET	\N	304	\N	::1	130	2026-06-28 10:01:30.917116
2636	40	/api/customers/51	GET	\N	304	\N	::1	211	2026-06-28 10:01:30.994669
2637	40	/api/customers?limit=200	GET	\N	200	\N	::1	9	2026-06-28 10:01:35.371786
2638	40	/api/branches	GET	\N	304	\N	::1	15	2026-06-28 10:01:35.376458
2639	40	/api/customers?limit=200	GET	\N	304	\N	::1	94	2026-06-28 10:03:36.095298
2640	40	/api/customers?limit=200	GET	\N	304	\N	::1	115	2026-06-28 10:35:43.193496
2641	40	/api/branches	GET	\N	304	\N	::1	150	2026-06-28 10:35:43.226138
2642	40	/api/customers?limit=200	GET	\N	304	\N	::1	68	2026-06-28 10:36:19.126284
2643	40	/api/customers?limit=200	GET	\N	304	\N	::1	69	2026-06-28 10:36:52.119769
2644	40	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	127	2026-06-28 10:41:09.175096
2645	40	/api/branches	GET	\N	304	\N	::1	84	2026-06-28 10:41:09.202876
2646	40	/api/customers?limit=200	GET	\N	304	\N	::1	102	2026-06-28 10:41:09.220977
2648	\N	/api/v1/notifications?limit=25	GET	\N	401	\N	::1	11	2026-06-28 22:13:32.815299
2649	\N	/api/customers?limit=200	GET	\N	401	\N	::1	2	2026-06-28 22:13:32.814683
2647	\N	/api/branches	GET	\N	401	\N	::1	2	2026-06-28 22:13:32.804272
2650	\N	/api/v1/setup/branches?limit=200	GET	\N	401	\N	::1	3	2026-06-28 22:13:32.860357
2651	\N	/api/auth/login	POST	\N	200	\N	::1	386	2026-06-28 22:13:45.8264
2652	1	/api/v1/notifications?limit=25	GET	\N	200	\N	::1	40	2026-06-28 22:13:46.034978
2653	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	98	2026-06-28 22:13:46.105985
2654	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	114	2026-06-28 22:13:46.11321
2655	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	500	\N	::1	38	2026-06-28 22:13:46.159765
2656	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	156	2026-06-28 22:13:46.16413
2657	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	52	2026-06-28 22:13:46.167872
2658	1	/api/customers?page=1&limit=1	GET	\N	200	\N	::1	132	2026-06-28 22:13:46.174332
2659	1	/api/dashboard/overview	GET	\N	200	\N	::1	181	2026-06-28 22:13:46.180822
2660	1	/api/cargo?limit=5&page=1	GET	\N	500	\N	::1	205	2026-06-28 22:13:46.195806
2661	1	/api/cargo?limit=100	GET	\N	500	\N	::1	9	2026-06-28 22:13:49.902984
2662	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	19	2026-06-28 22:13:49.908597
2663	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	28	2026-06-28 22:13:49.923469
2664	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	8	2026-06-28 22:13:52.373185
2665	1	/api/branches	GET	\N	304	\N	::1	10	2026-06-28 22:13:55.655089
2666	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	17	2026-06-28 22:13:55.662026
2667	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	12	2026-06-28 22:13:56.703162
2668	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	7	2026-06-28 22:13:58.719015
2669	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	6	2026-06-28 22:14:02.732391
2670	1	/api/employees/jobs	GET	\N	304	\N	::1	50	2026-06-28 22:14:05.662091
2671	1	/api/employees?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-28 22:14:05.664328
2672	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	57	2026-06-28 22:14:05.670068
2673	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	9	2026-06-28 22:14:10.596564
2674	1	/api/v1/transport/providers?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-28 22:14:10.598217
2675	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	11	2026-06-28 22:14:15.735214
2676	1	/api/accounts?page=1&limit=20	GET	\N	304	\N	::1	7	2026-06-28 22:14:15.777172
2677	1	/api/payments?page=1&limit=20	GET	\N	200	\N	::1	23	2026-06-28 22:14:18.457033
2678	1	/api/v1/expense-types	GET	\N	304	\N	::1	7	2026-06-28 22:14:20.991443
2679	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-28 22:14:20.995067
2680	1	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	9	2026-06-28 22:14:24.086088
2681	1	/api/salary/charges?page=1&limit=20	GET	\N	304	\N	::1	13	2026-06-28 22:14:27.540149
2682	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	16	2026-06-28 22:14:29.476806
2683	1	/api/reports/cargo	GET	\N	200	\N	::1	57	2026-06-28 22:14:29.524033
2684	1	/api/reports/branch-summary	GET	\N	304	\N	::1	63	2026-06-28 22:14:29.525032
2685	1	/api/reports/revenue	GET	\N	304	\N	::1	62	2026-06-28 22:14:29.526074
2686	1	/api/v1/users/roles	GET	\N	200	\N	::1	10	2026-06-28 22:14:37.239671
2687	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	15	2026-06-28 22:14:37.242544
2688	1	/api/v1/disputes?page=1&limit=20	GET	\N	304	\N	::1	60	2026-06-28 22:14:47.927326
2689	1	/api/v1/disputes/types	GET	\N	304	\N	::1	65	2026-06-28 22:14:47.932246
2690	1	/api/v1/notifications?page=1&limit=20	GET	\N	200	\N	::1	7	2026-06-28 22:14:49.146785
2691	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	10	2026-06-28 22:14:49.14798
2692	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	61	2026-06-28 22:27:58.204762
2693	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	14	2026-06-28 22:28:01.143011
2694	1	/api/cargo?limit=5&page=1	GET	\N	500	\N	::1	85	2026-06-28 22:28:01.217646
2695	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	500	\N	::1	31	2026-06-28 22:28:01.249155
2696	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	121	2026-06-28 22:28:01.255034
2697	1	/api/customers?page=1&limit=1	GET	\N	304	\N	::1	114	2026-06-28 22:28:01.259632
2698	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	129	2026-06-28 22:28:01.26351
2699	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	20	2026-06-28 22:28:01.270314
2700	1	/api/employees?limit=1&page=1	GET	\N	304	\N	::1	135	2026-06-28 22:28:01.272735
2701	1	/api/dashboard/overview	GET	\N	304	\N	::1	158	2026-06-28 22:28:01.291066
2702	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	11	2026-06-28 22:28:06.283955
2703	1	/api/branches	GET	\N	304	\N	::1	13	2026-06-28 22:28:06.284979
2704	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	9	2026-06-28 22:28:07.322639
2705	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	8	2026-06-28 22:28:09.34261
2706	1	/api/branches	GET	\N	304	\N	::1	8	2026-06-28 22:28:10.59779
2707	1	/api/customers?limit=200	GET	\N	200	\N	::1	12	2026-06-28 22:28:10.602219
2708	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	50	2026-06-28 22:28:35.033817
2709	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	16	2026-06-28 22:28:36.027252
2710	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	6	2026-06-28 22:28:38.039459
2711	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	7	2026-06-28 22:28:42.073745
2712	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	18	2026-06-28 22:28:46.417112
2713	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	12	2026-06-28 22:28:46.447856
2714	1	/api/branches	GET	\N	304	\N	::1	59	2026-06-28 22:28:46.454678
2715	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	10	2026-06-28 22:28:47.624743
2716	1	/api/cargo?page=1&limit=10	GET	\N	500	\N	::1	74	2026-06-28 22:29:08.064092
2717	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	16	2026-06-28 22:29:11.372411
2718	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	85	2026-06-28 22:29:11.444703
2719	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	500	\N	::1	88	2026-06-28 22:29:11.449702
2720	1	/api/cargo?limit=5&page=1	GET	\N	500	\N	::1	24	2026-06-28 22:29:11.475282
2721	1	/api/dashboard/overview	GET	\N	304	\N	::1	120	2026-06-28 22:29:11.479418
2722	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	54	2026-06-28 22:29:37.137191
2723	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	50	2026-06-28 22:32:48.868769
2724	1	/api/v1/notifications?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-28 22:32:50.798657
2725	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	81	2026-06-28 22:32:50.875367
2726	1	/api/cargo?limit=5&page=1	GET	\N	500	\N	::1	30	2026-06-28 22:32:53.865835
2727	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	64	2026-06-28 22:32:53.899656
2728	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	15	2026-06-28 22:32:53.901351
2729	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	500	\N	::1	73	2026-06-28 22:32:53.910806
2730	1	/api/dashboard/overview	GET	\N	304	\N	::1	108	2026-06-28 22:32:53.943731
2731	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	8	2026-06-28 22:32:57.336965
2732	1	/api/cargo?limit=100	GET	\N	500	\N	::1	14	2026-06-28 22:32:57.344288
2733	1	/api/trips?status=ongoing&limit=100	GET	\N	304	\N	::1	19	2026-06-28 22:32:57.349563
2734	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	9	2026-06-28 22:32:59.013913
2735	1	/api/v1/transport/providers?limit=100	GET	\N	304	\N	::1	108	2026-06-28 22:33:42.111208
2736	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	161	2026-06-28 22:33:42.143149
2737	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	18	2026-06-28 22:33:45.972469
2738	1	/api/cargo?limit=5&page=1	GET	\N	500	\N	::1	29	2026-06-28 22:33:45.989688
2739	1	/api/dashboard/overview	GET	\N	500	\N	::1	62	2026-06-28 22:33:46.024452
2740	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	67	2026-06-28 22:33:46.02709
2741	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	500	\N	::1	78	2026-06-28 22:33:46.043429
2742	\N	/api/auth/login	POST	\N	401	\N	::1	34	2026-06-28 22:36:19.122184
2743	\N	/api/auth/login	POST	\N	200	\N	::1	121	2026-06-28 22:36:54.367182
2744	\N	/api/dashboard/overview	GET	\N	401	\N	::1	1	2026-06-28 22:37:03.765333
2745	\N	/api/auth/login	POST	\N	200	\N	::1	100	2026-06-28 22:37:24.335637
2746	1	/api/dashboard/overview	GET	\N	500	\N	::1	54	2026-06-28 22:37:24.530808
2747	\N	/api/auth/login	POST	\N	200	\N	::1	100	2026-06-28 22:37:51.347165
2748	1	/api/dashboard/overview	GET	\N	500	\N	::1	55	2026-06-28 22:37:51.745586
2749	1	/api/cargo?limit=5&page=1	GET	\N	500	\N	::1	8	2026-06-28 22:37:51.812557
2750	\N	/api/auth/login	POST	\N	200	\N	::1	335	2026-06-28 22:46:43.983822
2751	\N	/api/cargo?limit=5&page=1	GET	\N	401	\N	::1	1	2026-06-28 22:46:44.080936
2752	\N	/api/dashboard/overview	GET	\N	401	\N	::1	0	2026-06-28 22:46:44.102231
2753	\N	/api/auth/login	POST	\N	200	\N	::1	336	2026-06-28 22:47:50.195986
2754	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	14	2026-06-28 22:47:59.337908
2755	1	/api/dashboard/overview	GET	\N	200	\N	::1	161	2026-06-28 22:47:59.51961
2756	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	114	2026-06-28 22:52:31.685035
2757	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	159	2026-06-28 22:52:31.731432
2758	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	183	2026-06-28 22:52:31.75214
2759	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	185	2026-06-28 22:52:31.771713
2760	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	120	2026-06-28 22:52:31.810332
2761	1	/api/dashboard/overview	GET	\N	200	\N	::1	249	2026-06-28 22:52:31.834765
2762	1	/api/v1/expense-types	GET	\N	304	\N	::1	52	2026-06-28 22:52:47.973577
2763	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	156	2026-06-28 22:52:48.075335
2764	1	/api/expenses	POST	\N	201	\N	::1	94	2026-06-28 22:53:06.787483
2765	1	/api/expenses?page=1&limit=20	GET	\N	200	\N	::1	16	2026-06-28 22:53:06.813055
2766	1	/api/accounts?limit=100	GET	\N	200	\N	::1	6	2026-06-28 22:53:11.70641
2767	1	/api/expense-payments	POST	\N	500	\N	::1	99	2026-06-28 22:53:22.033393
2768	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	57	2026-06-28 22:54:07.825391
2769	1	/api/v1/invoices?page=1&limit=20	GET	\N	304	\N	::1	59	2026-06-28 22:54:07.829034
2770	1	/api/salary/charges?page=1&limit=20	GET	\N	304	\N	::1	15	2026-06-28 22:54:11.230195
2771	1	/api/reports/cargo?period=month&from=2026-06-01&to=2026-06-28	GET	\N	200	\N	::1	66	2026-06-28 22:54:15.19848
2772	1	/api/reports/cargo/by-destination?period=month&from=2026-06-01&to=2026-06-28	GET	\N	200	\N	::1	66	2026-06-28 22:54:15.201029
2773	1	/api/reports/cargo/by-branch?period=month&from=2026-06-01&to=2026-06-28	GET	\N	200	\N	::1	101	2026-06-28 22:54:15.237219
2774	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	185	2026-06-28 22:54:15.323271
2775	1	/api/reports/cargo?period=month&from=2026-06-01&to=2026-06-28	GET	\N	304	\N	::1	7	2026-06-28 22:54:17.352569
2776	1	/api/reports/cargo/by-branch?period=month&from=2026-06-01&to=2026-06-28	GET	\N	304	\N	::1	9	2026-06-28 22:54:17.35675
2777	1	/api/reports/cargo/by-destination?period=month&from=2026-06-01&to=2026-06-28	GET	\N	304	\N	::1	11	2026-06-28 22:54:17.358682
2778	1	/api/reports/customers/stats?period=month&from=2026-06-01&to=2026-06-28	GET	\N	200	\N	::1	9	2026-06-28 22:54:19.531932
2779	1	/api/reports/employees/stats?period=month&from=2026-06-01&to=2026-06-28	GET	\N	500	\N	::1	8	2026-06-28 22:54:25.560388
2780	1	/api/reports/employees/stats?period=month&from=2026-06-01&to=2026-06-28	GET	\N	500	\N	::1	8	2026-06-28 22:54:26.578998
2781	1	/api/reports/financial?period=month&from=2026-06-01&to=2026-06-28	GET	\N	500	\N	::1	59	2026-06-28 22:54:28.228119
2782	1	/api/reports/branch-financial?period=month&from=2026-06-01&to=2026-06-28	GET	\N	200	\N	::1	67	2026-06-28 22:54:28.236809
2783	1	/api/reports/financial?period=month&from=2026-06-01&to=2026-06-28	GET	\N	500	\N	::1	11	2026-06-28 22:54:29.258199
2784	1	/api/reports/cargo/by-destination?period=year&from=2026-01-01&to=2026-06-28	GET	\N	200	\N	::1	8	2026-06-28 22:54:32.384157
2785	1	/api/reports/cargo/by-branch?period=year&from=2026-01-01&to=2026-06-28	GET	\N	200	\N	::1	10	2026-06-28 22:54:32.387365
2786	1	/api/reports/cargo?period=year&from=2026-01-01&to=2026-06-28	GET	\N	200	\N	::1	14	2026-06-28 22:54:32.388537
2787	1	/api/reports/cargo/by-branch?period=year&from=2026-01-01&to=2026-06-28	GET	\N	304	\N	::1	8	2026-06-28 22:54:38.203537
2788	1	/api/reports/cargo/by-destination?period=year&from=2026-01-01&to=2026-06-28	GET	\N	304	\N	::1	10	2026-06-28 22:54:38.204678
2789	1	/api/reports/cargo?period=year&from=2026-01-01&to=2026-06-28	GET	\N	304	\N	::1	15	2026-06-28 22:54:38.208157
2790	1	/api/reports/customers/stats?period=year&from=2026-01-01&to=2026-06-28	GET	\N	200	\N	::1	9	2026-06-28 22:54:39.773684
2791	1	/api/reports/financial?period=year&from=2026-01-01&to=2026-06-28	GET	\N	500	\N	::1	10	2026-06-28 22:54:44.929353
2792	1	/api/reports/branch-financial?period=year&from=2026-01-01&to=2026-06-28	GET	\N	200	\N	::1	59	2026-06-28 22:54:44.98043
2793	1	/api/reports/financial?period=year&from=2026-01-01&to=2026-06-28	GET	\N	500	\N	::1	10	2026-06-28 22:54:45.94633
2794	1	/api/reports/employees/stats?period=year&from=2026-01-01&to=2026-06-28	GET	\N	500	\N	::1	9	2026-06-28 22:54:46.561149
2795	1	/api/reports/employees/stats?period=year&from=2026-01-01&to=2026-06-28	GET	\N	500	\N	::1	6	2026-06-28 22:54:47.582046
2796	1	/api/reports/employees/stats?period=year&from=2026-01-01&to=2026-06-28	GET	\N	500	\N	::1	6	2026-06-28 22:54:49.600746
2797	1	/api/reports/employees/stats?period=year&from=2026-01-01&to=2026-06-28&branch_id=1	GET	\N	500	\N	::1	4	2026-06-28 22:54:49.836566
2798	1	/api/reports/employees/stats?period=year&from=2026-01-01&to=2026-06-28&branch_id=1	GET	\N	500	\N	::1	6	2026-06-28 22:54:50.86395
2799	1	/api/reports/cargo/by-destination?period=year&from=2026-01-01&to=2026-06-28&branch_id=1	GET	\N	200	\N	::1	7	2026-06-28 22:54:51.828
2800	1	/api/reports/cargo/by-branch?period=year&from=2026-01-01&to=2026-06-28&branch_id=1	GET	\N	200	\N	::1	8	2026-06-28 22:54:51.829286
2801	1	/api/reports/cargo?period=year&from=2026-01-01&to=2026-06-28&branch_id=1	GET	\N	200	\N	::1	11	2026-06-28 22:54:51.830559
2802	1	/api/v1/users/roles	GET	\N	304	\N	::1	7	2026-06-28 22:54:57.981253
2803	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	12	2026-06-28 22:54:57.984536
2804	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	50	2026-06-28 22:55:14.40918
2805	1	/api/v1/users/branch/assign	POST	\N	201	\N	::1	9	2026-06-28 22:55:18.077289
2806	1	/api/v1/users?page=1&limit=20	GET	\N	200	\N	::1	10	2026-06-28 22:55:18.095186
2807	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	58	2026-06-28 22:55:47.526687
2808	1	/api/v1/users/roles	GET	\N	304	\N	::1	62	2026-06-28 22:55:47.533271
2809	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	66	2026-06-28 22:55:47.536277
2810	1	/api/payments?page=1&limit=20	GET	\N	304	\N	::1	67	2026-06-28 22:57:55.721071
2811	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	163	2026-06-28 22:57:55.780344
2812	1	/api/v1/expense-types	GET	\N	304	\N	::1	9	2026-06-28 22:57:59.866851
2813	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	12	2026-06-28 22:57:59.868783
2814	1	/api/accounts?limit=100	GET	\N	304	\N	::1	6	2026-06-28 22:58:02.222386
2815	1	/api/expense-payments	POST	\N	500	\N	::1	195	2026-06-28 22:58:14.279
2816	1	/api/v1/expense-types	GET	\N	304	\N	::1	45	2026-06-28 23:03:59.740867
2817	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	181	2026-06-28 23:03:59.876358
2818	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	99	2026-06-28 23:06:41.826845
2819	1	/api/v1/expense-types	GET	\N	304	\N	::1	8	2026-06-28 23:06:44.506246
2820	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	68	2026-06-28 23:06:44.5672
2821	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	81	2026-06-28 23:06:44.577921
2822	1	/api/accounts?limit=100	GET	\N	304	\N	::1	8	2026-06-28 23:06:47.038728
2823	1	/api/expense-payments	POST	\N	500	\N	::1	10	2026-06-28 23:06:53.821387
2824	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	55	2026-06-28 23:07:06.144901
2825	1	/api/v1/expense-types	GET	\N	304	\N	::1	54	2026-06-28 23:07:06.147043
2826	1	/api/expenses?page=1&limit=20	GET	\N	304	\N	::1	99	2026-06-28 23:07:06.190427
2827	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	15	2026-06-28 23:07:10.254114
2828	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	27	2026-06-28 23:07:10.256518
2829	1	/api/cargo?limit=5&page=1	GET	\N	304	\N	::1	34	2026-06-28 23:07:10.279321
2830	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	304	\N	::1	71	2026-06-28 23:07:10.311962
2831	1	/api/dashboard/overview	GET	\N	200	\N	::1	107	2026-06-28 23:07:10.342404
2832	1	/api/branches	GET	\N	304	\N	::1	13	2026-06-28 23:07:20.295636
2833	1	/api/customers?limit=200	GET	\N	304	\N	::1	17	2026-06-28 23:07:20.30136
2834	1	/api/cargo/40/charges	POST	\N	500	\N	::1	8	2026-06-28 23:09:49.85687
2835	1	/api/cargo	POST	\N	201	\N	::1	87	2026-06-28 23:09:49.942523
2836	1	/api/customers?limit=200	GET	\N	304	\N	::1	70	2026-06-28 23:12:00.763286
2837	1	/api/cargo	POST	\N	201	\N	::1	29	2026-06-28 23:12:03.571201
2838	1	/api/cargo/41/charges	POST	\N	500	\N	::1	15	2026-06-28 23:12:03.596012
2839	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	18	2026-06-28 23:12:06.0134
2840	1	/api/branches	GET	\N	304	\N	::1	24	2026-06-28 23:12:06.026021
2841	1	/api/customers?limit=200	GET	\N	304	\N	::1	77	2026-06-28 23:12:06.074459
2842	1	/api/customers?limit=200	GET	\N	304	\N	::1	94	2026-06-28 23:13:02.7893
2843	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	15	2026-06-28 23:13:10.221918
2844	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	26	2026-06-28 23:13:10.239463
2845	1	/api/v1/users/roles	GET	\N	304	\N	::1	59	2026-06-28 23:13:10.269872
2846	1	/api/v1/setup/branches?limit=200	GET	\N	304	\N	::1	24	2026-06-28 23:13:17.784778
2847	1	/api/v1/users/branch/assign	POST	\N	201	\N	::1	5	2026-06-28 23:13:21.8713
2848	1	/api/v1/users?page=1&limit=20	GET	\N	304	\N	::1	6	2026-06-28 23:13:21.885529
2849	1	/api/auth/logout	POST	\N	200	\N	::1	46	2026-06-28 23:13:32.769735
2850	\N	/api/auth/login	POST	\N	200	\N	::1	298	2026-06-28 23:13:45.055251
2851	1	/api/payments?limit=100&page=1	GET	\N	304	\N	::1	75	2026-06-28 23:13:45.384361
2852	1	/api/cargo?limit=5&page=1	GET	\N	200	\N	::1	87	2026-06-28 23:13:45.391402
2853	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	136	2026-06-28 23:13:45.438312
2854	1	/api/cargo?system_wide=true&limit=1000&page=1	GET	\N	200	\N	::1	150	2026-06-28 23:13:45.494582
2855	1	/api/dashboard/overview	GET	\N	200	\N	::1	221	2026-06-28 23:13:45.52161
2856	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	33	2026-06-28 23:22:35.18464
2857	1	/api/branches	GET	\N	304	\N	::1	63	2026-06-28 23:22:35.228976
2858	1	/api/cargo?page=1&limit=10	GET	\N	200	\N	::1	70	2026-06-28 23:22:35.238385
2859	1	/api/branches	GET	\N	304	\N	::1	13	2026-06-28 23:22:38.434535
2860	1	/api/customers?limit=200	GET	\N	304	\N	::1	20	2026-06-28 23:22:38.446216
2861	1	/api/cargo/42/charges	POST	\N	500	\N	::1	64	2026-06-28 23:24:49.240041
2862	1	/api/cargo/42/charges	POST	\N	500	\N	::1	21	2026-06-28 23:24:49.247589
2863	1	/api/cargo	POST	\N	201	\N	::1	187	2026-06-28 23:24:49.309319
2864	1	/api/cargo/42/charges	POST	\N	500	\N	::1	162	2026-06-28 23:24:49.336205
2865	1	/api/customers?limit=200	GET	\N	304	\N	::1	95	2026-06-28 23:25:02.443593
2866	1	/api/branches	GET	\N	304	\N	::1	37	2026-06-28 23:34:28.326566
2867	1	/api/customers?limit=200	GET	\N	304	\N	::1	80	2026-06-28 23:34:28.374606
2868	1	/api/branches	GET	\N	304	\N	::1	21	2026-06-28 23:34:30.852041
2869	1	/api/v1/notifications?limit=25	GET	\N	304	\N	::1	71	2026-06-28 23:34:30.908236
2870	1	/api/customers?limit=200	GET	\N	304	\N	::1	79	2026-06-28 23:34:30.914143
\.


--
-- Data for Name: branch; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.branch (br_id, branch_name, manager_name, manager_tel, banner_tel, add_id, br_email, fg_message, banner_img, logo_img, latitude, longitude, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
1	Mogadishu Branch	Ahmed Hassan	+252611234567	\N	1	main@waafi.com	\N	\N	\N	\N	\N	2026-06-11 08:04:41.746673	2026-06-23 10:59:10.116182	1	1	f
34	Islii Branch	Mohamed Ali	+252611234571	\N	34	\N	\N	\N	\N	\N	\N	2026-06-23 05:22:58.324794	2026-06-23 10:59:10.116182	\N	\N	t
35	Dubai Branch	Fatuma Ali	+97141234567	\N	35	dubai@waafi.com	\N	\N	\N	\N	\N	2026-06-23 10:59:10.116182	2026-06-23 10:59:10.116182	\N	\N	f
36	Eastleigh central branch	Mohamed Ali	+252611234571	615245423	36	kenyawafi@gmail.com	\N	\N	\N	\N	\N	2026-06-23 11:03:53.280288	2026-06-23 11:06:53.332386	\N	\N	t
37	kenya branch	\N	\N	615627221	38	kenyabrachWaafi@gmail.com	\N	\N	\N	\N	\N	2026-06-27 00:39:38.432701	2026-06-27 00:39:38.432701	\N	\N	f
\.


--
-- Data for Name: cargo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo (cargo_id, tracking_no, sender_id, receiver_id, from_branch, to_branch, weight, price, rate_type, rate_per_kg, extra_charges, paid_origin, payment_received_amount, shipment_date, fly_name, fly_awb_no, mark, pcs, description, current_status_id, u_br_id, created_at, updated_at, created_by, updated_by, deleted, receiver_name_manual, receiver_phone_manual, receiver_address_manual, receiver_city_manual, receiver_country_manual) FROM stdin;
42	CRG100008	51	\N	35	1	50000.00	420000000.00	F020F	7.00	174.96	0.00	0.00	2026-06-28	Turkey airlines	\N	DhismoSadiiq	1200	construction Equipment's	1	34	2026-06-28 23:24:49.137407	2026-06-28 23:24:49.137407	1	1	f	Sadiiq Jaamac	615657789	\N	\N	\N
38	CRG100004	50	46	1	35	3.50	0.00	\N	0.00	0.00	0.00	0.00	\N	\N	\N	\N	1	\N	1	37	2026-06-26 11:08:08.745071	2026-06-26 11:08:08.745071	36	36	f	\N	\N	\N	\N	\N
37	CRG100003	40	41	1	1	50.00	3500.00	\N	7.00	0.00	0.00	0.00	2026-06-12	Somali airlines	awb1	Xsn100	10	QA test cargo	42	34	2026-06-25 13:18:32.363502	2026-06-27 07:02:36.279005	1	1	f	\N	\N	\N	\N	\N
36	CRG100002	40	41	1	1	19.00	133.00	\N	7.00	8.00	0.00	10.00	2026-06-16	Daalo Airlines	awb100	\N	1	new trip	4	34	2026-06-22 11:59:53.153806	2026-06-27 07:03:53.718192	1	1	f	\N	\N	\N	\N	\N
1	CRG100001	1	1	1	1	120.00	42000.00	\N	7.00	15.00	0.00	0.00	2026-06-11	Turkey airlines	awb1002	\N	50	Electronic and new Medicne	3	1	2026-06-11 08:04:41.746673	2026-06-27 07:04:59.863879	1	1	f	\N	\N	\N	\N	\N
39	CRG100005	45	42	1	35	7.00	350.00	\N	5.00	10.00	0.00	0.00	2026-06-25	turkey airlines	\N	Dub120	10	Electronics	3	39	2026-06-26 14:17:09.125934	2026-06-28 10:00:41.478089	38	40	f	\N	\N	\N	\N	\N
40	CRG100006	51	\N	1	35	250.00	210000.00	F020F	7.00	12.00	0.00	0.00	2026-06-28	\N	\N	Xsn100	120	New Clothes and Equib,ments	1	34	2026-06-28 23:09:49.762354	2026-06-28 23:09:49.762354	1	1	f	Xasan Saccid	615657616	\N	\N	\N
41	CRG100007	51	\N	1	35	250.00	210000.00	F020F	7.00	12.00	0.00	0.00	2026-06-28	\N	\N	Xsn100	120	New Clothes and Equib,ments	1	34	2026-06-28 23:12:03.55201	2026-06-28 23:12:03.55201	1	1	f	Xasan Saccid	615657616	\N	\N	\N
\.


--
-- Data for Name: cargo_charges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_charges (charge_id, cargo_id, charge_name, amount, note, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
\.


--
-- Data for Name: cargo_history_2025; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_history_2025 (history_id, cargo_id, status_id, add_id, u_br_id, note, created_at) FROM stdin;
\.


--
-- Data for Name: cargo_history_2026; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_history_2026 (history_id, cargo_id, status_id, add_id, u_br_id, note, created_at) FROM stdin;
1	1	1	\N	1	Cargo created	2026-06-11 08:04:41.746673
34	36	4	\N	34	\N	2026-06-22 12:01:36.350074
35	1	3	\N	34	QA test status update	2026-06-25 13:22:46.51894
36	37	2	\N	34	\N	2026-06-25 13:26:59.611213
37	37	39	\N	34	\N	2026-06-26 08:39:09.155942
38	37	40	\N	34	\N	2026-06-26 08:39:09.285954
39	37	41	\N	34	\N	2026-06-26 08:39:09.43642
40	37	42	\N	34	\N	2026-06-26 08:39:09.552862
41	39	1	\N	41	\N	2026-06-28 09:59:45.826604
42	39	4	\N	41	\N	2026-06-28 09:59:52.329737
43	39	4	\N	41	\N	2026-06-28 10:00:14.795045
44	39	3	\N	41	\N	2026-06-28 10:00:41.478089
\.


--
-- Data for Name: cargo_history_2027; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_history_2027 (history_id, cargo_id, status_id, add_id, u_br_id, note, created_at) FROM stdin;
\.


--
-- Data for Name: cargo_history_2028; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_history_2028 (history_id, cargo_id, status_id, add_id, u_br_id, note, created_at) FROM stdin;
\.


--
-- Data for Name: cargo_history_archive; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_history_archive (history_id, cargo_id, status_id, add_id, u_br_id, note, created_at) FROM stdin;
\.


--
-- Data for Name: cargo_insurance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_insurance (insurance_id, cargo_id, provider_id, policy_number, insured_value, premium_paid, claim_status, claim_amount, claim_date, notes, created_at) FROM stdin;
1	1	1	POL100001	500.00	12.50	none	\N	\N	\N	2026-06-11 08:04:41.746673
34	36	1	poly1001	1000.00	0.00	none	\N	\N	Start: 2026-07-05 | End: 2027-07-05	2026-06-27 03:26:55.135573
\.


--
-- Data for Name: cargo_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_items (item_id, cargo_id, item_name, quantity, weight, u_br_id, created_at, deleted) FROM stdin;
1	1	Test Item	2	5.00	1	2026-06-11 08:04:41.746673	f
34	36	Cargo	1	5.00	34	2026-06-22 11:59:53.153806	f
35	37	QA test cargo	1	5.50	34	2026-06-25 13:18:32.363502	f
36	38	Cargo	1	3.50	37	2026-06-26 11:08:08.745071	f
37	39	Dub120	10	7.00	39	2026-06-26 14:17:09.125934	f
38	40	Xsn100	120	250.00	34	2026-06-28 23:09:49.762354	f
39	41	Xsn100	120	250.00	34	2026-06-28 23:12:03.55201	f
40	42	DhismoSadiiq	1200	50000.00	34	2026-06-28 23:24:49.137407	f
\.


--
-- Data for Name: cargo_status; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_status (status_id, status_name) FROM stdin;
1	Pending
2	Picked Up
3	In Transit
4	Delivered
5	Cancelled
39	Arrived
40	Out for Delivery
41	On Hold
42	Returned
\.


--
-- Data for Name: cargo_tracking; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cargo_tracking (track_id, cargo_id, status_id, branch_id, location, note, updated_by, update_time) FROM stdin;
34	36	4	1	\N	\N	1	2026-06-22 12:01:36.350074
1	1	3	1	\N	QA test status update	1	2026-06-25 13:22:46.51894
36	37	42	1	\N	\N	1	2026-06-26 08:39:09.552862
43	38	1	1	\N	\N	36	2026-06-26 11:08:08.745071
44	39	3	35	\N	\N	40	2026-06-28 10:00:41.478089
49	40	1	1	\N	\N	1	2026-06-28 23:09:49.762354
50	41	1	1	\N	\N	1	2026-06-28 23:12:03.55201
51	42	1	35	\N	\N	1	2026-06-28 23:24:49.137407
\.


--
-- Data for Name: cities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cities (city_id, city_name, state_region, country, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
1	Mogadishu	Banaadir	Somalia	2026-06-11 08:04:41.746673	2026-06-11 08:04:41.746673	1	1	f
34	Nariobi	\N	Somalia	2026-06-23 05:22:46.134175	2026-06-23 10:59:10.116182	\N	\N	t
35	Dubai	Dubai	UAE	2026-06-23 10:59:10.116182	2026-06-23 10:59:10.116182	\N	\N	f
36	Nairobi	Nairobi County	Kenya	2026-06-23 11:02:59.405276	2026-06-23 11:06:53.332386	\N	\N	t
37	Algiers	Algiers	Algeria	2026-06-25 07:03:40.406178	2026-06-25 07:03:40.406178	\N	\N	f
38	Oran	Oran	Algeria	2026-06-25 07:03:40.418942	2026-06-25 07:03:40.418942	\N	\N	f
39	Constantine	Constantine	Algeria	2026-06-25 07:03:40.41988	2026-06-25 07:03:40.41988	\N	\N	f
40	Luanda	Luanda	Angola	2026-06-25 07:03:40.420516	2026-06-25 07:03:40.420516	\N	\N	f
41	Huambo	Huambo	Angola	2026-06-25 07:03:40.421263	2026-06-25 07:03:40.421263	\N	\N	f
42	Porto-Novo	Ouémé	Benin	2026-06-25 07:03:40.422055	2026-06-25 07:03:40.422055	\N	\N	f
43	Cotonou	Littoral	Benin	2026-06-25 07:03:40.422909	2026-06-25 07:03:40.422909	\N	\N	f
44	Gaborone	South-East	Botswana	2026-06-25 07:03:40.423566	2026-06-25 07:03:40.423566	\N	\N	f
45	Francistown	Central	Botswana	2026-06-25 07:03:40.424552	2026-06-25 07:03:40.424552	\N	\N	f
46	Ouagadougou	Centre	Burkina Faso	2026-06-25 07:03:40.425099	2026-06-25 07:03:40.425099	\N	\N	f
47	Bobo-Dioulasso	Hauts-Bassins	Burkina Faso	2026-06-25 07:03:40.425528	2026-06-25 07:03:40.425528	\N	\N	f
48	Gitega	Gitega	Burundi	2026-06-25 07:03:40.425916	2026-06-25 07:03:40.425916	\N	\N	f
49	Bujumbura	Bujumbura	Burundi	2026-06-25 07:03:40.426234	2026-06-25 07:03:40.426234	\N	\N	f
50	Yaoundé	Centre	Cameroon	2026-06-25 07:03:40.426545	2026-06-25 07:03:40.426545	\N	\N	f
51	Douala	Littoral	Cameroon	2026-06-25 07:03:40.426846	2026-06-25 07:03:40.426846	\N	\N	f
52	Bafoussam	West	Cameroon	2026-06-25 07:03:40.42715	2026-06-25 07:03:40.42715	\N	\N	f
53	Praia	Santiago	Cape Verde	2026-06-25 07:03:40.427445	2026-06-25 07:03:40.427445	\N	\N	f
54	Mindelo	São Vicente	Cape Verde	2026-06-25 07:03:40.427733	2026-06-25 07:03:40.427733	\N	\N	f
55	Bangui	Ombella-M'Poko	Central African Republic	2026-06-25 07:03:40.428049	2026-06-25 07:03:40.428049	\N	\N	f
56	N'Djamena	Chari-Baguirmi	Chad	2026-06-25 07:03:40.42838	2026-06-25 07:03:40.42838	\N	\N	f
57	Moundou	Logone Occidental	Chad	2026-06-25 07:03:40.428749	2026-06-25 07:03:40.428749	\N	\N	f
58	Moroni	Grande Comore	Comoros	2026-06-25 07:03:40.429058	2026-06-25 07:03:40.429058	\N	\N	f
59	Kinshasa	Kinshasa	DR Congo	2026-06-25 07:03:40.429349	2026-06-25 07:03:40.429349	\N	\N	f
60	Lubumbashi	Haut-Katanga	DR Congo	2026-06-25 07:03:40.429639	2026-06-25 07:03:40.429639	\N	\N	f
61	Goma	North Kivu	DR Congo	2026-06-25 07:03:40.429932	2026-06-25 07:03:40.429932	\N	\N	f
62	Mbuji-Mayi	Kasaï Oriental	DR Congo	2026-06-25 07:03:40.430229	2026-06-25 07:03:40.430229	\N	\N	f
63	Brazzaville	Brazzaville	Republic of Congo	2026-06-25 07:03:40.430568	2026-06-25 07:03:40.430568	\N	\N	f
64	Pointe-Noire	Kouilou	Republic of Congo	2026-06-25 07:03:40.430985	2026-06-25 07:03:40.430985	\N	\N	f
65	Djibouti	Djibouti	Djibouti	2026-06-25 07:03:40.431298	2026-06-25 07:03:40.431298	\N	\N	f
66	Cairo	Cairo	Egypt	2026-06-25 07:03:40.431723	2026-06-25 07:03:40.431723	\N	\N	f
67	Alexandria	Alexandria	Egypt	2026-06-25 07:03:40.432026	2026-06-25 07:03:40.432026	\N	\N	f
68	Giza	Giza	Egypt	2026-06-25 07:03:40.432329	2026-06-25 07:03:40.432329	\N	\N	f
69	Sharm el-Sheikh	South Sinai	Egypt	2026-06-25 07:03:40.432628	2026-06-25 07:03:40.432628	\N	\N	f
70	Port Said	Port Said	Egypt	2026-06-25 07:03:40.432934	2026-06-25 07:03:40.432934	\N	\N	f
71	Malabo	Bioko Norte	Equatorial Guinea	2026-06-25 07:03:40.433321	2026-06-25 07:03:40.433321	\N	\N	f
72	Bata	Litoral	Equatorial Guinea	2026-06-25 07:03:40.433631	2026-06-25 07:03:40.433631	\N	\N	f
73	Asmara	Maekel	Eritrea	2026-06-25 07:03:40.433925	2026-06-25 07:03:40.433925	\N	\N	f
74	Mbabane	Hhohho	Eswatini	2026-06-25 07:03:40.434224	2026-06-25 07:03:40.434224	\N	\N	f
75	Manzini	Manzini	Eswatini	2026-06-25 07:03:40.434516	2026-06-25 07:03:40.434516	\N	\N	f
76	Addis Ababa	Addis Ababa	Ethiopia	2026-06-25 07:03:40.434811	2026-06-25 07:03:40.434811	\N	\N	f
77	Dire Dawa	Dire Dawa	Ethiopia	2026-06-25 07:03:40.435102	2026-06-25 07:03:40.435102	\N	\N	f
78	Gondar	Amhara	Ethiopia	2026-06-25 07:03:40.435393	2026-06-25 07:03:40.435393	\N	\N	f
79	Mekelle	Tigray	Ethiopia	2026-06-25 07:03:40.435698	2026-06-25 07:03:40.435698	\N	\N	f
80	Adama	Oromia	Ethiopia	2026-06-25 07:03:40.435997	2026-06-25 07:03:40.435997	\N	\N	f
81	Libreville	Estuaire	Gabon	2026-06-25 07:03:40.437157	2026-06-25 07:03:40.437157	\N	\N	f
82	Port-Gentil	Ogooué-Maritime	Gabon	2026-06-25 07:03:40.437511	2026-06-25 07:03:40.437511	\N	\N	f
83	Banjul	Banjul	Gambia	2026-06-25 07:03:40.437938	2026-06-25 07:03:40.437938	\N	\N	f
84	Serekunda	Kanifing	Gambia	2026-06-25 07:03:40.438474	2026-06-25 07:03:40.438474	\N	\N	f
85	Accra	Greater Accra	Ghana	2026-06-25 07:03:40.43889	2026-06-25 07:03:40.43889	\N	\N	f
86	Kumasi	Ashanti	Ghana	2026-06-25 07:03:40.439251	2026-06-25 07:03:40.439251	\N	\N	f
87	Tamale	Northern	Ghana	2026-06-25 07:03:40.439636	2026-06-25 07:03:40.439636	\N	\N	f
88	Conakry	Conakry	Guinea	2026-06-25 07:03:40.440063	2026-06-25 07:03:40.440063	\N	\N	f
89	Kankan	Kankan	Guinea	2026-06-25 07:03:40.440751	2026-06-25 07:03:40.440751	\N	\N	f
90	Bissau	Bissau	Guinea-Bissau	2026-06-25 07:03:40.441381	2026-06-25 07:03:40.441381	\N	\N	f
91	Abidjan	Lagunes	Ivory Coast	2026-06-25 07:03:40.441932	2026-06-25 07:03:40.441932	\N	\N	f
92	Yamoussoukro	Bélier	Ivory Coast	2026-06-25 07:03:40.442417	2026-06-25 07:03:40.442417	\N	\N	f
93	Bouaké	Gbèkê	Ivory Coast	2026-06-25 07:03:40.442922	2026-06-25 07:03:40.442922	\N	\N	f
94	Nairobi	Nairobi	Kenya	2026-06-25 07:03:40.443451	2026-06-25 07:03:40.443451	\N	\N	f
95	Mombasa	Mombasa	Kenya	2026-06-25 07:03:40.443952	2026-06-25 07:03:40.443952	\N	\N	f
96	Kisumu	Kisumu	Kenya	2026-06-25 07:03:40.444477	2026-06-25 07:03:40.444477	\N	\N	f
97	Nakuru	Nakuru	Kenya	2026-06-25 07:03:40.444955	2026-06-25 07:03:40.444955	\N	\N	f
98	Eldoret	Uasin Gishu	Kenya	2026-06-25 07:03:40.445439	2026-06-25 07:03:40.445439	\N	\N	f
99	Maseru	Maseru	Lesotho	2026-06-25 07:03:40.445929	2026-06-25 07:03:40.445929	\N	\N	f
100	Monrovia	Montserrado	Liberia	2026-06-25 07:03:40.446454	2026-06-25 07:03:40.446454	\N	\N	f
101	Tripoli	Tripoli	Libya	2026-06-25 07:03:40.447002	2026-06-25 07:03:40.447002	\N	\N	f
102	Benghazi	Benghazi	Libya	2026-06-25 07:03:40.447605	2026-06-25 07:03:40.447605	\N	\N	f
103	Misrata	Misrata	Libya	2026-06-25 07:03:40.448134	2026-06-25 07:03:40.448134	\N	\N	f
104	Antananarivo	Analamanga	Madagascar	2026-06-25 07:03:40.448655	2026-06-25 07:03:40.448655	\N	\N	f
105	Toamasina	Atsinanana	Madagascar	2026-06-25 07:03:40.449185	2026-06-25 07:03:40.449185	\N	\N	f
106	Lilongwe	Central Region	Malawi	2026-06-25 07:03:40.449719	2026-06-25 07:03:40.449719	\N	\N	f
107	Blantyre	Southern Region	Malawi	2026-06-25 07:03:40.450241	2026-06-25 07:03:40.450241	\N	\N	f
108	Bamako	District de Bamako	Mali	2026-06-25 07:03:40.450804	2026-06-25 07:03:40.450804	\N	\N	f
109	Sikasso	Sikasso	Mali	2026-06-25 07:03:40.451326	2026-06-25 07:03:40.451326	\N	\N	f
110	Nouakchott	Nouakchott	Mauritania	2026-06-25 07:03:40.451878	2026-06-25 07:03:40.451878	\N	\N	f
111	Port Louis	Port Louis	Mauritius	2026-06-25 07:03:40.452419	2026-06-25 07:03:40.452419	\N	\N	f
112	Beau Bassin-Rose Hill	Plaines Wilhems	Mauritius	2026-06-25 07:03:40.452941	2026-06-25 07:03:40.452941	\N	\N	f
113	Rabat	Rabat-Salé-Kénitra	Morocco	2026-06-25 07:03:40.453481	2026-06-25 07:03:40.453481	\N	\N	f
114	Casablanca	Casablanca-Settat	Morocco	2026-06-25 07:03:40.454076	2026-06-25 07:03:40.454076	\N	\N	f
115	Marrakech	Marrakech-Safi	Morocco	2026-06-25 07:03:40.454661	2026-06-25 07:03:40.454661	\N	\N	f
116	Fez	Fès-Meknès	Morocco	2026-06-25 07:03:40.455194	2026-06-25 07:03:40.455194	\N	\N	f
117	Tangier	Tanger-Tétouan-Al Hoceïma	Morocco	2026-06-25 07:03:40.455644	2026-06-25 07:03:40.455644	\N	\N	f
118	Agadir	Souss-Massa	Morocco	2026-06-25 07:03:40.456266	2026-06-25 07:03:40.456266	\N	\N	f
119	Maputo	Maputo	Mozambique	2026-06-25 07:03:40.459764	2026-06-25 07:03:40.459764	\N	\N	f
120	Beira	Sofala	Mozambique	2026-06-25 07:03:40.46018	2026-06-25 07:03:40.46018	\N	\N	f
121	Nampula	Nampula	Mozambique	2026-06-25 07:03:40.460568	2026-06-25 07:03:40.460568	\N	\N	f
122	Windhoek	Khomas	Namibia	2026-06-25 07:03:40.460931	2026-06-25 07:03:40.460931	\N	\N	f
123	Walvis Bay	Erongo	Namibia	2026-06-25 07:03:40.461285	2026-06-25 07:03:40.461285	\N	\N	f
124	Niamey	Niamey	Niger	2026-06-25 07:03:40.461639	2026-06-25 07:03:40.461639	\N	\N	f
125	Zinder	Zinder	Niger	2026-06-25 07:03:40.461983	2026-06-25 07:03:40.461983	\N	\N	f
126	Abuja	FCT	Nigeria	2026-06-25 07:03:40.462327	2026-06-25 07:03:40.462327	\N	\N	f
127	Lagos	Lagos	Nigeria	2026-06-25 07:03:40.462675	2026-06-25 07:03:40.462675	\N	\N	f
128	Kano	Kano	Nigeria	2026-06-25 07:03:40.463024	2026-06-25 07:03:40.463024	\N	\N	f
129	Ibadan	Oyo	Nigeria	2026-06-25 07:03:40.46337	2026-06-25 07:03:40.46337	\N	\N	f
130	Port Harcourt	Rivers	Nigeria	2026-06-25 07:03:40.463723	2026-06-25 07:03:40.463723	\N	\N	f
131	Benin City	Edo	Nigeria	2026-06-25 07:03:40.464075	2026-06-25 07:03:40.464075	\N	\N	f
132	Enugu	Enugu	Nigeria	2026-06-25 07:03:40.464426	2026-06-25 07:03:40.464426	\N	\N	f
133	Kigali	Kigali	Rwanda	2026-06-25 07:03:40.464785	2026-06-25 07:03:40.464785	\N	\N	f
134	Huye	Southern Province	Rwanda	2026-06-25 07:03:40.46517	2026-06-25 07:03:40.46517	\N	\N	f
135	São Tomé	São Tomé	São Tomé and Príncipe	2026-06-25 07:03:40.465573	2026-06-25 07:03:40.465573	\N	\N	f
136	Dakar	Dakar	Senegal	2026-06-25 07:03:40.466121	2026-06-25 07:03:40.466121	\N	\N	f
137	Saint-Louis	Saint-Louis	Senegal	2026-06-25 07:03:40.466615	2026-06-25 07:03:40.466615	\N	\N	f
138	Thiès	Thiès	Senegal	2026-06-25 07:03:40.467167	2026-06-25 07:03:40.467167	\N	\N	f
139	Victoria	Mahé	Seychelles	2026-06-25 07:03:40.467949	2026-06-25 07:03:40.467949	\N	\N	f
140	Freetown	Western Area	Sierra Leone	2026-06-25 07:03:40.46847	2026-06-25 07:03:40.46847	\N	\N	f
141	Bo	Southern Province	Sierra Leone	2026-06-25 07:03:40.468907	2026-06-25 07:03:40.468907	\N	\N	f
142	Hargeisa	Woqooyi Galbeed	Somalia	2026-06-25 07:03:40.46971	2026-06-25 07:03:40.46971	\N	\N	f
143	Kismayo	Lower Juba	Somalia	2026-06-25 07:03:40.470372	2026-06-25 07:03:40.470372	\N	\N	f
144	Bosaso	Bari	Somalia	2026-06-25 07:03:40.470886	2026-06-25 07:03:40.470886	\N	\N	f
145	Garowe	Nugaal	Somalia	2026-06-25 07:03:40.471272	2026-06-25 07:03:40.471272	\N	\N	f
146	Baidoa	Bay	Somalia	2026-06-25 07:03:40.471689	2026-06-25 07:03:40.471689	\N	\N	f
147	Pretoria	Gauteng	South Africa	2026-06-25 07:03:40.472079	2026-06-25 07:03:40.472079	\N	\N	f
148	Cape Town	Western Cape	South Africa	2026-06-25 07:03:40.472499	2026-06-25 07:03:40.472499	\N	\N	f
149	Johannesburg	Gauteng	South Africa	2026-06-25 07:03:40.472933	2026-06-25 07:03:40.472933	\N	\N	f
150	Durban	KwaZulu-Natal	South Africa	2026-06-25 07:03:40.473314	2026-06-25 07:03:40.473314	\N	\N	f
151	Port Elizabeth	Eastern Cape	South Africa	2026-06-25 07:03:40.4737	2026-06-25 07:03:40.4737	\N	\N	f
152	Bloemfontein	Free State	South Africa	2026-06-25 07:03:40.474057	2026-06-25 07:03:40.474057	\N	\N	f
153	East London	Eastern Cape	South Africa	2026-06-25 07:03:40.474414	2026-06-25 07:03:40.474414	\N	\N	f
154	Juba	Central Equatoria	South Sudan	2026-06-25 07:03:40.474757	2026-06-25 07:03:40.474757	\N	\N	f
155	Wau	Western Bahr el Ghazal	South Sudan	2026-06-25 07:03:40.47512	2026-06-25 07:03:40.47512	\N	\N	f
156	Khartoum	Khartoum	Sudan	2026-06-25 07:03:40.47549	2026-06-25 07:03:40.47549	\N	\N	f
157	Omdurman	Khartoum	Sudan	2026-06-25 07:03:40.475928	2026-06-25 07:03:40.475928	\N	\N	f
158	Port Sudan	Red Sea	Sudan	2026-06-25 07:03:40.476307	2026-06-25 07:03:40.476307	\N	\N	f
159	Dodoma	Dodoma	Tanzania	2026-06-25 07:03:40.476869	2026-06-25 07:03:40.476869	\N	\N	f
160	Dar es Salaam	Dar es Salaam	Tanzania	2026-06-25 07:03:40.481633	2026-06-25 07:03:40.481633	\N	\N	f
161	Arusha	Arusha	Tanzania	2026-06-25 07:03:40.482084	2026-06-25 07:03:40.482084	\N	\N	f
162	Zanzibar City	Zanzibar Urban	Tanzania	2026-06-25 07:03:40.482493	2026-06-25 07:03:40.482493	\N	\N	f
163	Mwanza	Mwanza	Tanzania	2026-06-25 07:03:40.482927	2026-06-25 07:03:40.482927	\N	\N	f
164	Lomé	Maritime	Togo	2026-06-25 07:03:40.483318	2026-06-25 07:03:40.483318	\N	\N	f
165	Tunis	Tunis	Tunisia	2026-06-25 07:03:40.483947	2026-06-25 07:03:40.483947	\N	\N	f
166	Sfax	Sfax	Tunisia	2026-06-25 07:03:40.484397	2026-06-25 07:03:40.484397	\N	\N	f
167	Sousse	Sousse	Tunisia	2026-06-25 07:03:40.484932	2026-06-25 07:03:40.484932	\N	\N	f
168	Kampala	Central Region	Uganda	2026-06-25 07:03:40.48552	2026-06-25 07:03:40.48552	\N	\N	f
169	Gulu	Northern Region	Uganda	2026-06-25 07:03:40.486008	2026-06-25 07:03:40.486008	\N	\N	f
170	Mbarara	Western Region	Uganda	2026-06-25 07:03:40.486505	2026-06-25 07:03:40.486505	\N	\N	f
171	Lusaka	Lusaka	Zambia	2026-06-25 07:03:40.486945	2026-06-25 07:03:40.486945	\N	\N	f
172	Ndola	Copperbelt	Zambia	2026-06-25 07:03:40.487292	2026-06-25 07:03:40.487292	\N	\N	f
173	Kitwe	Copperbelt	Zambia	2026-06-25 07:03:40.487614	2026-06-25 07:03:40.487614	\N	\N	f
174	Harare	Harare	Zimbabwe	2026-06-25 07:03:40.487936	2026-06-25 07:03:40.487936	\N	\N	f
175	Bulawayo	Bulawayo	Zimbabwe	2026-06-25 07:03:40.488333	2026-06-25 07:03:40.488333	\N	\N	f
176	Mutare	Manicaland	Zimbabwe	2026-06-25 07:03:40.488642	2026-06-25 07:03:40.488642	\N	\N	f
177	Manama	Capital	Bahrain	2026-06-25 07:03:40.488947	2026-06-25 07:03:40.488947	\N	\N	f
178	Muharraq	Muharraq	Bahrain	2026-06-25 07:03:40.489246	2026-06-25 07:03:40.489246	\N	\N	f
179	Tehran	Tehran	Iran	2026-06-25 07:03:40.489612	2026-06-25 07:03:40.489612	\N	\N	f
180	Mashhad	Razavi Khorasan	Iran	2026-06-25 07:03:40.490014	2026-06-25 07:03:40.490014	\N	\N	f
181	Isfahan	Isfahan	Iran	2026-06-25 07:03:40.490376	2026-06-25 07:03:40.490376	\N	\N	f
182	Tabriz	East Azerbaijan	Iran	2026-06-25 07:03:40.490751	2026-06-25 07:03:40.490751	\N	\N	f
183	Shiraz	Fars	Iran	2026-06-25 07:03:40.491125	2026-06-25 07:03:40.491125	\N	\N	f
184	Baghdad	Baghdad	Iraq	2026-06-25 07:03:40.491481	2026-06-25 07:03:40.491481	\N	\N	f
185	Basra	Basra	Iraq	2026-06-25 07:03:40.491826	2026-06-25 07:03:40.491826	\N	\N	f
186	Mosul	Nineveh	Iraq	2026-06-25 07:03:40.492157	2026-06-25 07:03:40.492157	\N	\N	f
187	Erbil	Kurdistan	Iraq	2026-06-25 07:03:40.492515	2026-06-25 07:03:40.492515	\N	\N	f
188	Najaf	Najaf	Iraq	2026-06-25 07:03:40.492861	2026-06-25 07:03:40.492861	\N	\N	f
189	Jerusalem	Jerusalem	Israel	2026-06-25 07:03:40.493193	2026-06-25 07:03:40.493193	\N	\N	f
190	Tel Aviv	Tel Aviv	Israel	2026-06-25 07:03:40.493519	2026-06-25 07:03:40.493519	\N	\N	f
191	Haifa	Haifa	Israel	2026-06-25 07:03:40.493843	2026-06-25 07:03:40.493843	\N	\N	f
192	Amman	Amman	Jordan	2026-06-25 07:03:40.494274	2026-06-25 07:03:40.494274	\N	\N	f
193	Zarqa	Zarqa	Jordan	2026-06-25 07:03:40.494911	2026-06-25 07:03:40.494911	\N	\N	f
194	Irbid	Irbid	Jordan	2026-06-25 07:03:40.495289	2026-06-25 07:03:40.495289	\N	\N	f
195	Aqaba	Aqaba	Jordan	2026-06-25 07:03:40.495726	2026-06-25 07:03:40.495726	\N	\N	f
196	Kuwait City	Asimah	Kuwait	2026-06-25 07:03:40.496185	2026-06-25 07:03:40.496185	\N	\N	f
197	Hawalli	Hawalli	Kuwait	2026-06-25 07:03:40.496618	2026-06-25 07:03:40.496618	\N	\N	f
198	Salmiya	Hawalli	Kuwait	2026-06-25 07:03:40.497052	2026-06-25 07:03:40.497052	\N	\N	f
199	Beirut	Beirut	Lebanon	2026-06-25 07:03:40.497695	2026-06-25 07:03:40.497695	\N	\N	f
200	Tripoli	North Lebanon	Lebanon	2026-06-25 07:03:40.498485	2026-06-25 07:03:40.498485	\N	\N	f
201	Sidon	South Lebanon	Lebanon	2026-06-25 07:03:40.498882	2026-06-25 07:03:40.498882	\N	\N	f
202	Muscat	Muscat	Oman	2026-06-25 07:03:40.499281	2026-06-25 07:03:40.499281	\N	\N	f
203	Salalah	Dhofar	Oman	2026-06-25 07:03:40.499662	2026-06-25 07:03:40.499662	\N	\N	f
204	Sohar	North Al Batinah	Oman	2026-06-25 07:03:40.500062	2026-06-25 07:03:40.500062	\N	\N	f
205	Gaza	Gaza	Palestine	2026-06-25 07:03:40.500707	2026-06-25 07:03:40.500707	\N	\N	f
206	Ramallah	Ramallah	Palestine	2026-06-25 07:03:40.501242	2026-06-25 07:03:40.501242	\N	\N	f
207	Hebron	Hebron	Palestine	2026-06-25 07:03:40.50181	2026-06-25 07:03:40.50181	\N	\N	f
208	Doha	Ad Dawhah	Qatar	2026-06-25 07:03:40.502202	2026-06-25 07:03:40.502202	\N	\N	f
209	Al Rayyan	Al Rayyan	Qatar	2026-06-25 07:03:40.502558	2026-06-25 07:03:40.502558	\N	\N	f
210	Al Wakrah	Al Wakrah	Qatar	2026-06-25 07:03:40.502894	2026-06-25 07:03:40.502894	\N	\N	f
211	Riyadh	Riyadh	Saudi Arabia	2026-06-25 07:03:40.503208	2026-06-25 07:03:40.503208	\N	\N	f
212	Jeddah	Makkah	Saudi Arabia	2026-06-25 07:03:40.503521	2026-06-25 07:03:40.503521	\N	\N	f
213	Mecca	Makkah	Saudi Arabia	2026-06-25 07:03:40.503829	2026-06-25 07:03:40.503829	\N	\N	f
214	Medina	Madinah	Saudi Arabia	2026-06-25 07:03:40.50895	2026-06-25 07:03:40.50895	\N	\N	f
215	Dammam	Eastern Province	Saudi Arabia	2026-06-25 07:03:40.50934	2026-06-25 07:03:40.50934	\N	\N	f
216	Khobar	Eastern Province	Saudi Arabia	2026-06-25 07:03:40.509683	2026-06-25 07:03:40.509683	\N	\N	f
217	Tabuk	Tabuk	Saudi Arabia	2026-06-25 07:03:40.510013	2026-06-25 07:03:40.510013	\N	\N	f
218	Damascus	Damascus	Syria	2026-06-25 07:03:40.510336	2026-06-25 07:03:40.510336	\N	\N	f
219	Aleppo	Aleppo	Syria	2026-06-25 07:03:40.510656	2026-06-25 07:03:40.510656	\N	\N	f
220	Homs	Homs	Syria	2026-06-25 07:03:40.510978	2026-06-25 07:03:40.510978	\N	\N	f
221	Ankara	Ankara	Turkey	2026-06-25 07:03:40.511302	2026-06-25 07:03:40.511302	\N	\N	f
222	Istanbul	Istanbul	Turkey	2026-06-25 07:03:40.511622	2026-06-25 07:03:40.511622	\N	\N	f
223	Izmir	Izmir	Turkey	2026-06-25 07:03:40.511942	2026-06-25 07:03:40.511942	\N	\N	f
224	Bursa	Bursa	Turkey	2026-06-25 07:03:40.512264	2026-06-25 07:03:40.512264	\N	\N	f
225	Antalya	Antalya	Turkey	2026-06-25 07:03:40.512601	2026-06-25 07:03:40.512601	\N	\N	f
226	Abu Dhabi	Abu Dhabi	UAE	2026-06-25 07:03:40.512941	2026-06-25 07:03:40.512941	\N	\N	f
227	Sharjah	Sharjah	UAE	2026-06-25 07:03:40.514331	2026-06-25 07:03:40.514331	\N	\N	f
228	Ajman	Ajman	UAE	2026-06-25 07:03:40.514707	2026-06-25 07:03:40.514707	\N	\N	f
229	Ras Al Khaimah	Ras Al Khaimah	UAE	2026-06-25 07:03:40.515066	2026-06-25 07:03:40.515066	\N	\N	f
230	Fujairah	Fujairah	UAE	2026-06-25 07:03:40.515422	2026-06-25 07:03:40.515422	\N	\N	f
231	Al Ain	Abu Dhabi	UAE	2026-06-25 07:03:40.515771	2026-06-25 07:03:40.515771	\N	\N	f
232	Sana'a	Sana'a	Yemen	2026-06-25 07:03:40.516127	2026-06-25 07:03:40.516127	\N	\N	f
233	Aden	Aden	Yemen	2026-06-25 07:03:40.516489	2026-06-25 07:03:40.516489	\N	\N	f
234	Taiz	Taiz	Yemen	2026-06-25 07:03:40.517037	2026-06-25 07:03:40.517037	\N	\N	f
235	Hodeidah	Hodeidah	Yemen	2026-06-25 07:03:40.517618	2026-06-25 07:03:40.517618	\N	\N	f
236	Mukalla	Hadhramaut	Yemen	2026-06-25 07:03:40.518289	2026-06-25 07:03:40.518289	\N	\N	f
237	Kabul	Kabul	Afghanistan	2026-06-25 07:03:40.518703	2026-06-25 07:03:40.518703	\N	\N	f
238	Kandahar	Kandahar	Afghanistan	2026-06-25 07:03:40.519135	2026-06-25 07:03:40.519135	\N	\N	f
239	Herat	Herat	Afghanistan	2026-06-25 07:03:40.519704	2026-06-25 07:03:40.519704	\N	\N	f
240	Mazar-i-Sharif	Balkh	Afghanistan	2026-06-25 07:03:40.520235	2026-06-25 07:03:40.520235	\N	\N	f
241	Yerevan	Yerevan	Armenia	2026-06-25 07:03:40.520617	2026-06-25 07:03:40.520617	\N	\N	f
242	Gyumri	Shirak	Armenia	2026-06-25 07:03:40.521082	2026-06-25 07:03:40.521082	\N	\N	f
243	Baku	Baku	Azerbaijan	2026-06-25 07:03:40.521481	2026-06-25 07:03:40.521481	\N	\N	f
244	Ganja	Ganja-Gazakh	Azerbaijan	2026-06-25 07:03:40.521854	2026-06-25 07:03:40.521854	\N	\N	f
245	Dhaka	Dhaka	Bangladesh	2026-06-25 07:03:40.522213	2026-06-25 07:03:40.522213	\N	\N	f
246	Chittagong	Chittagong	Bangladesh	2026-06-25 07:03:40.522558	2026-06-25 07:03:40.522558	\N	\N	f
247	Sylhet	Sylhet	Bangladesh	2026-06-25 07:03:40.522927	2026-06-25 07:03:40.522927	\N	\N	f
248	Rajshahi	Rajshahi	Bangladesh	2026-06-25 07:03:40.523351	2026-06-25 07:03:40.523351	\N	\N	f
249	Khulna	Khulna	Bangladesh	2026-06-25 07:03:40.523741	2026-06-25 07:03:40.523741	\N	\N	f
250	Thimphu	Thimphu	Bhutan	2026-06-25 07:03:40.524276	2026-06-25 07:03:40.524276	\N	\N	f
251	Bandar Seri Begawan	Brunei-Muara	Brunei	2026-06-25 07:03:40.524627	2026-06-25 07:03:40.524627	\N	\N	f
252	Phnom Penh	Phnom Penh	Cambodia	2026-06-25 07:03:40.525	2026-06-25 07:03:40.525	\N	\N	f
253	Siem Reap	Siem Reap	Cambodia	2026-06-25 07:03:40.525357	2026-06-25 07:03:40.525357	\N	\N	f
254	Sihanoukville	Preah Sihanouk	Cambodia	2026-06-25 07:03:40.525686	2026-06-25 07:03:40.525686	\N	\N	f
255	Beijing	Beijing	China	2026-06-25 07:03:40.526016	2026-06-25 07:03:40.526016	\N	\N	f
256	Shanghai	Shanghai	China	2026-06-25 07:03:40.526343	2026-06-25 07:03:40.526343	\N	\N	f
257	Guangzhou	Guangdong	China	2026-06-25 07:03:40.526706	2026-06-25 07:03:40.526706	\N	\N	f
258	Shenzhen	Guangdong	China	2026-06-25 07:03:40.527042	2026-06-25 07:03:40.527042	\N	\N	f
259	Chengdu	Sichuan	China	2026-06-25 07:03:40.52738	2026-06-25 07:03:40.52738	\N	\N	f
260	Chongqing	Chongqing	China	2026-06-25 07:03:40.527708	2026-06-25 07:03:40.527708	\N	\N	f
261	Wuhan	Hubei	China	2026-06-25 07:03:40.528028	2026-06-25 07:03:40.528028	\N	\N	f
262	Xi'an	Shaanxi	China	2026-06-25 07:03:40.528435	2026-06-25 07:03:40.528435	\N	\N	f
263	Hangzhou	Zhejiang	China	2026-06-25 07:03:40.52883	2026-06-25 07:03:40.52883	\N	\N	f
264	Nanjing	Jiangsu	China	2026-06-25 07:03:40.529345	2026-06-25 07:03:40.529345	\N	\N	f
265	Tianjin	Tianjin	China	2026-06-25 07:03:40.530105	2026-06-25 07:03:40.530105	\N	\N	f
266	Hong Kong	Hong Kong	China	2026-06-25 07:03:40.530538	2026-06-25 07:03:40.530538	\N	\N	f
267	Macau	Macau	China	2026-06-25 07:03:40.530966	2026-06-25 07:03:40.530966	\N	\N	f
268	Tbilisi	Tbilisi	Georgia	2026-06-25 07:03:40.531332	2026-06-25 07:03:40.531332	\N	\N	f
269	Batumi	Adjara	Georgia	2026-06-25 07:03:40.531858	2026-06-25 07:03:40.531858	\N	\N	f
270	New Delhi	Delhi	India	2026-06-25 07:03:40.532511	2026-06-25 07:03:40.532511	\N	\N	f
271	Mumbai	Maharashtra	India	2026-06-25 07:03:40.532955	2026-06-25 07:03:40.532955	\N	\N	f
272	Bangalore	Karnataka	India	2026-06-25 07:03:40.533442	2026-06-25 07:03:40.533442	\N	\N	f
273	Chennai	Tamil Nadu	India	2026-06-25 07:03:40.533849	2026-06-25 07:03:40.533849	\N	\N	f
274	Kolkata	West Bengal	India	2026-06-25 07:03:40.534199	2026-06-25 07:03:40.534199	\N	\N	f
275	Hyderabad	Telangana	India	2026-06-25 07:03:40.534546	2026-06-25 07:03:40.534546	\N	\N	f
276	Pune	Maharashtra	India	2026-06-25 07:03:40.534891	2026-06-25 07:03:40.534891	\N	\N	f
277	Ahmedabad	Gujarat	India	2026-06-25 07:03:40.535238	2026-06-25 07:03:40.535238	\N	\N	f
278	Surat	Gujarat	India	2026-06-25 07:03:40.535577	2026-06-25 07:03:40.535577	\N	\N	f
279	Jaipur	Rajasthan	India	2026-06-25 07:03:40.535948	2026-06-25 07:03:40.535948	\N	\N	f
280	Lucknow	Uttar Pradesh	India	2026-06-25 07:03:40.536266	2026-06-25 07:03:40.536266	\N	\N	f
281	Kochi	Kerala	India	2026-06-25 07:03:40.536629	2026-06-25 07:03:40.536629	\N	\N	f
282	Jakarta	Jakarta	Indonesia	2026-06-25 07:03:40.536966	2026-06-25 07:03:40.536966	\N	\N	f
283	Surabaya	East Java	Indonesia	2026-06-25 07:03:40.537305	2026-06-25 07:03:40.537305	\N	\N	f
284	Bandung	West Java	Indonesia	2026-06-25 07:03:40.537657	2026-06-25 07:03:40.537657	\N	\N	f
285	Medan	North Sumatra	Indonesia	2026-06-25 07:03:40.538001	2026-06-25 07:03:40.538001	\N	\N	f
286	Makassar	South Sulawesi	Indonesia	2026-06-25 07:03:40.538361	2026-06-25 07:03:40.538361	\N	\N	f
287	Semarang	Central Java	Indonesia	2026-06-25 07:03:40.538802	2026-06-25 07:03:40.538802	\N	\N	f
288	Denpasar	Bali	Indonesia	2026-06-25 07:03:40.539169	2026-06-25 07:03:40.539169	\N	\N	f
289	Tokyo	Tokyo	Japan	2026-06-25 07:03:40.539775	2026-06-25 07:03:40.539775	\N	\N	f
290	Osaka	Osaka	Japan	2026-06-25 07:03:40.540326	2026-06-25 07:03:40.540326	\N	\N	f
291	Yokohama	Kanagawa	Japan	2026-06-25 07:03:40.540933	2026-06-25 07:03:40.540933	\N	\N	f
292	Nagoya	Aichi	Japan	2026-06-25 07:03:40.541554	2026-06-25 07:03:40.541554	\N	\N	f
293	Sapporo	Hokkaido	Japan	2026-06-25 07:03:40.542164	2026-06-25 07:03:40.542164	\N	\N	f
294	Kyoto	Kyoto	Japan	2026-06-25 07:03:40.542524	2026-06-25 07:03:40.542524	\N	\N	f
295	Kobe	Hyogo	Japan	2026-06-25 07:03:40.542959	2026-06-25 07:03:40.542959	\N	\N	f
296	Fukuoka	Fukuoka	Japan	2026-06-25 07:03:40.543326	2026-06-25 07:03:40.543326	\N	\N	f
297	Nur-Sultan	Akmola	Kazakhstan	2026-06-25 07:03:40.544003	2026-06-25 07:03:40.544003	\N	\N	f
298	Almaty	Almaty	Kazakhstan	2026-06-25 07:03:40.544478	2026-06-25 07:03:40.544478	\N	\N	f
299	Shymkent	South Kazakhstan	Kazakhstan	2026-06-25 07:03:40.545067	2026-06-25 07:03:40.545067	\N	\N	f
300	Bishkek	Bishkek	Kyrgyzstan	2026-06-25 07:03:40.545545	2026-06-25 07:03:40.545545	\N	\N	f
301	Osh	Osh	Kyrgyzstan	2026-06-25 07:03:40.545998	2026-06-25 07:03:40.545998	\N	\N	f
302	Vientiane	Prefecture of Vientiane	Laos	2026-06-25 07:03:40.546498	2026-06-25 07:03:40.546498	\N	\N	f
303	Luang Prabang	Luang Prabang	Laos	2026-06-25 07:03:40.54725	2026-06-25 07:03:40.54725	\N	\N	f
304	Kuala Lumpur	Kuala Lumpur	Malaysia	2026-06-25 07:03:40.547717	2026-06-25 07:03:40.547717	\N	\N	f
305	George Town	Penang	Malaysia	2026-06-25 07:03:40.548146	2026-06-25 07:03:40.548146	\N	\N	f
306	Johor Bahru	Johor	Malaysia	2026-06-25 07:03:40.548558	2026-06-25 07:03:40.548558	\N	\N	f
307	Kota Kinabalu	Sabah	Malaysia	2026-06-25 07:03:40.548927	2026-06-25 07:03:40.548927	\N	\N	f
308	Kuching	Sarawak	Malaysia	2026-06-25 07:03:40.549296	2026-06-25 07:03:40.549296	\N	\N	f
309	Malé	Malé	Maldives	2026-06-25 07:03:40.549659	2026-06-25 07:03:40.549659	\N	\N	f
310	Ulaanbaatar	Ulaanbaatar	Mongolia	2026-06-25 07:03:40.550013	2026-06-25 07:03:40.550013	\N	\N	f
311	Naypyidaw	Naypyidaw	Myanmar	2026-06-25 07:03:40.550355	2026-06-25 07:03:40.550355	\N	\N	f
312	Yangon	Yangon	Myanmar	2026-06-25 07:03:40.550696	2026-06-25 07:03:40.550696	\N	\N	f
313	Mandalay	Mandalay	Myanmar	2026-06-25 07:03:40.551039	2026-06-25 07:03:40.551039	\N	\N	f
314	Kathmandu	Bagmati	Nepal	2026-06-25 07:03:40.551375	2026-06-25 07:03:40.551375	\N	\N	f
315	Pokhara	Gandaki	Nepal	2026-06-25 07:03:40.551711	2026-06-25 07:03:40.551711	\N	\N	f
316	Islamabad	Islamabad Capital Territory	Pakistan	2026-06-25 07:03:40.552055	2026-06-25 07:03:40.552055	\N	\N	f
317	Karachi	Sindh	Pakistan	2026-06-25 07:03:40.552407	2026-06-25 07:03:40.552407	\N	\N	f
318	Lahore	Punjab	Pakistan	2026-06-25 07:03:40.55274	2026-06-25 07:03:40.55274	\N	\N	f
319	Faisalabad	Punjab	Pakistan	2026-06-25 07:03:40.553102	2026-06-25 07:03:40.553102	\N	\N	f
320	Rawalpindi	Punjab	Pakistan	2026-06-25 07:03:40.553478	2026-06-25 07:03:40.553478	\N	\N	f
321	Peshawar	Khyber Pakhtunkhwa	Pakistan	2026-06-25 07:03:40.553836	2026-06-25 07:03:40.553836	\N	\N	f
322	Quetta	Balochistan	Pakistan	2026-06-25 07:03:40.554244	2026-06-25 07:03:40.554244	\N	\N	f
323	Manila	Metro Manila	Philippines	2026-06-25 07:03:40.554605	2026-06-25 07:03:40.554605	\N	\N	f
324	Quezon City	Metro Manila	Philippines	2026-06-25 07:03:40.554949	2026-06-25 07:03:40.554949	\N	\N	f
325	Davao	Davao Region	Philippines	2026-06-25 07:03:40.555302	2026-06-25 07:03:40.555302	\N	\N	f
326	Cebu City	Central Visayas	Philippines	2026-06-25 07:03:40.555657	2026-06-25 07:03:40.555657	\N	\N	f
327	Singapore	Singapore	Singapore	2026-06-25 07:03:40.55601	2026-06-25 07:03:40.55601	\N	\N	f
328	Seoul	Seoul	South Korea	2026-06-25 07:03:40.556436	2026-06-25 07:03:40.556436	\N	\N	f
329	Busan	Busan	South Korea	2026-06-25 07:03:40.557221	2026-06-25 07:03:40.557221	\N	\N	f
330	Incheon	Incheon	South Korea	2026-06-25 07:03:40.557696	2026-06-25 07:03:40.557696	\N	\N	f
331	Daegu	Daegu	South Korea	2026-06-25 07:03:40.558098	2026-06-25 07:03:40.558098	\N	\N	f
332	Daejeon	Daejeon	South Korea	2026-06-25 07:03:40.558512	2026-06-25 07:03:40.558512	\N	\N	f
333	Colombo	Western Province	Sri Lanka	2026-06-25 07:03:40.558873	2026-06-25 07:03:40.558873	\N	\N	f
334	Kandy	Central Province	Sri Lanka	2026-06-25 07:03:40.559253	2026-06-25 07:03:40.559253	\N	\N	f
335	Taipei	Taipei	Taiwan	2026-06-25 07:03:40.559619	2026-06-25 07:03:40.559619	\N	\N	f
336	Kaohsiung	Kaohsiung	Taiwan	2026-06-25 07:03:40.559986	2026-06-25 07:03:40.559986	\N	\N	f
337	Taichung	Taichung	Taiwan	2026-06-25 07:03:40.560351	2026-06-25 07:03:40.560351	\N	\N	f
338	Dushanbe	Dushanbe	Tajikistan	2026-06-25 07:03:40.560709	2026-06-25 07:03:40.560709	\N	\N	f
339	Bangkok	Bangkok	Thailand	2026-06-25 07:03:40.561075	2026-06-25 07:03:40.561075	\N	\N	f
340	Chiang Mai	Chiang Mai	Thailand	2026-06-25 07:03:40.561438	2026-06-25 07:03:40.561438	\N	\N	f
341	Phuket	Phuket	Thailand	2026-06-25 07:03:40.561808	2026-06-25 07:03:40.561808	\N	\N	f
342	Pattaya	Chonburi	Thailand	2026-06-25 07:03:40.562175	2026-06-25 07:03:40.562175	\N	\N	f
343	Tashkent	Tashkent	Uzbekistan	2026-06-25 07:03:40.562531	2026-06-25 07:03:40.562531	\N	\N	f
344	Samarkand	Samarkand	Uzbekistan	2026-06-25 07:03:40.56289	2026-06-25 07:03:40.56289	\N	\N	f
345	Namangan	Namangan	Uzbekistan	2026-06-25 07:03:40.563242	2026-06-25 07:03:40.563242	\N	\N	f
346	Bukhara	Bukhara	Uzbekistan	2026-06-25 07:03:40.563576	2026-06-25 07:03:40.563576	\N	\N	f
347	Hanoi	Hanoi	Vietnam	2026-06-25 07:03:40.564133	2026-06-25 07:03:40.564133	\N	\N	f
348	Ho Chi Minh City	Ho Chi Minh City	Vietnam	2026-06-25 07:03:40.564791	2026-06-25 07:03:40.564791	\N	\N	f
349	Da Nang	Da Nang	Vietnam	2026-06-25 07:03:40.565225	2026-06-25 07:03:40.565225	\N	\N	f
350	Hai Phong	Hai Phong	Vietnam	2026-06-25 07:03:40.565625	2026-06-25 07:03:40.565625	\N	\N	f
351	Can Tho	Can Tho	Vietnam	2026-06-25 07:03:40.566013	2026-06-25 07:03:40.566013	\N	\N	f
352	Tirana	Tirana	Albania	2026-06-25 07:03:40.566384	2026-06-25 07:03:40.566384	\N	\N	f
353	Durrës	Durrës	Albania	2026-06-25 07:03:40.566747	2026-06-25 07:03:40.566747	\N	\N	f
354	Vienna	Vienna	Austria	2026-06-25 07:03:40.567104	2026-06-25 07:03:40.567104	\N	\N	f
355	Graz	Styria	Austria	2026-06-25 07:03:40.567456	2026-06-25 07:03:40.567456	\N	\N	f
356	Linz	Upper Austria	Austria	2026-06-25 07:03:40.567809	2026-06-25 07:03:40.567809	\N	\N	f
357	Salzburg	Salzburg	Austria	2026-06-25 07:03:40.568185	2026-06-25 07:03:40.568185	\N	\N	f
358	Minsk	Minsk	Belarus	2026-06-25 07:03:40.56854	2026-06-25 07:03:40.56854	\N	\N	f
359	Gomel	Gomel	Belarus	2026-06-25 07:03:40.578449	2026-06-25 07:03:40.578449	\N	\N	f
360	Brussels	Brussels Capital	Belgium	2026-06-25 07:03:40.578976	2026-06-25 07:03:40.578976	\N	\N	f
361	Antwerp	Antwerp	Belgium	2026-06-25 07:03:40.579357	2026-06-25 07:03:40.579357	\N	\N	f
362	Ghent	East Flanders	Belgium	2026-06-25 07:03:40.579721	2026-06-25 07:03:40.579721	\N	\N	f
363	Liège	Liège	Belgium	2026-06-25 07:03:40.58009	2026-06-25 07:03:40.58009	\N	\N	f
364	Sarajevo	Federation of Bosnia	Bosnia and Herzegovina	2026-06-25 07:03:40.580449	2026-06-25 07:03:40.580449	\N	\N	f
365	Banja Luka	Republika Srpska	Bosnia and Herzegovina	2026-06-25 07:03:40.580807	2026-06-25 07:03:40.580807	\N	\N	f
366	Sofia	Sofia City	Bulgaria	2026-06-25 07:03:40.581163	2026-06-25 07:03:40.581163	\N	\N	f
367	Plovdiv	Plovdiv	Bulgaria	2026-06-25 07:03:40.58152	2026-06-25 07:03:40.58152	\N	\N	f
368	Varna	Varna	Bulgaria	2026-06-25 07:03:40.581875	2026-06-25 07:03:40.581875	\N	\N	f
369	Zagreb	Zagreb County	Croatia	2026-06-25 07:03:40.58223	2026-06-25 07:03:40.58223	\N	\N	f
370	Split	Split-Dalmatia	Croatia	2026-06-25 07:03:40.582584	2026-06-25 07:03:40.582584	\N	\N	f
371	Dubrovnik	Dubrovnik-Neretva	Croatia	2026-06-25 07:03:40.582935	2026-06-25 07:03:40.582935	\N	\N	f
372	Nicosia	Nicosia	Cyprus	2026-06-25 07:03:40.583291	2026-06-25 07:03:40.583291	\N	\N	f
373	Limassol	Limassol	Cyprus	2026-06-25 07:03:40.583646	2026-06-25 07:03:40.583646	\N	\N	f
374	Prague	Prague	Czech Republic	2026-06-25 07:03:40.584006	2026-06-25 07:03:40.584006	\N	\N	f
375	Brno	South Moravian	Czech Republic	2026-06-25 07:03:40.584367	2026-06-25 07:03:40.584367	\N	\N	f
376	Ostrava	Moravian-Silesian	Czech Republic	2026-06-25 07:03:40.584725	2026-06-25 07:03:40.584725	\N	\N	f
377	Copenhagen	Capital Region	Denmark	2026-06-25 07:03:40.585105	2026-06-25 07:03:40.585105	\N	\N	f
378	Aarhus	Central Jutland	Denmark	2026-06-25 07:03:40.585685	2026-06-25 07:03:40.585685	\N	\N	f
379	Odense	Southern Denmark	Denmark	2026-06-25 07:03:40.586276	2026-06-25 07:03:40.586276	\N	\N	f
380	Tallinn	Harju County	Estonia	2026-06-25 07:03:40.586901	2026-06-25 07:03:40.586901	\N	\N	f
381	Tartu	Tartu County	Estonia	2026-06-25 07:03:40.587475	2026-06-25 07:03:40.587475	\N	\N	f
382	Helsinki	Uusimaa	Finland	2026-06-25 07:03:40.588025	2026-06-25 07:03:40.588025	\N	\N	f
383	Espoo	Uusimaa	Finland	2026-06-25 07:03:40.588581	2026-06-25 07:03:40.588581	\N	\N	f
384	Tampere	Pirkanmaa	Finland	2026-06-25 07:03:40.589134	2026-06-25 07:03:40.589134	\N	\N	f
385	Paris	Île-de-France	France	2026-06-25 07:03:40.589539	2026-06-25 07:03:40.589539	\N	\N	f
386	Marseille	Provence-Alpes-Côte d'Azur	France	2026-06-25 07:03:40.590048	2026-06-25 07:03:40.590048	\N	\N	f
387	Lyon	Auvergne-Rhône-Alpes	France	2026-06-25 07:03:40.590563	2026-06-25 07:03:40.590563	\N	\N	f
388	Toulouse	Occitanie	France	2026-06-25 07:03:40.590987	2026-06-25 07:03:40.590987	\N	\N	f
389	Nice	Provence-Alpes-Côte d'Azur	France	2026-06-25 07:03:40.59141	2026-06-25 07:03:40.59141	\N	\N	f
390	Nantes	Pays de la Loire	France	2026-06-25 07:03:40.591815	2026-06-25 07:03:40.591815	\N	\N	f
391	Strasbourg	Grand Est	France	2026-06-25 07:03:40.592177	2026-06-25 07:03:40.592177	\N	\N	f
392	Bordeaux	Nouvelle-Aquitaine	France	2026-06-25 07:03:40.592565	2026-06-25 07:03:40.592565	\N	\N	f
393	Lille	Hauts-de-France	France	2026-06-25 07:03:40.593019	2026-06-25 07:03:40.593019	\N	\N	f
394	Berlin	Berlin	Germany	2026-06-25 07:03:40.593519	2026-06-25 07:03:40.593519	\N	\N	f
395	Hamburg	Hamburg	Germany	2026-06-25 07:03:40.594069	2026-06-25 07:03:40.594069	\N	\N	f
396	Munich	Bavaria	Germany	2026-06-25 07:03:40.594455	2026-06-25 07:03:40.594455	\N	\N	f
397	Cologne	North Rhine-Westphalia	Germany	2026-06-25 07:03:40.594817	2026-06-25 07:03:40.594817	\N	\N	f
398	Frankfurt	Hesse	Germany	2026-06-25 07:03:40.595206	2026-06-25 07:03:40.595206	\N	\N	f
399	Stuttgart	Baden-Württemberg	Germany	2026-06-25 07:03:40.595689	2026-06-25 07:03:40.595689	\N	\N	f
400	Düsseldorf	North Rhine-Westphalia	Germany	2026-06-25 07:03:40.596129	2026-06-25 07:03:40.596129	\N	\N	f
401	Dortmund	North Rhine-Westphalia	Germany	2026-06-25 07:03:40.596867	2026-06-25 07:03:40.596867	\N	\N	f
402	Leipzig	Saxony	Germany	2026-06-25 07:03:40.597333	2026-06-25 07:03:40.597333	\N	\N	f
403	Bremen	Bremen	Germany	2026-06-25 07:03:40.59775	2026-06-25 07:03:40.59775	\N	\N	f
404	Athens	Attica	Greece	2026-06-25 07:03:40.598133	2026-06-25 07:03:40.598133	\N	\N	f
405	Thessaloniki	Central Macedonia	Greece	2026-06-25 07:03:40.598505	2026-06-25 07:03:40.598505	\N	\N	f
406	Patras	Western Greece	Greece	2026-06-25 07:03:40.598873	2026-06-25 07:03:40.598873	\N	\N	f
407	Budapest	Budapest	Hungary	2026-06-25 07:03:40.599248	2026-06-25 07:03:40.599248	\N	\N	f
408	Debrecen	Hajdú-Bihar	Hungary	2026-06-25 07:03:40.599678	2026-06-25 07:03:40.599678	\N	\N	f
409	Reykjavik	Capital Region	Iceland	2026-06-25 07:03:40.600103	2026-06-25 07:03:40.600103	\N	\N	f
410	Dublin	County Dublin	Ireland	2026-06-25 07:03:40.600545	2026-06-25 07:03:40.600545	\N	\N	f
411	Cork	County Cork	Ireland	2026-06-25 07:03:40.600937	2026-06-25 07:03:40.600937	\N	\N	f
412	Limerick	County Limerick	Ireland	2026-06-25 07:03:40.601354	2026-06-25 07:03:40.601354	\N	\N	f
413	Rome	Lazio	Italy	2026-06-25 07:03:40.601789	2026-06-25 07:03:40.601789	\N	\N	f
414	Milan	Lombardy	Italy	2026-06-25 07:03:40.602172	2026-06-25 07:03:40.602172	\N	\N	f
415	Naples	Campania	Italy	2026-06-25 07:03:40.602647	2026-06-25 07:03:40.602647	\N	\N	f
416	Turin	Piedmont	Italy	2026-06-25 07:03:40.603032	2026-06-25 07:03:40.603032	\N	\N	f
417	Palermo	Sicily	Italy	2026-06-25 07:03:40.60346	2026-06-25 07:03:40.60346	\N	\N	f
418	Genoa	Liguria	Italy	2026-06-25 07:03:40.603901	2026-06-25 07:03:40.603901	\N	\N	f
419	Bologna	Emilia-Romagna	Italy	2026-06-25 07:03:40.604321	2026-06-25 07:03:40.604321	\N	\N	f
420	Florence	Tuscany	Italy	2026-06-25 07:03:40.604718	2026-06-25 07:03:40.604718	\N	\N	f
421	Venice	Veneto	Italy	2026-06-25 07:03:40.605134	2026-06-25 07:03:40.605134	\N	\N	f
422	Pristina	Pristina	Kosovo	2026-06-25 07:03:40.605568	2026-06-25 07:03:40.605568	\N	\N	f
423	Riga	Riga	Latvia	2026-06-25 07:03:40.605992	2026-06-25 07:03:40.605992	\N	\N	f
424	Vilnius	Vilnius County	Lithuania	2026-06-25 07:03:40.606649	2026-06-25 07:03:40.606649	\N	\N	f
425	Kaunas	Kaunas County	Lithuania	2026-06-25 07:03:40.607583	2026-06-25 07:03:40.607583	\N	\N	f
426	Luxembourg City	Luxembourg	Luxembourg	2026-06-25 07:03:40.608365	2026-06-25 07:03:40.608365	\N	\N	f
427	Valletta	South Eastern	Malta	2026-06-25 07:03:40.609017	2026-06-25 07:03:40.609017	\N	\N	f
428	Chișinău	Chișinău	Moldova	2026-06-25 07:03:40.609501	2026-06-25 07:03:40.609501	\N	\N	f
429	Amsterdam	North Holland	Netherlands	2026-06-25 07:03:40.610127	2026-06-25 07:03:40.610127	\N	\N	f
430	Rotterdam	South Holland	Netherlands	2026-06-25 07:03:40.610626	2026-06-25 07:03:40.610626	\N	\N	f
431	The Hague	South Holland	Netherlands	2026-06-25 07:03:40.611112	2026-06-25 07:03:40.611112	\N	\N	f
432	Utrecht	Utrecht	Netherlands	2026-06-25 07:03:40.611567	2026-06-25 07:03:40.611567	\N	\N	f
433	Skopje	Skopje	North Macedonia	2026-06-25 07:03:40.611984	2026-06-25 07:03:40.611984	\N	\N	f
434	Oslo	Oslo	Norway	2026-06-25 07:03:40.612424	2026-06-25 07:03:40.612424	\N	\N	f
435	Bergen	Vestland	Norway	2026-06-25 07:03:40.612878	2026-06-25 07:03:40.612878	\N	\N	f
436	Stavanger	Rogaland	Norway	2026-06-25 07:03:40.613372	2026-06-25 07:03:40.613372	\N	\N	f
437	Trondheim	Trøndelag	Norway	2026-06-25 07:03:40.613867	2026-06-25 07:03:40.613867	\N	\N	f
438	Warsaw	Masovian	Poland	2026-06-25 07:03:40.614307	2026-06-25 07:03:40.614307	\N	\N	f
439	Kraków	Lesser Poland	Poland	2026-06-25 07:03:40.614733	2026-06-25 07:03:40.614733	\N	\N	f
440	Łódź	Łódź	Poland	2026-06-25 07:03:40.615449	2026-06-25 07:03:40.615449	\N	\N	f
441	Wrocław	Lower Silesian	Poland	2026-06-25 07:03:40.616125	2026-06-25 07:03:40.616125	\N	\N	f
442	Poznań	Greater Poland	Poland	2026-06-25 07:03:40.616606	2026-06-25 07:03:40.616606	\N	\N	f
443	Gdańsk	Pomeranian	Poland	2026-06-25 07:03:40.617073	2026-06-25 07:03:40.617073	\N	\N	f
444	Lisbon	Metropolitan Area of Lisbon	Portugal	2026-06-25 07:03:40.617514	2026-06-25 07:03:40.617514	\N	\N	f
445	Porto	Norte	Portugal	2026-06-25 07:03:40.618048	2026-06-25 07:03:40.618048	\N	\N	f
446	Braga	Norte	Portugal	2026-06-25 07:03:40.618529	2026-06-25 07:03:40.618529	\N	\N	f
447	Bucharest	Bucharest-Ilfov	Romania	2026-06-25 07:03:40.619135	2026-06-25 07:03:40.619135	\N	\N	f
448	Cluj-Napoca	Cluj	Romania	2026-06-25 07:03:40.619685	2026-06-25 07:03:40.619685	\N	\N	f
449	Timișoara	Timiș	Romania	2026-06-25 07:03:40.620102	2026-06-25 07:03:40.620102	\N	\N	f
450	Iași	Iași	Romania	2026-06-25 07:03:40.62056	2026-06-25 07:03:40.62056	\N	\N	f
451	Moscow	Moscow	Russia	2026-06-25 07:03:40.620967	2026-06-25 07:03:40.620967	\N	\N	f
452	Saint Petersburg	Saint Petersburg	Russia	2026-06-25 07:03:40.621429	2026-06-25 07:03:40.621429	\N	\N	f
453	Novosibirsk	Novosibirsk Oblast	Russia	2026-06-25 07:03:40.622452	2026-06-25 07:03:40.622452	\N	\N	f
454	Yekaterinburg	Sverdlovsk Oblast	Russia	2026-06-25 07:03:40.622918	2026-06-25 07:03:40.622918	\N	\N	f
455	Kazan	Tatarstan	Russia	2026-06-25 07:03:40.623808	2026-06-25 07:03:40.623808	\N	\N	f
456	Belgrade	Belgrade	Serbia	2026-06-25 07:03:40.624331	2026-06-25 07:03:40.624331	\N	\N	f
457	Novi Sad	Vojvodina	Serbia	2026-06-25 07:03:40.624771	2026-06-25 07:03:40.624771	\N	\N	f
458	Bratislava	Bratislava Region	Slovakia	2026-06-25 07:03:40.62517	2026-06-25 07:03:40.62517	\N	\N	f
459	Košice	Košice Region	Slovakia	2026-06-25 07:03:40.625591	2026-06-25 07:03:40.625591	\N	\N	f
460	Ljubljana	Central Slovenia	Slovenia	2026-06-25 07:03:40.626003	2026-06-25 07:03:40.626003	\N	\N	f
461	Madrid	Community of Madrid	Spain	2026-06-25 07:03:40.626435	2026-06-25 07:03:40.626435	\N	\N	f
462	Barcelona	Catalonia	Spain	2026-06-25 07:03:40.626865	2026-06-25 07:03:40.626865	\N	\N	f
463	Valencia	Valencian Community	Spain	2026-06-25 07:03:40.627277	2026-06-25 07:03:40.627277	\N	\N	f
464	Seville	Andalusia	Spain	2026-06-25 07:03:40.62774	2026-06-25 07:03:40.62774	\N	\N	f
465	Bilbao	Basque Country	Spain	2026-06-25 07:03:40.628159	2026-06-25 07:03:40.628159	\N	\N	f
466	Málaga	Andalusia	Spain	2026-06-25 07:03:40.628589	2026-06-25 07:03:40.628589	\N	\N	f
467	Zaragoza	Aragon	Spain	2026-06-25 07:03:40.629039	2026-06-25 07:03:40.629039	\N	\N	f
468	Stockholm	Stockholm County	Sweden	2026-06-25 07:03:40.629491	2026-06-25 07:03:40.629491	\N	\N	f
469	Gothenburg	Västra Götaland County	Sweden	2026-06-25 07:03:40.629943	2026-06-25 07:03:40.629943	\N	\N	f
470	Malmö	Skåne County	Sweden	2026-06-25 07:03:40.630328	2026-06-25 07:03:40.630328	\N	\N	f
471	Uppsala	Uppsala County	Sweden	2026-06-25 07:03:40.630751	2026-06-25 07:03:40.630751	\N	\N	f
472	Bern	Canton of Bern	Switzerland	2026-06-25 07:03:40.631165	2026-06-25 07:03:40.631165	\N	\N	f
473	Zurich	Canton of Zurich	Switzerland	2026-06-25 07:03:40.631607	2026-06-25 07:03:40.631607	\N	\N	f
474	Geneva	Canton of Geneva	Switzerland	2026-06-25 07:03:40.632022	2026-06-25 07:03:40.632022	\N	\N	f
475	Basel	Basel-Stadt	Switzerland	2026-06-25 07:03:40.632612	2026-06-25 07:03:40.632612	\N	\N	f
476	Kyiv	Kyiv	Ukraine	2026-06-25 07:03:40.633204	2026-06-25 07:03:40.633204	\N	\N	f
477	Kharkiv	Kharkiv Oblast	Ukraine	2026-06-25 07:03:40.633657	2026-06-25 07:03:40.633657	\N	\N	f
478	Odessa	Odessa Oblast	Ukraine	2026-06-25 07:03:40.63429	2026-06-25 07:03:40.63429	\N	\N	f
479	Dnipro	Dnipropetrovsk Oblast	Ukraine	2026-06-25 07:03:40.634714	2026-06-25 07:03:40.634714	\N	\N	f
480	Lviv	Lviv Oblast	Ukraine	2026-06-25 07:03:40.635154	2026-06-25 07:03:40.635154	\N	\N	f
481	London	England	United Kingdom	2026-06-25 07:03:40.635555	2026-06-25 07:03:40.635555	\N	\N	f
482	Birmingham	England	United Kingdom	2026-06-25 07:03:40.636001	2026-06-25 07:03:40.636001	\N	\N	f
483	Manchester	England	United Kingdom	2026-06-25 07:03:40.636606	2026-06-25 07:03:40.636606	\N	\N	f
484	Glasgow	Scotland	United Kingdom	2026-06-25 07:03:40.637048	2026-06-25 07:03:40.637048	\N	\N	f
485	Liverpool	England	United Kingdom	2026-06-25 07:03:40.637402	2026-06-25 07:03:40.637402	\N	\N	f
486	Leeds	England	United Kingdom	2026-06-25 07:03:40.637742	2026-06-25 07:03:40.637742	\N	\N	f
487	Sheffield	England	United Kingdom	2026-06-25 07:03:40.638082	2026-06-25 07:03:40.638082	\N	\N	f
488	Edinburgh	Scotland	United Kingdom	2026-06-25 07:03:40.638421	2026-06-25 07:03:40.638421	\N	\N	f
489	Bristol	England	United Kingdom	2026-06-25 07:03:40.638757	2026-06-25 07:03:40.638757	\N	\N	f
490	Cardiff	Wales	United Kingdom	2026-06-25 07:03:40.639119	2026-06-25 07:03:40.639119	\N	\N	f
491	Belfast	Northern Ireland	United Kingdom	2026-06-25 07:03:40.639546	2026-06-25 07:03:40.639546	\N	\N	f
492	Buenos Aires	Buenos Aires	Argentina	2026-06-25 07:03:40.640166	2026-06-25 07:03:40.640166	\N	\N	f
493	Córdoba	Córdoba	Argentina	2026-06-25 07:03:40.640613	2026-06-25 07:03:40.640613	\N	\N	f
494	Rosario	Santa Fe	Argentina	2026-06-25 07:03:40.641026	2026-06-25 07:03:40.641026	\N	\N	f
495	Mendoza	Mendoza	Argentina	2026-06-25 07:03:40.64141	2026-06-25 07:03:40.64141	\N	\N	f
496	Nassau	New Providence	Bahamas	2026-06-25 07:03:40.64178	2026-06-25 07:03:40.64178	\N	\N	f
497	Bridgetown	Saint Michael	Barbados	2026-06-25 07:03:40.642152	2026-06-25 07:03:40.642152	\N	\N	f
498	Belmopan	Cayo	Belize	2026-06-25 07:03:40.648491	2026-06-25 07:03:40.648491	\N	\N	f
499	Belize City	Belize	Belize	2026-06-25 07:03:40.649188	2026-06-25 07:03:40.649188	\N	\N	f
500	Sucre	Chuquisaca	Bolivia	2026-06-25 07:03:40.649735	2026-06-25 07:03:40.649735	\N	\N	f
501	La Paz	La Paz	Bolivia	2026-06-25 07:03:40.650285	2026-06-25 07:03:40.650285	\N	\N	f
502	Cochabamba	Cochabamba	Bolivia	2026-06-25 07:03:40.650794	2026-06-25 07:03:40.650794	\N	\N	f
503	Santa Cruz de la Sierra	Santa Cruz	Bolivia	2026-06-25 07:03:40.651354	2026-06-25 07:03:40.651354	\N	\N	f
504	Brasília	Federal District	Brazil	2026-06-25 07:03:40.651885	2026-06-25 07:03:40.651885	\N	\N	f
505	São Paulo	São Paulo	Brazil	2026-06-25 07:03:40.652397	2026-06-25 07:03:40.652397	\N	\N	f
506	Rio de Janeiro	Rio de Janeiro	Brazil	2026-06-25 07:03:40.653059	2026-06-25 07:03:40.653059	\N	\N	f
507	Salvador	Bahia	Brazil	2026-06-25 07:03:40.653621	2026-06-25 07:03:40.653621	\N	\N	f
508	Fortaleza	Ceará	Brazil	2026-06-25 07:03:40.654169	2026-06-25 07:03:40.654169	\N	\N	f
509	Belo Horizonte	Minas Gerais	Brazil	2026-06-25 07:03:40.654837	2026-06-25 07:03:40.654837	\N	\N	f
510	Manaus	Amazonas	Brazil	2026-06-25 07:03:40.65551	2026-06-25 07:03:40.65551	\N	\N	f
511	Curitiba	Paraná	Brazil	2026-06-25 07:03:40.656066	2026-06-25 07:03:40.656066	\N	\N	f
512	Recife	Pernambuco	Brazil	2026-06-25 07:03:40.656545	2026-06-25 07:03:40.656545	\N	\N	f
513	Porto Alegre	Rio Grande do Sul	Brazil	2026-06-25 07:03:40.657016	2026-06-25 07:03:40.657016	\N	\N	f
514	Ottawa	Ontario	Canada	2026-06-25 07:03:40.657864	2026-06-25 07:03:40.657864	\N	\N	f
515	Toronto	Ontario	Canada	2026-06-25 07:03:40.658385	2026-06-25 07:03:40.658385	\N	\N	f
516	Montreal	Quebec	Canada	2026-06-25 07:03:40.658897	2026-06-25 07:03:40.658897	\N	\N	f
517	Vancouver	British Columbia	Canada	2026-06-25 07:03:40.659399	2026-06-25 07:03:40.659399	\N	\N	f
518	Calgary	Alberta	Canada	2026-06-25 07:03:40.660022	2026-06-25 07:03:40.660022	\N	\N	f
519	Edmonton	Alberta	Canada	2026-06-25 07:03:40.660496	2026-06-25 07:03:40.660496	\N	\N	f
520	Winnipeg	Manitoba	Canada	2026-06-25 07:03:40.661043	2026-06-25 07:03:40.661043	\N	\N	f
521	Quebec City	Quebec	Canada	2026-06-25 07:03:40.661443	2026-06-25 07:03:40.661443	\N	\N	f
522	Santiago	Metropolitan Region	Chile	2026-06-25 07:03:40.661812	2026-06-25 07:03:40.661812	\N	\N	f
523	Valparaíso	Valparaíso	Chile	2026-06-25 07:03:40.662165	2026-06-25 07:03:40.662165	\N	\N	f
524	Concepción	Biobío	Chile	2026-06-25 07:03:40.662521	2026-06-25 07:03:40.662521	\N	\N	f
525	Bogotá	Cundinamarca	Colombia	2026-06-25 07:03:40.662864	2026-06-25 07:03:40.662864	\N	\N	f
526	Medellín	Antioquia	Colombia	2026-06-25 07:03:40.663216	2026-06-25 07:03:40.663216	\N	\N	f
527	Cali	Valle del Cauca	Colombia	2026-06-25 07:03:40.663576	2026-06-25 07:03:40.663576	\N	\N	f
528	Barranquilla	Atlántico	Colombia	2026-06-25 07:03:40.663924	2026-06-25 07:03:40.663924	\N	\N	f
529	Cartagena	Bolívar	Colombia	2026-06-25 07:03:40.664277	2026-06-25 07:03:40.664277	\N	\N	f
530	San José	San José	Costa Rica	2026-06-25 07:03:40.664632	2026-06-25 07:03:40.664632	\N	\N	f
531	Havana	La Habana	Cuba	2026-06-25 07:03:40.664978	2026-06-25 07:03:40.664978	\N	\N	f
532	Santiago de Cuba	Santiago de Cuba	Cuba	2026-06-25 07:03:40.665325	2026-06-25 07:03:40.665325	\N	\N	f
533	Santo Domingo	Distrito Nacional	Dominican Republic	2026-06-25 07:03:40.66567	2026-06-25 07:03:40.66567	\N	\N	f
534	Santiago de los Caballeros	Santiago	Dominican Republic	2026-06-25 07:03:40.666023	2026-06-25 07:03:40.666023	\N	\N	f
535	Quito	Pichincha	Ecuador	2026-06-25 07:03:40.666385	2026-06-25 07:03:40.666385	\N	\N	f
536	Guayaquil	Guayas	Ecuador	2026-06-25 07:03:40.666739	2026-06-25 07:03:40.666739	\N	\N	f
537	Cuenca	Azuay	Ecuador	2026-06-25 07:03:40.667126	2026-06-25 07:03:40.667126	\N	\N	f
538	San Salvador	San Salvador	El Salvador	2026-06-25 07:03:40.667563	2026-06-25 07:03:40.667563	\N	\N	f
539	Guatemala City	Guatemala	Guatemala	2026-06-25 07:03:40.667935	2026-06-25 07:03:40.667935	\N	\N	f
540	Quetzaltenango	Quetzaltenango	Guatemala	2026-06-25 07:03:40.668422	2026-06-25 07:03:40.668422	\N	\N	f
541	Port-au-Prince	Ouest	Haiti	2026-06-25 07:03:40.669302	2026-06-25 07:03:40.669302	\N	\N	f
542	Tegucigalpa	Francisco Morazán	Honduras	2026-06-25 07:03:40.670259	2026-06-25 07:03:40.670259	\N	\N	f
543	San Pedro Sula	Cortés	Honduras	2026-06-25 07:03:40.671114	2026-06-25 07:03:40.671114	\N	\N	f
544	Kingston	Kingston	Jamaica	2026-06-25 07:03:40.671917	2026-06-25 07:03:40.671917	\N	\N	f
545	Montego Bay	St. James	Jamaica	2026-06-25 07:03:40.672945	2026-06-25 07:03:40.672945	\N	\N	f
546	Mexico City	Mexico City	Mexico	2026-06-25 07:03:40.674	2026-06-25 07:03:40.674	\N	\N	f
547	Guadalajara	Jalisco	Mexico	2026-06-25 07:03:40.674873	2026-06-25 07:03:40.674873	\N	\N	f
548	Monterrey	Nuevo León	Mexico	2026-06-25 07:03:40.675518	2026-06-25 07:03:40.675518	\N	\N	f
549	Puebla	Puebla	Mexico	2026-06-25 07:03:40.676206	2026-06-25 07:03:40.676206	\N	\N	f
550	Tijuana	Baja California	Mexico	2026-06-25 07:03:40.677199	2026-06-25 07:03:40.677199	\N	\N	f
551	León	Guanajuato	Mexico	2026-06-25 07:03:40.677777	2026-06-25 07:03:40.677777	\N	\N	f
552	Ciudad Juárez	Chihuahua	Mexico	2026-06-25 07:03:40.678336	2026-06-25 07:03:40.678336	\N	\N	f
553	Cancún	Quintana Roo	Mexico	2026-06-25 07:03:40.678941	2026-06-25 07:03:40.678941	\N	\N	f
554	Managua	Managua	Nicaragua	2026-06-25 07:03:40.679472	2026-06-25 07:03:40.679472	\N	\N	f
555	León	León	Nicaragua	2026-06-25 07:03:40.680029	2026-06-25 07:03:40.680029	\N	\N	f
556	Panama City	Panama	Panama	2026-06-25 07:03:40.680551	2026-06-25 07:03:40.680551	\N	\N	f
557	Colón	Colón	Panama	2026-06-25 07:03:40.681028	2026-06-25 07:03:40.681028	\N	\N	f
558	Asunción	Central	Paraguay	2026-06-25 07:03:40.681564	2026-06-25 07:03:40.681564	\N	\N	f
559	Ciudad del Este	Alto Paraná	Paraguay	2026-06-25 07:03:40.682061	2026-06-25 07:03:40.682061	\N	\N	f
560	Lima	Lima	Peru	2026-06-25 07:03:40.682729	2026-06-25 07:03:40.682729	\N	\N	f
561	Arequipa	Arequipa	Peru	2026-06-25 07:03:40.683336	2026-06-25 07:03:40.683336	\N	\N	f
562	Trujillo	La Libertad	Peru	2026-06-25 07:03:40.683906	2026-06-25 07:03:40.683906	\N	\N	f
563	Cusco	Cusco	Peru	2026-06-25 07:03:40.684554	2026-06-25 07:03:40.684554	\N	\N	f
564	Paramaribo	Paramaribo	Suriname	2026-06-25 07:03:40.685065	2026-06-25 07:03:40.685065	\N	\N	f
565	Port of Spain	Port of Spain	Trinidad and Tobago	2026-06-25 07:03:40.685539	2026-06-25 07:03:40.685539	\N	\N	f
566	Chaguanas	Chaguanas	Trinidad and Tobago	2026-06-25 07:03:40.686156	2026-06-25 07:03:40.686156	\N	\N	f
567	Montevideo	Montevideo	Uruguay	2026-06-25 07:03:40.686876	2026-06-25 07:03:40.686876	\N	\N	f
568	Salto	Salto	Uruguay	2026-06-25 07:03:40.687595	2026-06-25 07:03:40.687595	\N	\N	f
569	Washington D.C.	District of Columbia	USA	2026-06-25 07:03:40.68813	2026-06-25 07:03:40.68813	\N	\N	f
570	New York	New York	USA	2026-06-25 07:03:40.688711	2026-06-25 07:03:40.688711	\N	\N	f
571	Los Angeles	California	USA	2026-06-25 07:03:40.689181	2026-06-25 07:03:40.689181	\N	\N	f
572	Chicago	Illinois	USA	2026-06-25 07:03:40.689633	2026-06-25 07:03:40.689633	\N	\N	f
573	Houston	Texas	USA	2026-06-25 07:03:40.690164	2026-06-25 07:03:40.690164	\N	\N	f
574	Phoenix	Arizona	USA	2026-06-25 07:03:40.690771	2026-06-25 07:03:40.690771	\N	\N	f
575	Philadelphia	Pennsylvania	USA	2026-06-25 07:03:40.691674	2026-06-25 07:03:40.691674	\N	\N	f
576	San Antonio	Texas	USA	2026-06-25 07:03:40.692363	2026-06-25 07:03:40.692363	\N	\N	f
577	San Diego	California	USA	2026-06-25 07:03:40.693168	2026-06-25 07:03:40.693168	\N	\N	f
578	Dallas	Texas	USA	2026-06-25 07:03:40.693916	2026-06-25 07:03:40.693916	\N	\N	f
579	Miami	Florida	USA	2026-06-25 07:03:40.694648	2026-06-25 07:03:40.694648	\N	\N	f
580	Atlanta	Georgia	USA	2026-06-25 07:03:40.695471	2026-06-25 07:03:40.695471	\N	\N	f
581	Seattle	Washington	USA	2026-06-25 07:03:40.696189	2026-06-25 07:03:40.696189	\N	\N	f
582	Boston	Massachusetts	USA	2026-06-25 07:03:40.696785	2026-06-25 07:03:40.696785	\N	\N	f
583	Caracas	Capital District	Venezuela	2026-06-25 07:03:40.697827	2026-06-25 07:03:40.697827	\N	\N	f
584	Maracaibo	Zulia	Venezuela	2026-06-25 07:03:40.69856	2026-06-25 07:03:40.69856	\N	\N	f
585	Valencia	Carabobo	Venezuela	2026-06-25 07:03:40.699175	2026-06-25 07:03:40.699175	\N	\N	f
586	Canberra	Australian Capital Territory	Australia	2026-06-25 07:03:40.699676	2026-06-25 07:03:40.699676	\N	\N	f
587	Sydney	New South Wales	Australia	2026-06-25 07:03:40.700301	2026-06-25 07:03:40.700301	\N	\N	f
588	Melbourne	Victoria	Australia	2026-06-25 07:03:40.700825	2026-06-25 07:03:40.700825	\N	\N	f
589	Brisbane	Queensland	Australia	2026-06-25 07:03:40.701314	2026-06-25 07:03:40.701314	\N	\N	f
590	Perth	Western Australia	Australia	2026-06-25 07:03:40.701799	2026-06-25 07:03:40.701799	\N	\N	f
591	Adelaide	South Australia	Australia	2026-06-25 07:03:40.702297	2026-06-25 07:03:40.702297	\N	\N	f
592	Gold Coast	Queensland	Australia	2026-06-25 07:03:40.70286	2026-06-25 07:03:40.70286	\N	\N	f
593	Newcastle	New South Wales	Australia	2026-06-25 07:03:40.703447	2026-06-25 07:03:40.703447	\N	\N	f
594	Suva	Central Division	Fiji	2026-06-25 07:03:40.704011	2026-06-25 07:03:40.704011	\N	\N	f
595	Lautoka	Western Division	Fiji	2026-06-25 07:03:40.704543	2026-06-25 07:03:40.704543	\N	\N	f
596	Wellington	Wellington	New Zealand	2026-06-25 07:03:40.70504	2026-06-25 07:03:40.70504	\N	\N	f
597	Auckland	Auckland	New Zealand	2026-06-25 07:03:40.705613	2026-06-25 07:03:40.705613	\N	\N	f
598	Christchurch	Canterbury	New Zealand	2026-06-25 07:03:40.706225	2026-06-25 07:03:40.706225	\N	\N	f
599	Hamilton	Waikato	New Zealand	2026-06-25 07:03:40.706688	2026-06-25 07:03:40.706688	\N	\N	f
600	Port Moresby	National Capital	Papua New Guinea	2026-06-25 07:03:40.707339	2026-06-25 07:03:40.707339	\N	\N	f
601	Lae	Morobe	Papua New Guinea	2026-06-25 07:03:40.708272	2026-06-25 07:03:40.708272	\N	\N	f
602	Apia	Tuamasaga	Samoa	2026-06-25 07:03:40.708872	2026-06-25 07:03:40.708872	\N	\N	f
603	Honiara	Guadalcanal	Solomon Islands	2026-06-25 07:03:40.709472	2026-06-25 07:03:40.709472	\N	\N	f
604	Nuku'alofa	Tongatapu	Tonga	2026-06-25 07:03:40.710025	2026-06-25 07:03:40.710025	\N	\N	f
605	Port Vila	Shefa	Vanuatu	2026-06-25 07:03:40.71053	2026-06-25 07:03:40.71053	\N	\N	f
606	TestCity	\N	Somalia	2026-06-25 13:22:46.848729	2026-06-25 13:22:46.848729	\N	\N	f
607	QA Test City	\N	Somalia	2026-06-25 13:22:46.993463	2026-06-25 13:22:46.993463	\N	\N	f
608	Kismayo Retest	Lower Jubba	Somalia	2026-06-26 08:36:51.822568	2026-06-26 08:36:51.822568	\N	\N	f
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (customer_id, full_name, phone, add_id, u_br_id, created_at, updated_at, created_by, updated_by, deleted, customer_type) FROM stdin;
1	Ali Mohamed	+252611234569	1	1	2026-06-11 08:04:41.746673	2026-06-11 08:04:41.746673	1	1	f	regular
34	Test Customer	0612345678	\N	34	2026-06-22 11:57:36.255677	2026-06-22 11:57:36.255677	1	1	f	regular
39	Omar Farah	0618888888	\N	34	2026-06-22 11:59:53.065231	2026-06-22 11:59:53.065231	1	1	f	regular
40	Ali Hassan	0611111111	\N	34	2026-06-22 11:59:53.153806	2026-06-22 11:59:53.153806	\N	\N	f	regular
41	Farah Ahmed	0622222222	\N	34	2026-06-22 11:59:53.153806	2026-06-22 11:59:53.153806	\N	\N	f	regular
47	Test VIP Customer	+252611999888	\N	34	2026-06-26 09:36:50.093992	2026-06-26 09:36:50.17096	1	1	t	regular
48	Test One-Time Customer	+252611999777	\N	34	2026-06-26 09:36:50.119499	2026-06-26 09:36:50.175862	1	1	t	one_time
49	VIP Customer Test	+1234567890	\N	34	2026-06-26 10:23:39.02369	2026-06-26 10:23:50.83418	1	1	t	regular
50	E2E Test Customer	0900123456	\N	37	2026-06-26 11:08:08.654759	2026-06-26 11:08:09.175129	36	1	t	regular
43	Robert	0611111111	\N	34	2026-06-26 08:39:47.359471	2026-06-26 11:28:56.269895	1	1	f	regular
44	yaasin	0612345678	\N	34	2026-06-26 08:39:47.528487	2026-06-26 11:29:16.027187	1	1	f	regular
42	New custmer	0699999998	\N	34	2026-06-25 13:18:13.012037	2026-06-26 13:58:03.418886	1	38	f	one_time
46	One Time Ltd	0688888888	38	34	2026-06-26 09:23:43.136561	2026-06-27 09:57:44.832458	1	38	f	regular
45	VIP Test Corp	0699999999	\N	34	2026-06-26 09:23:43.00605	2026-06-27 09:57:51.731467	1	38	f	one_time
51	Xasan Jaamac	615676512	35	41	2026-06-28 09:51:17.27889	2026-06-28 09:51:17.27889	40	40	f	one_time
\.


--
-- Data for Name: days; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.days (day_id, name, day_of_week, code) FROM stdin;
1	Monday	1	Mon
2	Tuesday	2	Tue
3	Wednesday	3	Wed
4	Thursday	4	Thu
5	Friday	5	Fri
6	Saturday	6	Sat
7	Sunday	7	Sun
\.


--
-- Data for Name: dispute_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dispute_types (dispute_type_id, name) FROM stdin;
1	Damaged Goods
2	Lost Shipment
3	Late Delivery
4	Wrong Item
5	Overcharged
\.


--
-- Data for Name: disputes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.disputes (dispute_id, cargo_id, customer_id, dispute_type_id, description, status, resolution, refund_amount, resolved_by, created_at, updated_at) FROM stdin;
1	1	1	1	Customer reported damaged goods	open	\N	\N	\N	2026-06-11 08:04:41.746673	2026-06-11 08:04:41.746673
\.


--
-- Data for Name: employee_attendance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_attendance (emp_att_id, emp_sch_id, day_id, time_in, time_out, u_br_id, created_at, attendance_date, status, notes, updated_at, employee_id) FROM stdin;
23	90	\N	09:00:00	17:00:00	34	2026-06-27 03:34:02.859539	2026-06-27	present	\N	2026-06-27 07:10:24.78286	38
24	99	\N	08:30:00	16:30:00	34	2026-06-27 03:34:02.859539	2026-06-27	present	\N	2026-06-27 07:10:24.78286	39
25	96	\N	08:30:00	17:00:00	34	2026-06-27 03:34:02.859539	2026-06-27	present	\N	2026-06-27 07:10:24.78286	40
5	1	5	08:00:00	17:00:00	34	2026-06-27 01:54:31.662942	2026-06-26	present	on time	2026-06-27 01:54:31.662942	1
26	85	6	07:00:00	17:00:00	34	2026-06-27 03:34:02.859539	2026-06-27	present	\N	2026-06-27 07:10:24.78286	41
3	35	2	08:40:00	16:40:00	34	2026-06-23 10:31:04.020558	2026-06-23	present	\N	2026-06-27 01:50:31.132983	1
27	79	6	09:00:00	17:00:00	34	2026-06-27 03:34:02.859539	2026-06-27	present	\N	2026-06-27 07:10:24.78286	37
6	79	6	09:00:00	17:00:00	34	2026-06-27 01:57:08.44668	2026-06-26	present	this is present person	2026-06-27 01:57:08.44668	37
10	\N	\N	08:00:00	16:30:00	34	2026-06-27 03:08:15.090376	2026-06-26	present	\N	2026-06-27 03:08:15.090376	34
11	\N	\N	\N	\N	34	2026-06-27 03:08:15.107681	2026-06-26	sick_leave	Doctor appointment	2026-06-27 03:08:15.107681	35
12	\N	\N	09:30:00	17:30:00	34	2026-06-27 03:08:15.107681	2026-06-26	late	\N	2026-06-27 03:08:15.107681	36
13	\N	\N	08:00:00	17:00:00	34	2026-06-27 03:09:41.396969	2026-06-27	present	\N	2026-06-27 07:10:24.78286	34
14	\N	\N	08:30:00	17:30:00	34	2026-06-27 03:09:41.396969	2026-06-27	present	\N	2026-06-27 07:10:24.78286	35
15	\N	\N	08:00:00	16:30:00	34	2026-06-27 03:09:41.396969	2026-06-27	present	\N	2026-06-27 07:10:24.78286	36
4	38	6	\N	\N	34	2026-06-27 00:35:18.740016	2026-06-27	absent	\N	2026-06-27 07:10:24.78286	1
\.


--
-- Data for Name: employee_branch; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_branch (employee_branch_id, employee_id, branch_id, sh_id, salary, sal_t_id, status, u_br_id, created_at, updated_at, deleted, effective_from, effective_to) FROM stdin;
34	34	1	\N	\N	\N	active	36	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
35	35	1	\N	\N	\N	active	37	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
36	36	1	\N	\N	\N	active	38	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
37	37	1	\N	\N	\N	active	39	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
38	38	35	\N	\N	\N	active	40	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
39	39	35	\N	\N	\N	active	41	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
40	40	35	\N	\N	\N	active	42	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
41	41	35	\N	\N	\N	active	43	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	f	2026-06-26	\N
42	37	37	\N	\N	\N	active	34	2026-06-27 00:40:07.268204	2026-06-27 01:46:36.481417	f	2026-06-27	\N
1	1	1	1	800.00	1	inactive	1	2026-06-11 08:04:41.746673	2026-06-27 01:52:05.703681	f	2026-06-11	2026-06-27
43	1	1	\N	\N	\N	inactive	34	2026-06-27 01:52:05.70533	2026-06-27 01:53:30.064464	f	2026-06-27	2026-06-27
44	1	1	\N	\N	\N	inactive	34	2026-06-27 01:53:30.066301	2026-06-27 01:54:31.654915	f	2026-06-27	2026-06-27
45	1	1	\N	\N	\N	active	34	2026-06-27 01:54:31.656963	2026-06-27 01:54:31.656963	f	2026-06-27	\N
\.


--
-- Data for Name: employee_schedule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_schedule (emp_sch_id, emp_id, day_id, time_in, time_out, u_br_id, created_at, break_start, break_end, updated_at) FROM stdin;
1	1	1	\N	\N	1	2026-06-11 08:04:41.746673	\N	\N	2026-06-27 01:50:31.132983
35	1	2	\N	\N	34	2026-06-23 05:50:04.684723	\N	\N	2026-06-27 01:50:31.132983
36	1	3	\N	\N	34	2026-06-23 05:50:04.70203	\N	\N	2026-06-27 01:50:31.132983
38	1	6	\N	\N	34	2026-06-23 05:50:04.728355	\N	\N	2026-06-27 01:50:31.132983
39	1	7	\N	\N	34	2026-06-23 05:50:04.736141	\N	\N	2026-06-27 01:50:31.132983
72	34	2	\N	\N	34	2026-06-27 00:35:29.493163	\N	\N	2026-06-27 01:50:31.132983
73	34	3	\N	\N	34	2026-06-27 00:35:29.502054	\N	\N	2026-06-27 01:50:31.132983
74	34	4	\N	\N	34	2026-06-27 00:35:29.511057	\N	\N	2026-06-27 01:50:31.132983
75	34	5	\N	\N	34	2026-06-27 00:35:29.521854	\N	\N	2026-06-27 01:50:31.132983
79	37	6	09:00:00	17:00:00	34	2026-06-27 01:56:07.893048	\N	\N	2026-06-27 01:56:07.893048
80	37	7	09:00:00	17:00:00	34	2026-06-27 01:56:07.902892	\N	\N	2026-06-27 01:56:07.902892
81	41	1	07:00:00	17:00:00	34	2026-06-27 03:22:24.562372	00:00:00	00:50:00	2026-06-27 03:22:24.562372
82	41	2	07:00:00	17:00:00	34	2026-06-27 03:22:24.65217	00:00:00	00:50:00	2026-06-27 03:22:24.65217
83	41	3	07:00:00	17:00:00	34	2026-06-27 03:22:24.675128	00:00:00	00:50:00	2026-06-27 03:22:24.675128
84	41	4	10:00:00	17:00:00	34	2026-06-27 03:22:24.693011	00:00:00	00:50:00	2026-06-27 03:22:24.693011
85	41	6	07:00:00	17:00:00	34	2026-06-27 03:22:24.716801	00:00:00	00:50:00	2026-06-27 03:22:24.716801
86	41	7	07:00:00	17:00:00	34	2026-06-27 03:22:24.730636	00:50:00	00:50:00	2026-06-27 03:22:24.730636
87	38	1	09:00:00	17:00:00	34	2026-06-27 03:34:46.766902	\N	\N	2026-06-27 03:34:46.766902
88	38	2	09:00:00	17:00:00	34	2026-06-27 03:34:46.79557	\N	\N	2026-06-27 03:34:46.79557
89	38	3	09:00:00	17:00:00	34	2026-06-27 03:34:46.819677	\N	\N	2026-06-27 03:34:46.819677
91	38	7	09:00:00	17:00:00	34	2026-06-27 03:34:46.851343	\N	\N	2026-06-27 03:34:46.851343
92	40	1	09:00:00	17:00:00	34	2026-06-27 06:28:44.147168	\N	\N	2026-06-27 06:28:44.147168
93	40	2	09:00:00	17:00:00	34	2026-06-27 06:28:44.167235	\N	\N	2026-06-27 06:28:44.167235
94	40	3	09:00:00	17:00:00	34	2026-06-27 06:28:44.177025	\N	\N	2026-06-27 06:28:44.177025
95	40	4	09:00:00	17:00:00	34	2026-06-27 06:28:44.185958	\N	\N	2026-06-27 06:28:44.185958
96	40	6	09:00:00	17:00:00	34	2026-06-27 06:28:44.197035	\N	\N	2026-06-27 06:28:44.197035
97	40	7	09:00:00	17:00:00	34	2026-06-27 06:28:44.2084	\N	\N	2026-06-27 06:28:44.2084
71	34	1	09:00:00	17:00:00	34	2026-06-27 00:35:29.480642	\N	\N	2026-06-27 07:05:47.912267
99	39	6	08:00:00	17:00:00	34	2026-06-27 07:06:38.317692	00:00:00	00:50:00	2026-06-27 07:07:18.073632
90	38	6	09:00:00	17:00:00	34	2026-06-27 03:34:46.835567	00:00:00	00:50:00	2026-06-27 07:07:42.627822
100	39	7	09:00:00	17:00:00	34	2026-06-27 07:06:52.185794	00:00:00	00:50:00	2026-06-27 07:08:11.664715
76	37	1	09:00:00	17:00:00	34	2026-06-27 01:56:07.852358	00:00:00	01:30:00	2026-06-27 07:08:57.57106
77	37	2	09:00:00	17:00:00	34	2026-06-27 01:56:07.868201	00:00:00	01:00:00	2026-06-27 07:09:19.308163
78	37	3	09:00:00	17:00:00	34	2026-06-27 01:56:07.8801	00:00:00	01:00:00	2026-06-27 07:10:08.420901
\.


--
-- Data for Name: employee_type; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employee_type (emp_t_id, type) FROM stdin;
1	Full-Time
2	Part-Time
3	Contract
4	Intern
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employees (employee_id, phone, email, job_id, amount, sl_t_id, emp_t_id, hire_date, status, u_br_id, created_at, updated_at, created_by, updated_by, deleted, first_name, last_name) FROM stdin;
1	+252611234571	mohamed@waafi.com	1	800.00	1	1	2026-06-11	active	1	2026-06-11 08:04:41.746673	2026-06-27 01:46:36.481417	1	\N	f	Mohamed	Ali
34	+252611001001	\N	35	\N	\N	\N	2026-06-26	active	36	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Ahmed	Hassan
35	+252611001002	\N	36	\N	\N	\N	2026-06-26	active	37	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Faadumo	Warsame
36	+252611001003	\N	37	\N	\N	\N	2026-06-26	active	38	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Hodan	Abdi
37	+252611001004	\N	38	\N	\N	\N	2026-06-26	active	39	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Bile	Mohamed
38	+97155001001	\N	35	\N	\N	\N	2026-06-26	active	40	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Khalid	Al-Rashid
39	+97155001002	\N	36	\N	\N	\N	2026-06-26	active	41	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Mariam	Saleh
40	+97155001003	\N	37	\N	\N	\N	2026-06-26	active	42	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Nadia	Omar
41	+97155001004	\N	38	\N	\N	\N	2026-06-26	active	43	2026-06-26 09:22:22.25723	2026-06-27 01:46:36.481417	\N	\N	f	Tariq	Hassan
\.


--
-- Data for Name: expense_badged; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_badged (exp_bd_id, exp_type_id, amount, user_id, created_at) FROM stdin;
1	1	100.00	1	2026-06-11 08:04:41.746673
\.


--
-- Data for Name: expense_charged_badged; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_charged_badged (exp_ch_bd_id, exp_bd_id, charge_month, description, status, u_br_id, created_at, deleted) FROM stdin;
1	1	2026-06-01	Badged expense	pending	1	2026-06-11 08:04:41.746673	f
\.


--
-- Data for Name: expense_charges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_charges (exp_charge_id, exp_type_id, amount, charge_month, description, status, u_br_id, created_at, created_by, updated_by, deleted) FROM stdin;
1	1	500.00	2026-06-01	Monthly fuel expense	pending	1	2026-06-11 08:04:41.746673	1	\N	f
34	3	1200.00	2026-06-01	The slary month of june	pending	34	2026-06-28 22:53:06.777621	\N	\N	f
\.


--
-- Data for Name: expense_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_payments (exp_payment_id, exp_charge_id, amount, phone, account_id, description, u_br_id, created_at, deleted) FROM stdin;
1	1	500.00	\N	1	Fuel payment	1	2026-06-11 08:04:41.746673	f
\.


--
-- Data for Name: expense_types; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expense_types (exp_type_id, name) FROM stdin;
1	Fuel
2	Maintenance
3	Salary
4	Rent
5	Utilities
6	Insurance
\.


--
-- Data for Name: insurance_providers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.insurance_providers (provider_id, name, contact_phone, rate_percent) FROM stdin;
1	Takaful Insurance	+252611234572	2.50
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.invoices (invoice_id, cargo_id, invoice_number, issue_date, due_date, subtotal, tax_percent, tax_amount, total_amount, status, notes, created_at) FROM stdin;
1	1	INV-50000	2026-06-11	2026-06-18	50.00	0.00	0.00	50.00	unpaid	\N	2026-06-11 08:04:41.746673
34	36	INV-50033	2026-06-22	2026-06-29	10.00	0.00	0.00	10.00	unpaid	\N	2026-06-22 11:59:53.153806
35	37	INV-50034	2026-06-25	2026-07-02	0.00	0.00	0.00	0.00	unpaid	\N	2026-06-25 13:18:32.363502
36	38	INV-50035	2026-06-26	2026-07-03	0.00	0.00	0.00	0.00	unpaid	\N	2026-06-26 11:08:08.745071
37	39	INV-50036	2026-06-26	2026-07-03	350.00	0.00	0.00	350.00	unpaid	\N	2026-06-26 14:17:09.125934
38	40	INV-50037	2026-06-28	2026-07-05	210000.00	0.00	0.00	210000.00	unpaid	\N	2026-06-28 23:09:49.762354
39	41	INV-50038	2026-06-28	2026-07-05	210000.00	0.00	0.00	210000.00	unpaid	\N	2026-06-28 23:12:03.55201
40	42	INV-50039	2026-06-28	2026-07-05	420000000.00	0.00	0.00	420000000.00	unpaid	\N	2026-06-28 23:24:49.137407
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jobs (job_id, job_title, u_br_id, created_at, deleted, job_code, description, min_salary, max_salary, updated_at, created_by) FROM stdin;
1	Logistics Coordinator	1	2026-06-11 08:04:41.746673	f	JOB-0001	\N	\N	\N	2026-06-27 01:54:12.781208	\N
35	Operations Officer	1	2026-06-26 09:22:22.25723	f	JOB-0035	\N	\N	\N	2026-06-27 01:54:12.781208	\N
36	Finance Officer	1	2026-06-26 09:22:22.25723	f	JOB-0036	\N	\N	\N	2026-06-27 01:54:12.781208	\N
37	HR Officer	1	2026-06-26 09:22:22.25723	f	JOB-0037	\N	\N	\N	2026-06-27 01:54:12.781208	\N
38	Customer Service Rep	1	2026-06-26 09:22:22.25723	f	JOB-0038	\N	\N	\N	2026-06-27 01:54:12.781208	\N
\.


--
-- Data for Name: menu_privileges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.menu_privileges (li_pr_id, pr_id, name, href, state, created_at) FROM stdin;
1	2	All Cargo	/cargo/list	active	2026-06-11 08:00:02.113735
2	2	New Cargo	/cargo/create	active	2026-06-11 08:00:02.113735
3	2	Tracking	/cargo/tracking	active	2026-06-11 08:00:02.113735
4	3	Payments	/finance/payments	active	2026-06-11 08:00:02.113735
5	3	Accounts	/finance/accounts	active	2026-06-11 08:00:02.113735
6	3	Expenses	/finance/expenses	active	2026-06-11 08:00:02.113735
7	4	Trips	/transport/trips	active	2026-06-11 08:00:02.113735
8	4	Providers	/transport/providers	active	2026-06-11 08:00:02.113735
9	5	Employees	/hrm/employees	active	2026-06-11 08:00:02.113735
10	5	Salary	/hrm/salary	active	2026-06-11 08:00:02.113735
11	2	All Cargo	/cargo/list	active	2026-06-11 08:04:41.685706
12	2	New Cargo	/cargo/create	active	2026-06-11 08:04:41.685706
13	2	Tracking	/cargo/tracking	active	2026-06-11 08:04:41.685706
14	3	Payments	/finance/payments	active	2026-06-11 08:04:41.685706
15	3	Accounts	/finance/accounts	active	2026-06-11 08:04:41.685706
16	3	Expenses	/finance/expenses	active	2026-06-11 08:04:41.685706
17	4	Trips	/transport/trips	active	2026-06-11 08:04:41.685706
18	4	Providers	/transport/providers	active	2026-06-11 08:04:41.685706
19	5	Employees	/hrm/employees	active	2026-06-11 08:04:41.685706
20	5	Salary	/hrm/salary	active	2026-06-11 08:04:41.685706
\.


--
-- Data for Name: notification_channels; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notification_channels (channel_id, name) FROM stdin;
1	email
2	sms
3	push
4	webhook
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (notification_id, user_id, cargo_id, title, message, channel_id, sent, sent_at, created_at) FROM stdin;
1	1	1	Welcome to Waafi	Your account has been created successfully	1	f	\N	2026-06-11 08:04:41.746673
34	1	36	Cargo Status Update	Your cargo CRG100002 has a new status update.	1	f	\N	2026-06-22 12:01:36.350074
35	3	1	Cargo Status Update	Your cargo CRG100001 has a new status update.	1	f	\N	2026-06-25 13:22:46.51894
36	1	37	Cargo Status Update	Your cargo CRG100003 has a new status update.	1	f	\N	2026-06-25 13:26:59.611213
37	1	37	Cargo Status Update	Your cargo CRG100003 has a new status update.	1	f	\N	2026-06-26 08:39:09.155942
38	1	37	Cargo Status Update	Your cargo CRG100003 has a new status update.	1	f	\N	2026-06-26 08:39:09.285954
39	1	37	Cargo Status Update	Your cargo CRG100003 has a new status update.	1	f	\N	2026-06-26 08:39:09.43642
40	1	37	Cargo Status Update	Your cargo CRG100003 has a new status update.	1	f	\N	2026-06-26 08:39:09.552862
41	38	39	Cargo Status Update	Your cargo CRG100005 has a new status update.	1	f	\N	2026-06-28 09:59:52.329737
42	38	39	Cargo Status Update	Your cargo CRG100005 has a new status update.	1	f	\N	2026-06-28 10:00:41.478089
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (payment_id, cargo_id, account_id, amount, payment_type, u_br_id, created_at, deleted) FROM stdin;
1	1	1	50.00	cash	1	2026-06-11 08:04:41.746673	f
34	36	1	10.00	cash	34	2026-06-25 13:22:46.683549	f
\.


--
-- Data for Name: privileges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.privileges (pr_id, name, icon, state, created_at) FROM stdin;
1	Dashboard	fa-dashboard	active	2026-06-11 08:00:02.112143
2	Cargo Management	fa-box	active	2026-06-11 08:00:02.112143
3	Finance	fa-money	active	2026-06-11 08:00:02.112143
4	Transport	fa-truck	active	2026-06-11 08:00:02.112143
5	HRM	fa-users	active	2026-06-11 08:00:02.112143
6	Settings	fa-cog	active	2026-06-11 08:00:02.112143
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (role_id, role_name, created_at, deleted) FROM stdin;
1	Admin	2026-06-11 08:00:02.092402	f
2	Finance	2026-06-11 08:00:02.092402	f
3	Operations	2026-06-11 08:00:02.092402	f
4	HR	2026-06-11 08:00:02.092402	f
5	Customer	2026-06-11 08:00:02.092402	f
\.


--
-- Data for Name: routes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.routes (route_id, from_branch_id, to_branch_id, distance_km, u_br_id, created_at, created_by, updated_by, deleted) FROM stdin;
1	1	35	5.50	1	2026-06-11 08:04:41.746673	1	\N	f
34	1	37	\N	1	2026-06-27 10:16:58.711709	\N	\N	f
35	35	1	\N	1	2026-06-27 10:16:58.711709	\N	\N	f
36	35	37	\N	1	2026-06-27 10:16:58.711709	\N	\N	f
37	37	1	\N	1	2026-06-27 10:16:58.711709	\N	\N	f
38	37	35	\N	1	2026-06-27 10:16:58.711709	\N	\N	f
\.


--
-- Data for Name: salary; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary (sal_id, emp_id, u_br_id, created_at, deleted) FROM stdin;
1	1	1	2026-06-11 08:04:41.746673	f
\.


--
-- Data for Name: salary_adjustments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_adjustments (adjustment_id, employee_branch_id, month, overtime_hours, overtime_rate, bonus, penalty, notes) FROM stdin;
1	1	2026-06-01	5.00	10.00	100.00	0.00	Overtime and bonus
\.


--
-- Data for Name: salary_charges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_charges (salary_charge_id, employee_branch_id, salary_month, salary_amount, commission, decrease, status, u_br_id, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
1	1	2026-06-01	800.00	0.00	0.00	pending	1	2026-06-11 08:04:41.746673	2026-06-11 08:04:41.746673	1	\N	f
\.


--
-- Data for Name: salary_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_payments (salary_payment_id, salary_charge_id, amount, send_phone, account_id, description, u_br_id, created_at, deleted) FROM stdin;
1	1	800.00	\N	1	Salary payment	1	2026-06-11 08:04:41.746673	f
\.


--
-- Data for Name: salary_tax_brackets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_tax_brackets (bracket_id, min_amount, max_amount, tax_rate) FROM stdin;
1	0.00	500.00	0.00
2	500.01	1000.00	5.00
3	1000.01	2000.00	10.00
4	2000.01	5000.00	15.00
5	5000.01	999999.00	20.00
\.


--
-- Data for Name: salary_type; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_type (sal_t_id, type) FROM stdin;
1	Monthly
2	Daily
3	Hourly
\.


--
-- Data for Name: shift; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.shift (sh_id, shift) FROM stdin;
1	Morning
2	Afternoon
3	Night
\.


--
-- Data for Name: sub_privileges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sub_privileges (sub_pr_id, li_pr_id, name, code, state, created_at) FROM stdin;
1	1	View Cargo	view_cargo	active	2026-06-11 08:04:41.887833
2	1	Create Cargo	create_cargo	active	2026-06-11 08:04:41.887833
3	1	Update Cargo	update_cargo	active	2026-06-11 08:04:41.887833
4	1	Delete Cargo	delete_cargo	active	2026-06-11 08:04:41.887833
5	3	Track Shipment	track_shipment	active	2026-06-11 08:04:41.887833
6	4	View Payments	view_payments	active	2026-06-11 08:04:41.887833
7	4	Make Payment	make_payment	active	2026-06-11 08:04:41.887833
8	5	View Accounts	view_accounts	active	2026-06-11 08:04:41.887833
9	5	Manage Accounts	manage_accounts	active	2026-06-11 08:04:41.887833
10	6	View Expenses	view_expenses	active	2026-06-11 08:04:41.887833
11	6	Manage Expenses	manage_expenses	active	2026-06-11 08:04:41.887833
12	7	View Trips	view_trips	active	2026-06-11 08:04:41.887833
13	7	Create Trip	create_trip	active	2026-06-11 08:04:41.887833
14	8	View Providers	view_providers	active	2026-06-11 08:04:41.887833
15	9	View Employees	view_employees	active	2026-06-11 08:04:41.887833
16	9	Manage Employees	manage_employees	active	2026-06-11 08:04:41.887833
17	10	View Salary	view_salary	active	2026-06-11 08:04:41.887833
18	10	Manage Salary	manage_salary	active	2026-06-11 08:04:41.887833
\.


--
-- Data for Name: system_logs_2025; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_logs_2025 (log_id, user_id, action, table_name, record_id, description, ip_address, log_time) FROM stdin;
\.


--
-- Data for Name: system_logs_2026; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_logs_2026 (log_id, user_id, action, table_name, record_id, description, ip_address, log_time) FROM stdin;
\.


--
-- Data for Name: system_logs_2027; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_logs_2027 (log_id, user_id, action, table_name, record_id, description, ip_address, log_time) FROM stdin;
\.


--
-- Data for Name: system_logs_2028; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_logs_2028 (log_id, user_id, action, table_name, record_id, description, ip_address, log_time) FROM stdin;
\.


--
-- Data for Name: transport_providers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transport_providers (provider_id, name, provider_type, phone, status, created_at, created_by, updated_by, deleted) FROM stdin;
1	Waafi Transport	truck	+252611234570	active	2026-06-11 08:04:41.746673	1	\N	f
34	Tayota	ship	614625062	active	2026-06-23 04:54:33.341793	\N	\N	f
\.


--
-- Data for Name: trip_cargo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.trip_cargo (trip_cargo_id, trip_id, cargo_id, transport_cost, u_br_id, created_at, deleted) FROM stdin;
1	1	1	50.00	1	2026-06-11 08:04:41.746673	f
34	34	1	1.00	34	2026-06-22 11:41:19.768506	f
\.


--
-- Data for Name: trips; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.trips (trip_id, provider_id, route_id, trip_date, departure_time, arrival_time, total_cost, status, u_br_id, created_at, updated_at, created_by, updated_by, deleted, notes) FROM stdin;
1	1	1	2026-06-12	08:00:00	17:00:00	500.00	planned	1	2026-06-11 08:04:41.746673	2026-06-11 08:04:41.746673	1	\N	f	\N
34	1	1	2026-06-24	08:00:00	18:00:00	0.00	cancelled	34	2026-06-22 11:39:13.853201	2026-06-23 04:53:42.070014	1	1	f	test trip
35	1	1	2026-06-27	08:00:00	18:00:00	0.00	completed	34	2026-06-22 11:57:54.60976	2026-06-25 13:28:23.785415	1	1	f	\N
36	1	1	2026-06-27	08:00:00	18:00:00	0.00	completed	34	2026-06-22 11:59:53.274291	2026-06-25 13:28:26.095189	1	1	f	\N
37	34	35	2026-06-30	08:00:00	18:00:00	0.00	planned	39	2026-06-27 11:06:24.747189	2026-06-27 11:06:24.747189	38	38	f	This is new trip to mogadisho
\.


--
-- Data for Name: user_branch; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_branch (u_br_id, u_id, br_id, state, created_at, deleted) FROM stdin;
1	3	1	active	2026-06-11 08:04:41.746673	f
34	1	1	active	2026-06-19 13:04:43.390357	f
36	35	1	active	2026-06-26 09:22:22.25723	f
37	36	1	active	2026-06-26 09:22:22.25723	f
38	37	1	active	2026-06-26 09:22:22.25723	f
39	38	1	active	2026-06-26 09:22:22.25723	f
40	39	35	active	2026-06-26 09:22:22.25723	f
41	40	35	active	2026-06-26 09:22:22.25723	f
42	41	35	active	2026-06-26 09:22:22.25723	f
43	42	35	active	2026-06-26 09:22:22.25723	f
44	36	37	active	2026-06-28 22:55:18.071329	f
35	1	35	active	2026-06-23 10:59:10.116182	f
\.


--
-- Data for Name: user_privilege; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_privilege (u_pr_id, sub_pr_id, u_br_id, granted_by, state, created_at, deleted) FROM stdin;
1	5	1	1	active	2026-06-11 08:04:41.926763	f
2	1	1	1	active	2026-06-11 08:04:41.926763	f
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sessions (session_id, user_id, token_hash, expires_at, ip_address, user_agent, created_at) FROM stdin;
75753b91-fc51-440c-807e-2cf208ae680b	1	test_token_hash_12345	2026-06-18 08:04:41.746673	192.168.1.1	Test Browser	2026-06-11 08:04:41.746673
15c13a91-e3ef-48fc-acce-36897858512e	1	c5f3a1c698d812f7be50c9e3733a7094a69b4ca6e20e51227eead5e3da6ebdd6	2026-06-19 20:55:51.782	::1	node	2026-06-19 12:55:51.784373
db22ca13-a9a3-4155-93e1-e36cec8cfe3e	1	85ea2ca08a4b4946d02e0c08fc988126f0f0596e9920fd8175cbe5c79bd80d56	2026-06-19 21:02:04.319	::1	Mozilla/5.0 (compatible; automated-test)	2026-06-19 13:02:04.320915
bfdad1f6-6ef1-4297-a99b-ab29ae730648	1	5ff698a0052e98e44d2336cb2ef6377e722e853f422b3283174e0ba9dc7d69b5	2026-06-19 21:04:03.05	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-19 13:04:03.051949
235be293-3833-4ec4-947b-9296eb4971fc	1	7202bcdfe318c5f363a5ca5fab8305a31bfa5887cc9c529b7452eed672bf9705	2026-06-22 13:08:05.412	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-22 05:08:05.413761
8d1457c1-d640-4f32-aa51-09ed170a32d2	1	0e2a8cadb34d07dba5f9df82fce9c9c32b7a600b0c27f1474e4193987bec784a	2026-06-22 13:45:35.151	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-22 05:45:35.152731
eb0077ae-13e4-4d92-9daf-0bba32f6b0ba	1	05c229bbfdd7c8a7f73deefe3f279a4933c53492d78db183f03534e1a612578d	2026-06-22 19:39:04.285	::1	curl/8.19.0	2026-06-22 11:39:04.286888
64f60fcc-d19b-4d51-8351-17c457de90bf	1	e07cf02456002ff0af604dbe58c3b29b1d695fb8a770179b167108ef18cd4ca7	2026-06-22 19:39:13.532	::1	curl/8.19.0	2026-06-22 11:39:13.533727
580e4d22-9ec1-4e42-9b8a-b42c8a2c482b	1	f06844c7479c2a3c0ebc61703ce6d006c1cfa3170d29cad099bf409ca82998a6	2026-06-22 19:53:56.104	::1	curl/8.19.0	2026-06-22 11:53:56.105112
b6c9e5f9-21af-40f5-af7e-827a9009df2d	1	dcefefa7582c4dbc98c22930b761d6bbbaa5c42584493164e6fba69035bd2d21	2026-06-22 19:55:15.173	::1	curl/8.19.0	2026-06-22 11:55:15.173473
1435f470-24ce-404d-864e-9cea56a90a79	1	af6778a8182b93ad77aa63af483d67f7ca722f29e61096e0ad9435eced3bdfbc	2026-06-22 19:57:36.111	::1	curl/8.19.0	2026-06-22 11:57:36.112921
e02c12e1-01fa-4861-8d50-89ef7966f22e	1	e50c5a2d6cddac7195f63a45b30b2a193c889a0063ad205f6734d261d2326ca5	2026-06-22 19:57:54.351	::1	curl/8.19.0	2026-06-22 11:57:54.352197
9129810c-9351-46b1-a02e-7b3ce3ee91c9	1	aad7aae7f676ff8a716a8c05137e2a49f79955b06790e300993ab58d2c54950c	2026-06-22 19:58:05.018	::1	curl/8.19.0	2026-06-22 11:58:05.019711
4089b522-13cf-48e3-b669-cb0ba194c68f	1	768a76c8e6e501bc7b10a51809b9e4662587d66bea1e5bcc42c6dd4eb45c1055	2026-06-22 19:58:10.971	::1	curl/8.19.0	2026-06-22 11:58:10.972538
6730f4c2-5fe0-4b20-b501-61a25d217a01	1	4956ab748251446510a27b37ad1ce05ba85ce3f3c6d4c74edd137dee85757c98	2026-06-22 19:59:52.947	::1	curl/8.19.0	2026-06-22 11:59:52.948965
289e2bf0-9afd-4f4e-a113-923596bd6bae	1	be59cceb8c8583d7f25d7b4fe08b63a0d6793fd8ae32f02349cc70ce7f83c27d	2026-06-22 22:48:28.621	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.124.2 Chrome/148.0.7778.97 Electron/42.2.0 Safari/537.36	2026-06-22 14:48:28.622536
168061a7-9f98-4d89-9443-ab6166aa1b87	1	65528e6c09913da1fcaecb22fc6487c958d81d6e8a33fcafd1ecf83aac7fbff9	2026-06-22 22:53:13.711	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.124.2 Chrome/148.0.7778.97 Electron/42.2.0 Safari/537.36	2026-06-22 14:53:13.712577
fb33a8fe-be3d-4c5a-925e-410be0ba1a0b	1	8acaa0bfb706f24a104539a0eecee78ee8b2504067c434dfad545a7b8c4cfdbb	2026-06-22 22:58:11.899	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.124.2 Chrome/148.0.7778.97 Electron/42.2.0 Safari/537.36	2026-06-22 14:58:11.900733
a4b16c37-2875-4170-9d9c-139cde0b8218	1	9db1b546dff80044a52eb6219958ac63539b618f50d7adad8e801cc483dc3a27	2026-06-22 22:58:53.33	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-22 14:58:53.332115
8768e08d-7d89-4a2a-9607-4ce02459f57f	1	39a7122d9ec1f36c2ec6dd988c697ed9b5a441fcc2cd4d763bba73d0753c7689	2026-06-23 12:37:02.429	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-23 04:37:02.431016
50ac07f8-55af-4547-9f27-16d784a1ab4a	1	7d3a93a5be688db1d634a9f70e4683dcb5fd5473376c19ea51e8ad1207f4cbac	2026-06-25 21:14:03.794	::1	curl/8.19.0	2026-06-25 13:14:03.794802
6fb8c8cc-df4a-4ba5-920e-960477c7f8a4	1	a06d8688d9ca88eb95a9fd82d708a9a6eecd254b6e12e57269c0429762f6aa6b	2026-06-26 16:36:27.572	::1	curl/8.19.0	2026-06-26 08:36:27.573489
8246ba3a-6375-40bb-a66f-1c63c51df288	35	b6d8cecd3bdf3e16e3cfbf5cc729d493041ae7cb44335b5627c318db12eff057	2026-06-26 17:23:10.685	::1	curl/8.19.0	2026-06-26 09:23:10.68758
295a66d7-ea6e-498d-ac2e-f5835b545824	36	97df8b41f21739a67318d732d02952837dc949e8e7dfee3a205de5e11522e1cd	2026-06-26 17:23:11.401	::1	curl/8.19.0	2026-06-26 09:23:11.402427
6bca0acf-dc3f-4fd9-9f45-438f07c93e52	41	c9c04c15dbadaeacc92228fbe26400794f1d877ee35584933cfc414bef6c0f4d	2026-06-26 17:23:11.946	::1	curl/8.19.0	2026-06-26 09:23:11.947058
ee48cd33-12df-450c-8072-7aa698bf757c	1	a6be273b28a308c046da9cf9cbe3abe3281eaf97780c367ded595c6f74a8d47b	2026-06-26 17:23:42.862	::1	curl/8.19.0	2026-06-26 09:23:42.863638
1ee6f34e-7843-427e-a460-7f852cb2fc40	1	83722bc7110149c1e3508ceedca53478b3e055fee6c1801f6dae630e720e3907	2026-06-26 17:30:37.721	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:37.722526
d9730f2e-4de6-4cff-86c6-fd224fe556fd	35	1d32121d927419d4cd152dc00562307b7d8a9a7496833e24f15090e304173803	2026-06-26 17:30:48.109	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:48.110632
d37102e0-56af-4dd5-889c-93db103569d1	36	3736a9d6105762383ee670c23531d68986f41599dba261317507f89d454f5f4d	2026-06-26 17:30:48.367	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:48.368496
1e51df79-a376-4bcd-90f5-c74e186b6fbb	37	b1d2af07ddbc6bca8bcc1b961b46795331aebe0a4a5ac1a92022d3edf7e5a490	2026-06-26 17:30:48.652	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:48.653181
f55ca566-6f2c-41db-a633-3988c48b09b1	39	d93e339ad765cfb4427ea30a2b6791839a9f897f410c43d5bd4af7baba11af52	2026-06-26 17:30:48.919	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:48.920588
86b0cbe0-4b77-4fef-b67c-f28f4b1200be	40	4895c1cfdaff76b02bb1918c887ed3af473b29498651f3d9c9555ef95b7e6211	2026-06-26 17:30:49.137	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:49.13819
de2aead6-256c-4ec3-8408-c2d9a2aec96d	41	9a2d8f2a2d26dea622a146f6e0888b4cf8ef8edd3a8bd5c57d9269b1d315ae8b	2026-06-26 17:30:49.374	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:30:49.375349
e9d9f7cd-a614-4a86-8c38-62dedcc23dc2	35	ac81de9dd7434a9a76a1b0592dff44da59a3fb9065b4d5105a36eb04b71479eb	2026-06-26 17:31:17.589	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:31:17.590682
ec62c3e6-2676-4d04-bc2d-cbbb35c0088f	36	8e55fc8cd7267083ddc8fe9db85c9800b23fde6fbf920d0dd39e696a1e37a2b7	2026-06-26 17:31:17.967	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:31:17.968331
f6e2ccec-e053-4406-b90f-7e715b0fdb4c	37	b0bdd137da08cf53a7aa9416f196c8fb3492529ff65b94163c79e15d97e44fb4	2026-06-26 17:31:18.173	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:31:18.174073
a7937aec-65b4-4903-87fb-29e8e74ba834	39	ec8920c3a1d75690d56459467ae4e373d07b7061c2431f98b94d943e832efaa4	2026-06-26 17:31:18.42	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:31:18.421903
a0724564-c527-4b24-9efd-bfaf12b03d6e	41	ac4c626e563c2048b5e7919a67a003bda2f31936ad5e06a566e02ff5068f590e	2026-06-26 17:31:18.657	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:31:18.65785
fb0b1d02-5c5b-4b2a-a8cd-a16fc38bae40	35	667008c8e2f7628355ae50d363f99421d2f1a2d43ebe260aae3a4d87bc88a988	2026-06-26 17:32:38.428	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:32:38.42913
38ef8452-c92a-4a31-a880-2fbf79e8add7	35	3140448b759bab696f72128509f61bdb1f8137c526cd5bd3fdbff3bb4a8537d1	2026-06-26 17:33:55.671	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:33:55.672674
50a43cfe-0e61-45a3-9fac-bc586c95eeb8	36	50c4f52bbddb0c3b7d2278cbe3ad69922584d4408414a23920615a33ed4277f6	2026-06-26 17:33:55.936	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:33:55.93794
0964f1c5-cab5-4a53-9946-d8adf07a9b3a	37	d4024c0855cbc32bb409357c234784458baf583080cef088034d63d3e55514cd	2026-06-26 17:33:56.192	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:33:56.193958
b772e2f7-563d-4264-a767-ff4770413b20	39	5e6fa6c024eb947bbb0b2b75834e419bf00a1896067786d1aad5feb99593f96c	2026-06-26 17:33:56.431	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:33:56.432653
ac27e0f3-6192-4103-8d9d-ce03eec4f253	40	9b930e96d3dad8fe223bfd2104880c7a54b458f26c1f718b0dc087eec90a32e0	2026-06-26 17:33:56.718	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:33:56.7192
31ac7aa7-6d2f-47e8-a01e-17781ca50a91	41	7b76ade206ff96bdd8c2e1eb2c231c7fd7387b0eaecc58112d15ed5bf1bd70e0	2026-06-26 17:33:56.966	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:33:56.967551
0b954c65-e92a-413f-ae2d-a6c08d0a4b71	35	51dc3fb34b680d59bbb0699f364639986f3296144eb530db4e489af41ac179a6	2026-06-26 17:35:24.758	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:35:24.759531
e27e0104-3a37-462e-a00b-dd7c9e1122a6	37	fd8b4b6add97ae0f8c0fe6fe8754285d1e576e98daf35824ac67e0dabdf87666	2026-06-26 17:35:25.08	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:35:25.081283
344c075d-2c70-4891-bebc-38ab00131b98	1	66b3a102ef7f3d588c33b7a4e11964678dbbf665831325119effe5171a5a1d79	2026-06-26 17:36:50.006	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:36:50.007689
3d3a034d-3044-41af-a39e-aa5fff5e5fc2	1	d2ab4b5f246bd83fcfd0cd667c8d60c658d8bc08669cb66fa85202a7e07f4875	2026-06-26 17:37:01.9	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:37:01.900674
a197f894-9a20-4d14-8dc1-cecd94edb7f7	1	93a902318fbb92c1244d213ccb293d1594237bc9cd17e1844b2976e410e14aa5	2026-06-26 17:37:43.444	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 09:37:43.445254
a51f1107-fd14-4cf9-9339-de84fca47700	35	150df88c8ea8c5fb978bc4fa18a5c1f91be80dd4aa37d583349026cc5b3effe1	2026-06-26 18:02:57.229	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:02:57.230145
8ea1f25d-6796-4d05-9a09-810e64c470f4	35	fdc458b1d1edae59c0221015c4f7cef2e60007fd00a207d800a7379c7100b891	2026-06-26 18:03:05.148	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:03:05.14927
939365fc-eadf-4cb7-991a-624d265cf144	35	51809809d67448fc03d642563ac8ff2309eafc545c69e5f4f5704d487f23af98	2026-06-26 18:03:24.4	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:03:24.401707
9eb16dd1-e1a5-467b-82a8-0821c39597fb	36	16af1195e7c49f060fce5d1d9d08256c3e7e97d8db6194879a8df6baf711e94b	2026-06-26 18:03:24.707	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:03:24.708775
c80dcf44-451a-41cd-aaaf-b9de1973e647	39	b8ab1774cd0768f752e03d8ac5416d7e428466cefa8eeaab529c5819fc2cb957	2026-06-26 18:03:25.243	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:03:25.244441
bd8dae1d-5f98-4d59-b93a-fdb9a8c7cec2	40	cd25c433621657a0f1bfad595bbfc7cd41ee357af2734588efeff55b6c66b012	2026-06-26 18:03:25.517	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:03:25.51806
3a781f1f-5b84-4f00-9197-16b6f1eac130	37	68bc47f79fa2f6cec5428d20b9a2911f62fbac55433cb3dcc1a4aef9b954850e	2026-06-26 18:04:58.739	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:04:58.740421
3c1ca31f-76db-45a7-baef-f5bd8e741154	35	21efc2dbd8741b6d80f9d3ca043c3df719871d376bdb906a0140df3f6a138c01	2026-06-26 18:06:10.495	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:10.495667
4fdefe62-816e-41f7-8d55-4b31f6ad2a0b	36	baea65ba926fecc9311680618d93bc866279ecfe8ebca427ecb8cd0ce385c10e	2026-06-26 18:06:10.786	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:10.786698
154d4d21-b82d-4608-a410-46cef8afa428	37	29cffec18552589265e64ab14b7a0f0df93f63030357ecdc786e966410a509f6	2026-06-26 18:06:11.047	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:11.048252
a4f01cc6-05ec-47d8-bd9f-7f0f45a4c8ff	39	42d2686f02db19e800215bcad5bc12cc36913502ae458f90530145752dfdeaa8	2026-06-26 18:06:11.321	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:11.322434
54b79b0b-0606-4411-af1f-eac983fb799d	40	79dbb71ef7f6409d5228ca40250115a271bdbf56c9eb594d548a44a6f8577da4	2026-06-26 18:06:11.591	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:11.591614
c1c3f3d0-ac4e-4418-a976-e832bb52be8c	41	a3edbeb9f1a11a910990aa565cda88fa9f46b6ba412d32d1696a22681f92c8ac	2026-06-26 18:06:11.8	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:11.800771
85b54872-c15f-47c5-b60c-809914ba9f0d	1	7796b6a6dd147fb37d425696315025fd2178d847e85e3a81c46c2c4141cd6a63	2026-06-26 18:06:12.087	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:06:12.088312
af0952d4-fdb9-4ffa-930c-d9814bf5ac59	1	2c4e196bf76c976415205b4cf096e8a4db85aa3acbef61047c149bbd12371cd0	2026-06-26 18:12:52.147	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:12:52.147848
0e6129a2-ba8e-49f2-847b-73bc76b33e65	35	4b38cc885eb2e24721de2b1abf5ab73779865deebde8e8ed22b37d4be34b395b	2026-06-26 18:12:52.456	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:12:52.457047
28f840d9-0d94-4830-86e6-0180fc210a43	36	4c3665b28c20dde8bcdf54814778c2001df45a08f95e6c4eca197a6b90dd32a4	2026-06-26 18:12:52.9	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:12:52.901492
a81b427c-67ac-458c-8495-0aeb60037719	37	665bc8b00dc05b4c9f75339444e704cab577ffc446bf4d544bd17c4fa31dbe5d	2026-06-26 18:12:53.157	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:12:53.157577
0b7ac4ae-c9e1-4530-9c83-e24c9d0fc6d1	1	65d8df3e30122168da8f39e9d8154420492160d01d588ed1b255c09a4b975776	2026-06-26 18:14:32.431	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:14:32.43285
6acfc2ee-0ad4-419b-97e3-d6a8508f3672	35	67872f4c5f27ff6986b3c2a04446325a5a0ce56a74760246d48bf21d2549962f	2026-06-26 18:14:32.657	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:14:32.658456
00ad418b-f653-4f70-8d81-3c456f91312b	36	b751bce9dd0095c06106e44f2e4d625413709a55a369097d603d85f59f272a2b	2026-06-26 18:14:32.908	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:14:32.909824
7309b05a-2d02-4a96-b1e1-91541a2c1496	37	23a10572f14f64c69d928c57337dc1830f12c3464823ff5ed1003ce83ff530e9	2026-06-26 18:14:33.117	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:14:33.119095
eb57d30b-04fa-44dd-9b25-a284979fa0e9	1	40d08df74f4a4e52889b51aaa493139264added464ae65f3347677382a5648de	2026-06-26 18:14:46.618	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:14:46.619757
2446f675-0701-4d34-bca9-3cbc64435efa	1	b34cd35219df32ec05eec555be6ef80ef1b33abe3ed30b60d3f930725e1285ea	2026-06-26 18:15:26.812	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:15:26.814181
78a7d988-42a1-4600-9cff-bfcbf8e5970a	35	295ed099b95b2862d83b1c7e83fbf13e7a6e1c555e3dc186de999eb345fd3f1e	2026-06-26 18:15:27.148	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:15:27.15008
62bc77bb-c7fd-4a04-b4f2-9f2f2ad4b1fa	36	16baa4ff7b86126e3eb63a48c7bed4076d7a86ae23fd4366351d8a39d2ec006c	2026-06-26 18:15:27.395	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:15:27.396934
c0c000a1-44b6-4a81-a5f4-fa22931c010a	37	b999ce0283a69ecf93570f29ca40e5726f08f4e7ff6da1ec2bef4143c198b7a6	2026-06-26 18:15:27.719	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:15:27.721297
8e89a2ad-0217-48d5-b826-ced1621e6e4d	1	a90f9779c0e5bbb5974970bab4fccf215275a5228d4a593f91e36f6457cfa449	2026-06-26 18:15:50.926	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:15:50.926915
9dfe5af2-7d9a-4467-9912-0ed9b304cef4	1	9e11eeae8c0aaa2b2eedf83ef6f430eb2684db1f0d759f7ea4dfc635a093fee6	2026-06-26 18:17:19.97	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:17:19.970386
f20d9b47-284a-47e2-b604-16bd34c7ac26	35	750950e6ff4720293aaeddb1bda0b5f727bb675401fd0605346b7bfe10b3edc5	2026-06-26 18:17:20.248	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:17:20.248785
95c18568-85a2-4369-91c0-fa79050f0a9a	36	809a76c12d66a378350c1188234f84e33859913cd5d3e81636ffe37a231d01fe	2026-06-26 18:17:20.52	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:17:20.520907
d50e064f-9458-410a-b578-d442888759fe	37	0db0f9915c478b1bc3d4ea806ce7e23121d87a3b07c5efaf221ff40aaea38ce9	2026-06-26 18:17:20.755	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:17:20.756096
8314e56c-e2be-4d60-90fd-323cb8cc5e11	1	5de5f917db0252b88347be387dd0b3b34a67359d48c5229306baebf2ab71ad2e	2026-06-26 18:22:13.224	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:22:13.224989
791edea2-48d2-4ad7-b313-d752da07fc36	1	4479c59739f53476adc2831a8a8e692df4d35f2788b442b75a94cf2ccaa44b6c	2026-06-26 18:23:38.9	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:23:38.901352
8ce89583-d10d-45f0-ba8d-1f45e95fa2b5	1	d023e386d56fbe5755f21a4ed97f63a8a67a5d2d77bd08bd42b058ee1fee6343	2026-06-26 18:23:50.694	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:23:50.695075
88316334-db54-4a3e-b493-8cebba190754	1	88d77b0299342d613165f5d16c4e256ef31c6bbb2693b8fa85980ebd83843f90	2026-06-26 18:33:14.603	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:33:14.604115
7d348ce4-36af-490c-9c2d-ebbf78965a41	1	efc076cd2b9bd553dfa6a2d315b9bfb6f64245332408e0a9d97e7333f1717ccd	2026-06-26 18:33:49.957	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:33:49.958138
782a2c96-6b44-4384-bcb9-b3f00bbae9da	35	feced3a753e331afbd3f044feba2fb1aab81d42140cdb143f4362f033c1ec79a	2026-06-26 18:33:50.097	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:33:50.098353
a27095cc-45ed-4cc1-9387-d2d32db4d669	36	fc466cc457dfbbc758f5f8f0c95fe89470f7f96e2db4c4b625448011bc9ae2d3	2026-06-26 18:33:50.211	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:33:50.21203
601fc6c1-6037-44d4-afd8-d1b5313f4f32	37	eea96c937c8ba4cd767d3e070d86617643899aadb1e4aace59cbc0f7eeb3539d	2026-06-26 18:33:50.291	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:33:50.292418
b9fc4c8a-2ded-42df-8508-d378fb387335	1	b2adf8079ec9bb700690fc427b80eb5ed36644dff75f68537092d00906adbf2a	2026-06-26 18:34:23.13	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:34:23.131406
246925f2-c111-4162-a7d1-f4de8b884a11	35	a763ddfc3062b97e5038a4b87a9b0de015b850f7947696051cf1ddc00d1ee990	2026-06-26 18:34:23.28	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:34:23.2811
5750c700-4737-4d09-9455-29dc71166a32	36	5cfa0741d6da3089d2a48cf12341011a8c4e0f8a4f8600d5056be7b7d0798802	2026-06-26 18:34:23.524	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:34:23.525617
33364d92-e467-4b90-92f3-6690e46b64a8	37	d66529ffe04f68f96efef7fc40a1d136d20d0f9278697567a9665bc06a3d1cb0	2026-06-26 18:34:23.619	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 10:34:23.619919
d556df7f-e9d0-4e0d-a958-185fbd3bc968	1	aa0f873c2355faaa8a59315cc20c111dc15cc3df007b97915f52ab403e9dc0ee	2026-06-26 19:00:55.059	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:00:55.060753
e93f1d4d-12f9-4f87-96d4-4cc4c65da504	1	d0bdd8179866f6766d52fee6503665ddf25be7c9f021ccec848a80f486ac15c4	2026-06-26 19:02:29.026	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:02:29.028866
e8030a28-ed3a-4c68-8c62-0c350f119d6b	36	07ee2936eb5ef7a4ae346fef6b83a9457d49a4723ba098d7cecbec67d6ab4f59	2026-06-26 19:02:29.454	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:02:29.456401
592a0853-07a1-4596-bf81-e0710b18d2d2	35	221329ac8be1977d813a2bb5b5ab0a1c2242091a2e8951e204076577f29026e9	2026-06-26 19:02:29.841	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:02:29.84247
2f00e8f9-25c7-4f01-a83a-38a11552caea	37	0637dd35923cfd63e95f57d52d36880ab998c258da42b62a8a78174156654482	2026-06-26 19:02:30.151	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:02:30.152813
c28876bb-8dae-4dda-b1f5-b85bf7582b7d	3	efd616e08db277012620945d0769290faa9ef86b70cfc242e679989a5eebe17f	2026-06-26 19:02:30.517	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:02:30.518868
ec7ab4b0-9d07-4689-8821-5edd5d768849	36	0422a95e022f394e2c8710e10ce258ff0c7dae9747d616a75d89fdebcb57bb96	2026-06-26 19:02:45.088	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:02:45.090048
66ecd88b-9d79-44d0-a76a-bc9eb5503820	36	666797c2a860052448f9c080e7e466e6e6b80fb7ebfc140fed25dad5957ac2ac	2026-06-26 19:03:37.25	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:03:37.251374
9ec7c98e-e568-48c6-9ff9-e5d823a4f2db	36	9fbc1a1436ef6e4549924b1922a717487fc5b0cc2fdf6dfd4c6a3da21c47e0f7	2026-06-26 19:04:50.186	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:04:50.188241
e282685f-5475-4117-8bdb-46544a22e022	1	830c951945ef6119a07adc38da2257cdb0053f8665fda1ef3049510592acaad2	2026-06-26 19:05:11.103	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:11.104581
79dfaa25-625e-4f61-a06e-a3ecb01c5e87	36	a253e4cd70ce32f7b4b34c94b7e050ab3b9d525d75a37da2d48f2a5526543ae2	2026-06-26 19:05:11.485	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:11.486691
ef3b7a43-d6a0-4fe1-bd9c-e40eac9b4696	35	708f41c9517d58fe80185670ef7b40dea48f17f0daf9cd802e5758745ea5c18f	2026-06-26 19:05:11.84	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:11.841581
70b74b43-d025-400f-a35b-c9bdb4788ace	37	d549214fee9b04eea1c62d725373ca5f6606c1ef4c873315f132934918919154	2026-06-26 19:05:12.139	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:12.140563
724c88b5-2346-479b-bdf6-bcad7ce6674b	3	52ce315ed4bc390c43edbb91857d82350f421e7f236c2ff97d776ade9015e197	2026-06-26 19:05:12.483	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:12.485217
32b86dab-5341-4af5-a26e-bb79cd865999	39	6f586235fb51b9a7afb78a6622b3d23110722dcb6171ca5320a1e3e8e25b7651	2026-06-26 19:05:12.781	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:12.782502
cc65264c-ea93-45d1-aa25-025c2999fb64	1	646b904836b7c23dcd81dead8bffd5bad0cb60e8441cf18d9cb8c1ac95ca3f4e	2026-06-26 19:05:55.353	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:55.355276
06d440df-c562-46ad-804a-a41c9ef5d15d	36	79041b8477e2bf62f1c6f8c95f32247a83c2f9fbca4b5a94cf78446c21cffec7	2026-06-26 19:05:55.639	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:55.640495
35be4f3c-697a-4c4e-854f-fc38b6368f94	39	89aa491c6a425f3bd12fdfc63ff95fe08237c71b7f31425e9cbcadcc10aa9354	2026-06-26 19:05:56.005	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:05:56.006851
8b02a263-5ea2-464d-b195-380ac5aec251	36	4b3f84bc721b79607ef1ff02f91200d03017f2f12a27667197b343358470da68	2026-06-26 19:06:22.187	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:06:22.190006
2f5a0df4-fa68-465a-aab8-18b58c7616e3	36	64da333bba81c44483687a2553c0541a7de329918e48d2ded0ff28e7d19df177	2026-06-26 19:08:08.166	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:08.167086
c13fcc14-4aa7-49d4-88ea-85340e9e01a7	39	fc46e3614ce46a68cf4fd726e679d99e3eebc7bb535f7d9e50618caccb332844	2026-06-26 19:08:08.544	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:08.544706
94a1c49a-bdb2-4472-b01b-107b942ffb14	1	13f41a2d37264d55a0acf6f93089a786abe79fb6b00094e28289e024a0513718	2026-06-26 19:08:09.107	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:09.107543
64bfcd0a-d06d-448c-85bb-d05cc5cf61c7	1	c290015fbeb3ca9d8f122b1f895336d9fdc4ce733f4b9ebdbb0fae8a804cb36e	2026-06-26 19:08:43.083	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:43.08377
4ff5c1f5-a8d0-4a15-8d4d-17c3bee1d79c	36	4b92e8f2cc441d98f5dbefa9273cf9b2bb41a2ffe1d192a16070d7ac4977b71a	2026-06-26 19:08:43.41	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:43.41045
14d6dc97-d55e-443d-8435-095c064185e4	39	fd817d942b781a14fb47c693b42f2adc34d4bd005926688afb858451c142e5c9	2026-06-26 19:08:43.707	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:43.708238
df58cce6-bf6c-42f6-8e07-761220a34454	37	f1fd4a44059ccd5e30bcdf191d0b63edd0f046f9a85b7bfaa2a88de698589a17	2026-06-26 19:08:43.999	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:08:44.000056
c8c7a493-2b00-407e-80ef-ce916cbe413d	36	9a0637b3458a65ee2a8502809182c9b9b4f22592ccfdbeb9991fef602d90facf	2026-06-26 19:15:45.358	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:45.359967
9e9c38a0-5769-49ee-97e8-d82cab5d1363	35	b8b772dcc01fb3a80247977f46b40ab7889fd5dd3b671c29f415c854cc5746d8	2026-06-26 19:15:45.743	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:45.745131
58aa29a5-a5bd-42c4-b7fd-f9fa22c2eaed	37	976d01fa8717bbf5003a312197ccc0bc23e7095383a1ee256b85efb439fc6e58	2026-06-26 19:15:46.167	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:46.168937
7638e010-ce8b-4914-bf26-0081c33c76dc	3	fe7c7a6541461309ef194874e37e7f82730124aa0cceb428cf0a0e55a99b66ce	2026-06-26 19:15:46.45	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:46.452652
61a52a5a-8f4c-4761-bca1-b28e24e686ae	40	cbb1770fc4debda2c9933189278b6ddc5c5f3c207149dd6cc993f1f5123aab82	2026-06-26 19:15:46.799	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:46.801177
b86b77af-ee8b-4732-8b29-2eb76c0b38f2	39	5c463082436df9a4bcf462e4aa21baec38b994912833afffe66bdf47c7624988	2026-06-26 19:15:47.073	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:47.074629
5069944a-20ab-4a8c-bf68-48d650e0d0ed	41	678fa75bbc505eca703b65cc1bf272c7cb15131da1adf63112154dda7d83f30d	2026-06-26 19:15:47.423	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:15:47.425007
a87433c4-b52e-4bba-bb7e-705df9d891b4	38	778fc7b169728ccb3bcf6baa24fd35944aef497c1cbc6e26bdc4d31499a3c88f	2026-06-26 19:16:50.172	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:16:50.173468
6db054c7-280c-4dd9-be37-185a7983baa0	42	06cf8d9a02b717caf552ae231fc0b8fbabe1a3c7804c2d0aba3ffa83af6eec20	2026-06-26 19:16:50.546	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-26 11:16:50.54682
68cd1427-1421-42bf-8119-32b85f4cf9cf	36	5f618ce1a21a9a621263d5f0e368820c47a43aaf25f6541873b4a722b79b1fa2	2026-06-26 19:17:48.765	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-26 11:17:48.766607
7318de93-980e-4c6d-95eb-99a0f0fb938f	1	aa2a385494163c579f5efaf7046ccf9f43694fc27d344259164506beb9da77e5	2026-06-26 19:27:38.207	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-26 11:27:38.209618
be8f26ac-53b2-411a-9c20-34e3a81325a0	3	346d3e764bcc43a11fe73537d2a4d929682f9f0b86d2d89c5c996e1604f0471e	2026-06-26 19:42:21.71	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-26 11:42:21.71116
11aebef4-89f7-4556-96bc-38f4d0eeabc8	3	1778f9e6036b727222b1eb83cc310c32820984b0fd8c30134e494fb9ef75cf51	2026-06-26 19:42:48.043	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-26 11:42:48.044427
bb78e6f6-c1fa-4f42-88fa-13b04117888c	3	c5b2dbce2e8c05563b586a500f6e715ca141e27c106dd678c3a265cb69bdf36d	2026-06-26 19:42:59.569	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-26 11:42:59.570022
598e1301-2714-4812-8aa6-102c03705ac0	38	92313bab88912f64a3497f89fc46a2e76c09c85c687dad9947709301820e6122	2026-06-26 21:56:22.295	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-26 13:56:22.296698
1ff2d941-210c-4f05-98a1-c9e2859986dd	1	ea4272bf6ac7428bca6c53596d2f3f63bbb5555dbdb4fcb83170b4e327987b5a	2026-06-27 08:34:23.315	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-27 00:34:23.316173
d8e6f06e-b442-424a-accf-e1b1bb84a568	1	152a1b7f334d8f95b827c6758edb686e6596f9dad6d0d63405379ca6993615c0	2026-06-27 09:48:05.536	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:48:05.537591
9479bbc7-7b1c-4325-b425-62c3f350c03b	1	fbe641201af23c5733ee896d867462650fa2fd7af8816655314fb348e9510448	2026-06-27 09:48:21.866	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:48:21.866956
7ac5dadf-40e3-4790-aba1-be3e0197b3ad	1	65a9c9603aaf7978a9e5ed68e5b5e831a35f564ab8a7fa6fdec32b69ca532774	2026-06-27 09:48:31.402	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:48:31.402731
97e41c13-dd3e-43bc-ace5-2dd5ce282a21	1	5c112d83b251757585520f96a95ceaacc9b8b3e3d3480a899d386bdff5f4370d	2026-06-27 09:48:43.822	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:48:43.823441
611836c2-6b75-4574-ad60-f02796860048	1	52a14cc317adf87c1e01ac975244fe9df45dfa98cbec3d1d5abb74b316f1d358	2026-06-27 09:51:10.631	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:51:10.632175
b274f2c6-ce05-4254-84c2-34e5ad959299	1	c86003390cd4f0f263103aa853dd67260d09a92cc01af584e9b1fbb3fbebaabf	2026-06-27 09:52:05.536	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:52:05.537313
01d7ce5c-9abe-403a-87ec-766a1a32f710	1	a162ffca1fc4aca8e0b5a8cc43f0b9f6081ee2dadceabc92f71422de3e62f576	2026-06-27 09:53:29.852	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:53:29.852846
b2755d54-6a35-4de1-9949-eaab9119818a	1	17186f28d4fd738d6f5cd3f41b6e43efbefb46ae277979632e4d065721884863	2026-06-27 09:54:31.366	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 01:54:31.367289
99712108-97ae-4db4-be1d-6e6feaaa94f5	1	e9908cb8aca0765137fb6fe11caf276f68d484f40e86bf0d70802172dcd7cf4a	2026-06-27 11:05:26	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:05:26.001666
c07fdbc8-c42a-44d4-b5eb-46165a8e23f4	1	2946db52c040370b8c71cde72dd79219a7d83c7aac390fa8b364132eb20bb217	2026-06-27 11:05:40.128	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:05:40.129818
0aa4a407-8bbe-424f-8d9b-654eaca99c64	1	e2fd261826cd83dc7f2dcca862d62afe8cad58f7cbb10b9fd43f55f0382a3ac0	2026-06-27 11:05:47.869	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:05:47.87067
34ace71e-5fa2-47da-9401-cbf6935e2a8a	1	277e5b21b9c586954cc6bf1fec2f99b44101969419d1ba147905dde8f6342bea	2026-06-27 11:06:06.533	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:06:06.534487
6abe01f0-b74d-402b-a18a-f32a0181ab74	1	543231546655577f9f9fd6df46980c79458c8e5c73d2c96576462c8a3e2f4420	2026-06-27 11:06:20.256	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:06:20.257719
54c9a561-43a8-4647-b188-c0c73f66ec28	1	822f1ab7759db38a3e47f3a0299ed6cabc5b26d196e2bd55ad1f73755e1c964a	2026-06-27 11:07:00.399	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:07:00.399611
78e792b2-0378-465c-9e3d-fb5bd1f18ae3	1	6bc9993e54d02f9981e8dc18d0954e72385b708c370937cc0c89e248f17aa1b8	2026-06-27 11:08:14.982	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:08:14.983185
7d431129-ce6e-4d01-a337-9193513f7a8c	1	e0600ed7bf14ddc9ece07d3d5189eacca3476657532c6ed1ff10d5788d8fc90b	2026-06-27 11:09:41.303	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:09:41.30399
24c89837-0e7b-4308-8f75-ebe03357a40e	1	c563d787ca33c89f91530dabf82efc77d31f5ae11b4c1f38fa484ce638922bb1	2026-06-27 11:09:55.894	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:09:55.895063
681fcee4-ffca-443a-9c0d-2ade9129f3c1	1	7f0237b3806106690c15e70394bbabc42c677a4957124b3c36c08403038e0984	2026-06-27 11:11:48.23	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:11:48.231485
168a835b-be90-4ac9-a436-c0dab855bf97	1	a6049c728c9df78206a0f4dc3f8b2b35eb329d136d18e9f6315f360160131cde	2026-06-27 11:27:55.815	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-27 03:27:55.816244
d545120d-0066-4593-93c1-3a10d27141bf	1	f356e9f5ade65b81f9a92fc6adfdae477c639d8e7fbb4aeaafa34b3e3af26f60	2026-06-27 19:06:40.33	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-27 11:06:40.332159
e294dae5-a44a-47ec-90a5-83058829d361	40	e4f59a66b4080430280fd3e155753679be45a85b84dec29751f12abbd5f354e6	2026-06-28 17:50:26.047	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-28 09:50:26.047876
3d7ec656-237a-4b39-9a77-78bbac075335	1	f9892cbe9bccc9a1d050e630150fce517f5a53b732177ded80d31cba3415d924	2026-06-29 06:36:54.334	::1	curl/8.19.0	2026-06-28 22:36:54.334877
a930bbae-62e7-4492-a7f6-c51901772f6c	1	b4f5b531ef93506a8e0d00c296977bc9436dea1b9baadbf934b273deb680e88b	2026-06-29 06:37:24.3	::1	curl/8.19.0	2026-06-28 22:37:24.30168
3ad12b4a-60ac-4622-8cf1-8ab8918bb935	1	112e0d231b23ca0a3a31a4786b87c11a5e329c1682c629a4c40bccaa7a2339db	2026-06-29 06:37:51.319	::1	curl/8.19.0	2026-06-28 22:37:51.320032
326b43d2-1771-40e4-9660-8a1a8d90eb2f	1	56e2a94720b8918f6f1f2fb6df99656571bed617c430c0dbc4f3a479734b26b6	2026-06-29 06:46:43.91	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-28 22:46:43.912746
3a6c6133-1299-4085-841d-33f87949cc97	1	a7010934e40b66c961be57653d2ea06ab28a8ba282711c9b29fb952887892133	2026-06-29 06:47:50.153	::1	Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.26100.8655	2026-06-28 22:47:50.154161
8973d71a-45b3-4c6b-bd71-a04868c7595d	1	4d83c7abbfb37de4a06d068c1f52b4fbc820155d3525b45173eb338d0f2e9033	2026-06-29 07:13:44.993	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	2026-06-28 23:13:44.994028
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (u_id, external_id, name, username, password_hash, phone, role_id, state, created_at, updated_at, created_by, updated_by, deleted) FROM stdin;
1	\N	System Admin	admin	$2a$10$dwyuncFF9PpbsVYObw3wJuhJ76plCfXnWfhAFFQm58TdZEzzVzFrG	\N	1	active	2026-06-11 08:00:02.120175	2026-06-19 12:55:51.600248	1	1	f
36	\N	Faadumo Warsame	fin_mgq	$2a$10$N6pUa0WyoLNJJyeBR3Qu2.UkpfKzicwhdhABd15uLp802vlcIR1f2	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 09:22:22.25723	\N	\N	f
40	\N	Mariam Saleh	fin_dxb	$2a$10$N6pUa0WyoLNJJyeBR3Qu2.UkpfKzicwhdhABd15uLp802vlcIR1f2	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 09:22:22.25723	\N	\N	f
3	\N	Test User	testuser	$2a$10$rVq7hGqoWFPQImkxjigYk.DLizeehvrLP0t66zX.dM20xgHsM8zxC	+252611234568	2	active	2026-06-11 08:04:41.746673	2026-06-26 10:52:10.157177	1	1	f
35	\N	Ahmed Hassan	ops_mgq	$2a$10$xtlUWN2zjhCOB15dcQqbguG50NHW2jBi2G1WXomppZwq54vnWNnaS	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 10:52:10.157177	\N	\N	f
37	\N	Hodan Abdi	hr_mgq	$2a$10$K6GHufb/2JhsCCqOX1EMmOctkRGcGVdndlTjiSr9aczyG/EyMgXXG	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 10:52:10.157177	\N	\N	f
39	\N	Khalid Al-Rashid	ops_dxb	$2a$10$xtlUWN2zjhCOB15dcQqbguG50NHW2jBi2G1WXomppZwq54vnWNnaS	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 10:52:10.157177	\N	\N	f
41	\N	Nadia Omar	hr_dxb	$2a$10$K6GHufb/2JhsCCqOX1EMmOctkRGcGVdndlTjiSr9aczyG/EyMgXXG	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 10:52:10.157177	\N	\N	f
38	\N	Bile Mohamed	cs_mgq	$2a$10$dx3PK2G4Q8oUhHm2oL5N2uqqvwqv.NBD/QSCoKhLX7P7MZgh8PBhC	\N	2	active	2026-06-26 09:22:22.25723	2026-06-26 11:16:27.507208	\N	\N	f
42	\N	Tariq Hassan	cs_dxb	$2a$10$dx3PK2G4Q8oUhHm2oL5N2uqqvwqv.NBD/QSCoKhLX7P7MZgh8PBhC	\N	4	active	2026-06-26 09:22:22.25723	2026-06-27 03:25:24.393407	\N	\N	f
\.


--
-- Name: accounts_account_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.accounts_account_id_seq', 33, true);


--
-- Name: accounts_transfer_acc_tr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.accounts_transfer_acc_tr_id_seq', 33, true);


--
-- Name: address_add_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.address_add_id_seq', 38, true);


--
-- Name: api_logs_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.api_logs_log_id_seq', 2870, true);


--
-- Name: branch_br_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.branch_br_id_seq', 37, true);


--
-- Name: cargo_cargo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_cargo_id_seq', 42, true);


--
-- Name: cargo_charges_charge_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_charges_charge_id_seq', 1, false);


--
-- Name: cargo_history_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_history_history_id_seq', 44, true);


--
-- Name: cargo_insurance_insurance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_insurance_insurance_id_seq', 34, true);


--
-- Name: cargo_items_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_items_item_id_seq', 40, true);


--
-- Name: cargo_status_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_status_status_id_seq', 42, true);


--
-- Name: cargo_tracking_track_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cargo_tracking_track_id_seq', 51, true);


--
-- Name: cities_city_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cities_city_id_seq', 608, true);


--
-- Name: customers_customer_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_customer_id_seq', 51, true);


--
-- Name: days_day_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.days_day_id_seq', 40, true);


--
-- Name: dispute_types_dispute_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dispute_types_dispute_type_id_seq', 38, true);


--
-- Name: disputes_dispute_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.disputes_dispute_id_seq', 33, true);


--
-- Name: employee_attendance_emp_att_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employee_attendance_emp_att_id_seq', 76, true);


--
-- Name: employee_branch_employee_branch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employee_branch_employee_branch_id_seq', 45, true);


--
-- Name: employee_schedule_emp_sch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employee_schedule_emp_sch_id_seq', 108, true);


--
-- Name: employee_type_emp_t_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employee_type_emp_t_id_seq', 37, true);


--
-- Name: employees_employee_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_employee_id_seq', 41, true);


--
-- Name: expense_badged_exp_bd_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_badged_exp_bd_id_seq', 33, true);


--
-- Name: expense_charged_badged_exp_ch_bd_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_charged_badged_exp_ch_bd_id_seq', 33, true);


--
-- Name: expense_charges_exp_charge_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_charges_exp_charge_id_seq', 34, true);


--
-- Name: expense_payments_exp_payment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_payments_exp_payment_id_seq', 36, true);


--
-- Name: expense_types_exp_type_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expense_types_exp_type_id_seq', 39, true);


--
-- Name: insurance_providers_provider_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.insurance_providers_provider_id_seq', 33, true);


--
-- Name: invoices_invoice_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_invoice_id_seq', 40, true);


--
-- Name: jobs_job_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.jobs_job_id_seq', 38, true);


--
-- Name: menu_privileges_li_pr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.menu_privileges_li_pr_id_seq', 43, true);


--
-- Name: notification_channels_channel_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notification_channels_channel_id_seq', 37, true);


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_notification_id_seq', 42, true);


--
-- Name: payments_payment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payments_payment_id_seq', 34, true);


--
-- Name: privileges_pr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.privileges_pr_id_seq', 39, true);


--
-- Name: roles_role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_role_id_seq', 38, true);


--
-- Name: routes_route_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.routes_route_id_seq', 38, true);


--
-- Name: salary_adjustments_adjustment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_adjustments_adjustment_id_seq', 33, true);


--
-- Name: salary_charges_salary_charge_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_charges_salary_charge_id_seq', 33, true);


--
-- Name: salary_payments_salary_payment_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_payments_salary_payment_id_seq', 33, true);


--
-- Name: salary_sal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_sal_id_seq', 33, true);


--
-- Name: salary_tax_brackets_bracket_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_tax_brackets_bracket_id_seq', 38, true);


--
-- Name: salary_type_sal_t_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_type_sal_t_id_seq', 36, true);


--
-- Name: seq_invoice_no; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.seq_invoice_no', 50039, true);


--
-- Name: seq_tracking_no; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.seq_tracking_no', 100008, true);


--
-- Name: seq_trip_no; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.seq_trip_no', 1000, false);


--
-- Name: shift_sh_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shift_sh_id_seq', 36, true);


--
-- Name: sub_privileges_sub_pr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.sub_privileges_sub_pr_id_seq', 33, true);


--
-- Name: system_logs_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_logs_log_id_seq', 1, false);


--
-- Name: transport_providers_provider_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transport_providers_provider_id_seq', 34, true);


--
-- Name: trip_cargo_trip_cargo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.trip_cargo_trip_cargo_id_seq', 34, true);


--
-- Name: trips_trip_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.trips_trip_id_seq', 37, true);


--
-- Name: user_branch_u_br_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_branch_u_br_id_seq', 45, true);


--
-- Name: user_privilege_u_pr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_privilege_u_pr_id_seq', 33, true);


--
-- Name: users_u_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_u_id_seq', 42, true);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (account_id);


--
-- Name: accounts_transfer accounts_transfer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_transfer
    ADD CONSTRAINT accounts_transfer_pkey PRIMARY KEY (acc_tr_id);


--
-- Name: address address_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT address_pkey PRIMARY KEY (add_id);


--
-- Name: api_logs api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_pkey PRIMARY KEY (log_id);


--
-- Name: branch branch_branch_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT branch_branch_name_key UNIQUE (branch_name);


--
-- Name: branch branch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT branch_pkey PRIMARY KEY (br_id);


--
-- Name: cargo_charges cargo_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_charges
    ADD CONSTRAINT cargo_charges_pkey PRIMARY KEY (charge_id);


--
-- Name: cargo_history cargo_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history
    ADD CONSTRAINT cargo_history_pkey PRIMARY KEY (history_id, created_at);


--
-- Name: cargo_history_2025 cargo_history_2025_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history_2025
    ADD CONSTRAINT cargo_history_2025_pkey PRIMARY KEY (history_id, created_at);


--
-- Name: cargo_history_2026 cargo_history_2026_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history_2026
    ADD CONSTRAINT cargo_history_2026_pkey PRIMARY KEY (history_id, created_at);


--
-- Name: cargo_history_2027 cargo_history_2027_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history_2027
    ADD CONSTRAINT cargo_history_2027_pkey PRIMARY KEY (history_id, created_at);


--
-- Name: cargo_history_2028 cargo_history_2028_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_history_2028
    ADD CONSTRAINT cargo_history_2028_pkey PRIMARY KEY (history_id, created_at);


--
-- Name: cargo_insurance cargo_insurance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_insurance
    ADD CONSTRAINT cargo_insurance_pkey PRIMARY KEY (insurance_id);


--
-- Name: cargo_items cargo_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_items
    ADD CONSTRAINT cargo_items_pkey PRIMARY KEY (item_id);


--
-- Name: cargo cargo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_pkey PRIMARY KEY (cargo_id);


--
-- Name: cargo_status cargo_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_status
    ADD CONSTRAINT cargo_status_pkey PRIMARY KEY (status_id);


--
-- Name: cargo_status cargo_status_status_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_status
    ADD CONSTRAINT cargo_status_status_name_key UNIQUE (status_name);


--
-- Name: cargo_tracking cargo_tracking_cargo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_tracking
    ADD CONSTRAINT cargo_tracking_cargo_id_key UNIQUE (cargo_id);


--
-- Name: cargo cargo_tracking_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_tracking_no_key UNIQUE (tracking_no);


--
-- Name: cargo_tracking cargo_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_tracking
    ADD CONSTRAINT cargo_tracking_pkey PRIMARY KEY (track_id);


--
-- Name: cities cities_city_name_state_region_country_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_city_name_state_region_country_key UNIQUE (city_name, state_region, country);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (city_id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (customer_id);


--
-- Name: days days_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.days
    ADD CONSTRAINT days_code_unique UNIQUE (code);


--
-- Name: days days_day_of_week_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.days
    ADD CONSTRAINT days_day_of_week_unique UNIQUE (day_of_week);


--
-- Name: days days_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.days
    ADD CONSTRAINT days_name_key UNIQUE (name);


--
-- Name: days days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.days
    ADD CONSTRAINT days_pkey PRIMARY KEY (day_id);


--
-- Name: dispute_types dispute_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_types
    ADD CONSTRAINT dispute_types_name_key UNIQUE (name);


--
-- Name: dispute_types dispute_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_types
    ADD CONSTRAINT dispute_types_pkey PRIMARY KEY (dispute_type_id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (dispute_id);


--
-- Name: employee_attendance employee_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance
    ADD CONSTRAINT employee_attendance_pkey PRIMARY KEY (emp_att_id);


--
-- Name: employee_branch employee_branch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch
    ADD CONSTRAINT employee_branch_pkey PRIMARY KEY (employee_branch_id);


--
-- Name: employee_schedule employee_schedule_emp_id_day_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_schedule
    ADD CONSTRAINT employee_schedule_emp_id_day_id_key UNIQUE (emp_id, day_id);


--
-- Name: employee_schedule employee_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_schedule
    ADD CONSTRAINT employee_schedule_pkey PRIMARY KEY (emp_sch_id);


--
-- Name: employee_type employee_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_type
    ADD CONSTRAINT employee_type_pkey PRIMARY KEY (emp_t_id);


--
-- Name: employee_type employee_type_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_type
    ADD CONSTRAINT employee_type_type_key UNIQUE (type);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (employee_id);


--
-- Name: expense_badged expense_badged_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_badged
    ADD CONSTRAINT expense_badged_pkey PRIMARY KEY (exp_bd_id);


--
-- Name: expense_charged_badged expense_charged_badged_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charged_badged
    ADD CONSTRAINT expense_charged_badged_pkey PRIMARY KEY (exp_ch_bd_id);


--
-- Name: expense_charges expense_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charges
    ADD CONSTRAINT expense_charges_pkey PRIMARY KEY (exp_charge_id);


--
-- Name: expense_payments expense_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_pkey PRIMARY KEY (exp_payment_id);


--
-- Name: expense_types expense_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_types
    ADD CONSTRAINT expense_types_name_key UNIQUE (name);


--
-- Name: expense_types expense_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_types
    ADD CONSTRAINT expense_types_pkey PRIMARY KEY (exp_type_id);


--
-- Name: insurance_providers insurance_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_providers
    ADD CONSTRAINT insurance_providers_pkey PRIMARY KEY (provider_id);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (invoice_id);


--
-- Name: jobs jobs_job_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_job_code_unique UNIQUE (job_code);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (job_id);


--
-- Name: menu_privileges menu_privileges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_privileges
    ADD CONSTRAINT menu_privileges_pkey PRIMARY KEY (li_pr_id);


--
-- Name: notification_channels notification_channels_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channels
    ADD CONSTRAINT notification_channels_name_key UNIQUE (name);


--
-- Name: notification_channels notification_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channels
    ADD CONSTRAINT notification_channels_pkey PRIMARY KEY (channel_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (payment_id);


--
-- Name: privileges privileges_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privileges
    ADD CONSTRAINT privileges_name_key UNIQUE (name);


--
-- Name: privileges privileges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privileges
    ADD CONSTRAINT privileges_pkey PRIMARY KEY (pr_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role_id);


--
-- Name: roles roles_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_role_name_key UNIQUE (role_name);


--
-- Name: routes routes_from_branch_id_to_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_from_branch_id_to_branch_id_key UNIQUE (from_branch_id, to_branch_id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (route_id);


--
-- Name: salary_adjustments salary_adjustments_employee_branch_id_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_employee_branch_id_month_key UNIQUE (employee_branch_id, month);


--
-- Name: salary_adjustments salary_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_pkey PRIMARY KEY (adjustment_id);


--
-- Name: salary_charges salary_charges_employee_branch_id_salary_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_charges
    ADD CONSTRAINT salary_charges_employee_branch_id_salary_month_key UNIQUE (employee_branch_id, salary_month);


--
-- Name: salary_charges salary_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_charges
    ADD CONSTRAINT salary_charges_pkey PRIMARY KEY (salary_charge_id);


--
-- Name: salary salary_emp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary
    ADD CONSTRAINT salary_emp_id_key UNIQUE (emp_id);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (salary_payment_id);


--
-- Name: salary salary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary
    ADD CONSTRAINT salary_pkey PRIMARY KEY (sal_id);


--
-- Name: salary_tax_brackets salary_tax_brackets_min_amount_max_amount_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_tax_brackets
    ADD CONSTRAINT salary_tax_brackets_min_amount_max_amount_key UNIQUE (min_amount, max_amount);


--
-- Name: salary_tax_brackets salary_tax_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_tax_brackets
    ADD CONSTRAINT salary_tax_brackets_pkey PRIMARY KEY (bracket_id);


--
-- Name: salary_type salary_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_type
    ADD CONSTRAINT salary_type_pkey PRIMARY KEY (sal_t_id);


--
-- Name: salary_type salary_type_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_type
    ADD CONSTRAINT salary_type_type_key UNIQUE (type);


--
-- Name: shift shift_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift
    ADD CONSTRAINT shift_pkey PRIMARY KEY (sh_id);


--
-- Name: shift shift_shift_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift
    ADD CONSTRAINT shift_shift_key UNIQUE (shift);


--
-- Name: sub_privileges sub_privileges_li_pr_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_privileges
    ADD CONSTRAINT sub_privileges_li_pr_id_name_key UNIQUE (li_pr_id, name);


--
-- Name: sub_privileges sub_privileges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_privileges
    ADD CONSTRAINT sub_privileges_pkey PRIMARY KEY (sub_pr_id);


--
-- Name: system_logs system_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs
    ADD CONSTRAINT system_logs_pkey PRIMARY KEY (log_id, log_time);


--
-- Name: system_logs_2025 system_logs_2025_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs_2025
    ADD CONSTRAINT system_logs_2025_pkey PRIMARY KEY (log_id, log_time);


--
-- Name: system_logs_2026 system_logs_2026_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs_2026
    ADD CONSTRAINT system_logs_2026_pkey PRIMARY KEY (log_id, log_time);


--
-- Name: system_logs_2027 system_logs_2027_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs_2027
    ADD CONSTRAINT system_logs_2027_pkey PRIMARY KEY (log_id, log_time);


--
-- Name: system_logs_2028 system_logs_2028_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_logs_2028
    ADD CONSTRAINT system_logs_2028_pkey PRIMARY KEY (log_id, log_time);


--
-- Name: transport_providers transport_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_providers
    ADD CONSTRAINT transport_providers_pkey PRIMARY KEY (provider_id);


--
-- Name: trip_cargo trip_cargo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_cargo
    ADD CONSTRAINT trip_cargo_pkey PRIMARY KEY (trip_cargo_id);


--
-- Name: trip_cargo trip_cargo_trip_id_cargo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_cargo
    ADD CONSTRAINT trip_cargo_trip_id_cargo_id_key UNIQUE (trip_id, cargo_id);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (trip_id);


--
-- Name: employee_attendance uq_attendance_emp_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance
    ADD CONSTRAINT uq_attendance_emp_date UNIQUE (employee_id, attendance_date);


--
-- Name: employee_schedule uq_employee_schedule_emp_day; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_schedule
    ADD CONSTRAINT uq_employee_schedule_emp_day UNIQUE (emp_id, day_id);


--
-- Name: user_branch user_branch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch
    ADD CONSTRAINT user_branch_pkey PRIMARY KEY (u_br_id);


--
-- Name: user_branch user_branch_u_id_br_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch
    ADD CONSTRAINT user_branch_u_id_br_id_key UNIQUE (u_id, br_id);


--
-- Name: user_privilege user_privilege_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privilege
    ADD CONSTRAINT user_privilege_pkey PRIMARY KEY (u_pr_id);


--
-- Name: user_privilege user_privilege_sub_pr_id_u_br_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privilege
    ADD CONSTRAINT user_privilege_sub_pr_id_u_br_id_key UNIQUE (sub_pr_id, u_br_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (session_id);


--
-- Name: user_sessions user_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: users users_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_external_id_key UNIQUE (external_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (u_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_cargo_charges_cargo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cargo_charges_cargo_id ON public.cargo_charges USING btree (cargo_id) WHERE (deleted = false);


--
-- Name: idx_ea_employee_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ea_employee_date ON public.employee_attendance USING btree (employee_id, attendance_date DESC);


--
-- Name: idx_eb_employee_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eb_employee_effective ON public.employee_branch USING btree (employee_id, effective_from DESC, created_at DESC) WHERE (deleted = false);


--
-- Name: idx_mv_daily_revenue_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_daily_revenue_pk ON public.mv_daily_revenue USING btree (day, branch_id);


--
-- Name: idx_mv_monthly_branch_profit_pk; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_monthly_branch_profit_pk ON public.mv_monthly_branch_profit USING btree (month, branch_id);


--
-- Name: cargo_history_2025_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.cargo_history_pkey ATTACH PARTITION public.cargo_history_2025_pkey;


--
-- Name: cargo_history_2026_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.cargo_history_pkey ATTACH PARTITION public.cargo_history_2026_pkey;


--
-- Name: cargo_history_2027_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.cargo_history_pkey ATTACH PARTITION public.cargo_history_2027_pkey;


--
-- Name: cargo_history_2028_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.cargo_history_pkey ATTACH PARTITION public.cargo_history_2028_pkey;


--
-- Name: system_logs_2025_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.system_logs_pkey ATTACH PARTITION public.system_logs_2025_pkey;


--
-- Name: system_logs_2026_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.system_logs_pkey ATTACH PARTITION public.system_logs_2026_pkey;


--
-- Name: system_logs_2027_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.system_logs_pkey ATTACH PARTITION public.system_logs_2027_pkey;


--
-- Name: system_logs_2028_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.system_logs_pkey ATTACH PARTITION public.system_logs_2028_pkey;


--
-- Name: accounts trg_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: address trg_address_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_address_updated_at BEFORE UPDATE ON public.address FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: branch trg_branch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_branch_updated_at BEFORE UPDATE ON public.branch FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: cargo trg_cargo_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cargo_invoice AFTER INSERT ON public.cargo FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_invoice();


--
-- Name: cargo trg_cargo_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cargo_soft_delete BEFORE UPDATE OF deleted ON public.cargo FOR EACH ROW EXECUTE FUNCTION public.fn_cargo_soft_delete_cascade();


--
-- Name: cargo_tracking trg_cargo_tracking_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cargo_tracking_notify AFTER UPDATE ON public.cargo_tracking FOR EACH ROW EXECUTE FUNCTION public.fn_notify_status_change();


--
-- Name: cargo_tracking trg_cargo_tracking_update_time; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cargo_tracking_update_time BEFORE UPDATE ON public.cargo_tracking FOR EACH ROW EXECUTE FUNCTION public.fn_set_update_time();


--
-- Name: cargo trg_cargo_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cargo_updated_at BEFORE UPDATE ON public.cargo FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: cities trg_cities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cities_updated_at BEFORE UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: customers trg_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: disputes trg_disputes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: employee_branch trg_employee_branch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employee_branch_updated_at BEFORE UPDATE ON public.employee_branch FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: employees trg_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: salary_charges trg_salary_charges_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_salary_charges_updated_at BEFORE UPDATE ON public.salary_charges FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: trips trg_trips_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: accounts accounts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(br_id);


--
-- Name: accounts accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: accounts_transfer accounts_transfer_acc_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_transfer
    ADD CONSTRAINT accounts_transfer_acc_from_fkey FOREIGN KEY (acc_from) REFERENCES public.accounts(account_id);


--
-- Name: accounts_transfer accounts_transfer_acc_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_transfer
    ADD CONSTRAINT accounts_transfer_acc_to_fkey FOREIGN KEY (acc_to) REFERENCES public.accounts(account_id);


--
-- Name: accounts_transfer accounts_transfer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts_transfer
    ADD CONSTRAINT accounts_transfer_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(u_id);


--
-- Name: accounts accounts_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: accounts accounts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: address address_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT address_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(city_id) ON DELETE RESTRICT;


--
-- Name: api_logs api_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(u_id);


--
-- Name: branch branch_add_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT branch_add_id_fkey FOREIGN KEY (add_id) REFERENCES public.address(add_id) ON DELETE RESTRICT;


--
-- Name: cargo_charges cargo_charges_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_charges
    ADD CONSTRAINT cargo_charges_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id) ON DELETE CASCADE;


--
-- Name: cargo_charges cargo_charges_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_charges
    ADD CONSTRAINT cargo_charges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id) ON DELETE SET NULL;


--
-- Name: cargo_charges cargo_charges_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_charges
    ADD CONSTRAINT cargo_charges_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id) ON DELETE SET NULL;


--
-- Name: cargo cargo_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: cargo cargo_current_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_current_status_id_fkey FOREIGN KEY (current_status_id) REFERENCES public.cargo_status(status_id);


--
-- Name: cargo cargo_from_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_from_branch_fkey FOREIGN KEY (from_branch) REFERENCES public.branch(br_id);


--
-- Name: cargo_history cargo_history_add_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cargo_history
    ADD CONSTRAINT cargo_history_add_id_fkey FOREIGN KEY (add_id) REFERENCES public.address(add_id);


--
-- Name: cargo_history cargo_history_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cargo_history
    ADD CONSTRAINT cargo_history_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id) ON DELETE CASCADE;


--
-- Name: cargo_history cargo_history_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cargo_history
    ADD CONSTRAINT cargo_history_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.cargo_status(status_id);


--
-- Name: cargo_history cargo_history_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.cargo_history
    ADD CONSTRAINT cargo_history_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: cargo_insurance cargo_insurance_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_insurance
    ADD CONSTRAINT cargo_insurance_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id);


--
-- Name: cargo_insurance cargo_insurance_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_insurance
    ADD CONSTRAINT cargo_insurance_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.insurance_providers(provider_id);


--
-- Name: cargo_items cargo_items_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_items
    ADD CONSTRAINT cargo_items_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id) ON DELETE CASCADE;


--
-- Name: cargo_items cargo_items_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_items
    ADD CONSTRAINT cargo_items_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: cargo cargo_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.customers(customer_id);


--
-- Name: cargo cargo_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.customers(customer_id);


--
-- Name: cargo cargo_to_branch_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_to_branch_fkey FOREIGN KEY (to_branch) REFERENCES public.branch(br_id);


--
-- Name: cargo_tracking cargo_tracking_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_tracking
    ADD CONSTRAINT cargo_tracking_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(br_id);


--
-- Name: cargo_tracking cargo_tracking_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_tracking
    ADD CONSTRAINT cargo_tracking_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id) ON DELETE CASCADE;


--
-- Name: cargo_tracking cargo_tracking_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_tracking
    ADD CONSTRAINT cargo_tracking_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.cargo_status(status_id);


--
-- Name: cargo_tracking cargo_tracking_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo_tracking
    ADD CONSTRAINT cargo_tracking_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: cargo cargo_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: cargo cargo_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cargo
    ADD CONSTRAINT cargo_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: customers customers_add_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_add_id_fkey FOREIGN KEY (add_id) REFERENCES public.address(add_id);


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: customers customers_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: customers customers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: disputes disputes_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id);


--
-- Name: disputes disputes_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);


--
-- Name: disputes disputes_dispute_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_dispute_type_id_fkey FOREIGN KEY (dispute_type_id) REFERENCES public.dispute_types(dispute_type_id);


--
-- Name: disputes disputes_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(u_id);


--
-- Name: employee_attendance employee_attendance_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance
    ADD CONSTRAINT employee_attendance_day_id_fkey FOREIGN KEY (day_id) REFERENCES public.days(day_id);


--
-- Name: employee_attendance employee_attendance_emp_sch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance
    ADD CONSTRAINT employee_attendance_emp_sch_id_fkey FOREIGN KEY (emp_sch_id) REFERENCES public.employee_schedule(emp_sch_id);


--
-- Name: employee_attendance employee_attendance_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance
    ADD CONSTRAINT employee_attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE CASCADE;


--
-- Name: employee_attendance employee_attendance_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_attendance
    ADD CONSTRAINT employee_attendance_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: employee_branch employee_branch_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch
    ADD CONSTRAINT employee_branch_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branch(br_id);


--
-- Name: employee_branch employee_branch_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch
    ADD CONSTRAINT employee_branch_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id);


--
-- Name: employee_branch employee_branch_sal_t_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch
    ADD CONSTRAINT employee_branch_sal_t_id_fkey FOREIGN KEY (sal_t_id) REFERENCES public.salary_type(sal_t_id);


--
-- Name: employee_branch employee_branch_sh_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch
    ADD CONSTRAINT employee_branch_sh_id_fkey FOREIGN KEY (sh_id) REFERENCES public.shift(sh_id);


--
-- Name: employee_branch employee_branch_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch
    ADD CONSTRAINT employee_branch_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: employee_schedule employee_schedule_day_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_schedule
    ADD CONSTRAINT employee_schedule_day_id_fkey FOREIGN KEY (day_id) REFERENCES public.days(day_id);


--
-- Name: employee_schedule employee_schedule_emp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_schedule
    ADD CONSTRAINT employee_schedule_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(employee_id);


--
-- Name: employee_schedule employee_schedule_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_schedule
    ADD CONSTRAINT employee_schedule_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: employees employees_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: employees employees_emp_t_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_emp_t_id_fkey FOREIGN KEY (emp_t_id) REFERENCES public.employee_type(emp_t_id);


--
-- Name: employees employees_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(job_id);


--
-- Name: employees employees_sl_t_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_sl_t_id_fkey FOREIGN KEY (sl_t_id) REFERENCES public.salary_type(sal_t_id);


--
-- Name: employees employees_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: employees employees_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: expense_badged expense_badged_exp_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_badged
    ADD CONSTRAINT expense_badged_exp_type_id_fkey FOREIGN KEY (exp_type_id) REFERENCES public.expense_types(exp_type_id);


--
-- Name: expense_badged expense_badged_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_badged
    ADD CONSTRAINT expense_badged_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(u_id);


--
-- Name: expense_charged_badged expense_charged_badged_exp_bd_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charged_badged
    ADD CONSTRAINT expense_charged_badged_exp_bd_id_fkey FOREIGN KEY (exp_bd_id) REFERENCES public.expense_badged(exp_bd_id);


--
-- Name: expense_charged_badged expense_charged_badged_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charged_badged
    ADD CONSTRAINT expense_charged_badged_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: expense_charges expense_charges_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charges
    ADD CONSTRAINT expense_charges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: expense_charges expense_charges_exp_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charges
    ADD CONSTRAINT expense_charges_exp_type_id_fkey FOREIGN KEY (exp_type_id) REFERENCES public.expense_types(exp_type_id);


--
-- Name: expense_charges expense_charges_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charges
    ADD CONSTRAINT expense_charges_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: expense_charges expense_charges_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_charges
    ADD CONSTRAINT expense_charges_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: expense_payments expense_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id);


--
-- Name: expense_payments expense_payments_exp_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_exp_charge_id_fkey FOREIGN KEY (exp_charge_id) REFERENCES public.expense_charges(exp_charge_id);


--
-- Name: expense_payments expense_payments_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_payments
    ADD CONSTRAINT expense_payments_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: address fk_address_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT fk_address_created_by FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: address fk_address_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.address
    ADD CONSTRAINT fk_address_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: branch fk_branch_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT fk_branch_created_by FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: branch fk_branch_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branch
    ADD CONSTRAINT fk_branch_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: cities fk_cities_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT fk_cities_created_by FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: cities fk_cities_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT fk_cities_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: users fk_users_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: users fk_users_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: invoices invoices_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id);


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id) ON DELETE SET NULL;


--
-- Name: jobs jobs_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: menu_privileges menu_privileges_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_privileges
    ADD CONSTRAINT menu_privileges_pr_id_fkey FOREIGN KEY (pr_id) REFERENCES public.privileges(pr_id);


--
-- Name: notifications notifications_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id);


--
-- Name: notifications notifications_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.notification_channels(channel_id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(u_id);


--
-- Name: payments payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id);


--
-- Name: payments payments_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id);


--
-- Name: payments payments_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: routes routes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: routes routes_from_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_from_branch_id_fkey FOREIGN KEY (from_branch_id) REFERENCES public.branch(br_id);


--
-- Name: routes routes_to_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_to_branch_id_fkey FOREIGN KEY (to_branch_id) REFERENCES public.branch(br_id);


--
-- Name: routes routes_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: routes routes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: salary_adjustments salary_adjustments_employee_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_adjustments
    ADD CONSTRAINT salary_adjustments_employee_branch_id_fkey FOREIGN KEY (employee_branch_id) REFERENCES public.employee_branch(employee_branch_id);


--
-- Name: salary_charges salary_charges_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_charges
    ADD CONSTRAINT salary_charges_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: salary_charges salary_charges_employee_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_charges
    ADD CONSTRAINT salary_charges_employee_branch_id_fkey FOREIGN KEY (employee_branch_id) REFERENCES public.employee_branch(employee_branch_id);


--
-- Name: salary_charges salary_charges_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_charges
    ADD CONSTRAINT salary_charges_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: salary_charges salary_charges_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_charges
    ADD CONSTRAINT salary_charges_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: salary salary_emp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary
    ADD CONSTRAINT salary_emp_id_fkey FOREIGN KEY (emp_id) REFERENCES public.employees(employee_id);


--
-- Name: salary_payments salary_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id);


--
-- Name: salary_payments salary_payments_salary_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_salary_charge_id_fkey FOREIGN KEY (salary_charge_id) REFERENCES public.salary_charges(salary_charge_id);


--
-- Name: salary_payments salary_payments_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: salary salary_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary
    ADD CONSTRAINT salary_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: sub_privileges sub_privileges_li_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sub_privileges
    ADD CONSTRAINT sub_privileges_li_pr_id_fkey FOREIGN KEY (li_pr_id) REFERENCES public.menu_privileges(li_pr_id);


--
-- Name: system_logs system_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.system_logs
    ADD CONSTRAINT system_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(u_id);


--
-- Name: transport_providers transport_providers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_providers
    ADD CONSTRAINT transport_providers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: transport_providers transport_providers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transport_providers
    ADD CONSTRAINT transport_providers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: trip_cargo trip_cargo_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_cargo
    ADD CONSTRAINT trip_cargo_cargo_id_fkey FOREIGN KEY (cargo_id) REFERENCES public.cargo(cargo_id);


--
-- Name: trip_cargo trip_cargo_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_cargo
    ADD CONSTRAINT trip_cargo_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(trip_id);


--
-- Name: trip_cargo trip_cargo_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_cargo
    ADD CONSTRAINT trip_cargo_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: trips trips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(u_id);


--
-- Name: trips trips_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.transport_providers(provider_id);


--
-- Name: trips trips_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(route_id);


--
-- Name: trips trips_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: trips trips_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(u_id);


--
-- Name: user_branch user_branch_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch
    ADD CONSTRAINT user_branch_br_id_fkey FOREIGN KEY (br_id) REFERENCES public.branch(br_id) ON DELETE CASCADE;


--
-- Name: user_branch user_branch_u_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_branch
    ADD CONSTRAINT user_branch_u_id_fkey FOREIGN KEY (u_id) REFERENCES public.users(u_id) ON DELETE CASCADE;


--
-- Name: user_privilege user_privilege_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privilege
    ADD CONSTRAINT user_privilege_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(u_id);


--
-- Name: user_privilege user_privilege_sub_pr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privilege
    ADD CONSTRAINT user_privilege_sub_pr_id_fkey FOREIGN KEY (sub_pr_id) REFERENCES public.sub_privileges(sub_pr_id);


--
-- Name: user_privilege user_privilege_u_br_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privilege
    ADD CONSTRAINT user_privilege_u_br_id_fkey FOREIGN KEY (u_br_id) REFERENCES public.user_branch(u_br_id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(u_id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(role_id);


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: cargo branch_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_isolation ON public.cargo USING (((from_branch IN ( SELECT user_branch.br_id
   FROM public.user_branch
  WHERE ((user_branch.u_id = public.current_app_user_id()) AND (user_branch.deleted = false)))) OR (to_branch IN ( SELECT user_branch.br_id
   FROM public.user_branch
  WHERE ((user_branch.u_id = public.current_app_user_id()) AND (user_branch.deleted = false))))));


--
-- Name: accounts branch_isolation_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_isolation_accounts ON public.accounts USING ((branch_id IN ( SELECT user_branch.br_id
   FROM public.user_branch
  WHERE ((user_branch.u_id = public.current_app_user_id()) AND (user_branch.deleted = false)))));


--
-- Name: customers branch_isolation_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_isolation_customers ON public.customers USING ((u_br_id IN ( SELECT user_branch.u_br_id
   FROM public.user_branch
  WHERE ((user_branch.u_id = public.current_app_user_id()) AND (user_branch.deleted = false)))));


--
-- Name: payments branch_isolation_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_isolation_payments ON public.payments USING ((cargo_id IN ( SELECT cargo.cargo_id
   FROM public.cargo
  WHERE (cargo.from_branch IN ( SELECT user_branch.br_id
           FROM public.user_branch
          WHERE ((user_branch.u_id = public.current_app_user_id()) AND (user_branch.deleted = false)))))));


--
-- Name: trips branch_isolation_trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY branch_isolation_trips ON public.trips USING ((u_br_id IN ( SELECT user_branch.u_br_id
   FROM public.user_branch
  WHERE ((user_branch.u_id = public.current_app_user_id()) AND (user_branch.deleted = false)))));


--
-- Name: cargo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cargo ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: trips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

--
-- Name: mv_daily_revenue; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.mv_daily_revenue;


--
-- Name: mv_monthly_branch_profit; Type: MATERIALIZED VIEW DATA; Schema: public; Owner: -
--

REFRESH MATERIALIZED VIEW public.mv_monthly_branch_profit;


--
-- PostgreSQL database dump complete
--

\unrestrict hu7S0gns1XisfgE6f8EOtsBwItrAjkSUFDXiexqIqTGbqDyssPOvfZ4lTYDlDt7

