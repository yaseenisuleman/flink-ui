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

import { NgForOf, NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, switchMap, takeUntil } from 'rxjs/operators';

import { HumanizeDatePipe } from '@flink-runtime-web/components/humanize-date.pipe';
import { HumanizeDurationPipe } from '@flink-runtime-web/components/humanize-duration.pipe';
import { JobBadgeComponent } from '@flink-runtime-web/components/job-badge/job-badge.component';
import { JobMetric, JobVertexSubTask, SubtaskAttempt, SubtaskAttemptAccumulators } from '@flink-runtime-web/interfaces';
import { JobLocalService } from '@flink-runtime-web/pages/job/job-local.service';
import { JobService } from '@flink-runtime-web/services';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';

/** Attempts loaded per subtask: the latest ones. */
const MAX_ATTEMPTS = 20;
/** Metric values fetched at once for the filtered list. */
const MAX_METRICS = 40;

/**
 * Execution attempts of one subtask: where each attempt ran and how long, its
 * accumulators, and a searchable list of the subtask's metrics.
 */
@Component({
  selector: 'flink-job-overview-subtask-attempts',
  templateUrl: './job-overview-subtask-attempts.component.html',
  styleUrls: ['./job-overview-subtask-attempts.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIf,
    NgForOf,
    FormsModule,
    RouterLink,
    NzSelectModule,
    NzTableModule,
    NzInputModule,
    HumanizeDatePipe,
    HumanizeDurationPipe,
    JobBadgeComponent
  ]
})
export class JobOverviewSubtaskAttemptsComponent implements OnInit, OnChanges, OnDestroy {
  private readonly jobService = inject(JobService);
  private readonly jobLocalService = inject(JobLocalService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly metricQuery$ = new Subject<void>();

  @Input() subtasks: JobVertexSubTask[] = [];

  readonly trackByAttempt = (_: number, attempt: SubtaskAttempt): number => attempt.attempt;
  readonly trackById = (_: number, metric: JobMetric): string => metric.id;

  jobId = '';
  vertexId = '';
  selected: number | null = null;
  attempts: SubtaskAttempt[] = [];
  loadingAttempts = false;
  expanded = new Set<number>();
  accumulators = new Map<number, SubtaskAttemptAccumulators | null>();

  metricNames: string[] = [];
  metricFilter = '';
  metrics: JobMetric[] = [];
  matchingMetrics = 0;
  loadingMetrics = false;

  ngOnInit(): void {
    this.jobLocalService
      .jobWithVertexChanges()
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ job, vertex }) => {
        const changed = vertex?.id !== this.vertexId;
        this.jobId = job.jid;
        this.vertexId = vertex?.id || '';
        if (changed) {
          this.selected = null;
          this.selectDefault();
        }
      });
    this.metricQuery$
      .pipe(
        debounceTime(250),
        switchMap(() => {
          const needle = this.metricFilter.trim().toLowerCase();
          const names = this.metricNames.filter(name => name.toLowerCase().includes(needle));
          this.matchingMetrics = names.length;
          this.loadingMetrics = true;
          this.cdr.markForCheck();
          return names.length && this.selected !== null
            ? this.jobService
                .loadSubtaskMetrics(this.jobId, this.vertexId, this.selected, names.slice(0, MAX_METRICS))
                .pipe(catchError(() => of([] as JobMetric[])))
            : of([] as JobMetric[]);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(metrics => {
        this.metrics = [...metrics].sort((a, b) => (a.id > b.id ? 1 : -1));
        this.loadingMetrics = false;
        this.cdr.markForCheck();
      });
  }

  ngOnChanges(): void {
    if (this.selected === null) {
      this.selectDefault();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** The first subtask that has been retried, else subtask 0. */
  selectDefault(): void {
    if (!this.subtasks.length || !this.vertexId) {
      return;
    }
    const retried = this.subtasks.find(subtask => subtask.attempt > 0);
    this.select((retried || this.subtasks[0]).subtask);
  }

  select(subtaskIndex: number): void {
    this.selected = subtaskIndex;
    this.expanded.clear();
    this.accumulators.clear();
    const current = this.subtasks.find(subtask => subtask.subtask === subtaskIndex)?.attempt ?? 0;
    const first = Math.max(0, current - MAX_ATTEMPTS + 1);
    const numbers = Array.from({ length: current - first + 1 }, (_, i) => first + i);
    this.loadingAttempts = true;
    this.cdr.markForCheck();
    forkJoin(
      numbers.map(attempt =>
        this.jobService
          .loadSubtaskAttempt(this.jobId, this.vertexId, subtaskIndex, attempt)
          .pipe(catchError(() => of(null)))
      )
    ).subscribe(list => {
      this.attempts = list.filter((item): item is SubtaskAttempt => !!item).sort((a, b) => b.attempt - a.attempt);
      this.loadingAttempts = false;
      this.cdr.markForCheck();
    });
    this.jobService
      .loadSubtaskMetrics(this.jobId, this.vertexId, subtaskIndex)
      .pipe(catchError(() => of([] as JobMetric[])))
      .subscribe(names => {
        this.metricNames = names.map(item => item.id).sort();
        this.metricQuery$.next();
      });
  }

  filterMetrics(): void {
    this.metricQuery$.next();
  }

  toggleAccumulators(attempt: number): void {
    if (this.expanded.has(attempt)) {
      this.expanded.delete(attempt);
    } else {
      this.expanded.add(attempt);
      if (!this.accumulators.has(attempt) && this.selected !== null) {
        this.jobService
          .loadSubtaskAttemptAccumulators(this.jobId, this.vertexId, this.selected, attempt)
          .pipe(catchError(() => of(null)))
          .subscribe(data => {
            this.accumulators.set(attempt, data);
            this.cdr.markForCheck();
          });
      }
    }
    this.cdr.markForCheck();
  }

  statusDurations(attempt: SubtaskAttempt): string {
    const durations = attempt['status-duration'] || {};
    return ['CREATED', 'SCHEDULED', 'DEPLOYING', 'INITIALIZING', 'RUNNING']
      .filter(state => durations[state] !== undefined && durations[state] > 0)
      .map(state => `${state.charAt(0)}${state.slice(1).toLowerCase()} ${durations[state]}ms`)
      .join(' · ');
  }
}
