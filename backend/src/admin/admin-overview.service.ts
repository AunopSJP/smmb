import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { LOW_BATTERY_PCT } from '../box/box-protocol.service.js';
import { BoxConfigService } from '../box/box-config.service.js';
import { type BoxStatus } from '../box/box-config.js';
import { PG_POOL } from '../db/db.module.js';
import { QrIssueService } from '../box/qr-issue.service.js';

const PENDING_AGENCY_STATUS = 'pending';
const OPEN_SOS_STATUSES = ['open', 'accepted'] as const;
const OPEN_TECHNICIAN_REQUEST_STATUS = 'open';

interface OverviewBoxRow {
  box_id: string;
  owner_user_id: string | null;
  service_active: boolean;
  battery_pct: number | null;
  last_poll_date: Date | null;
  last_seen_date: Date | null;
  config_override: Record<string, unknown>;
}

const INITIAL_BOX_COUNTS = {
  total: 0,
  online: 0,
  offline: 0,
  sleeping: 0,
  service_closed: 0,
  unbound: 0,
  low_battery: 0,
};

@Injectable()
export class AdminOverviewService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly configs: BoxConfigService,
    private readonly qrIssues: QrIssueService,
  ) {}

  async get() {
    const [boxRows, agencyCount, qrIssues, sosCount, technicianCount, planRows] = await Promise.all([
      this.pool.query<OverviewBoxRow>(
        `SELECT box_id, owner_user_id, service_active, battery_pct, last_poll_date, last_seen_date, config_override
         FROM app.box_tb`,
      ),
      this.pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM app.agency_tb WHERE status = $1`, [PENDING_AGENCY_STATUS]),
      this.qrIssues.summary(),
      this.pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM app.sos_case_tb WHERE status = ANY($1::text[])`, [OPEN_SOS_STATUSES]),
      this.pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM app.technician_request_tb WHERE status = $1`, [OPEN_TECHNICIAN_REQUEST_STATUS]),
      this.pool.query<{ plan_code: string; owners_count: number }>(
        `SELECT p.plan_code, count(DISTINCT up.user_id) FILTER (WHERE tstzrange(up.start_date, up.end_date) @> now())::int AS owners_count
         FROM app.plan_tb p
         LEFT JOIN app.user_plan_tb up ON up.plan_code = p.plan_code
         GROUP BY p.plan_code
         ORDER BY p.sort_order, p.plan_code`,
      ),
    ]);
    const boxes = boxRows.rows;
    const statusByBox = await this.configs.statusOf(boxes);
    const boxCounts = { ...INITIAL_BOX_COUNTS };
    for (const box of boxes) {
      const status: BoxStatus | undefined = statusByBox.get(box.box_id);
      boxCounts.total += 1;
      if (status) boxCounts[status] += 1;
      if (box.owner_user_id && box.battery_pct !== null && box.battery_pct < LOW_BATTERY_PCT) boxCounts.low_battery += 1;
    }

    return {
      boxes: boxCounts,
      agencies_pending: agencyCount.rows[0]?.count ?? 0,
      qr_issues: qrIssues,
      sos_open: sosCount.rows[0]?.count ?? 0,
      technician_requests_open: technicianCount.rows[0]?.count ?? 0,
      owners_by_plan: planRows.rows.map((row) => ({ plan_code: row.plan_code, owners_count: row.owners_count })),
    };
  }
}
