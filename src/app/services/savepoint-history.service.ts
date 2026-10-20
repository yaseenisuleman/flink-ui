/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { Checkpoint, JobsItem, SavepointRecord } from '@flink-runtime-web/interfaces';

import { ConfigService } from './config.service';

const STORAGE_KEY = 'flink-savepoints';
const MAX_RECORDS = 200;

/**
 * Savepoints the dashboard knows about: the ones triggered from this browser
 * (kept in local storage, so only this browser sees them) and the ones still
 * in the checkpoint history of the jobs the JobManager knows.
 */
@Injectable({
  providedIn: 'root'
})
export class SavepointHistoryService {
  private readonly httpClient = inject(HttpClient);
  private readonly configService = inject(ConfigService);

  /** Savepoints recorded in this browser, newest first. */
  local(): SavepointRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as SavepointRecord[]) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  record(entry: Omit<SavepointRecord, 'source'>): void {
    const list = this.local().filter(item => item.path !== entry.path);
    list.unshift({ ...entry, source: 'browser' });
    this.save(list.slice(0, MAX_RECORDS));
  }

  markDisposed(path: string): void {
    this.save(this.local().map(item => (item.path === path ? { ...item, disposed: true } : item)));
  }

  forget(path: string): void {
    this.save(this.local().filter(item => item.path !== path));
  }

  /** Local records merged with the savepoints in the jobs' checkpoint history, newest first. */
  all(): Observable<SavepointRecord[]> {
    const base = this.configService.BASE_URL;
    return this.httpClient.get<{ jobs: JobsItem[] }>(`${base}/jobs/overview`).pipe(
      switchMap(({ jobs }) =>
        jobs.length
          ? forkJoin(
              jobs.map(job =>
                this.httpClient.get<Checkpoint>(`${base}/jobs/${job.jid}/checkpoints`).pipe(
                  map(stats => this.fromHistory(job, stats)),
                  catchError(() => of([] as SavepointRecord[]))
                )
              )
            )
          : of([] as SavepointRecord[][])
      ),
      catchError(() => of([] as SavepointRecord[][])),
      map(perJob => {
        const local = this.local();
        const byPath = new Map<string, SavepointRecord>();
        for (const record of perJob.reduce((all, list) => all.concat(list), [] as SavepointRecord[])) {
          byPath.set(record.path, record);
        }
        for (const record of local) {
          // A local record wins: it knows whether the savepoint was disposed
          byPath.set(record.path, { ...byPath.get(record.path), ...record });
        }
        return [...byPath.values()].sort((a, b) => b.time - a.time);
      })
    );
  }

  private fromHistory(job: JobsItem, stats: Checkpoint): SavepointRecord[] {
    // The REST API returns "history" at the top level (the Checkpoint typing nests it under "latest")
    interface Entry {
      is_savepoint?: boolean;
      status?: string;
      external_path?: string;
      trigger_timestamp?: number;
      latest_ack_timestamp?: number;
    }
    const response = stats as unknown as { history?: Entry[]; latest?: { savepoint?: Entry | null } };
    const entries: Entry[] = [...(response.history || [])];
    if (response.latest?.savepoint) {
      entries.push({ ...response.latest.savepoint, is_savepoint: true, status: 'COMPLETED' });
    }
    return entries
      .filter(item => item.is_savepoint && item.status === 'COMPLETED' && item.external_path)
      .map(item => ({
        path: item.external_path!,
        jobId: job.jid,
        jobName: job.name,
        time: item.latest_ack_timestamp || item.trigger_timestamp || 0,
        source: 'cluster' as const
      }));
  }

  private save(list: SavepointRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      // Storage unavailable (private window, blocked site data): nothing is kept.
    }
  }
}
