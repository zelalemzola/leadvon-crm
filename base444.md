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

## SaLead

### Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `prenom` | string |  | First name |
| `nom` | string |  | Last name |
| `telephone` | string |  | Phone number |
| `age` | string |  | Age bracket (e.g. 18-24, 25-44) |
| `province` | string |  | Province from IP geolocation |
| `work` | string |  | Work status |
| `income` | string |  | Monthly income bracket |
| `debt` | string |  | Total debt bracket |
| `review_status` | string |  | Debt review status |
| `last_step` | string |  | Last step reached in the funnel |
| `device` | `mobile`, `desktop` |  | Device type of the visitor |
| `status` | `new`, `contacted`, `converted` |  | Lead status |
| `utm_source` | string |  |  |
| `utm_medium` | string |  |  |
| `utm_campaign` | string |  |  |
| `utm_content` | string |  |  |
| `utm_term` | string |  |  |
| `utm_id` | string |  |  |
| `tblci` | string |  | Taboola Click ID for S2S postback conversion tracking |
| `id` | string |  | Unique record identifier |
| `created_date` | string |  | Record creation timestamp |
| `updated_date` | string |  | Record last update timestamp |
| `created_by_id` | string |  | ID of the user who created the record |

### Endpoints

### `GET /entities/SaLead`
List SaLead records

**Parameters:**
- `q` (query): JSON query filter, e.g. {"status":"active"}
- `limit` (query): Maximum number of records to return
- `skip` (query): Number of records to skip (pagination)
- `sort_by` (query): Field name to sort by. Prefix with '-' for descending order, e.g. -created_date

```javascript
const records = await base44.entities.SaLead.list();
```

### `POST /entities/SaLead`
Create a SaLead record

```javascript
const record = await base44.entities.SaLead.create({
  // your data
});
```

### `DELETE /entities/SaLead`
Delete multiple SaLead records

```javascript
await base44.entities.SaLead.deleteMany({
  // query filter — WARNING: empty {} deletes ALL records
  field: "value"
});
```

### `POST /entities/SaLead/bulk`
Bulk create SaLead records

```javascript
const records = await base44.entities.SaLead.bulkCreate([
  { /* record 1 */ },
  { /* record 2 */ },
]);
```

### `PUT /entities/SaLead/bulk`
Bulk update SaLead records

```javascript
// bulk-update is not available via SDK — use the REST API
```

### `PATCH /entities/SaLead/update-many`
Update many SaLead records by query

```javascript
// update-many is not available via SDK — use the REST API
```

### `GET /entities/SaLead/{SaLead_id}`
Get a SaLead record by ID

**Parameters:**
- `SaLead_id` (path): Record ID

```javascript
const record = await base44.entities.SaLead.get(recordId);
```

### `PUT /entities/SaLead/{SaLead_id}`
Update a SaLead record

**Parameters:**
- `SaLead_id` (path): Record ID

```javascript
const record = await base44.entities.SaLead.update(recordId, {
  // fields to update
});
```

### `DELETE /entities/SaLead/{SaLead_id}`
Delete a SaLead record

**Parameters:**
- `SaLead_id` (path): Record ID

```javascript
await base44.entities.SaLead.delete(recordId);
```

### `PUT /entities/SaLead/{SaLead_id}/restore`
Restore a deleted SaLead record

**Parameters:**
- `SaLead_id` (path): Record ID

```javascript
const record = await base44.entities.SaLead.restore(recordId);
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
| `code_postal` | string |  | Postal code |
| `prenom` | string | Yes | First name |
| `nom` | string | Yes | Last name |
| `telephone` | string | Yes | Phone number |
| `email` | string | Yes | Email address |
| `consent_telephone` | boolean |  | Consent for phone contact |
| `consent_marketing` | boolean |  | Consent for marketing |
| `status` | `new`, `contacted`, `converted` |  |  |
| `utm_source` | string |  | UTM source |
| `utm_medium` | string |  | UTM medium |
| `utm_campaign` | string |  | UTM campaign |
| `utm_id` | string |  | UTM ad ID |
| `id` | string |  | Unique record identifier |
| `created_date` | string |  | Record creation timestamp |
| `updated_date` | string |  | Record last update timestamp |
| `created_by_id` | string |  | ID of the user who created the record |

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

## VisitorLocation

### Schema

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `latitude` | number |  |  |
| `longitude` | number |  |  |
| `accuracy` | number |  | Accuracy in meters |
| `page` | string |  | Page where location was captured |
| `user_agent` | string |  |  |
| `utm_source` | string |  |  |
| `utm_campaign` | string |  |  |
| `id` | string |  | Unique record identifier |
| `created_date` | string |  | Record creation timestamp |
| `updated_date` | string |  | Record last update timestamp |
| `created_by_id` | string |  | ID of the user who created the record |

### Endpoints

### `GET /entities/VisitorLocation`
List VisitorLocation records

**Parameters:**
- `q` (query): JSON query filter, e.g. {"status":"active"}
- `limit` (query): Maximum number of records to return
- `skip` (query): Number of records to skip (pagination)
- `sort_by` (query): Field name to sort by. Prefix with '-' for descending order, e.g. -created_date

```javascript
const records = await base44.entities.VisitorLocation.list();
```

### `POST /entities/VisitorLocation`
Create a VisitorLocation record

```javascript
const record = await base44.entities.VisitorLocation.create({
  // your data
});
```

### `DELETE /entities/VisitorLocation`
Delete multiple VisitorLocation records

```javascript
await base44.entities.VisitorLocation.deleteMany({
  // query filter — WARNING: empty {} deletes ALL records
  field: "value"
});
```

### `POST /entities/VisitorLocation/bulk`
Bulk create VisitorLocation records

```javascript
const records = await base44.entities.VisitorLocation.bulkCreate([
  { /* record 1 */ },
  { /* record 2 */ },
]);
```

### `PUT /entities/VisitorLocation/bulk`
Bulk update VisitorLocation records

```javascript
// bulk-update is not available via SDK — use the REST API
```

### `PATCH /entities/VisitorLocation/update-many`
Update many VisitorLocation records by query

```javascript
// update-many is not available via SDK — use the REST API
```

### `GET /entities/VisitorLocation/{VisitorLocation_id}`
Get a VisitorLocation record by ID

**Parameters:**
- `VisitorLocation_id` (path): Record ID

```javascript
const record = await base44.entities.VisitorLocation.get(recordId);
```

### `PUT /entities/VisitorLocation/{VisitorLocation_id}`
Update a VisitorLocation record

**Parameters:**
- `VisitorLocation_id` (path): Record ID

```javascript
const record = await base44.entities.VisitorLocation.update(recordId, {
  // fields to update
});
```

### `DELETE /entities/VisitorLocation/{VisitorLocation_id}`
Delete a VisitorLocation record

**Parameters:**
- `VisitorLocation_id` (path): Record ID

```javascript
await base44.entities.VisitorLocation.delete(recordId);
```

### `PUT /entities/VisitorLocation/{VisitorLocation_id}/restore`
Restore a deleted VisitorLocation record

**Parameters:**
- `VisitorLocation_id` (path): Record ID

```javascript
const record = await base44.entities.VisitorLocation.restore(recordId);
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
| `created_by_id` | string |  | ID of the user who created the record |

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

## Backend Functions

### `POST /functions/sendLeadSms`
Invoke 'sendLeadSms'

```javascript
const result = await base44.functions.sendLeadSms({
  // your payload
});
```

### `POST /functions/sendWhatsAppMessage`
Invoke 'sendWhatsAppMessage'

```javascript
const result = await base44.functions.sendWhatsAppMessage({
  // your payload
});
```

### `POST /functions/zapiWebhook`
Invoke 'zapiWebhook'

```javascript
const result = await base44.functions.zapiWebhook({
  // your payload
});
```

### `POST /functions/trackVisit`
Invoke 'trackVisit'

```javascript
const result = await base44.functions.trackVisit({
  // your payload
});
```

### `POST /functions/syncLeadToSheet`
Invoke 'syncLeadToSheet'

```javascript
const result = await base44.functions.syncLeadToSheet({
  // your payload
});
```

### `POST /functions/sendMorningSms`
Invoke 'sendMorningSms'

```javascript
const result = await base44.functions.sendMorningSms({
  // your payload
});
```

### `POST /functions/taboolaPostback`
Invoke 'taboolaPostback'

```javascript
const result = await base44.functions.taboolaPostback({
  // your payload
});
```