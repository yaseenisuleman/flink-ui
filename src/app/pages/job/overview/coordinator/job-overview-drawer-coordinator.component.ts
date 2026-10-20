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

import { NgForOf } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { of, Subject } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';

import { JobMetric } from '@flink-runtime-web/interfaces';
import { JobLocalService } from '@flink-runtime-web/pages/job/job-local.service';
import { JobService } from '@flink-runtime-web/services';
import { NzTableModule } from 'ng-zorro-antd/table';

/**
 * Metrics of the vertex's operator coordinators, which run on the JobManager
 * (for example a source enumerator's unassigned splits).
 */
@Component({
  selector: 'flink-job-overview-drawer-coordinator',
  template: `
    <nz-table
      nzSize="small"
      [nzLoading]="loading"
      [nzData]="metrics"
      [nzFrontPagination]="false"
      [nzShowPagination]="false"
      [nzNoResult]="empty"
    >
      <thead>
        <tr>
          <th>Coordinator Metric</th>
          <th nzWidth="30%">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let metric of metrics; trackBy: trackById">
          <td [attr.title]="metric.id">{{ shortName(metric.id) }}</td>
          <td class="mono">{{ metric.value ?? '-' }}</td>
        </tr>
      </tbody>
    </nz-table>
    <ng-template #empty>
      <div class="tb-empty">
        This vertex has no coordinator metrics. Operators with a coordinator on the JobManager (such as FLIP-27 sources)
        report them here.
      </div>
    </ng-template>
  `,
  styles: [':host { display: block; height: 100%; overflow: auto; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgForOf, NzTableModule]
})
export class JobOverviewDrawerCoordinatorComponent implements OnInit, OnDestroy {
  private readonly jobService = inject(JobService);
  private readonly jobLocalService = inject(JobLocalService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  readonly trackById = (_: number, metric: JobMetric): string => metric.id;

  loading = true;
  metrics: JobMetric[] = [];

  ngOnInit(): void {
    this.jobLocalService
      .jobWithVertexChanges()
      .pipe(
        switchMap(({ job, vertex }) =>
          this.jobService.loadCoordinatorMetrics(job.jid, vertex!.id).pipe(
            switchMap(names =>
              names.length
                ? this.jobService.loadCoordinatorMetrics(
                    job.jid,
                    vertex!.id,
                    names.map(item => item.id)
                  )
                : of([])
            ),
            map(list => [...list].sort((a, b) => (a.id > b.id ? 1 : -1))),
            catchError(() => of([] as JobMetric[]))
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(metrics => {
        this.metrics = metrics;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** "Source__Events.coordinator.enumerator.unassignedSplits" → "enumerator.unassignedSplits" */
  shortName(id: string): string {
    const index = id.indexOf('.coordinator.');
    return index > -1 ? id.slice(index + '.coordinator.'.length) : id;
  }
}
