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

import { DecimalPipe, NgForOf, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { OverviewWithApplicationStatistics } from '@flink-runtime-web/interfaces';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';

@Component({
  selector: 'flink-overview-statistic',
  templateUrl: './overview-statistic.component.html',
  styleUrls: ['./overview-statistic.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgForOf, NzSkeletonModule, DecimalPipe]
})
export class OverviewStatisticComponent implements OnInit, OnDestroy {
  @Input() statisticData$: Observable<OverviewWithApplicationStatistics> | null = null;
  public statistic: OverviewWithApplicationStatistics | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly cdr: ChangeDetectorRef) {}

  /** Share of all task slots that are taken. */
  public get slotsUsedPercent(): number {
    const total = this.statistic?.['slots-total'] || 0;
    return total ? ((total - (this.statistic?.['slots-available'] || 0)) / total) * 100 : 0;
  }

  public ngOnInit(): void {
    if (this.statisticData$) {
      this.statisticData$.pipe(takeUntil(this.destroy$)).subscribe(data => {
        this.statistic = data;
        this.cdr.markForCheck();
      });
    }
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
