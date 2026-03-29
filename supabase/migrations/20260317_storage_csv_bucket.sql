-- Create storage bucket for scraping CSV results
-- Run this in Supabase SQL Editor

-- Create bucket for scraping results (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'scraping-results') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'scraping-results',
            'scraping-results',
            true,  -- Public access to files
            52428800,  -- 50MB limit per file
            ARRAY['text/csv', 'text/plain', 'application/octet-stream']
        );
    END IF;
END $$;

-- Set up RLS policies for the bucket (idempotent)
DO $$
BEGIN
    -- Allow authenticated users to upload
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow authenticated uploads'
    ) THEN
        CREATE POLICY "Allow authenticated uploads" ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (bucket_id = 'scraping-results');
    END IF;

    -- Allow service role to do everything
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow service role all operations'
    ) THEN
        CREATE POLICY "Allow service role all operations" ON storage.objects
            FOR ALL TO service_role
            USING (bucket_id = 'scraping-results')
            WITH CHECK (bucket_id = 'scraping-results');
    END IF;

    -- Allow public read access
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Allow public read access'
    ) THEN
        CREATE POLICY "Allow public read access" ON storage.objects
            FOR SELECT TO anon
            USING (bucket_id = 'scraping-results');
    END IF;
END $$;

-- Create table to track CSV exports
CREATE TABLE IF NOT EXISTS scraping_csv_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL,
    client_id TEXT,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    business_count INTEGER DEFAULT 0,
    file_size_bytes INTEGER,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Index for batch lookups
CREATE INDEX IF NOT EXISTS idx_csv_exports_batch ON scraping_csv_exports(batch_id);
CREATE INDEX IF NOT EXISTS idx_csv_exports_client ON scraping_csv_exports(client_id);

-- Enable RLS
ALTER TABLE IF EXISTS scraping_csv_exports ENABLE ROW LEVEL SECURITY;

-- Policies (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'scraping_csv_exports' AND policyname = 'Allow all access to service role'
    ) THEN
        CREATE POLICY "Allow all access to service role" ON scraping_csv_exports
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'scraping_csv_exports' AND policyname = 'Allow read access to authenticated users'
    ) THEN
        CREATE POLICY "Allow read access to authenticated users" ON scraping_csv_exports
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
