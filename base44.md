# API Reference

**Base URL:** `https://choisir-assur-pro.base44.app/api`

## Setup

```bash
npm install @base44/sdk
```

```javascript
import { createClient } from '@base44/sdk';

const base44 = createClient({
  appId: "69e389829dd79acdd11ec88b",
  headers: {
    "api_key": "22cd68e1cbed4e7ab4e1cde7631552ac"
  }
});
```

## Lead

### Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `age` | number | Yes | Age of the lead |
| `besoins` | array |  | Specific health needs |
| `couvert_mutuelle` | string |  | Currently covered by mutuelle (Oui/Non) |
| `mutuelle_actuelle` | string |  | Current insurance provider |
| `cotisation_mensuelle` | string |  | Monthly premium bracket |
| `qui_assurer` | string |  | Who to insure |
| `profession` | string |  | Profession status |
| `prenom` | string | Yes | First name |
| `nom` | string | Yes | Last name |
| `telephone` | string | Yes | Phone number |
| `email` | string | Yes | Email address |
| `consent_telephone` | boolean |  | Consent for phone contact |
| `consent_marketing` | boolean |  | Consent for marketing |
| `status` | `new`, `contacted`, `converted` |  |  |
| `id` | string |  | Unique record identifier |
| `created_date` | string |  | Record creation timestamp |
| `updated_date` | string |  | Record last update timestamp |
| `created_by` | string |  | Email of the user who created the record |

### Endpoints

### `GET /entities/Lead`
List Lead records

**Parameters:**
- `q` (query): JSON query filter, e.g. {"status":"active"}
- `limit` (query): Maximum number of records to return
- `skip` (query): Number of records to skip (pagination)
- `sort_by` (query): Field name to sort by. Prefix with '-' for descending order, e.g. -created_date

```javascript
const records = await base44.entities.Lead.list();
```

### `POST /entities/Lead`
Create a Lead record

```javascript
const record = await base44.entities.Lead.create({
  // your data
});
```

### `DELETE /entities/Lead`
Delete multiple Lead records

```javascript
await base44.entities.Lead.deleteMany({
  // query filter — WARNING: empty {} deletes ALL records
  age: 0
});
```

### `POST /entities/Lead/bulk`
Bulk create Lead records

```javascript
const records = await base44.entities.Lead.bulkCreate([
  { /* record 1 */ },
  { /* record 2 */ },
]);
```

### `PUT /entities/Lead/bulk`
Bulk update Lead records

```javascript
// bulk-update is not available via SDK — use the REST API
```

### `PATCH /entities/Lead/update-many`
Update many Lead records by query

```javascript
// update-many is not available via SDK — use the REST API
```

### `GET /entities/Lead/{Lead_id}`
Get a Lead record by ID

**Parameters:**
- `Lead_id` (path): Record ID

```javascript
const record = await base44.entities.Lead.get(recordId);
```

### `PUT /entities/Lead/{Lead_id}`
Update a Lead record

**Parameters:**
- `Lead_id` (path): Record ID

```javascript
const record = await base44.entities.Lead.update(recordId, {
  // fields to update
});
```

### `DELETE /entities/Lead/{Lead_id}`
Delete a Lead record

**Parameters:**
- `Lead_id` (path): Record ID

```javascript
await base44.entities.Lead.delete(recordId);
```

### `PUT /entities/Lead/{Lead_id}/restore`
Restore a deleted Lead record

**Parameters:**
- `Lead_id` (path): Record ID

```javascript
const record = await base44.entities.Lead.restore(recordId);
```

## User

### Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `email` | string | Yes | The email of the user |
| `full_name` | string | Yes | The full name of the user |
| `role` | `admin`, `user` | Yes | The role of the user in the app |
| `id` | string |  | Unique record identifier |
| `created_date` | string |  | Record creation timestamp |
| `updated_date` | string |  | Record last update timestamp |
| `created_by` | string |  | Email of the user who created the record |

### Endpoints

### `GET /entities/User`
List User records

**Parameters:**
- `q` (query): JSON query filter, e.g. {"status":"active"}
- `limit` (query): Maximum number of records to return
- `skip` (query): Number of records to skip (pagination)
- `sort_by` (query): Field name to sort by. Prefix with '-' for descending order, e.g. -created_date

```javascript
const records = await base44.entities.User.list();
```

### `POST /entities/User`
Create a User record

```javascript
const record = await base44.entities.User.create({
  // your data
});
```

### `GET /entities/User/{User_id}`
Get a User record by ID

**Parameters:**
- `User_id` (path): Record ID

```javascript
const record = await base44.entities.User.get(recordId);
```

### `PUT /entities/User/{User_id}`
Update a User record

**Parameters:**
- `User_id` (path): Record ID

```javascript
const record = await base44.entities.User.update(recordId, {
  // fields to update
});
```

### `DELETE /entities/User/{User_id}`
Delete a User record

**Parameters:**
- `User_id` (path): Record ID

```javascript
await base44.entities.User.delete(recordId);
```
