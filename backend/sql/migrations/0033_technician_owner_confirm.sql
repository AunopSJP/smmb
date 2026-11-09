-- เจ้าของบ้านยืนยันผลงานช่าง (OwnTechDone) — ok = ปิดงาน · still_broken = เปิดคำขอเดิมใหม่
ALTER TABLE app.technician_request_tb
  ADD COLUMN owner_result text CHECK (owner_result IN ('ok', 'still_broken')),
  ADD COLUMN owner_confirmed_date timestamptz;
