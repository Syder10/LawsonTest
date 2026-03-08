-- Drop old tables if they exist and recreate with correct columns
-- This comprehensive schema matches all form fields being submitted by the application

-- Blowing Department
DROP TABLE IF EXISTS blowing_daily_records;
CREATE TABLE blowing_daily_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  opening_stock_bags INT,
  quantity_received_bags INT,
  preforms_used_bags INT,
  total_produced INT,
  waste_pcs INT,
  final_production INT,
  closing_stock_bags INT,
  bottles_given_out INT,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Alcohol and Blending - Stock Level Records
DROP TABLE IF EXISTS alcohol_stock_level_records;
CREATE TABLE alcohol_stock_level_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  opening_stock_level DECIMAL(12, 2),
  quantity_received DECIMAL(12, 2),
  total_stock DECIMAL(12, 2),
  quantity_used DECIMAL(12, 2),
  remaining_stock DECIMAL(12, 2),
  destination VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Alcohol and Blending - Daily Records
DROP TABLE IF EXISTS alcohol_blending_daily_records;
CREATE TABLE alcohol_blending_daily_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  alcohol_transferred_drums INT,
  alcohol_transferred_litres DECIMAL(10, 2),
  finished_products_transferred_tanks INT,
  finished_products_transferred_litres DECIMAL(10, 2),
  number_of_staff INT,
  hourly_work VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Alcohol and Blending - Ginger Production
DROP TABLE IF EXISTS ginger_production_records;
CREATE TABLE ginger_production_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  quantity_raw_ginger_bags INT,
  quantity_grinded_ginger DECIMAL(12, 2),
  alcohol_used_tanks INT,
  alcohol_used_litres DECIMAL(12, 2),
  finished_product_tanks INT,
  finished_product_litres DECIMAL(12, 2),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Alcohol and Blending - Extraction Monitoring Records
DROP TABLE IF EXISTS extraction_monitoring_records;
CREATE TABLE extraction_monitoring_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  beginning_date DATE,
  tank_number VARCHAR(100),
  alcohol_percentage INT CHECK (alcohol_percentage IN (70, 80)),
  beginning_time TIME,
  expected_maturity_date DATE,
  prepared_by VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Filling Line - Daily Records
DROP TABLE IF EXISTS filling_line_daily_records;
CREATE TABLE filling_line_daily_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  bottles_wasted INT,
  bottles_rejected INT,
  total_production INT,
  number_of_staff INT,
  hourly_work VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Filling Line - Stocks Labels Caps Records
DROP TABLE IF EXISTS stocks_labels_caps_records;
CREATE TABLE stocks_labels_caps_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  number_caps INT,
  number_labels INT,
  number_cartons INT,
  number_rolls INT,
  machine_number VARCHAR(100),
  time TIME,
  name_of_personnel VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Packaging Department
DROP TABLE IF EXISTS packaging_daily_records;
CREATE TABLE packaging_daily_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  quantity_cartons_produced INT,
  number_cartons_wasted INT,
  number_of_staff INT,
  hourly_work VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Concentrate - Alcohol Records
DROP TABLE IF EXISTS concentrate_alcohol_records;
CREATE TABLE concentrate_alcohol_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  number_tanks_70 INT,
  alcohol_used_70_litres DECIMAL(10, 2),
  water_70_litres DECIMAL(10, 2),
  number_tanks_80 INT,
  alcohol_used_80_litres DECIMAL(10, 2),
  water_80_litres DECIMAL(10, 2),
  total_alcohol_used_litres DECIMAL(10, 2),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Concentrate - Daily Records
DROP TABLE IF EXISTS concentrate_daily_records;
CREATE TABLE concentrate_daily_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  supervisor_name VARCHAR(255) NOT NULL,
  shift VARCHAR(50) NOT NULL CHECK (shift IN ('Morning', 'Afternoon', 'Night')),
  group_number INT NOT NULL CHECK (group_number IN (1, 2, 3)),
  department VARCHAR(100) NOT NULL,
  record_type VARCHAR(100) NOT NULL,
  product VARCHAR(100),
  herbs_received INT,
  remaining_quantity INT,
  number_of_staff INT,
  hourly_work VARCHAR(255),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create Indexes for Performance
CREATE INDEX idx_blowing_date ON blowing_daily_records(date);
CREATE INDEX idx_blowing_supervisor ON blowing_daily_records(supervisor_name);
CREATE INDEX idx_blowing_shift_group ON blowing_daily_records(shift, group_number);

CREATE INDEX idx_alcohol_stock_date ON alcohol_stock_level_records(date);
CREATE INDEX idx_alcohol_stock_destination ON alcohol_stock_level_records(destination);

CREATE INDEX idx_alcohol_blending_date ON alcohol_blending_daily_records(date);
CREATE INDEX idx_alcohol_blending_product ON alcohol_blending_daily_records(product);

CREATE INDEX idx_ginger_date ON ginger_production_records(date);

CREATE INDEX idx_extraction_date ON extraction_monitoring_records(date);
CREATE INDEX idx_extraction_tank ON extraction_monitoring_records(tank_number);

CREATE INDEX idx_filling_date ON filling_line_daily_records(date);
CREATE INDEX idx_filling_product ON filling_line_daily_records(product);

CREATE INDEX idx_stocks_date ON stocks_labels_caps_records(date);
CREATE INDEX idx_stocks_machine ON stocks_labels_caps_records(machine_number);

CREATE INDEX idx_packaging_date ON packaging_daily_records(date);
CREATE INDEX idx_packaging_product ON packaging_daily_records(product);

CREATE INDEX idx_concentrate_alcohol_date ON concentrate_alcohol_records(date);
CREATE INDEX idx_concentrate_daily_date ON concentrate_daily_records(date);
