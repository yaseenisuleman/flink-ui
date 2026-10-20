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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PageHeaderComponent } from '@flink-runtime-web/components/page-header/page-header.component';
import { OperationResult, SavepointRecord } from '@flink-runtime-web/interfaces';
import { JobOperationsService, SavepointHistoryService } from '@flink-runtime-web/services';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

/**
 * Savepoints: the ones triggered from this browser and the ones still in the
 * checkpoint history of the cluster's jobs. Copy a path, resume a job from
 * one (opens Submit with the path filled in), or dispose of its files.
 */
@Component({
  selector: 'flink-savepoints',
  templateUrl: './savepoints.component.html',
  styleUrls: ['./savepoints.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIf,
    NgForOf,
    DatePipe,
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    NzCardModule,
    NzTableModule,
    NzButtonModule,
    NzInputModule,
    NzPopconfirmModule,
    NzAlertModule,
    NzTooltipModule
  ]
})
export class SavepointsComponent implements OnInit, OnDestroy {
  private readonly history = inject(SavepointHistoryService);
  private readonly operations = inject(JobOperationsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  readonly trackByPath = (_: number, item: SavepointRecord): string => item.path;

  savepoints: SavepointRecord[] = [];
  loading = true;
  /** Paths being disposed right now. */
  disposing = new Set<string>();
  copiedPath = '';

  disposePath = '';
  disposeResult: OperationResult | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.history
      .all()
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => {
        this.savepoints = list;
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  dispose(path: string, fromForm = false): void {
    const target = path.trim();
    if (!target) {
      return;
    }
    this.disposing.add(target);
    if (fromForm) {
      this.disposeResult = null;
    }
    this.cdr.markForCheck();
    this.operations
      .disposeSavepoint(target)
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.disposing.delete(target);
        if (result.ok) {
          this.history.markDisposed(target);
          this.savepoints = this.savepoints.map(item => (item.path === target ? { ...item, disposed: true } : item));
        }
        if (fromForm || !result.ok) {
          this.disposeResult = { ...result, value: target };
        }
        this.cdr.markForCheck();
      });
  }

  forget(path: string): void {
    this.history.forget(path);
    this.savepoints = this.savepoints.filter(item => item.path !== path || item.source === 'cluster');
    this.cdr.markForCheck();
  }

  copy(path: string): void {
    navigator.clipboard?.writeText(path).then(
      () => {
        this.copiedPath = path;
        this.cdr.markForCheck();
      },
      () => undefined
    );
  }
}
