# Handoff

เพิ่ม app/.gitignore เพื่อไม่รวม target/, target-build/, target-verify/, shots/ และ *.pdb; ใช้ cargo clean ล้าง build artifacts เดิมรวมประมาณ 6.4 GiB แล้ว build ใหม่สำเร็จด้วย cargo build --offline --locked --target-dir target. rebuild_check ล่าสุดผ่านทั้ง build และ app-screenshot (1350×1025). Unknown เดิมเรื่อง firmware offset/partition table และ USB VID/PID ยังไม่ได้แก้เพราะไม่เกี่ยวกับงาน cleanup รอบนี้.
