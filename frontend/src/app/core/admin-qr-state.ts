import { Injectable, inject, signal } from '@angular/core';
import { AdminApi, type AdminQrFix, type AdminQrHealth, type AdminQrIssue } from './admin-api';

@Injectable({ providedIn: 'root' })
export class AdminQrState {
  private readonly api = inject(AdminApi);
  readonly issues = signal<AdminQrIssue[]>([]);

  async refresh(health?: AdminQrHealth[]): Promise<void> {
    this.issues.set(await this.api.qrIssues(health));
  }

  async get(id: string): Promise<AdminQrIssue> {
    const issue = await this.api.qrIssue(id);
    this.upsert(issue);
    return issue;
  }

  async chooseFix(id: string, fix: AdminQrFix): Promise<AdminQrIssue> {
    const issue = await this.api.chooseQrFix(id, fix);
    this.upsert(issue);
    return issue;
  }

  async requestBackupSwap(id: string): Promise<AdminQrIssue> {
    const issue = await this.api.requestBackupSwap(id);
    this.upsert(issue);
    return issue;
  }

  async recordReissue(id: string, slots: (1 | 2)[], deliveryMethod?: 'post' | 'technician'): Promise<AdminQrIssue> {
    const issue = await this.api.recordQrReissue(id, slots, deliveryMethod);
    this.upsert(issue);
    return issue;
  }

  async dispatchTechnician(id: string): Promise<AdminQrIssue> {
    const issue = await this.api.dispatchQrTechnician(id);
    this.upsert(issue);
    return issue;
  }

  async resolve(id: string): Promise<AdminQrIssue> {
    const issue = await this.api.resolveQrIssue(id);
    this.upsert(issue);
    return issue;
  }

  private upsert(issue: AdminQrIssue): void {
    this.issues.update((current) => [issue, ...current.filter((item) => item.id !== issue.id)]);
  }
}
