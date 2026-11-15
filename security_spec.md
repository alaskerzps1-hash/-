# Security Specification — Ministry of Health Portal (بوابة وزارة الصحة)

## 1. Data Invariants
1. **Director Privilege Integrity**: Only users verified via `request.auth.token.email_verified == true` who either match the bootstrapped director email (`alaskerzps1@gmail.com`) or exist in `/admins/{request.auth.uid}` can create, update, or delete departments, employees, rank tiers, discord mappings, director decisions, and admin records.
2. **No Self-Assigned Escalation**: Standard users creating `/users/{userId}` MUST set `role == 'staff'` and `uid == request.auth.uid`, and cannot modify `role` on update unless they are an existing admin.
3. **Referential & ID Integrity**: All document IDs (`userId`, `adminId`, `deptId`, `employeeId`, `rankId`, `mappingId`, `decisionId`, `logId`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` characters. Employees must reference an existing department (`exists(/databases/$(database)/documents/departments/$(incoming().departmentId))` or `existsAfter(...)`) when created or reassigned.
4. **No PII Exposure in Public Directory**: Employee records contain only institutional fields (`fullName`, `employeeCode`, `rank`, `rankLevel`, `departmentName`, `facility`, `status`, `shift`, `extension`, `hireDate`) and no personal PII (no email, phone, or home address). Restricted employee records (`visibility == 'restricted'`) are readable ONLY by directors (`isAdmin()`).
5. **Temporal Integrity & Immutability**: `createdAt` and `updatedAt` must equal `request.time`. `createdAt` and `createdBy` are immutable on update. `auditLogs` and `directorDecisions` are append-only by directors (cannot be mutated to erase history; decisions cannot be edited once issued).
6. **Strict Schema Enforcement**: Every write uses `keys().hasAll(...) && keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update, rejecting unknown shadow fields and oversized strings.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Employee Create**: Anonymous client attempts `POST /employees/emp_1` -> Denied (`isSignedIn()`).
2. **Non-Admin Employee Create**: Signed-in non-director user attempts `POST /employees/emp_1` -> Denied (`isAdmin()`).
3. **Role Self-Escalation on User Profile**: Non-admin user creates `/users/{uid}` with `role: "director"` -> Denied.
4. **Role Modification on User Profile Update**: Non-admin user updates `/users/{uid}` changing `role` from `"staff"` to `"director"` -> Denied (`affectedKeys().hasOnly(['displayName', 'employeeCode', 'updatedAt'])`).
5. **Email Spoofing Attack**: Unverified account (`email_verified: false`) with bootstrapped admin email attempts admin write -> Denied (`isVerified()`).
6. **Shadow Field Injection**: Director creates `/employees/emp_1` with extra ghost field `isSuperAdmin: true` -> Denied (`keys().hasOnly(...)`).
7. **ID Poisoning / Resource Exhaustion**: Client attempts `GET /employees/<2000-char-id>` -> Denied (`isValidId(employeeId)`).
8. **Invalid Employee Code Format**: Director creates `/employees/emp_1` with `employeeCode: "INVALID"` (missing `MOH-` prefix) -> Denied.
9. **Orphaned Employee Department**: Director creates `/employees/emp_1` referencing nonexistent `departmentId: "ghost_dept"` -> Denied (`exists(...)`).
10. **PII Blanket Read on Users**: Signed-in non-admin user attempts `LIST /users` or `GET /users/other_uid` -> Denied (`isOwner(userId) || isAdmin()`).
11. **Restricted Employee Read Leak**: Non-admin user attempts `GET /employees/emp_restricted` where `visibility == 'restricted'` -> Denied.
12. **Client-Forged Timestamp / Immutable Field Mutation**: Director updates `/employees/emp_1` changing `createdAt` or passing past `updatedAt != request.time` -> Denied.
