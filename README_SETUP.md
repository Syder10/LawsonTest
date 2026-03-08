# Lawson Limited Company Production Management System - Setup Guide

## Database Setup Instructions

### Step 1: Run the Main Schema
1. Log in to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `scripts/supabase-schema-v1.sql`
4. Click "Run" to create all tables

This will create 10 tables for the 5 departments:
- **Blowing**: `blowing_daily_records`
- **Alcohol and Blending**: `alcohol_stock_level_records`, `alcohol_blending_daily_records`, `ginger_production_records`, `extraction_monitoring_records`
- **Filling Line**: `filling_line_daily_records`, `stocks_labels_caps_records`
- **Packaging**: `packaging_daily_records`
- **Concentrate**: `concentrate_alcohol_records`, `concentrate_daily_records`

### Step 2: Verify Tables Created
After running the schema, verify all tables exist:
\`\`\`sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
\`\`\`

You should see all 10 tables listed.

### Step 3: Test Stock Continuity
The system implements stock continuity for:
1. **Daily Records (Preform Usage)** - Blowing Department
2. **Daily Usage of Alcohol And Stock Level** - Alcohol and Blending

Opening stock automatically populates from the previous shift's closing stock.

## Environment Variables Required

Make sure these are set in your Vercel project or .env.local:

\`\`\`
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
\`\`\`

## API Endpoints

### Record Submission
- **POST** `/api/records/submit` - Submit production records
- Handles all 10 record types across 5 departments

### Previous Stock Retrieval
- **GET** `/api/records/previous-stock?recordType=...&date=...&department=...`
- Returns the closing stock from the most recent shift

### Analytics (Python-powered)
- **GET** `/api/analytics/kpis` - Fetch production KPIs and metrics
- Calculates:
  - Total production (cartons)
  - Current alcohol balance
  - Current bottle balance
  - Ginger production totals
  - Production trends (30-day)
  - Department activity

### Data Export
- **GET** `/api/records/export?date=...&department=...`
- Exports records to Excel format

## Troubleshooting

### Error: "Could not find the table..."
**Cause**: Database tables haven't been created yet.
**Solution**: Run `scripts/supabase-schema-v1.sql` in your Supabase SQL Editor.

### Error: "Failed to fetch previous stock"
**Cause**: The previous-stock API can't connect to the database.
**Solution**: 
1. Verify environment variables are set correctly
2. Check that the service role key has proper permissions
3. Ensure tables exist in the database

### KPI Dashboard Shows Zeros
**Cause**: No production data has been submitted yet.
**Solution**: This is expected behavior - the dashboard will update automatically when forms are submitted.

### Python Script Errors
**Cause**: Missing database connection or malformed data.
**Solution**: The Python script includes fallback logic to return zeros when data is unavailable.

## Mobile Optimization

All screens are optimized for mobile devices with:
- Responsive grid layouts (1 column on mobile, 2 on tablet/desktop)
- Touch-friendly button sizes (minimum 44x44px)
- Readable text sizes (base 16px, scales appropriately)
- Properly sized input fields with adequate spacing

## Record Type to Table Mapping

| Department | Record Type | Table Name |
|------------|-------------|------------|
| Blowing | Daily Records (Preform Usage) | `blowing_daily_records` |
| Alcohol and Blending | Daily Usage of Alcohol And Stock Level | `alcohol_stock_level_records` |
| Alcohol and Blending | Daily Records for Alcohol and Blending | `alcohol_blending_daily_records` |
| Alcohol and Blending | Ginger Production | `ginger_production_records` |
| Alcohol and Blending | Extraction Monitoring Records | `extraction_monitoring_records` |
| Filling Line | Filling Line Daily Records | `filling_line_daily_records` |
| Filling Line | Stocks Keeping For Labels & Caps | `stocks_labels_caps_records` |
| Packaging | Packaging Daily Records | `packaging_daily_records` |
| Concentrate | Daily Records Alcohol For Concentrate | `concentrate_alcohol_records` |
| Concentrate | Daily Records For Concentrate | `concentrate_daily_records` |

## Next Steps

1. Run the SQL schema in Supabase
2. Verify environment variables are set
3. Test by submitting a production record
4. Check the Manager Dashboard to see KPIs update
5. Verify stock continuity by submitting multiple shifts of stock-tracked forms
