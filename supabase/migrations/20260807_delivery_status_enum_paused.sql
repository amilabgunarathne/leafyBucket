-- deliveries.status enum: add paused (must commit before functions use the value).

ALTER TYPE public.delivery_status_enum ADD VALUE IF NOT EXISTS 'paused';
