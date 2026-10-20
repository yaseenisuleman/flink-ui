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

import { DecimalPipe, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, mergeMap, takeUntil } from 'rxjs/operators';

import { HumanizeBytesPipe } from '@flink-runtime-web/components/humanize-bytes.pipe';
import { SparklineComponent, SparklinePoint } from '@flink-runtime-web/components/sparkline/sparkline.component';
import { AggregatedMetric } from '@flink-runtime-web/interfaces';
import { OverviewService, StatusService } from '@flink-runtime-web/services';

/** Samples kept per chart: a few minutes at the default 3s refresh. */
const MAX_POINTS = 60;

const TM_METRICS = [
  'Status.JVM.CPU.Load',
  'Status.JVM.Memory.Heap.Used',
  'Status.JVM.Memory.Heap.Max',
  'Status.Flink.Memory.Managed.Used',
  'Status.Flink.Memory.Managed.Total'
];

interface Trend {
  points: SparklinePoint[];
  latest?: number;
}

/**
 * Cluster trends on the Overview: TaskManager CPU and memory and job restarts,
 * aggregated across the cluster and sampled on every dashboard refresh.
 */
@Component({
  selector: 'flink-overview-trends',
  templateUrl: './overview-trends.component.html',
  styleUrls: ['./overview-trends.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, DecimalPipe, HumanizeBytesPipe, SparklineComponent]
})
export class OverviewTrendsComponent implements OnInit, OnDestroy {
  private readonly overviewService = inject(OverviewService);
  private readonly statusService = inject(StatusService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly humanizeBytes = new HumanizeBytesPipe();

  cpu: Trend = { points: [] };
  cpuMax?: number;
  heap: Trend = { points: [] };
  heapMax?: number;
  managed: Trend = { points: [] };
  managedTotal?: number;
  restarts: Trend = { points: [] };
  hasData = false;

  readonly percent = (value: number): string => `${value.toFixed(1)}%`;
  readonly bytes = (value: number): string => this.humanizeBytes.transform(value);
  readonly count = (value: number): string => String(Math.round(value));

  ngOnInit(): void {
    this.statusService.refresh$
      .pipe(
        mergeMap(() =>
          forkJoin([
            this.overviewService
              .loadTaskManagerAggregates(TM_METRICS, ['sum', 'avg', 'max'])
              .pipe(catchError(() => of([]))),
            this.overviewService.loadJobAggregates(['numRestarts'], ['sum']).pipe(catchError(() => of([])))
          ])
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(([tm, jobs]) => this.sample(tm, jobs));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private sample(tm: AggregatedMetric[], jobs: AggregatedMetric[]): void {
    const now = Date.now();
    const get = (list: AggregatedMetric[], id: string): AggregatedMetric | undefined => list.find(m => m.id === id);
    const cpu = get(tm, 'Status.JVM.CPU.Load');
    if (cpu?.avg !== undefined) {
      this.push(this.cpu, now, cpu.avg * 100);
      this.cpuMax = (cpu.max ?? cpu.avg) * 100;
    }
    const heapUsed = get(tm, 'Status.JVM.Memory.Heap.Used')?.sum;
    if (heapUsed !== undefined) {
      this.push(this.heap, now, heapUsed);
      this.heapMax = get(tm, 'Status.JVM.Memory.Heap.Max')?.sum;
    }
    const managedUsed = get(tm, 'Status.Flink.Memory.Managed.Used')?.sum;
    if (managedUsed !== undefined) {
      this.push(this.managed, now, managedUsed);
      this.managedTotal = get(tm, 'Status.Flink.Memory.Managed.Total')?.sum;
    }
    // No running jobs: no job metrics, which is 0 restarts
    this.push(this.restarts, now, get(jobs, 'numRestarts')?.sum ?? 0);
    this.hasData = this.cpu.points.length > 0 || this.heap.points.length > 0;
    this.cdr.markForCheck();
  }

  private push(trend: Trend, time: number, value: number): void {
    trend.points = [...trend.points, { time, value }].slice(-MAX_POINTS);
    trend.latest = value;
  }
}
