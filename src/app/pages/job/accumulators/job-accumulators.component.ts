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

import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, mergeMap, takeUntil } from 'rxjs/operators';

import { HumanizeDurationPipe } from '@flink-runtime-web/components/humanize-duration.pipe';
import { JobExecutionResult, JobLevelAccumulators } from '@flink-runtime-web/interfaces';
import { JobLocalService } from '@flink-runtime-web/pages/job/job-local.service';
import { JobService, rootCause } from '@flink-runtime-web/services';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';

const TERMINAL_STATES = ['FINISHED', 'FAILED', 'CANCELED'];

/**
 * Job-level accumulators, and for a job that has ended its execution result
 * (application status, net runtime, final accumulator values, failure).
 */
@Component({
  selector: 'flink-job-accumulators',
  templateUrl: './job-accumulators.component.html',
  styleUrls: ['./job-accumulators.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgForOf, DatePipe, HumanizeDurationPipe, NzCardModule, NzTableModule, NzAlertModule]
})
export class JobAccumulatorsComponent implements OnInit, OnDestroy {
  private readonly jobService = inject(JobService);
  private readonly jobLocalService = inject(JobLocalService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  loading = true;
  accumulators?: JobLevelAccumulators;
  result?: JobExecutionResult['job-execution-result'];
  resultAccumulators: Array<{ name: string; value: string }> = [];
  failure = '';

  ngOnInit(): void {
    this.jobLocalService
      .jobDetailChanges()
      .pipe(
        mergeMap(job =>
          forkJoin([
            this.jobService.loadJobLevelAccumulators(job.jid).pipe(catchError(() => of(undefined))),
            TERMINAL_STATES.includes(job.state)
              ? this.jobService.loadExecutionResult(job.jid).pipe(catchError(() => of(undefined)))
              : of(undefined)
          ])
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(([accumulators, result]) => {
        this.accumulators = accumulators;
        this.result = result?.['job-execution-result'];
        const values = this.result?.['accumulator-results'] || {};
        this.resultAccumulators = Object.keys(values)
          .sort()
          .map(name => ({ name, value: values[name] }));
        this.failure = this.result?.['failure-cause'] ? rootCause(this.result['failure-cause']) : '';
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
