-- ============================================================
-- SECTION 1: CREATE DATABASE
-- ============================================================
CREATE DATABASE cargo_management_system
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

\c cargo_management_system;

-- ============================================================
-- SECTION 2: CREATE SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS cargo_system;
SET search_path TO cargo_system;

-- ============================================================
-- SECTION 3: CREATE TABLES
-- ============================================================

-- ----------------------------------------------
-- SECURITY MODULE TABLES
-- ----------------------------------------------

-- 3.1: Branches
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    branch_code VARCHAR(20) UNIQUE NOT NULL,
    branch_name VARCHAR(100) NOT NULL,
    manager_name VARCHAR(100),
    manager_phone VARCHAR(20),
    branch_phone VARCHAR(20),
    email VARCHAR(100),
    address_id INTEGER,
    logo_url TEXT,
    banner_url TEXT,
    welcome_message TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP
);

COMMENT ON TABLE branches IS 'Physical branch locations of the cargo company';

-- 3.2: Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    role_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE roles IS 'User roles for access control';

-- 3.3: Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role_id INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

COMMENT ON TABLE users IS 'System users with authentication credentials';

-- 3.4: User Branches (Many-to-Many)
CREATE TABLE user_branches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_user_branches_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_branches_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT unique_user_branch UNIQUE(user_id, branch_id)
);

COMMENT ON TABLE user_branches IS 'Branch assignments for users';

-- 3.5: Privileges (Main Menu Items)
CREATE TABLE privileges (
    id SERIAL PRIMARY KEY,
    privilege_name VARCHAR(50) UNIQUE NOT NULL,
    icon_class VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE privileges IS 'Main menu privilege items';

-- 3.6: Menu Privileges (Sub-Menu Items)
CREATE TABLE menu_privileges (
    id SERIAL PRIMARY KEY,
    privilege_id INTEGER NOT NULL,
    menu_name VARCHAR(50) NOT NULL,
    menu_url VARCHAR(255),
    icon_class VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_menu_privileges_privilege FOREIGN KEY (privilege_id) REFERENCES privileges(id)
);

COMMENT ON TABLE menu_privileges IS 'Sub-menu items under main privileges';

-- 3.7: Sub-Privileges (Action Permissions)
CREATE TABLE sub_privileges (
    id SERIAL PRIMARY KEY,
    menu_privilege_id INTEGER NOT NULL,
    action_name VARCHAR(50) NOT NULL,
    action_key VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_sub_privileges_menu FOREIGN KEY (menu_privilege_id) REFERENCES menu_privileges(id)
);

COMMENT ON TABLE sub_privileges IS 'Granular action permissions';

-- 3.8: User Privileges (Assign Permissions to Users)
CREATE TABLE user_privileges (
    id SERIAL PRIMARY KEY,
    sub_privilege_id INTEGER NOT NULL,
    user_branch_id INTEGER NOT NULL,
    granted_by INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_user_priv_sub_priv FOREIGN KEY (sub_privilege_id) REFERENCES sub_privileges(id),
    CONSTRAINT fk_user_priv_user_branch FOREIGN KEY (user_branch_id) REFERENCES user_branches(id),
    CONSTRAINT unique_user_sub_priv UNIQUE(sub_privilege_id, user_branch_id)
);

COMMENT ON TABLE user_privileges IS 'Assigned permissions to users at branch level';

-- ----------------------------------------------
-- LOCATION MODULE TABLES
-- ----------------------------------------------

-- 3.9: Countries
CREATE TABLE countries (
    id SERIAL PRIMARY KEY,
    country_code CHAR(2) UNIQUE NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    phone_code VARCHAR(10),
    currency_code CHAR(3),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE countries IS 'Country master data';

-- 3.10: States/Regions
CREATE TABLE states_or_regions (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    state_code VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_states_country FOREIGN KEY (country_id) REFERENCES countries(id),
    CONSTRAINT unique_state_country UNIQUE(state_name, country_id)
);

COMMENT ON TABLE states_or_regions IS 'States/Regions within countries';

-- 3.11: Cities
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    state_id INTEGER NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    city_code VARCHAR(10),
    postal_code VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_cities_state FOREIGN KEY (state_id) REFERENCES states_or_regions(id),
    CONSTRAINT unique_city_state UNIQUE(city_name, state_id)
);

COMMENT ON TABLE cities IS 'Cities within states';

-- 3.12: Addresses
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    city_id INTEGER NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    landmark VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_addresses_city FOREIGN KEY (city_id) REFERENCES cities(id)
);

COMMENT ON TABLE addresses IS 'Complete address details with geo-location';

-- ----------------------------------------------
-- CUSTOMER MODULE TABLES
-- ----------------------------------------------

-- 3.13: Customers
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    address_id INTEGER,
    branch_id INTEGER NOT NULL,
    id_type VARCHAR(50),
    id_number VARCHAR(50),
    date_of_birth DATE,
    is_active BOOLEAN DEFAULT TRUE,
    is_frequent BOOLEAN DEFAULT FALSE,
    loyalty_points INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_customers_address FOREIGN KEY (address_id) REFERENCES addresses(id),
    CONSTRAINT fk_customers_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE customers IS 'Customer master data for cargo senders and receivers';

-- ----------------------------------------------
-- CARGO MODULE TABLES
-- ----------------------------------------------

-- 3.14: Cargo Status (Lookup Table)
CREATE TABLE cargo_status (
    id SERIAL PRIMARY KEY,
    status_name VARCHAR(50) UNIQUE NOT NULL,
    status_description TEXT,
    is_terminal BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE cargo_status IS 'Cargo status codes';

-- 3.15: Cargo (Main Cargo Table)
CREATE TABLE cargo (
    id SERIAL PRIMARY KEY,
    tracking_number VARCHAR(50) UNIQUE NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    from_branch_id INTEGER NOT NULL,
    to_branch_id INTEGER NOT NULL,
    current_branch_id INTEGER,
    current_status_id INTEGER NOT NULL,
    weight DECIMAL(10, 2) NOT NULL CHECK (weight > 0),
    volume DECIMAL(10, 2),
    total_price DECIMAL(15, 2),
    is_fragile BOOLEAN DEFAULT FALSE,
    is_insured BOOLEAN DEFAULT FALSE,
    insurance_amount DECIMAL(15, 2),
    special_instructions TEXT,
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    delivered_by INTEGER,
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    CONSTRAINT fk_cargo_sender FOREIGN KEY (sender_id) REFERENCES customers(id),
    CONSTRAINT fk_cargo_receiver FOREIGN KEY (receiver_id) REFERENCES customers(id),
    CONSTRAINT fk_cargo_from_branch FOREIGN KEY (from_branch_id) REFERENCES branches(id),
    CONSTRAINT fk_cargo_to_branch FOREIGN KEY (to_branch_id) REFERENCES branches(id),
    CONSTRAINT fk_cargo_current_branch FOREIGN KEY (current_branch_id) REFERENCES branches(id),
    CONSTRAINT fk_cargo_status FOREIGN KEY (current_status_id) REFERENCES cargo_status(id),
    CONSTRAINT fk_cargo_delivered_by FOREIGN KEY (delivered_by) REFERENCES users(id),
    CONSTRAINT fk_cargo_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE cargo IS 'Main cargo/shipment information';

-- 3.16: Cargo Items
CREATE TABLE cargo_items (
    id SERIAL PRIMARY KEY,
    cargo_id INTEGER NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    weight DECIMAL(10, 2) NOT NULL CHECK (weight > 0),
    unit_price DECIMAL(15, 2),
    total_price DECIMAL(15, 2),
    dimensions VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_cargo_items_cargo FOREIGN KEY (cargo_id) REFERENCES cargo(id) ON DELETE CASCADE
);

COMMENT ON TABLE cargo_items IS 'Individual items within a cargo shipment';

-- 3.17: Cargo History (Status Tracking)
CREATE TABLE cargo_history (
    id SERIAL PRIMARY KEY,
    cargo_id INTEGER NOT NULL,
    status_id INTEGER NOT NULL,
    location_name VARCHAR(255),
    address_id INTEGER,
    note TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    updated_by INTEGER,
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cargo_history_cargo FOREIGN KEY (cargo_id) REFERENCES cargo(id) ON DELETE CASCADE,
    CONSTRAINT fk_cargo_history_status FOREIGN KEY (status_id) REFERENCES cargo_status(id),
    CONSTRAINT fk_cargo_history_address FOREIGN KEY (address_id) REFERENCES addresses(id),
    CONSTRAINT fk_cargo_history_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE cargo_history IS 'Audit trail of cargo status changes';

-- ----------------------------------------------
-- TRANSPORTATION MODULE TABLES
-- ----------------------------------------------

-- 3.18: Provider Types
CREATE TABLE provider_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    type_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE provider_types IS 'Types of transport providers';

-- 3.19: Transport Providers
CREATE TABLE transport_providers (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL,
    provider_type_id INTEGER NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    contact_person VARCHAR(100),
    address_id INTEGER,
    rating DECIMAL(3, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_providers_type FOREIGN KEY (provider_type_id) REFERENCES provider_types(id),
    CONSTRAINT fk_providers_address FOREIGN KEY (address_id) REFERENCES addresses(id)
);

COMMENT ON TABLE transport_providers IS 'Transport service providers';

-- 3.20: Routes
CREATE TABLE routes (
    id SERIAL PRIMARY KEY,
    route_code VARCHAR(20) UNIQUE NOT NULL,
    from_branch_id INTEGER NOT NULL,
    to_branch_id INTEGER NOT NULL,
    distance_km DECIMAL(10, 2) NOT NULL CHECK (distance_km > 0),
    estimated_hours DECIMAL(5, 2),
    base_cost DECIMAL(15, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    branch_id INTEGER NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_routes_from_branch FOREIGN KEY (from_branch_id) REFERENCES branches(id),
    CONSTRAINT fk_routes_to_branch FOREIGN KEY (to_branch_id) REFERENCES branches(id),
    CONSTRAINT fk_routes_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT unique_route_branches UNIQUE(from_branch_id, to_branch_id)
);

COMMENT ON TABLE routes IS 'Branch-to-branch routes';

-- 3.21: Trips
CREATE TABLE trips (
    id SERIAL PRIMARY KEY,
    trip_code VARCHAR(20) UNIQUE NOT NULL,
    provider_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    vehicle_number VARCHAR(50),
    driver_name VARCHAR(100),
    driver_phone VARCHAR(20),
    trip_date DATE NOT NULL,
    departure_time TIME NOT NULL,
    estimated_arrival_time TIME,
    actual_arrival_time TIMESTAMP,
    total_cost DECIMAL(15, 2),
    status VARCHAR(50) DEFAULT 'Scheduled',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    branch_id INTEGER NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_trips_provider FOREIGN KEY (provider_id) REFERENCES transport_providers(id),
    CONSTRAINT fk_trips_route FOREIGN KEY (route_id) REFERENCES routes(id),
    CONSTRAINT fk_trips_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT check_trip_status CHECK (status IN ('Scheduled', 'In Transit', 'Delayed', 'Completed', 'Cancelled'))
);

COMMENT ON TABLE trips IS 'Transportation trips';

-- 3.22: Trip Cargo (Many-to-Many between Trips and Cargo)
CREATE TABLE trip_cargo (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL,
    cargo_id INTEGER NOT NULL,
    loading_order INTEGER,
    transport_cost DECIMAL(15, 2),
    status VARCHAR(50) DEFAULT 'Pending',
    loaded_at TIMESTAMP,
    unloaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    branch_id INTEGER NOT NULL,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_trip_cargo_trip FOREIGN KEY (trip_id) REFERENCES trips(id),
    CONSTRAINT fk_trip_cargo_cargo FOREIGN KEY (cargo_id) REFERENCES cargo(id),
    CONSTRAINT fk_trip_cargo_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT unique_trip_cargo UNIQUE(trip_id, cargo_id)
);

COMMENT ON TABLE trip_cargo IS 'Association between trips and cargo';

-- ----------------------------------------------
-- FINANCE MODULE TABLES
-- ----------------------------------------------

-- 3.23: Account Types
CREATE TABLE account_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    type_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE account_types IS 'Types of accounts';

-- 3.24: Accounts
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    account_code VARCHAR(20) UNIQUE NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type_id INTEGER NOT NULL,
    institution_name VARCHAR(100),
    account_number VARCHAR(50),
    balance DECIMAL(15, 2) DEFAULT 0 NOT NULL,
    currency_code CHAR(3) DEFAULT 'USD',
    branch_id INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_accounts_type FOREIGN KEY (account_type_id) REFERENCES account_types(id),
    CONSTRAINT fk_accounts_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE accounts IS 'Financial accounts';

-- 3.25: Account Transfers
CREATE TABLE account_transfers (
    id SERIAL PRIMARY KEY,
    from_account_id INTEGER NOT NULL,
    to_account_id INTEGER NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    transfer_reference VARCHAR(50) UNIQUE NOT NULL,
    reason TEXT,
    transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_transfers_from_account FOREIGN KEY (from_account_id) REFERENCES accounts(id),
    CONSTRAINT fk_transfers_to_account FOREIGN KEY (to_account_id) REFERENCES accounts(id)
);

COMMENT ON TABLE account_transfers IS 'Transfers between accounts';

-- 3.26: Payment Methods
CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    method_name VARCHAR(50) UNIQUE NOT NULL,
    method_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE payment_methods IS 'Payment methods';

-- 3.27: Payments
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    payment_code VARCHAR(20) UNIQUE NOT NULL,
    cargo_id INTEGER,
    account_id INTEGER NOT NULL,
    payment_method_id INTEGER NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reference_number VARCHAR(100),
    description TEXT,
    payment_status VARCHAR(50) DEFAULT 'Completed',
    created_by INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_payments_cargo FOREIGN KEY (cargo_id) REFERENCES cargo(id),
    CONSTRAINT fk_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    CONSTRAINT fk_payments_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE payments IS 'Payment transactions';

-- 3.28: Expense Types
CREATE TABLE expense_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    type_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE expense_types IS 'Categories of expenses';

-- 3.29: Expense Charges
CREATE TABLE expense_charges (
    id SERIAL PRIMARY KEY,
    expense_type_id INTEGER NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    charge_month DATE NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'Pending',
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_expense_charges_type FOREIGN KEY (expense_type_id) REFERENCES expense_types(id),
    CONSTRAINT fk_expense_charges_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT check_expense_status CHECK (status IN ('Pending', 'Paid', 'Cancelled'))
);

COMMENT ON TABLE expense_charges IS 'Expense charge details';

-- 3.30: Expense Payments
CREATE TABLE expense_payments (
    id SERIAL PRIMARY KEY,
    expense_charge_id INTEGER NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_method_id INTEGER NOT NULL,
    reference_number VARCHAR(100),
    account_id INTEGER NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_expense_payments_charge FOREIGN KEY (expense_charge_id) REFERENCES expense_charges(id),
    CONSTRAINT fk_expense_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    CONSTRAINT fk_expense_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_expense_payments_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE expense_payments IS 'Payments for expenses';

-- ----------------------------------------------
-- HRM MODULE TABLES
-- ----------------------------------------------

-- 3.31: Jobs
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    job_title VARCHAR(50) UNIQUE NOT NULL,
    job_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE jobs IS 'Job positions';

-- 3.32: Salary Types
CREATE TABLE salary_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    type_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE salary_types IS 'Salary types';

-- 3.33: Employee Types
CREATE TABLE employee_types (
    id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) UNIQUE NOT NULL,
    type_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE employee_types IS 'Employee types';

-- 3.34: Shifts
CREATE TABLE shifts (
    id SERIAL PRIMARY KEY,
    shift_name VARCHAR(50) UNIQUE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    shift_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE shifts IS 'Work shifts';

-- 3.35: Working Days
CREATE TABLE working_days (
    id SERIAL PRIMARY KEY,
    day_name VARCHAR(20) UNIQUE NOT NULL,
    day_code CHAR(3) UNIQUE NOT NULL,
    is_working BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE
);

COMMENT ON TABLE working_days IS 'Days of the week';

-- 3.36: Employees
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100) UNIQUE,
    job_id INTEGER NOT NULL,
    employee_type_id INTEGER NOT NULL,
    salary_type_id INTEGER NOT NULL,
    base_salary DECIMAL(15, 2) NOT NULL CHECK (base_salary >= 0),
    hire_date DATE NOT NULL,
    termination_date DATE,
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    address_id INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_employees_job FOREIGN KEY (job_id) REFERENCES jobs(id),
    CONSTRAINT fk_employees_type FOREIGN KEY (employee_type_id) REFERENCES employee_types(id),
    CONSTRAINT fk_employees_salary_type FOREIGN KEY (salary_type_id) REFERENCES salary_types(id),
    CONSTRAINT fk_employees_address FOREIGN KEY (address_id) REFERENCES addresses(id)
);

COMMENT ON TABLE employees IS 'Employee master data';

-- 3.37: Employee Branches
CREATE TABLE employee_branches (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'Active',
    salary_amount DECIMAL(15, 2),
    salary_type_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_emp_branches_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
    CONSTRAINT fk_emp_branches_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
    CONSTRAINT fk_emp_branches_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
    CONSTRAINT fk_emp_branches_salary_type FOREIGN KEY (salary_type_id) REFERENCES salary_types(id),
    CONSTRAINT unique_employee_branch UNIQUE(employee_id, branch_id)
);

COMMENT ON TABLE employee_branches IS 'Branch assignments for employees';

-- 3.38: Employee Schedules
CREATE TABLE employee_schedules (
    id SERIAL PRIMARY KEY,
    employee_branch_id INTEGER NOT NULL,
    day_id INTEGER NOT NULL,
    time_in TIME NOT NULL,
    time_out TIME NOT NULL,
    is_break BOOLEAN DEFAULT FALSE,
    break_start TIME,
    break_end TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_emp_schedules_branch FOREIGN KEY (employee_branch_id) REFERENCES employee_branches(id),
    CONSTRAINT fk_emp_schedules_day FOREIGN KEY (day_id) REFERENCES working_days(id),
    CONSTRAINT unique_employee_day_schedule UNIQUE(employee_branch_id, day_id)
);

COMMENT ON TABLE employee_schedules IS 'Employee weekly schedules';

-- 3.39: Employee Attendance
CREATE TABLE employee_attendance (
    id SERIAL PRIMARY KEY,
    employee_schedule_id INTEGER NOT NULL,
    attendance_date DATE NOT NULL,
    clock_in_time TIMESTAMP,
    clock_out_time TIMESTAMP,
    break_start_time TIMESTAMP,
    break_end_time TIMESTAMP,
    is_present BOOLEAN DEFAULT FALSE,
    is_late BOOLEAN DEFAULT FALSE,
    is_absent BOOLEAN DEFAULT FALSE,
    overtime_hours DECIMAL(5, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_attendance_schedule FOREIGN KEY (employee_schedule_id) REFERENCES employee_schedules(id),
    CONSTRAINT unique_attendance_date UNIQUE(employee_schedule_id, attendance_date)
);

COMMENT ON TABLE employee_attendance IS 'Daily attendance records';

-- 3.40: Salary Records
CREATE TABLE salary_records (
    id SERIAL PRIMARY KEY,
    employee_branch_id INTEGER NOT NULL,
    salary_month DATE NOT NULL,
    base_salary DECIMAL(15, 2) NOT NULL,
    overtime_pay DECIMAL(15, 2) DEFAULT 0,
    bonus DECIMAL(15, 2) DEFAULT 0,
    commission DECIMAL(15, 2) DEFAULT 0,
    deductions DECIMAL(15, 2) DEFAULT 0,
    net_salary DECIMAL(15, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    processed_at TIMESTAMP,
    processed_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_salary_emp_branch FOREIGN KEY (employee_branch_id) REFERENCES employee_branches(id),
    CONSTRAINT check_salary_status CHECK (status IN ('Pending', 'Processed', 'Paid', 'Cancelled')),
    CONSTRAINT unique_employee_month UNIQUE(employee_branch_id, salary_month)
);

COMMENT ON TABLE salary_records IS 'Monthly salary records';

-- 3.41: Salary Payments
CREATE TABLE salary_payments (
    id SERIAL PRIMARY KEY,
    salary_record_id INTEGER NOT NULL,
    payment_code VARCHAR(20) UNIQUE NOT NULL,
    payment_method_id INTEGER NOT NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reference_number VARCHAR(100),
    account_id INTEGER NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_salary_payments_record FOREIGN KEY (salary_record_id) REFERENCES salary_records(id),
    CONSTRAINT fk_salary_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    CONSTRAINT fk_salary_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_salary_payments_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
);

COMMENT ON TABLE salary_payments IS 'Salary payment transactions';

-- ----------------------------------------------
-- SYSTEM MONITORING
-- ----------------------------------------------

-- 3.42: System Logs
CREATE TABLE system_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id INTEGER,
    old_data JSONB,
    new_data JSONB,
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    browser_info TEXT,
    request_url TEXT,
    request_method VARCHAR(10),
    status_code INTEGER,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT check_action_type CHECK (action_type IN ('LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'INSERT', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT', 'PRINT'))
);

COMMENT ON TABLE system_logs IS 'Audit log for all system activities';

-- 3.43: Session Table
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
);

COMMENT ON TABLE user_sessions IS 'Active user sessions';

-- ============================================================
-- SECTION 4: CREATE INDEXES
-- ============================================================

-- Security Module Indexes
CREATE INDEX idx_users_username ON users(username) WHERE deleted = FALSE;
CREATE INDEX idx_users_email ON users(email) WHERE deleted = FALSE;
CREATE INDEX idx_users_role ON users(role_id) WHERE deleted = FALSE;
CREATE INDEX idx_user_branches_user ON user_branches(user_id) WHERE deleted = FALSE;
CREATE INDEX idx_user_branches_branch ON user_branches(branch_id) WHERE deleted = FALSE;

-- Location Module Indexes
CREATE INDEX idx_addresses_city ON addresses(city_id) WHERE deleted = FALSE;
CREATE INDEX idx_cities_state ON cities(state_id) WHERE deleted = FALSE;
CREATE INDEX idx_states_country ON states_or_regions(country_id) WHERE deleted = FALSE;

-- Customer Module Indexes
CREATE INDEX idx_customers_phone ON customers(phone) WHERE deleted = FALSE;
CREATE INDEX idx_customers_code ON customers(customer_code) WHERE deleted = FALSE;
CREATE INDEX idx_customers_branch ON customers(branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_customers_name ON customers(full_name) WHERE deleted = FALSE;

-- Cargo Module Indexes
CREATE INDEX idx_cargo_tracking ON cargo(tracking_number) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_sender ON cargo(sender_id) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_receiver ON cargo(receiver_id) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_from_branch ON cargo(from_branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_to_branch ON cargo(to_branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_status ON cargo(current_status_id) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_branch ON cargo(branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_created ON cargo(created_at) WHERE deleted = FALSE;
CREATE INDEX idx_cargo_history_cargo ON cargo_history(cargo_id);
CREATE INDEX idx_cargo_history_status ON cargo_history(status_id);
CREATE INDEX idx_cargo_history_branch ON cargo_history(branch_id);

-- Transportation Module Indexes
CREATE INDEX idx_transport_providers_type ON transport_providers(provider_type_id) WHERE deleted = FALSE;
CREATE INDEX idx_routes_from_branch ON routes(from_branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_routes_to_branch ON routes(to_branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_trips_provider ON trips(provider_id) WHERE deleted = FALSE;
CREATE INDEX idx_trips_route ON trips(route_id) WHERE deleted = FALSE;
CREATE INDEX idx_trips_date ON trips(trip_date) WHERE deleted = FALSE;
CREATE INDEX idx_trip_cargo_trip ON trip_cargo(trip_id) WHERE deleted = FALSE;
CREATE INDEX idx_trip_cargo_cargo ON trip_cargo(cargo_id) WHERE deleted = FALSE;

-- Finance Module Indexes
CREATE INDEX idx_accounts_branch ON accounts(branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_accounts_type ON accounts(account_type_id) WHERE deleted = FALSE;
CREATE INDEX idx_payments_cargo ON payments(cargo_id) WHERE deleted = FALSE;
CREATE INDEX idx_payments_account ON payments(account_id) WHERE deleted = FALSE;
CREATE INDEX idx_payments_branch ON payments(branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_payments_date ON payments(payment_date) WHERE deleted = FALSE;
CREATE INDEX idx_expense_charges_type ON expense_charges(expense_type_id) WHERE deleted = FALSE;
CREATE INDEX idx_expense_charges_branch ON expense_charges(branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_expense_charges_month ON expense_charges(charge_month) WHERE deleted = FALSE;

-- HRM Module Indexes
CREATE INDEX idx_employees_job ON employees(job_id) WHERE deleted = FALSE;
CREATE INDEX idx_employees_type ON employees(employee_type_id) WHERE deleted = FALSE;
CREATE INDEX idx_employees_email ON employees(email) WHERE deleted = FALSE;
CREATE INDEX idx_employees_code ON employees(employee_code) WHERE deleted = FALSE;
CREATE INDEX idx_employee_branches_emp ON employee_branches(employee_id) WHERE deleted = FALSE;
CREATE INDEX idx_employee_branches_branch ON employee_branches(branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_employee_branches_shift ON employee_branches(shift_id) WHERE deleted = FALSE;
CREATE INDEX idx_attendance_date ON employee_attendance(attendance_date) WHERE deleted = FALSE;
CREATE INDEX idx_salary_records_emp ON salary_records(employee_branch_id) WHERE deleted = FALSE;
CREATE INDEX idx_salary_records_month ON salary_records(salary_month) WHERE deleted = FALSE;

-- System Logs Indexes
CREATE INDEX idx_system_logs_user ON system_logs(user_id);
CREATE INDEX idx_system_logs_action ON system_logs(action_type);
CREATE INDEX idx_system_logs_table ON system_logs(table_name);
CREATE INDEX idx_system_logs_created ON system_logs(created_at);

-- ============================================================
-- SECTION 5: INSERT DEFAULT DATA
-- ============================================================

-- Insert Roles
INSERT INTO roles (role_name, role_description) VALUES
('Admin', 'System Administrator with full access'),
('Finance', 'Finance Department Access'),
('Admission', 'Admission/Registration Access'),
('Manager', 'Branch Manager Access'),
('Staff', 'Regular Staff Access'),
('Viewer', 'Read-only Access');

-- Insert Default Countries (Somalia Region)
INSERT INTO countries (country_code, country_name, phone_code, currency_code) VALUES
('SO', 'Somalia', '+252', 'SOS'),
('KE', 'Kenya', '+254', 'KES'),
('ET', 'Ethiopia', '+251', 'ETB'),
('DJ', 'Djibouti', '+253', 'DJF'),
('UG', 'Uganda', '+256', 'UGX'),
('TZ', 'Tanzania', '+255', 'TZS');

-- Insert Default States/Regions for Somalia
DO $$
DECLARE somalia_id INTEGER;
BEGIN
    SELECT id INTO somalia_id FROM countries WHERE country_code = 'SO';
    
    INSERT INTO states_or_regions (country_id, state_name, state_code) VALUES
    (somalia_id, 'Banaadir', 'BN'),
    (somalia_id, 'Mudug', 'MD'),
    (somalia_id, 'Nugaal', 'NG'),
    (somalia_id, 'Awdal', 'AW'),
    (somalia_id, 'Sanaag', 'SA'),
    (somalia_id, 'Sool', 'SO'),
    (somalia_id, 'Gedo', 'GD'),
    (somalia_id, 'Bakool', 'BK'),
    (somalia_id, 'Bay', 'BY'),
    (somalia_id, 'Lower Shabelle', 'LS'),
    (somalia_id, 'Middle Shabelle', 'MS'),
    (somalia_id, 'Lower Juba', 'LJ'),
    (somalia_id, 'Middle Juba', 'MJ'),
    (somalia_id, 'Galguduud', 'GL');
END $$;

-- Insert Default Cities for Somalia
DO $$
DECLARE banaadir_id INTEGER;
DECLARE mudug_id INTEGER;
DECLARE nugaal_id INTEGER;
BEGIN
    SELECT id INTO banaadir_id FROM states_or_regions WHERE state_code = 'BN';
    SELECT id INTO mudug_id FROM states_or_regions WHERE state_code = 'MD';
    SELECT id INTO nugaal_id FROM states_or_regions WHERE state_code = 'NG';
    
    INSERT INTO cities (state_id, city_name, city_code) VALUES
    (banaadir_id, 'Mogadishu', 'MGQ'),
    (banaadir_id, 'Afgooye', 'AFG'),
    (mudug_id, 'Galkayo', 'GLK'),
    (mudug_id, 'Galdogob', 'GDB'),
    (nugaal_id, 'Garowe', 'GRW'),
    (nugaal_id, 'Eyl', 'EYL');
END $$;

-- Insert Cargo Statuses
INSERT INTO cargo_status (status_name, status_description, is_terminal, display_order) VALUES
('Pending', 'Cargo registered and pending pickup', FALSE, 1),
('Picked Up', 'Cargo picked up from sender', FALSE, 2),
('In Transit', 'Cargo is in transit', FALSE, 3),
('Arrived', 'Cargo arrived at destination branch', FALSE, 4),
('Ready for Pickup', 'Cargo ready for receiver pickup', FALSE, 5),
('Delivered', 'Cargo delivered to receiver', TRUE, 6),
('Cancelled', 'Cargo shipment cancelled', TRUE, 7);

-- Insert Payment Methods
INSERT INTO payment_methods (method_name, method_description) VALUES
('Cash', 'Cash Payment'),
('Bank Transfer', 'Bank Transfer'),
('Mobile Money', 'Mobile Money Payment'),
('Cheque', 'Cheque Payment');

-- Insert Account Types
INSERT INTO account_types (type_name, type_description) VALUES
('Bank', 'Bank Account'),
('Cash', 'Cash Account'),
('Mobile Money', 'Mobile Money Account');

-- Insert Expense Types
INSERT INTO expense_types (type_name, type_description) VALUES
('Salary', 'Employee Salary Expenses'),
('Transport', 'Transportation Costs'),
('Fuel', 'Fuel Expenses'),
('Office Rent', 'Office Rent Payments'),
('Maintenance', 'Maintenance Costs'),
('Utilities', 'Utilities Expenses');

-- Insert Provider Types
INSERT INTO provider_types (type_name, type_description) VALUES
('Truck', 'Truck Transport'),
('Air', 'Air Transport'),
('Sea', 'Sea Transport'),
('Rail', 'Rail Transport');

-- Insert Salary Types
INSERT INTO salary_types (type_name, type_description) VALUES
('Monthly', 'Monthly Salary'),
('Weekly', 'Weekly Salary'),
('Daily', 'Daily Salary'),
('Hourly', 'Hourly Rate');

-- Insert Employee Types
INSERT INTO employee_types (type_name, type_description) VALUES
('Permanent', 'Permanent Employee'),
('Contract', 'Contract Employee'),
('Part-time', 'Part-time Employee'),
('Intern', 'Intern/Trainee');

-- Insert Shifts
INSERT INTO shifts (shift_name, start_time, end_time) VALUES
('Morning', '08:00:00', '16:00:00'),
('Afternoon', '16:00:00', '00:00:00'),
('Night', '00:00:00', '08:00:00');

-- Insert Working Days
INSERT INTO working_days (day_name, day_code, display_order) VALUES
('Monday', 'MON', 1),
('Tuesday', 'TUE', 2),
('Wednesday', 'WED', 3),
('Thursday', 'THU', 4),
('Friday', 'FRI', 5),
('Saturday', 'SAT', 6),
('Sunday', 'SUN', 7);

-- Insert Default Jobs
INSERT INTO jobs (job_title, job_description) VALUES
('Manager', 'Branch Manager'),
('Finance Officer', 'Finance Department Staff'),
('Customer Service', 'Customer Service Representative'),
('Driver', 'Vehicle Driver'),
('Loader', 'Loading Staff'),
('Admin Officer', 'Administration Staff'),
('Receptionist', 'Front Desk Receptionist');

-- Insert Default Privileges
INSERT INTO privileges (privilege_name, icon_class, display_order) VALUES
('Dashboard', 'fa-dashboard', 1),
('Cargo Management', 'fa-truck', 2),
('Customer Management', 'fa-users', 3),
('Transport Management', 'fa-bus', 4),
('Financial Management', 'fa-money', 5),
('HR Management', 'fa-users-cog', 6),
('Reports', 'fa-file-alt', 7),
('Administration', 'fa-cogs', 8);

-- Insert Default Menu Privileges
DO $$
DECLARE dashboard_id INTEGER;
DECLARE cargo_id INTEGER;
DECLARE customer_id INTEGER;
DECLARE transport_id INTEGER;
DECLARE financial_id INTEGER;
DECLARE hr_id INTEGER;
BEGIN
    SELECT id INTO dashboard_id FROM privileges WHERE privilege_name = 'Dashboard';
    SELECT id INTO cargo_id FROM privileges WHERE privilege_name = 'Cargo Management';
    SELECT id INTO customer_id FROM privileges WHERE privilege_name = 'Customer Management';
    SELECT id INTO transport_id FROM privileges WHERE privilege_name = 'Transport Management';
    SELECT id INTO financial_id FROM privileges WHERE privilege_name = 'Financial Management';
    SELECT id INTO hr_id FROM privileges WHERE privilege_name = 'HR Management';
    
    -- Dashboard Menu Items
    INSERT INTO menu_privileges (privilege_id, menu_name, menu_url, icon_class, display_order) VALUES
    (dashboard_id, 'Main Dashboard', '/dashboard', 'fa-dashboard', 1);
    
    -- Cargo Menu Items
    INSERT INTO menu_privileges (privilege_id, menu_name, menu_url, icon_class, display_order) VALUES
    (cargo_id, 'Register Cargo', '/cargo/register', 'fa-plus', 1),
    (cargo_id, 'Track Cargo', '/cargo/track', 'fa-search', 2),
    (cargo_id, 'All Shipments', '/cargo/list', 'fa-list', 3);
    
    -- Customer Menu Items
    INSERT INTO menu_privileges (privilege_id, menu_name, menu_url, icon_class, display_order) VALUES
    (customer_id, 'Register Customer', '/customers/register', 'fa-user-plus', 1),
    (customer_id, 'Customer List', '/customers/list', 'fa-users', 2);
    
    -- Transport Menu Items
    INSERT INTO menu_privileges (privilege_id, menu_name, menu_url, icon_class, display_order) VALUES
    (transport_id, 'Routes', '/transport/routes', 'fa-road', 1),
    (transport_id, 'Trips', '/transport/trips', 'fa-trip', 2),
    (transport_id, 'Providers', '/transport/providers', 'fa-building', 3);
    
    -- Financial Menu Items
    INSERT INTO menu_privileges (privilege_id, menu_name, menu_url, icon_class, display_order) VALUES
    (financial_id, 'Accounts', '/finance/accounts', 'fa-university', 1),
    (financial_id, 'Payments', '/finance/payments', 'fa-credit-card', 2),
    (financial_id, 'Expenses', '/finance/expenses', 'fa-calculator', 3);
    
    -- HR Menu Items
    INSERT INTO menu_privileges (privilege_id, menu_name, menu_url, icon_class, display_order) VALUES
    (hr_id, 'Employees', '/hr/employees', 'fa-user-tie', 1),
    (hr_id, 'Attendance', '/hr/attendance', 'fa-clock', 2),
    (hr_id, 'Payroll', '/hr/payroll', 'fa-money-bill', 3);
END $$;

-- Insert Default Sub-Privileges (Action Permissions)
DO $$
DECLARE menu_id INTEGER;
BEGIN
    -- For Cargo Registration Menu
    SELECT id INTO menu_id FROM menu_privileges WHERE menu_name = 'Register Cargo';
    
    INSERT INTO sub_privileges (menu_privilege_id, action_name, action_key) VALUES
    (menu_id, 'Create Cargo', 'cargo_create'),
    (menu_id, 'Update Cargo', 'cargo_update'),
    (menu_id, 'Delete Cargo', 'cargo_delete'),
    (menu_id, 'View Cargo', 'cargo_view');
    
    -- For Cargo Track Menu
    SELECT id INTO menu_id FROM menu_privileges WHERE menu_name = 'Track Cargo';
    
    INSERT INTO sub_privileges (menu_privilege_id, action_name, action_key) VALUES
    (menu_id, 'Track Cargo', 'cargo_track');
    
    -- For Customer Registration Menu
    SELECT id INTO menu_id FROM menu_privileges WHERE menu_name = 'Register Customer';
    
    INSERT INTO sub_privileges (menu_privilege_id, action_name, action_key) VALUES
    (menu_id, 'Create Customer', 'customer_create'),
    (menu_id, 'Update Customer', 'customer_update'),
    (menu_id, 'Delete Customer', 'customer_delete'),
    (menu_id, 'View Customer', 'customer_view');
END $$;

-- ============================================================
-- SECTION 6: VIEWS
-- ============================================================

-- 6.1: View for Cargo with Full Details
CREATE OR REPLACE VIEW vw_cargo_details AS
SELECT 
    c.id,
    c.tracking_number,
    sender.full_name AS sender_name,
    sender.phone AS sender_phone,
    receiver.full_name AS receiver_name,
    receiver.phone AS receiver_phone,
    fb.branch_name AS from_branch,
    tb.branch_name AS to_branch,
    cb.branch_name AS current_branch,
    cs.status_name AS current_status,
    c.weight,
    c.total_price,
    c.created_at,
    c.expected_delivery_date,
    c.actual_delivery_date
FROM cargo c
JOIN customers sender ON c.sender_id = sender.id
JOIN customers receiver ON c.receiver_id = receiver.id
JOIN branches fb ON c.from_branch_id = fb.id
JOIN branches tb ON c.to_branch_id = tb.id
LEFT JOIN branches cb ON c.current_branch_id = cb.id
JOIN cargo_status cs ON c.current_status_id = cs.id
WHERE c.deleted = FALSE;

-- 6.2: View for Employee with Branch Details
CREATE OR REPLACE VIEW vw_employee_details AS
SELECT 
    e.id,
    e.employee_code,
    e.full_name,
    e.phone,
    e.email,
    j.job_title,
    et.type_name AS employee_type,
    st.type_name AS salary_type,
    e.base_salary,
    b.branch_name,
    s.shift_name,
    e.hire_date,
    e.is_active
FROM employees e
JOIN jobs j ON e.job_id = j.id
JOIN employee_types et ON e.employee_type_id = et.id
JOIN salary_types st ON e.salary_type_id = st.id
JOIN employee_branches eb ON e.id = eb.employee_id
JOIN branches b ON eb.branch_id = b.id
JOIN shifts s ON eb.shift_id = s.id
WHERE e.deleted = FALSE AND eb.deleted = FALSE;

-- 6.3: View for Trip with Cargo Summary
CREATE OR REPLACE VIEW vw_trip_details AS
SELECT 
    t.id,
    t.trip_code,
    tp.provider_name,
    r.route_code,
    fb.branch_name AS from_branch,
    tb.branch_name AS to_branch,
    t.trip_date,
    t.departure_time,
    t.estimated_arrival_time,
    COUNT(tc.cargo_id) AS cargo_count,
    SUM(tc.transport_cost) AS total_transport_cost,
    t.status AS trip_status
FROM trips t
JOIN transport_providers tp ON t.provider_id = tp.id
JOIN routes r ON t.route_id = r.id
JOIN branches fb ON r.from_branch_id = fb.id
JOIN branches tb ON r.to_branch_id = tb.id
LEFT JOIN trip_cargo tc ON t.id = tc.trip_id AND tc.deleted = FALSE
WHERE t.deleted = FALSE
GROUP BY t.id, tp.provider_name, r.route_code, fb.branch_name, tb.branch_name;

-- 6.4: View for Financial Summary
CREATE OR REPLACE VIEW vw_financial_summary AS
SELECT 
    a.id,
    a.account_code,
    a.account_name,
    at.type_name AS account_type,
    a.balance,
    b.branch_name,
    a.currency_code,
    COUNT(p.id) AS payment_count,
    COALESCE(SUM(p.amount), 0) AS total_payments
FROM accounts a
JOIN account_types at ON a.account_type_id = at.id
JOIN branches b ON a.branch_id = b.id
LEFT JOIN payments p ON a.id = p.account_id AND p.deleted = FALSE
WHERE a.deleted = FALSE
GROUP BY a.id, at.type_name, b.branch_name;

-- ============================================================
-- SECTION 7: FUNCTIONS AND STORED PROCEDURES
-- ============================================================

-- 7.1: Function to Generate Tracking Number
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    tracking_no VARCHAR(50);
    exists_flag BOOLEAN;
BEGIN
    LOOP
        -- Format: CARGO-YYYYMMDD-XXXXX
        tracking_no := 'CARGO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                       LPAD(FLOOR(RANDOM() * 100000)::VARCHAR, 5, '0');
        
        SELECT EXISTS(SELECT 1 FROM cargo WHERE tracking_number = tracking_no) INTO exists_flag;
        
        EXIT WHEN NOT exists_flag;
    END LOOP;
    
    RETURN tracking_no;
END;
$$ LANGUAGE plpgsql;

-- 7.2: Function to Calculate Net Salary
CREATE OR REPLACE FUNCTION calculate_net_salary(
    p_base_salary DECIMAL,
    p_overtime_pay DECIMAL DEFAULT 0,
    p_bonus DECIMAL DEFAULT 0,
    p_commission DECIMAL DEFAULT 0,
    p_deductions DECIMAL DEFAULT 0
)
RETURNS DECIMAL AS $$
BEGIN
    RETURN p_base_salary + p_overtime_pay + p_bonus + p_commission - p_deductions;
END;
$$ LANGUAGE plpgsql;

-- 7.3: Function to Update Account Balance
CREATE OR REPLACE FUNCTION update_account_balance(
    p_account_id INTEGER,
    p_amount DECIMAL,
    p_operation VARCHAR(10)
)
RETURNS VOID AS $$
BEGIN
    IF p_operation = 'CREDIT' THEN
        UPDATE accounts SET balance = balance + p_amount WHERE id = p_account_id;
    ELSIF p_operation = 'DEBIT' THEN
        UPDATE accounts SET balance = balance - p_amount WHERE id = p_account_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7.4: Function to Check Cargo Status History
CREATE OR REPLACE FUNCTION check_cargo_status_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Log status change in cargo_history
    INSERT INTO cargo_history (
        cargo_id,
        status_id,
        location_name,
        note,
        updated_by,
        branch_id,
        created_at
    )
    VALUES (
        NEW.id,
        NEW.current_status_id,
        (SELECT branch_name FROM branches WHERE id = NEW.current_branch_id),
        'Status updated via trigger',
        NEW.updated_by,
        NEW.branch_id,
        CURRENT_TIMESTAMP
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7.5: Function to Log System Actions
CREATE OR REPLACE FUNCTION log_system_action()
RETURNS TRIGGER AS $$
DECLARE
    log_action VARCHAR(50);
    log_data JSONB;
    user_id_val INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        log_action := 'INSERT';
        log_data := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        log_action := 'UPDATE';
        log_data := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        log_action := 'DELETE';
        log_data := to_jsonb(OLD);
    END IF;
    
    -- Get user_id from session or context
    user_id_val := current_setting('app.current_user_id', TRUE)::INTEGER;
    
    INSERT INTO system_logs (
        user_id,
        action_type,
        table_name,
        record_id,
        new_data,
        description,
        ip_address,
        request_url,
        request_method
    ) VALUES (
        user_id_val,
        log_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        log_data,
        log_action || ' operation on ' || TG_TABLE_NAME,
        current_setting('app.client_ip', TRUE)::INET,
        current_setting('app.request_url', TRUE),
        current_setting('app.request_method', TRUE)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 7.6: Procedure to Process Monthly Salary
CREATE OR REPLACE PROCEDURE process_monthly_salary(
    p_year INTEGER,
    p_month INTEGER,
    p_branch_id INTEGER DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    emp_rec RECORD;
    salary_month DATE;
    net_salary DECIMAL;
    month_start DATE;
    month_end DATE;
BEGIN
    salary_month := TO_DATE(p_year || '-' || p_month || '-01', 'YYYY-MM-DD');
    month_start := DATE_TRUNC('month', salary_month);
    month_end := month_start + INTERVAL '1 month' - INTERVAL '1 day';
    
    FOR emp_rec IN 
        SELECT 
            eb.id AS employee_branch_id,
            eb.salary_amount AS base_salary,
            COALESCE(SUM(CASE WHEN ea.is_present THEN 1 ELSE 0 END), 0) AS days_present,
            COALESCE(SUM(ea.overtime_hours), 0) AS total_overtime
        FROM employee_branches eb
        JOIN employees e ON eb.employee_id = e.id
        LEFT JOIN employee_attendance ea ON eb.id = ea.employee_schedule_id
        WHERE eb.deleted = FALSE 
          AND e.is_active = TRUE
          AND (p_branch_id IS NULL OR eb.branch_id = p_branch_id)
          AND ea.attendance_date BETWEEN month_start AND month_end
        GROUP BY eb.id, eb.salary_amount
    LOOP
        -- Calculate overtime pay (example: base_salary / 30 / 8 * 1.5 * overtime_hours)
        net_salary := calculate_net_salary(
            emp_rec.base_salary,
            (emp_rec.base_salary / 30 / 8 * 1.5 * emp_rec.total_overtime),
            0,  -- bonus
            0,  -- commission
            0   -- deductions
        );
        
        INSERT INTO salary_records (
            employee_branch_id,
            salary_month,
            base_salary,
            overtime_pay,
            net_salary,
            created_by,
            branch_id,
            created_at
        ) VALUES (
            emp_rec.employee_branch_id,
            salary_month,
            emp_rec.base_salary,
            (emp_rec.base_salary / 30 / 8 * 1.5 * emp_rec.total_overtime),
            net_salary,
            current_setting('app.current_user_id', TRUE)::INTEGER,
            p_branch_id,
            CURRENT_TIMESTAMP
        );
    END LOOP;
END;
$$;

-- ============================================================
-- SECTION 8: TRIGGERS
-- ============================================================

-- 8.1: Trigger for Cargo Status History
CREATE TRIGGER trg_cargo_status_history
    AFTER UPDATE OF current_status_id ON cargo
    FOR EACH ROW
    WHEN (OLD.current_status_id IS DISTINCT FROM NEW.current_status_id)
    EXECUTE FUNCTION check_cargo_status_history();

-- 8.2: Trigger for System Logs (Example for Cargo Table)
CREATE TRIGGER trg_cargo_log
    AFTER INSERT OR UPDATE OR DELETE ON cargo
    FOR EACH ROW
    EXECUTE FUNCTION log_system_action();

-- 8.3: Trigger for Customer Logs
CREATE TRIGGER trg_customer_log
    AFTER INSERT OR UPDATE OR DELETE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION log_system_action();

-- 8.4: Trigger for Payment Logs
CREATE TRIGGER trg_payment_log
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION log_system_action();

-- 8.5: Trigger to Update Updated_At Timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cargo_update_timestamp
    BEFORE UPDATE ON cargo
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_customers_update_timestamp
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SECTION 9: SAMPLE QUERIES
-- ============================================================

-- 9.1: Get Cargo Tracking Information
/*
SELECT 
    tracking_number,
    sender_name,
    receiver_name,
    current_status,
    from_branch,
    to_branch
FROM vw_cargo_details
WHERE tracking_number = 'CARGO-20231201-12345';
*/

-- 9.2: Get Customer Cargo History
/*
SELECT 
    c.tracking_number,
    c.total_price,
    cs.status_name,
    c.created_at,
    c.actual_delivery_date
FROM cargo c
JOIN cargo_status cs ON c.current_status_id = cs.id
WHERE c.sender_id = (SELECT id FROM customers WHERE phone = '+252612345678')
   OR c.receiver_id = (SELECT id FROM customers WHERE phone = '+252612345678')
ORDER BY c.created_at DESC;
*/

-- 9.3: Get Branch Revenue Report
/*
SELECT 
    b.branch_name,
    COUNT(c.id) AS total_shipments,
    COALESCE(SUM(c.total_price), 0) AS total_revenue,
    COUNT(p.id) AS total_payments,
    COALESCE(SUM(p.amount), 0) AS total_collected
FROM branches b
LEFT JOIN cargo c ON b.id = c.branch_id AND c.deleted = FALSE
LEFT JOIN payments p ON b.id = p.branch_id AND p.deleted = FALSE
WHERE b.deleted = FALSE
GROUP BY b.id, b.branch_name
ORDER BY total_revenue DESC;
*/

-- 9.4: Get Employee Attendance Summary
/*
SELECT 
    e.full_name,
    COUNT(CASE WHEN ea.is_present THEN 1 END) AS days_present,
    COUNT(CASE WHEN ea.is_absent THEN 1 END) AS days_absent,
    SUM(ea.overtime_hours) AS total_overtime,
    AVG(CASE WHEN ea.is_present THEN 1 ELSE 0 END) * 100 AS attendance_percentage
FROM employees e
JOIN employee_branches eb ON e.id = eb.employee_id
JOIN employee_attendance ea ON eb.id = ea.employee_schedule_id
WHERE ea.attendance_date BETWEEN '2024-01-01' AND '2024-01-31'
  AND e.deleted = FALSE
GROUP BY e.id, e.full_name;
*/

-- ============================================================
-- SECTION 10: PERFORMANCE RECOMMENDATIONS
-- ============================================================

-- 10.1: Partitioning Strategy
-- For large tables like cargo_history, consider partitioning by date

-- 10.2: Regular VACUUM and ANALYZE
-- Run: VACUUM ANALYZE; regularly

-- 10.3: Connection Pooling
-- Use PgBouncer or similar for connection pooling

-- 10.4: Read Replicas
-- Consider setting up read replicas for reporting queries

-- 10.5: Query Optimization
-- Use EXPLAIN ANALYZE to identify slow queries
-- Create appropriate indexes for frequently used WHERE clauses

-- 10.6: Backup Strategy
-- Use pg_dump for regular backups
-- Consider Point-in-Time Recovery (PITR) for critical data

-- 10.7: Monitoring
-- Monitor with pg_stat_statements
-- Set up alerting for slow queries and errors

-- ============================================================
-- SECTION 11: COMMENTS AND DOCUMENTATION
-- ============================================================

COMMENT ON DATABASE cargo_management_system IS 'Production Cargo Management System Database';

-- ============================================================
-- END OF DATABASE SCRIPT
-- ============================================================