# Phase 3 Security Test Matrix

| Test | Scope | Result | Evidence |
|---|---|---|---|
| Server-only zero-policy table contract | Static migration review | PENDING EXECUTION | `supabase/tests/local_security_contract_test.sh` |
| Private rate-limit server-only contract | Static migration review | PENDING EXECUTION | Same test |
| Catalog helper client revokes | Static migration review | PENDING EXECUTION | Same test |
| `business_module_for_listing` non-definer contract | Static migration review | PENDING EXECUTION | Same test |
| Anonymous SELECT/INSERT/UPDATE/DELETE isolation | Database role test | BLOCKED | Requires isolated PostgreSQL/Supabase runtime |
| Customer A versus customer B isolation | Database role test | BLOCKED | Requires isolated seeded accounts |
| Cross-business member isolation | Database role test | BLOCKED | Requires isolated seeded businesses/accounts |
| Provider/admin/super-admin boundaries | Database role test | BLOCKED | Requires isolated role fixtures |
| SECURITY DEFINER function execution matrix | Database privilege/function-body test | BLOCKED | Requires database runtime |
| Storage path traversal and signed URL access | Storage integration test | BLOCKED | Requires isolated Storage service/accounts |

No mock or static result is counted as runtime authorization verification.
