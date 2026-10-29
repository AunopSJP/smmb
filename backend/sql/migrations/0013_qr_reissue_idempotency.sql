-- Idempotent retries for admin QR rotation; preserves the exact issued codes on retry.
CREATE TABLE app.box_qr_reissue_request_tb (
  box_id        text NOT NULL REFERENCES app.box_tb (box_id),
  request_id    uuid NOT NULL,
  slots         text[] NOT NULL CHECK (cardinality(slots) BETWEEN 1 AND 2 AND slots <@ ARRAY['1','2']::text[]),
  response      jsonb NOT NULL,
  created_date  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (box_id, request_id)
);

CREATE INDEX ix_box_qr_reissue_request_created
  ON app.box_qr_reissue_request_tb (created_date);
