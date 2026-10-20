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

import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { of, Subject } from 'rxjs';
import { catchError, distinctUntilKeyChanged, mergeMap, takeUntil } from 'rxjs/operators';

import { TableDisplayComponent } from '@flink-runtime-web/components/configuration-cards/table-display/table-display.component';
import { ClusterConfiguration } from '@flink-runtime-web/interfaces';
import { ApplicationLocalService } from '@flink-runtime-web/pages/application/application-local.service';
import { ApplicationService } from '@flink-runtime-web/services';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';

/** The JobManager configuration the application runs with. */
@Component({
  selector: 'flink-application-configuration',
  template: `
    <div class="wrapper">
      <nz-card nzType="inner" nzTitle="JobManager Configuration" [nzLoading]="loading" [nzBordered]="true">
        <flink-table-display
          *ngIf="configuration.length; else empty"
          [listOfData]="configuration"
        ></flink-table-display>
        <ng-template #empty>
          <nz-empty *ngIf="!loading" nzNotFoundImage="simple"></nz-empty>
        </ng-template>
      </nz-card>
    </div>
  `,
  styles: ['.wrapper { padding: 1.25rem; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NzCardModule, NzEmptyModule, TableDisplayComponent]
})
export class ApplicationConfigurationComponent implements OnInit, OnDestroy {
  private readonly applicationService = inject(ApplicationService);
  private readonly applicationLocalService = inject(ApplicationLocalService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  loading = true;
  configuration: ClusterConfiguration[] = [];

  ngOnInit(): void {
    this.applicationLocalService
      .applicationDetailChanges()
      .pipe(
        distinctUntilKeyChanged('id'),
        mergeMap(application =>
          this.applicationService.loadJobManagerConfig(application.id).pipe(catchError(() => of([])))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(configuration => {
        this.configuration = [...configuration].sort((a, b) => (a.key > b.key ? 1 : -1));
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
