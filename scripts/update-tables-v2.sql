-- Update Ginger Production Records table
ALTER TABLE ginger_production_records 
ADD COLUMN IF NOT EXISTS quantity_grinded_ginger DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS quantity_alcohol_used_tanks INT,
ADD COLUMN IF NOT EXISTS quantity_finished_product_tanks INT,
ADD COLUMN IF NOT EXISTS quantity_finished_product_litres DECIMAL(10, 2);

-- Update Daily Records Alcohol For Concentrate table
ALTER TABLE concentrate_alcohol_records
ADD COLUMN IF NOT EXISTS water_litres_70 DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS water_litres_80 DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS total_alcohol_used_litres DECIMAL(10, 2);
