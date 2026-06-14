--
-- PostgreSQL database dump
--

\restrict c5a3BGBHfIVJbhG95zeBlHfpOXGnP3DcjaZmqHScmMVBMb0fNO6cG0IU2bfChAc

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: cash_operation_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cash_operation_type AS ENUM (
    'deposit',
    'withdrawal',
    'salary'
);


--
-- Name: check_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.check_status AS ENUM (
    'open',
    'closed',
    'cancelled'
);


--
-- Name: discount_target; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.discount_target AS ENUM (
    'check',
    'item'
);


--
-- Name: discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.discount_type AS ENUM (
    'percent',
    'fixed'
);


--
-- Name: evening_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evening_type AS ENUM (
    'sport_mafia',
    'city_mafia',
    'kids_mafia',
    'board_games',
    'none'
);


--
-- Name: event_billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_billing_mode AS ENUM (
    'amount',
    'hourly'
);


--
-- Name: event_payment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_payment_type AS ENUM (
    'fixed',
    'per_head',
    'free'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'planned',
    'active',
    'completed',
    'cancelled'
);


--
-- Name: event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_type AS ENUM (
    'titan',
    'exit'
);


--
-- Name: expense_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expense_category AS ENUM (
    'rent',
    'utilities',
    'supplies',
    'salary',
    'marketing',
    'equipment',
    'other'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'card',
    'bonus',
    'deposit',
    'debt',
    'split',
    'certificate',
    'transfer'
);


--
-- Name: refund_reason; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_reason AS ENUM (
    'return',
    'exchange',
    'discount',
    'damage'
);


--
-- Name: refund_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_type AS ENUM (
    'full',
    'partial'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'owner',
    'staff',
    'tablet',
    'client'
);


--
-- Name: shift_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shift_status AS ENUM (
    'open',
    'closed'
);


--
-- Name: space_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.space_type AS ENUM (
    'small_booth',
    'large_booth',
    'hall'
);


--
-- Name: tg_link_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tg_link_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'deposit',
    'withdrawal',
    'payment',
    'refund',
    'bonus_accrual',
    'bonus_spend'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    id text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event text NOT NULL,
    props jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bonus_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bonus_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bonus_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bonus_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    remaining numeric(12,2) NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cash_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.cash_operation_type NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text,
    shift_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text
);


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    nominal numeric(10,2) NOT NULL,
    balance numeric(10,2) NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    created_by uuid NOT NULL,
    used_by uuid,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    space_id uuid,
    sender text NOT NULL,
    sender_id uuid,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: check_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    discount_id uuid,
    name text NOT NULL,
    type public.discount_type NOT NULL,
    value numeric(10,2) NOT NULL,
    amount numeric(10,2) NOT NULL,
    target public.discount_target DEFAULT 'check'::public.discount_target NOT NULL,
    item_id uuid,
    client_rule_id uuid
);


--
-- Name: check_item_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_item_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_item_id uuid NOT NULL,
    modifier_id uuid NOT NULL,
    price_at_time numeric(10,2) NOT NULL
);


--
-- Name: check_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    price_at_time numeric(10,2) NOT NULL
);


--
-- Name: check_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    method public.payment_method NOT NULL,
    amount numeric(12,2) NOT NULL
);


--
-- Name: checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player_id uuid,
    staff_id uuid NOT NULL,
    shift_id uuid NOT NULL,
    status public.check_status DEFAULT 'open'::public.check_status NOT NULL,
    total_amount numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    payment_method public.payment_method,
    bonus_used numeric(12,2) DEFAULT '0'::numeric,
    certificate_used numeric(12,2) DEFAULT '0'::numeric,
    certificate_id uuid,
    discount_total numeric(12,2) DEFAULT '0'::numeric,
    space_id uuid,
    space_start_at timestamp with time zone,
    space_end_at timestamp with time zone,
    guest_names text[] DEFAULT '{}'::text[],
    note text,
    linked_event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    excluded_discount_ids uuid[] DEFAULT '{}'::uuid[],
    event_base_amount numeric(12,2),
    tip_amount numeric(12,2) DEFAULT 0 NOT NULL,
    platega_tx_id text,
    staff_comp_id uuid,
    prepaid_amount numeric(12,2) DEFAULT 0 NOT NULL,
    acquiring_surcharge numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: client_discount_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_discount_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    client_tier text NOT NULL,
    discount_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_tiers (
    key text NOT NULL,
    label text NOT NULL,
    color text DEFAULT '#8B5CF6'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.discount_type NOT NULL,
    value numeric(10,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_auto boolean DEFAULT false NOT NULL,
    min_quantity integer DEFAULT 1,
    item_id uuid,
    client_rule_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id uuid
);


--
-- Name: evening_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evening_types (
    key text NOT NULL,
    label text NOT NULL,
    color text DEFAULT '#8B5CF6'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_hourly_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_hourly_rates (
    hours integer NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL
);


--
-- Name: event_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    role text DEFAULT 'player'::text NOT NULL,
    prepaid boolean DEFAULT false NOT NULL,
    check_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.event_type DEFAULT 'titan'::public.event_type NOT NULL,
    location text,
    date text NOT NULL,
    start_time text NOT NULL,
    end_time text,
    payment_type public.event_payment_type DEFAULT 'fixed'::public.event_payment_type NOT NULL,
    fixed_amount numeric(10,2),
    status text DEFAULT 'planned'::text NOT NULL,
    comment text,
    reminders jsonb DEFAULT '[]'::jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    space_id uuid,
    per_head_amount numeric(10,2),
    max_guests integer,
    attendees_count integer DEFAULT 0 NOT NULL,
    billing_mode public.event_billing_mode DEFAULT 'amount'::public.event_billing_mode NOT NULL,
    manual_amount numeric(10,2),
    responsible_staff_id uuid,
    check_id uuid,
    customer_name text,
    customer_phone text,
    planned_hours integer,
    format text DEFAULT 'regular'::text NOT NULL,
    participation_fee numeric(12,2),
    prize_fund numeric(12,2),
    lunch_cost numeric(12,2),
    other_cost numeric(12,2),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'needs_clarification'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text,
    expense_date text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    event_id uuid,
    unit_price numeric(12,2),
    quantity numeric(12,2),
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['rent'::text, 'utilities'::text, 'supplies'::text, 'salary'::text, 'marketing'::text, 'equipment'::text, 'other'::text, 'consumables'::text, 'tobacco'::text])))
);


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category uuid,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    cost_price numeric(10,2) DEFAULT '0'::numeric,
    stock_quantity integer DEFAULT 0 NOT NULL,
    min_threshold integer DEFAULT 0,
    track_stock boolean DEFAULT false NOT NULL,
    is_service boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_top boolean DEFAULT false NOT NULL,
    is_tablet_visible boolean DEFAULT false NOT NULL,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    search_tags text[] DEFAULT '{}'::text[],
    linked_space_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    reorder_point integer,
    par_level integer
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    icon text DEFAULT 'Package'::text NOT NULL,
    color text DEFAULT 'violet'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_tablet_visible boolean DEFAULT true NOT NULL
);


--
-- Name: modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    product_id uuid NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: passkeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkeys (
    id text NOT NULL,
    user_id uuid NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    device_type text,
    backed_up boolean DEFAULT false NOT NULL,
    transports text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pending_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    space_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nickname text NOT NULL,
    role public.role DEFAULT 'staff'::public.role NOT NULL,
    client_tier text DEFAULT 'newbie'::text NOT NULL,
    balance numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    bonus_points numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    pin text,
    password_hash text,
    tg_id text,
    tg_username text,
    phone text,
    birthday text,
    photo_url text,
    tg_photo_url text,
    gomafia_photo_url text,
    permissions jsonb DEFAULT '{}'::jsonb,
    linked_space_id uuid,
    search_tags text[] DEFAULT '{}'::text[],
    is_resident boolean DEFAULT false NOT NULL,
    needs_pin_setup boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    full_name text,
    wallet_notify_enabled boolean DEFAULT true NOT NULL,
    manual_visits integer DEFAULT 0 NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_id uuid NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    refund_type public.refund_type DEFAULT 'full'::public.refund_type NOT NULL,
    reason public.refund_reason DEFAULT 'return'::public.refund_reason NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenders jsonb,
    restored_items jsonb DEFAULT '[]'::jsonb
);


--
-- Name: revision_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revision_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision_id uuid NOT NULL,
    item_id uuid NOT NULL,
    name text NOT NULL,
    expected integer NOT NULL,
    actual integer NOT NULL,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    status text DEFAULT 'applied'::text NOT NULL,
    draft_data jsonb
);


--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method public.payment_method DEFAULT 'cash'::public.payment_method NOT NULL,
    note text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opened_by uuid NOT NULL,
    closed_by uuid,
    status public.shift_status DEFAULT 'open'::public.shift_status NOT NULL,
    cash_start numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    cash_end numeric(12,2),
    evening_type text DEFAULT 'none'::text NOT NULL,
    note text,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);


--
-- Name: spaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    hourly_rate numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    capacity integer,
    CONSTRAINT spaces_type_check CHECK ((type = ANY (ARRAY['small_booth'::text, 'large_booth'::text, 'hall'::text, 'table'::text, 'vr'::text, 'ps5'::text, 'zone'::text])))
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    delta integer NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    qty_after integer NOT NULL,
    unit_cost numeric(12,2),
    source_type text,
    source_id uuid,
    note text,
    CONSTRAINT stock_movements_type_check CHECK ((type = ANY (ARRAY['opening'::text, 'receipt'::text, 'sale'::text, 'return'::text, 'adjustment'::text, 'write_off'::text, 'count'::text, 'transfer'::text])))
);


--
-- Name: supplies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note text,
    total_cost numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    payment_method public.payment_method DEFAULT 'cash'::public.payment_method NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier text,
    idempotency_key text,
    status text DEFAULT 'posted'::text NOT NULL,
    draft_data jsonb
);


--
-- Name: supply_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supply_id uuid NOT NULL,
    reason text NOT NULL,
    total_before numeric(12,2) DEFAULT 0 NOT NULL,
    total_after numeric(12,2) DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supply_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supply_id uuid NOT NULL,
    item_id uuid,
    quantity numeric(10,2) NOT NULL,
    cost_per_unit numeric(10,2) NOT NULL,
    name text,
    unit text DEFAULT 'шт'::text NOT NULL
);


--
-- Name: tariffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tariffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    key text,
    is_system boolean DEFAULT false NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    color text DEFAULT '#8B5CF6'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS tariffs_key_unique ON public.tariffs (key) WHERE key IS NOT NULL;


--
-- Name: tg_link_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tg_link_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    tg_id text NOT NULL,
    tg_username text,
    status public.tg_link_status DEFAULT 'pending'::public.tg_link_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text,
    check_id uuid,
    player_id uuid,
    item_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'payment'::text, 'refund'::text, 'bonus_accrual'::text, 'bonus_spend'::text, 'visit_adjust'::text])))
);


--
-- Name: user_notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    types jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (id);


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: bonus_history bonus_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_history
    ADD CONSTRAINT bonus_history_pkey PRIMARY KEY (id);


--
-- Name: bonus_lots bonus_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_lots
    ADD CONSTRAINT bonus_lots_pkey PRIMARY KEY (id);


--
-- Name: cash_operations cash_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_operations
    ADD CONSTRAINT cash_operations_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_code_unique UNIQUE (code);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: check_discounts check_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_discounts
    ADD CONSTRAINT check_discounts_pkey PRIMARY KEY (id);


--
-- Name: check_item_modifiers check_item_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_item_modifiers
    ADD CONSTRAINT check_item_modifiers_pkey PRIMARY KEY (id);


--
-- Name: check_items check_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_items
    ADD CONSTRAINT check_items_pkey PRIMARY KEY (id);


--
-- Name: check_payments check_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_payments
    ADD CONSTRAINT check_payments_pkey PRIMARY KEY (id);


--
-- Name: checks checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_pkey PRIMARY KEY (id);


--
-- Name: client_discount_rules client_discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_discount_rules
    ADD CONSTRAINT client_discount_rules_pkey PRIMARY KEY (id);


--
-- Name: client_tiers client_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_tiers
    ADD CONSTRAINT client_tiers_pkey PRIMARY KEY (key);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);


--
-- Name: evening_types evening_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evening_types
    ADD CONSTRAINT evening_types_pkey PRIMARY KEY (key);


--
-- Name: event_hourly_rates event_hourly_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_hourly_rates
    ADD CONSTRAINT event_hourly_rates_pkey PRIMARY KEY (hours);


--
-- Name: event_participants event_participants_event_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_profile_id_key UNIQUE (event_id, profile_id);


--
-- Name: event_participants event_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: modifiers modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modifiers
    ADD CONSTRAINT modifiers_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: passkeys passkeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_pkey PRIMARY KEY (id);


--
-- Name: pending_orders pending_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_orders
    ADD CONSTRAINT pending_orders_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_nickname_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_nickname_unique UNIQUE (nickname);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_tg_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tg_id_unique UNIQUE (tg_id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: revision_items revision_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revision_items
    ADD CONSTRAINT revision_items_pkey PRIMARY KEY (id);


--
-- Name: revisions revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_pkey PRIMARY KEY (id);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: spaces spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spaces
    ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: supplies supplies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_pkey PRIMARY KEY (id);


--
-- Name: supply_corrections supply_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_corrections
    ADD CONSTRAINT supply_corrections_pkey PRIMARY KEY (id);


--
-- Name: supply_items supply_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_items
    ADD CONSTRAINT supply_items_pkey PRIMARY KEY (id);


--
-- Name: tariffs tariffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariffs
    ADD CONSTRAINT tariffs_pkey PRIMARY KEY (id);


--
-- Name: tg_link_requests tg_link_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tg_link_requests
    ADD CONSTRAINT tg_link_requests_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_notification_settings user_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_pkey PRIMARY KEY (id);


--
-- Name: user_notification_settings user_notification_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_user_id_unique UNIQUE (user_id);


--
-- Name: analytics_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_created_at_idx ON public.analytics_events USING btree (created_at);


--
-- Name: analytics_events_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_events_event_idx ON public.analytics_events USING btree (event);


--
-- Name: bonus_lots_profile_exp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bonus_lots_profile_exp_idx ON public.bonus_lots USING btree (profile_id, expires_at) WHERE (remaining > (0)::numeric);


--
-- Name: cash_operations_idem_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_operations_idem_key_uniq ON public.cash_operations USING btree (idempotency_key);


--
-- Name: chat_messages_check_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_check_idx ON public.chat_messages USING btree (check_id, created_at);


--
-- Name: checks_staff_comp_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checks_staff_comp_id_idx ON public.checks USING btree (staff_comp_id) WHERE (staff_comp_id IS NOT NULL);


--
-- Name: customers_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_phone_idx ON public.customers USING btree (phone);


--
-- Name: expenses_idem_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX expenses_idem_key_uniq ON public.expenses USING btree (idempotency_key);


--
-- Name: idx_bonus_history_profile_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_history_profile_created ON public.bonus_history USING btree (profile_id, created_at DESC);


--
-- Name: idx_check_item_modifiers_check_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_check_item_modifiers_check_item ON public.check_item_modifiers USING btree (check_item_id);


--
-- Name: idx_check_item_modifiers_modifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_check_item_modifiers_modifier ON public.check_item_modifiers USING btree (modifier_id);


--
-- Name: idx_check_items_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_check_items_check ON public.check_items USING btree (check_id);


--
-- Name: idx_check_items_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_check_items_item ON public.check_items USING btree (item_id);


--
-- Name: idx_check_payments_check_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_check_payments_check_method ON public.check_payments USING btree (check_id, method);


--
-- Name: idx_checks_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checks_event ON public.checks USING btree (linked_event_id) WHERE (linked_event_id IS NOT NULL);


--
-- Name: idx_checks_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checks_player ON public.checks USING btree (player_id) WHERE (player_id IS NOT NULL);


--
-- Name: idx_checks_shift_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checks_shift_status ON public.checks USING btree (shift_id, status);


--
-- Name: idx_checks_space_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checks_space_status ON public.checks USING btree (space_id, status) WHERE (space_id IS NOT NULL);


--
-- Name: idx_checks_staff_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checks_staff_status_created ON public.checks USING btree (staff_id, status, created_at DESC);


--
-- Name: idx_event_participants_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_participants_event ON public.event_participants USING btree (event_id);


--
-- Name: idx_events_date_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_date_status ON public.events USING btree (date, status);


--
-- Name: idx_events_space_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_space_status ON public.events USING btree (space_id, status) WHERE (space_id IS NOT NULL);


--
-- Name: idx_expenses_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_created_by ON public.expenses USING btree (created_by);


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_date ON public.expenses USING btree (expense_date);


--
-- Name: idx_expenses_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_event ON public.expenses USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_modifiers_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modifiers_product ON public.modifiers USING btree (product_id);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_profiles_role_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role_active ON public.profiles USING btree (role) WHERE (deleted_at IS NULL);


--
-- Name: idx_refunds_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_check ON public.refunds USING btree (check_id);


--
-- Name: idx_revision_items_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revision_items_revision ON public.revision_items USING btree (revision_id);


--
-- Name: idx_revisions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revisions_created ON public.revisions USING btree (created_at DESC);


--
-- Name: idx_revisions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_revisions_status ON public.revisions USING btree (status);


--
-- Name: idx_stock_movements_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_item ON public.stock_movements USING btree (item_id, created_at DESC);


--
-- Name: idx_stock_movements_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_source ON public.stock_movements USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_stock_movements_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_type ON public.stock_movements USING btree (type, created_at DESC);


--
-- Name: idx_supplies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplies_status ON public.supplies USING btree (status);


--
-- Name: idx_supply_items_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supply_items_item ON public.supply_items USING btree (item_id);


--
-- Name: idx_supply_items_supply; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supply_items_supply ON public.supply_items USING btree (supply_id);


--
-- Name: idx_transactions_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_check ON public.transactions USING btree (check_id) WHERE (check_id IS NOT NULL);


--
-- Name: idx_transactions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_created_by ON public.transactions USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_transactions_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_item ON public.transactions USING btree (item_id) WHERE (item_id IS NOT NULL);


--
-- Name: idx_transactions_player_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_player_created ON public.transactions USING btree (player_id, created_at DESC) WHERE (player_id IS NOT NULL);


--
-- Name: inventory_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_category_idx ON public.inventory USING btree (category) WHERE (deleted_at IS NULL);


--
-- Name: inventory_not_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_not_deleted_idx ON public.inventory USING btree (id) WHERE (deleted_at IS NULL);


--
-- Name: inventory_tablet_visible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_tablet_visible_idx ON public.inventory USING btree (sort_order) WHERE ((deleted_at IS NULL) AND is_active AND is_tablet_visible);


--
-- Name: pending_orders_check_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_orders_check_pending_idx ON public.pending_orders USING btree (check_id) WHERE (status = 'pending'::text);


--
-- Name: push_subscriptions_endpoint_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX push_subscriptions_endpoint_uq ON public.push_subscriptions USING btree (endpoint);


--
-- Name: push_subscriptions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: salary_payments_idem_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX salary_payments_idem_key_uniq ON public.salary_payments USING btree (idempotency_key);


--
-- Name: shifts_one_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shifts_one_open ON public.shifts USING btree (status) WHERE (status = 'open'::public.shift_status);


--
-- Name: supplies_idempotency_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplies_idempotency_key_uniq ON public.supplies USING btree (idempotency_key);


--
-- Name: supply_corrections_supply_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supply_corrections_supply_id_idx ON public.supply_corrections USING btree (supply_id);


--
-- Name: tariffs_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tariffs_item_id_idx ON public.tariffs USING btree (item_id);


--
-- Name: transactions_idempotency_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_idempotency_key_uniq ON public.transactions USING btree (idempotency_key);


--
-- Name: uniq_one_open_rental_per_space; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_one_open_rental_per_space ON public.checks USING btree (space_id) WHERE ((status = 'open'::public.check_status) AND (space_id IS NOT NULL));


--
-- Name: analytics_events analytics_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: bonus_history bonus_history_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_history
    ADD CONSTRAINT bonus_history_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: bonus_lots bonus_lots_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_lots
    ADD CONSTRAINT bonus_lots_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: cash_operations cash_operations_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_operations
    ADD CONSTRAINT cash_operations_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: cash_operations cash_operations_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_operations
    ADD CONSTRAINT cash_operations_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL NOT VALID;


--
-- Name: certificates certificates_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: certificates certificates_used_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_used_by_profiles_id_fk FOREIGN KEY (used_by) REFERENCES public.profiles(id);


--
-- Name: chat_messages chat_messages_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.checks(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: chat_messages chat_messages_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id);


--
-- Name: check_discounts check_discounts_check_id_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_discounts
    ADD CONSTRAINT check_discounts_check_id_checks_id_fk FOREIGN KEY (check_id) REFERENCES public.checks(id) ON DELETE CASCADE;


--
-- Name: check_discounts check_discounts_client_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_discounts
    ADD CONSTRAINT check_discounts_client_rule_id_fkey FOREIGN KEY (client_rule_id) REFERENCES public.client_discount_rules(id) ON DELETE SET NULL NOT VALID;


--
-- Name: check_discounts check_discounts_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_discounts
    ADD CONSTRAINT check_discounts_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE SET NULL NOT VALID;


--
-- Name: check_item_modifiers check_item_modifiers_check_item_id_check_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_item_modifiers
    ADD CONSTRAINT check_item_modifiers_check_item_id_check_items_id_fk FOREIGN KEY (check_item_id) REFERENCES public.check_items(id) ON DELETE CASCADE;


--
-- Name: check_item_modifiers check_item_modifiers_modifier_id_modifiers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_item_modifiers
    ADD CONSTRAINT check_item_modifiers_modifier_id_modifiers_id_fk FOREIGN KEY (modifier_id) REFERENCES public.modifiers(id);


--
-- Name: check_items check_items_check_id_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_items
    ADD CONSTRAINT check_items_check_id_checks_id_fk FOREIGN KEY (check_id) REFERENCES public.checks(id) ON DELETE CASCADE;


--
-- Name: check_items check_items_item_id_inventory_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_items
    ADD CONSTRAINT check_items_item_id_inventory_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: check_payments check_payments_check_id_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_payments
    ADD CONSTRAINT check_payments_check_id_checks_id_fk FOREIGN KEY (check_id) REFERENCES public.checks(id) ON DELETE CASCADE;


--
-- Name: checks checks_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE SET NULL NOT VALID;


--
-- Name: checks checks_linked_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_linked_event_id_fkey FOREIGN KEY (linked_event_id) REFERENCES public.events(id) ON DELETE SET NULL NOT VALID;


--
-- Name: checks checks_player_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_player_id_profiles_id_fk FOREIGN KEY (player_id) REFERENCES public.profiles(id);


--
-- Name: checks checks_shift_id_shifts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_shift_id_shifts_id_fk FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: checks checks_space_id_spaces_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_space_id_spaces_id_fk FOREIGN KEY (space_id) REFERENCES public.spaces(id);


--
-- Name: checks checks_staff_comp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_staff_comp_id_fkey FOREIGN KEY (staff_comp_id) REFERENCES public.profiles(id);


--
-- Name: checks checks_staff_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checks
    ADD CONSTRAINT checks_staff_id_profiles_id_fk FOREIGN KEY (staff_id) REFERENCES public.profiles(id);


--
-- Name: client_discount_rules client_discount_rules_discount_id_discounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_discount_rules
    ADD CONSTRAINT client_discount_rules_discount_id_discounts_id_fk FOREIGN KEY (discount_id) REFERENCES public.discounts(id);


--
-- Name: discounts discounts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id);


--
-- Name: discounts discounts_item_id_inventory_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_item_id_inventory_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: event_participants event_participants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: events events_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: events events_responsible_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_responsible_staff_id_fkey FOREIGN KEY (responsible_staff_id) REFERENCES public.profiles(id);


--
-- Name: events events_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id);


--
-- Name: expenses expenses_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: expenses expenses_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: inventory inventory_category_menu_categories_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_category_menu_categories_id_fk FOREIGN KEY (category) REFERENCES public.menu_categories(id);


--
-- Name: inventory inventory_linked_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_linked_space_id_fkey FOREIGN KEY (linked_space_id) REFERENCES public.spaces(id) ON DELETE SET NULL NOT VALID;


--
-- Name: modifiers modifiers_product_id_inventory_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modifiers
    ADD CONSTRAINT modifiers_product_id_inventory_id_fk FOREIGN KEY (product_id) REFERENCES public.inventory(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: passkeys passkeys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkeys
    ADD CONSTRAINT passkeys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pending_orders pending_orders_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_orders
    ADD CONSTRAINT pending_orders_check_id_fkey FOREIGN KEY (check_id) REFERENCES public.checks(id) ON DELETE CASCADE;


--
-- Name: pending_orders pending_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_orders
    ADD CONSTRAINT pending_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: pending_orders pending_orders_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_orders
    ADD CONSTRAINT pending_orders_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id);


--
-- Name: pending_orders pending_orders_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_orders
    ADD CONSTRAINT pending_orders_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.spaces(id);


--
-- Name: profiles profiles_linked_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_linked_space_id_fkey FOREIGN KEY (linked_space_id) REFERENCES public.spaces(id) ON DELETE SET NULL NOT VALID;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: refunds refunds_check_id_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_check_id_checks_id_fk FOREIGN KEY (check_id) REFERENCES public.checks(id);


--
-- Name: refunds refunds_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: revision_items revision_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revision_items
    ADD CONSTRAINT revision_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: revision_items revision_items_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revision_items
    ADD CONSTRAINT revision_items_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.revisions(id) ON DELETE CASCADE;


--
-- Name: revisions revisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revisions
    ADD CONSTRAINT revisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: salary_payments salary_payments_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: salary_payments salary_payments_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: shifts shifts_closed_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_closed_by_profiles_id_fk FOREIGN KEY (closed_by) REFERENCES public.profiles(id);


--
-- Name: shifts shifts_opened_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_opened_by_profiles_id_fk FOREIGN KEY (opened_by) REFERENCES public.profiles(id);


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: stock_movements stock_movements_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: supplies supplies_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplies
    ADD CONSTRAINT supplies_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: supply_corrections supply_corrections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_corrections
    ADD CONSTRAINT supply_corrections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: supply_corrections supply_corrections_supply_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_corrections
    ADD CONSTRAINT supply_corrections_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES public.supplies(id) ON DELETE CASCADE;


--
-- Name: supply_items supply_items_item_id_inventory_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_items
    ADD CONSTRAINT supply_items_item_id_inventory_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: supply_items supply_items_supply_id_supplies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_items
    ADD CONSTRAINT supply_items_supply_id_supplies_id_fk FOREIGN KEY (supply_id) REFERENCES public.supplies(id) ON DELETE CASCADE;


--
-- Name: tariffs tariffs_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariffs
    ADD CONSTRAINT tariffs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: tg_link_requests tg_link_requests_profile_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tg_link_requests
    ADD CONSTRAINT tg_link_requests_profile_id_profiles_id_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_check_id_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_check_id_checks_id_fk FOREIGN KEY (check_id) REFERENCES public.checks(id);


--
-- Name: transactions transactions_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: transactions transactions_item_id_inventory_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_item_id_inventory_id_fk FOREIGN KEY (item_id) REFERENCES public.inventory(id);


--
-- Name: transactions transactions_player_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_player_id_profiles_id_fk FOREIGN KEY (player_id) REFERENCES public.profiles(id);


--
-- Name: user_notification_settings user_notification_settings_user_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_user_id_profiles_id_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict c5a3BGBHfIVJbhG95zeBlHfpOXGnP3DcjaZmqHScmMVBMb0fNO6cG0IU2bfChAc

