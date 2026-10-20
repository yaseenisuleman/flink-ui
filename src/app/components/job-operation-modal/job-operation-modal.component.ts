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
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  Output
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CheckpointType, OperationResult, SavepointFormat } from '@flink-runtime-web/interfaces';
import { JobManagerService, JobOperationsService, SavepointHistoryService } from '@flink-runtime-web/services';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSpinModule } from 'ng-zorro-antd/spin';

export type JobOperationMode = 'savepoint' | 'stop' | 'checkpoint';

const TITLES: Record<JobOperationMode, string> = {
  savepoint: 'Trigger Savepoint',
  stop: 'Stop with Savepoint',
  checkpoint: 'Trigger Checkpoint'
};

const ACTIONS: Record<JobOperationMode, string> = {
  savepoint: 'Trigger Savepoint',
  stop: 'Stop Job',
  checkpoint: 'Trigger Checkpoint'
};

/** Savepoint directory keys, current first (Flink 2.x) then the legacy name. */
const SAVEPOINT_DIR_KEYS = ['execution.checkpointing.savepoint-dir', 'state.savepoints.dir'];

/**
 * Dialog for the job operations Flink runs asynchronously: savepoint, stop
 * with savepoint and a manual checkpoint. It waits for the result; closing it
 * early lets the operation finish in the background and reports it as a
 * notification.
 */
@Component({
  selector: 'flink-job-operation-modal',
  templateUrl: './job-operation-modal.component.html',
  styleUrls: ['./job-operation-modal.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIf,
    FormsModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzRadioModule,
    NzCheckboxModule,
    NzButtonModule,
    NzAlertModule,
    NzSpinModule
  ]
})
export class JobOperationModalComponent implements OnDestroy {
  private readonly operations = inject(JobOperationsService);
  private readonly savepoints = inject(SavepointHistoryService);
  private readonly jobManagerService = inject(JobManagerService);
  private readonly notification = inject(NzNotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  @Input() jobId = '';
  @Input() jobName = '';
  /** Emits after an operation finished, so the page can refresh the job. */
  @Output() readonly finished = new EventEmitter<OperationResult>();

  visible = false;
  mode: JobOperationMode = 'savepoint';
  running = false;
  result: OperationResult | null = null;
  copied = false;

  targetDirectory = '';
  defaultDirectory = '';
  formatType: SavepointFormat = 'CANONICAL';
  cancelJob = false;
  drain = false;
  checkpointType: CheckpointType = 'CONFIGURED';

  get title(): string {
    return TITLES[this.mode];
  }

  get action(): string {
    return ACTIONS[this.mode];
  }

  open(mode: JobOperationMode): void {
    this.mode = mode;
    this.visible = true;
    this.running = false;
    this.result = null;
    this.copied = false;
    this.cancelJob = false;
    this.drain = false;
    if (mode !== 'checkpoint' && !this.defaultDirectory) {
      this.jobManagerService.loadConfig().subscribe(config => {
        const entry = SAVEPOINT_DIR_KEYS.map(key => config.find(item => item.key === key)).find(Boolean);
        this.defaultDirectory = entry?.value || '';
        this.cdr.markForCheck();
      });
    }
    this.cdr.markForCheck();
  }

  close(): void {
    this.visible = false;
    this.cdr.markForCheck();
  }

  run(): void {
    if (this.mode !== 'checkpoint' && !this.targetDirectory && !this.defaultDirectory) {
      this.result = {
        ok: false,
        error: 'No savepoint directory: enter one, or set execution.checkpointing.savepoint-dir on the cluster.'
      };
      this.cdr.markForCheck();
      return;
    }
    const mode = this.mode;
    const jobId = this.jobId;
    const jobName = this.jobName;
    const options = {
      targetDirectory: this.targetDirectory.trim(),
      formatType: this.formatType
    };
    const operation$ =
      mode === 'checkpoint'
        ? this.operations.triggerCheckpoint(jobId, this.checkpointType)
        : mode === 'stop'
        ? this.operations.stopWithSavepoint(jobId, { ...options, drain: this.drain })
        : this.operations.triggerSavepoint(jobId, { ...options, cancelJob: this.cancelJob });
    this.running = true;
    this.result = null;
    this.cdr.markForCheck();
    operation$.pipe(takeUntil(this.destroy$)).subscribe(result => {
      if (result.ok && result.value && mode !== 'checkpoint') {
        this.savepoints.record({ path: result.value, jobId, jobName, time: Date.now() });
      }
      if (!this.visible || this.mode !== mode) {
        this.notify(mode, result);
      }
      this.running = false;
      this.result = result;
      this.finished.emit(result);
      this.cdr.markForCheck();
    });
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => {
        this.copied = true;
        this.cdr.markForCheck();
      },
      () => undefined
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Result of an operation whose dialog was closed while it ran. */
  private notify(mode: JobOperationMode, result: OperationResult): void {
    const what = mode === 'checkpoint' ? 'Checkpoint' : mode === 'stop' ? 'Stop with savepoint' : 'Savepoint';
    if (result.ok) {
      const detail = mode === 'checkpoint' ? `Checkpoint ${result.value} completed.` : result.value || '';
      this.notification.success(`${what} completed`, detail, { nzDuration: 0 });
    } else {
      this.notification.error(`${what} failed`, result.error || '', { nzDuration: 0 });
    }
  }
}
