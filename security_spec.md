# Security Specification - ConfeitaPro AI

This document establishes the Attribute-Based Access Control (ABAC) boundaries, data invariants, and verification criteria for the Firestore security rules.

## 1. Core Data Invariants

1. **Strict Multi-Tenancy**: A user (`owner`) can only read, write, update, or delete data (products, orders, inventory, store config) that belongs to their assigned store.
2. **Public Store Access**: Anonymous/public visitors must be able to:
   - View/read store configuration (e.g., logo, working hours, slug) of any active store.
   - View/read active products within a store.
   - Create (submit) orders into a store's `/orders` subcollection.
3. **No Cross-Tenant Read/Write**: Store owners cannot read or write orders, products, or inventory of other store owners.
4. **Order Status Lifecycle Security**: Customers (public) can only create orders with a status of `pending`. They cannot update any fields of an existing order.
5. **Immutable Identity**: Users cannot change their own `role`, `status`, or `plan` attributes in their profile. Only the Platform Admin (`Josuealvaro.damata@gmail.com`) can modify these fields.
6. **No Self-Registration as Admin**: No user can create a profile claiming `role: 'admin'`.
7. **Default Deny Catch-All**: Any resource path not explicitly matched is denied by default.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent malicious requests designed to exploit potential security rule weaknesses (e.g., identity spoofing, value poisoning, status bypassing, data cross-talk).

### Payload 1: Privilege Escalation (Self-Admin Role Registration)
- **Path**: `/users/attacker123` (Creation)
- **Payload**:
  ```json
  {
    "uid": "attacker123",
    "email": "attacker@gmail.com",
    "name": "Attacker",
    "role": "admin",
    "status": "active",
    "plan": "pro"
  }
  ```
- **Reason to Deny**: Users should not be able to declare themselves as admins or change their tier parameters on creation.

### Payload 2: Plan Spoofing (Upgrading Plan without Payment)
- **Path**: `/users/owner123` (Update)
- **Payload**:
  ```json
  {
    "plan": "pro"
  }
  ```
- **Reason to Deny**: An owner cannot update their own plan directly from the client.

### Payload 3: Cross-Tenant Store Takeover (Modifying another Store Config)
- **Path**: `/stores/victimStoreId` (Update by `owner123` with `uid: owner123`)
- **Payload**:
  ```json
  {
    "name": "Victim's Bakery - Hacked",
    "ownerId": "attacker123"
  }
  ```
- **Reason to Deny**: An owner cannot update details of a store that doesn't belong to them or spoof the owner ID.

### Payload 4: Overwriting Store Slug to Hijack URL
- **Path**: `/stores/ownerStoreId` (Update)
- **Payload**:
  ```json
  {
    "slug": "different-slug"
  }
  ```
- **Reason to Deny**: Store slugs should be immutable after store initialization to prevent breaking customer-facing links and hijacking existing urls.

### Payload 5: Product Price Poisoning (Negative or astronomical price)
- **Path**: `/stores/store123/products/prod123` (Create or Update)
- **Payload**:
  ```json
  {
    "name": "Bolo Formigueiro",
    "price": -50.0,
    "active": true,
    "storeId": "store123"
  }
  ```
- **Reason to Deny**: Negative numbers must be strictly blocked by the validation helper.

### Payload 6: Modifying Product details from another Store
- **Path**: `/stores/victimStoreId/products/prod123` (Create by `owner123`)
- **Payload**:
  ```json
  {
    "name": "Hacked cake",
    "price": 10,
    "active": true,
    "storeId": "victimStoreId"
  }
  ```
- **Reason to Deny**: Users cannot create or edit products in other stores.

### Payload 7: Inventory Poisoning (Negative quantities)
- **Path**: `/stores/store123/inventory/inv123` (Update)
- **Payload**:
  ```json
  {
    "quantity": -10,
    "minStock": 5
  }
  ```
- **Reason to Deny**: Values must be positive integers or floats.

### Payload 8: Order Status Bypass (Setting an Order to "Delivered" on submit)
- **Path**: `/stores/store123/orders/order123` (Create by Public Client)
- **Payload**:
  ```json
  {
    "customerName": "John Doe",
    "customerPhone": "11999999999",
    "deliveryType": "delivery",
    "deliveryDateTime": "2026-07-15T18:00:00Z",
    "items": [],
    "total": 0,
    "status": "delivered",
    "storeId": "store123"
  }
  ```
- **Reason to Deny**: Public creations of orders must default strictly to `pending`.

### Payload 9: Unauthorized Order Read (Cross-Store Spying)
- **Path**: `/stores/victimStoreId/orders/order123` (Read by `owner123`)
- **Reason to Deny**: A tenant owner must never be allowed to read orders from another store.

### Payload 10: Injecting Ghost Fields into Orders
- **Path**: `/stores/store123/orders/order123` (Update by Store Owner)
- **Payload**:
  ```json
  {
    "status": "ready",
    "ghostField": "unauthorized_payload_data"
  }
  ```
- **Reason to Deny**: Must be rejected via `affectedKeys().hasOnly(['status', 'updatedAt'])`.

### Payload 11: Modifying Immutable Order Attributes
- **Path**: `/stores/store123/orders/order123` (Update by Store Owner)
- **Payload**:
  ```json
  {
    "total": 10,
    "status": "ready"
  }
  ```
- **Reason to Deny**: Once an order is created, the owner can only change the `status` or the `updatedAt` field. They cannot modify the customer details or total amount.

### Payload 12: Super-Size ID Denial of Wallet (ID Poisoning)
- **Path**: `/stores/store123/inventory/A_REALLY_LONG_ID_EXCEEDING_128_CHARS_FOR_RESOURCE_EXHAUSTION_ATTACKS_ABC`
- **Reason to Deny**: Blocked by `isValidId(inventoryId)` matching rules checking ID sizes <= 128 characters.

---

## 3. Test Verification Plan

The safety of these rules is tested locally and at runtime by verifying that unauthorized operations on these paths fail with `PERMISSION_DENIED` errors. We implement the complete ruleset matching the schema structures in `firestore.rules`.
