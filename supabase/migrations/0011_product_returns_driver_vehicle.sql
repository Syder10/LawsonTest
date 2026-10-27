-- Add driver_name and vehicle_reg to product_returns
-- User decision: Returns capture date, shift, branch/source, product type, quantity of cartons, driver, car, remarks.
alter table public.product_returns
  add column if not exists driver_name text,
  add column if not exists vehicle_reg text;

comment on column public.product_returns.driver_name is 'Driver who transported the returned finished goods.';
comment on column public.product_returns.vehicle_reg is 'Vehicle registration / car used for the return.';
