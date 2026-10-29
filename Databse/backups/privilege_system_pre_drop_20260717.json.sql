-- Pre-drop backup of dormant privilege-system tables, taken before migration 005.
-- Generated 2026-07-17T18:03:22.347Z

-- privileges (6 rows)
[
  {
    "privilege_id": 1,
    "name": "Dashboard",
    "icon_class": "fa-dashboard",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.112Z"
  },
  {
    "privilege_id": 2,
    "name": "Cargo Management",
    "icon_class": "fa-box",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.112Z"
  },
  {
    "privilege_id": 3,
    "name": "Finance",
    "icon_class": "fa-money",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.112Z"
  },
  {
    "privilege_id": 4,
    "name": "Transport",
    "icon_class": "fa-truck",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.112Z"
  },
  {
    "privilege_id": 5,
    "name": "HRM",
    "icon_class": "fa-users",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.112Z"
  },
  {
    "privilege_id": 6,
    "name": "Settings",
    "icon_class": "fa-cog",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.112Z"
  }
]

-- menu_privileges (20 rows)
[
  {
    "menu_privilege_id": 1,
    "privilege_id": 2,
    "menu_name": "All Cargo",
    "menu_url": "/cargo/list",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 2,
    "privilege_id": 2,
    "menu_name": "New Cargo",
    "menu_url": "/cargo/create",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 3,
    "privilege_id": 2,
    "menu_name": "Tracking",
    "menu_url": "/cargo/tracking",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 4,
    "privilege_id": 3,
    "menu_name": "Payments",
    "menu_url": "/finance/payments",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 5,
    "privilege_id": 3,
    "menu_name": "Accounts",
    "menu_url": "/finance/accounts",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 6,
    "privilege_id": 3,
    "menu_name": "Expenses",
    "menu_url": "/finance/expenses",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 7,
    "privilege_id": 4,
    "menu_name": "Trips",
    "menu_url": "/transport/trips",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 8,
    "privilege_id": 4,
    "menu_name": "Providers",
    "menu_url": "/transport/providers",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 9,
    "privilege_id": 5,
    "menu_name": "Employees",
    "menu_url": "/hrm/employees",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 10,
    "privilege_id": 5,
    "menu_name": "Salary",
    "menu_url": "/hrm/salary",
    "state": "active",
    "created_at": "2026-06-11T05:00:02.113Z"
  },
  {
    "menu_privilege_id": 11,
    "privilege_id": 2,
    "menu_name": "All Cargo",
    "menu_url": "/cargo/list",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 12,
    "privilege_id": 2,
    "menu_name": "New Cargo",
    "menu_url": "/cargo/create",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 13,
    "privilege_id": 2,
    "menu_name": "Tracking",
    "menu_url": "/cargo/tracking",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 14,
    "privilege_id": 3,
    "menu_name": "Payments",
    "menu_url": "/finance/payments",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 15,
    "privilege_id": 3,
    "menu_name": "Accounts",
    "menu_url": "/finance/accounts",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 16,
    "privilege_id": 3,
    "menu_name": "Expenses",
    "menu_url": "/finance/expenses",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 17,
    "privilege_id": 4,
    "menu_name": "Trips",
    "menu_url": "/transport/trips",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 18,
    "privilege_id": 4,
    "menu_name": "Providers",
    "menu_url": "/transport/providers",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 19,
    "privilege_id": 5,
    "menu_name": "Employees",
    "menu_url": "/hrm/employees",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  },
  {
    "menu_privilege_id": 20,
    "privilege_id": 5,
    "menu_name": "Salary",
    "menu_url": "/hrm/salary",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.685Z"
  }
]

-- sub_privileges (18 rows)
[
  {
    "sub_privilege_id": 1,
    "menu_privilege_id": 1,
    "action_name": "View Cargo",
    "action_key": "view_cargo",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 2,
    "menu_privilege_id": 1,
    "action_name": "Create Cargo",
    "action_key": "create_cargo",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 3,
    "menu_privilege_id": 1,
    "action_name": "Update Cargo",
    "action_key": "update_cargo",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 4,
    "menu_privilege_id": 1,
    "action_name": "Delete Cargo",
    "action_key": "delete_cargo",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 5,
    "menu_privilege_id": 3,
    "action_name": "Track Shipment",
    "action_key": "track_shipment",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 6,
    "menu_privilege_id": 4,
    "action_name": "View Payments",
    "action_key": "view_payments",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 7,
    "menu_privilege_id": 4,
    "action_name": "Make Payment",
    "action_key": "make_payment",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 8,
    "menu_privilege_id": 5,
    "action_name": "View Accounts",
    "action_key": "view_accounts",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 9,
    "menu_privilege_id": 5,
    "action_name": "Manage Accounts",
    "action_key": "manage_accounts",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 10,
    "menu_privilege_id": 6,
    "action_name": "View Expenses",
    "action_key": "view_expenses",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 11,
    "menu_privilege_id": 6,
    "action_name": "Manage Expenses",
    "action_key": "manage_expenses",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 12,
    "menu_privilege_id": 7,
    "action_name": "View Trips",
    "action_key": "view_trips",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 13,
    "menu_privilege_id": 7,
    "action_name": "Create Trip",
    "action_key": "create_trip",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 14,
    "menu_privilege_id": 8,
    "action_name": "View Providers",
    "action_key": "view_providers",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 15,
    "menu_privilege_id": 9,
    "action_name": "View Employees",
    "action_key": "view_employees",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 16,
    "menu_privilege_id": 9,
    "action_name": "Manage Employees",
    "action_key": "manage_employees",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 17,
    "menu_privilege_id": 10,
    "action_name": "View Salary",
    "action_key": "view_salary",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  },
  {
    "sub_privilege_id": 18,
    "menu_privilege_id": 10,
    "action_name": "Manage Salary",
    "action_key": "manage_salary",
    "state": "active",
    "created_at": "2026-06-11T05:04:41.887Z"
  }
]

-- user_privileges (2 rows)
[
  {
    "user_privilege_id": 1,
    "sub_privilege_id": 5,
    "user_branch_id": 1,
    "granted_by": 1,
    "state": "active",
    "created_at": "2026-06-11T05:04:41.926Z",
    "deleted": false
  },
  {
    "user_privilege_id": 2,
    "sub_privilege_id": 1,
    "user_branch_id": 1,
    "granted_by": 1,
    "state": "active",
    "created_at": "2026-06-11T05:04:41.926Z",
    "deleted": false
  }
]

