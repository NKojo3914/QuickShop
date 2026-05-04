-- Brand accent colour per store (hex string, e.g. '#e11d48')
ALTER TABLE stores ADD COLUMN IF NOT EXISTS accent_color text;
