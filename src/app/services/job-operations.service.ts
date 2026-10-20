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

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, timer } from 'rxjs';
import { catchError, filter, map, switchMap, take, timeout } from 'rxjs/operators';

import {
  AsyncOperationStatus,
  CheckpointOperation,
  CheckpointType,
  DisposalOperation,
  FailureCause,
  OperationResult,
  SavepointFormat,
  SavepointOperation,
  TriggerResponse
} from '@flink-runtime-web/interfaces';

import { ConfigService } from './config.service';

/** Savepoints of large state can take a while; give up waiting after this. */
const OPERATION_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 1000;

/**
 * One line naming the root cause of a failed operation: the last "Caused by"
 * of the stack trace, without the exception's package.
 */
export function rootCause(failure?: FailureCause | null): string {
  const trace = failure?.['stack-trace'] || '';
  const lines = trace.split('\n').map(line => line.trim());
  const causes = lines.filter(line => line.startsWith('Caused by:'));
  const line = (causes.length ? causes[causes.length - 1].replace(/^Caused by:\s*/, '') : lines[0]) || '';
  return line.replace(/^([\w$]+\.)+(?=[\w$]+(:|$))/, '') || failure?.class || 'Unknown error';
}

/** Error message of a failed REST call (the first entry of Flink's "errors"). */
export function restError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const errors: unknown = error.error?.errors;
    if (Array.isArray(errors) && errors.length) {
      // The gateway puts the stack trace in the second entry
      const detail = String(errors[errors.length - 1]);
      const causes = detail.split('\n').filter(line => line.trim().startsWith('Caused by:'));
      const message = causes.length ? causes[causes.length - 1] : String(errors[0]);
      return message.replace(/^\s*Caused by:\s*/, '').replace(/^([\w$]+\.)+(?=[\w$]+(:|$))/, '');
    }
    return error.message;
  }
  return String(error);
}

/**
 * Savepoints, stop-with-savepoint, manual checkpoints and savepoint disposal.
 * Each call triggers the operation, waits for it to finish and emits once.
 */
@Injectable({
  providedIn: 'root'
})
export class JobOperationsService {
  private readonly httpClient = inject(HttpClient);
  private readonly configService = inject(ConfigService);

  /** POST /jobs/:jobid/savepoints */
  triggerSavepoint(
    jobId: string,
    options: { targetDirectory?: string; cancelJob: boolean; formatType: SavepointFormat }
  ): Observable<OperationResult> {
    const body = {
      'target-directory': options.targetDirectory || undefined,
      'cancel-job': options.cancelJob,
      formatType: options.formatType
    };
    return this.trigger(
      `/jobs/${jobId}/savepoints`,
      body,
      id => `/jobs/${jobId}/savepoints/${id}`,
      op => {
        return (op as SavepointOperation['operation'])?.location;
      }
    );
  }

  /** POST /jobs/:jobid/stop. Its status is reported by the savepoint status handler. */
  stopWithSavepoint(
    jobId: string,
    options: { targetDirectory?: string; drain: boolean; formatType: SavepointFormat }
  ): Observable<OperationResult> {
    const body = {
      targetDirectory: options.targetDirectory || undefined,
      drain: options.drain,
      formatType: options.formatType
    };
    return this.trigger(
      `/jobs/${jobId}/stop`,
      body,
      id => `/jobs/${jobId}/savepoints/${id}`,
      op => {
        return (op as SavepointOperation['operation'])?.location;
      }
    );
  }

  /** POST /jobs/:jobid/checkpoints */
  triggerCheckpoint(jobId: string, checkpointType: CheckpointType): Observable<OperationResult> {
    return this.trigger(
      `/jobs/${jobId}/checkpoints`,
      { checkpointType },
      id => `/jobs/${jobId}/checkpoints/${id}`,
      op => {
        const checkpointId = (op as CheckpointOperation['operation'])?.checkpointId;
        return checkpointId === undefined ? undefined : String(checkpointId);
      }
    );
  }

  /** POST /savepoint-disposal: deletes the savepoint's files. */
  disposeSavepoint(path: string): Observable<OperationResult> {
    return this.trigger(
      '/savepoint-disposal',
      { 'savepoint-path': path },
      id => `/savepoint-disposal/${id}`,
      (_: DisposalOperation['operation']) => path
    );
  }

  private trigger<T>(
    url: string,
    body: object,
    statusUrl: (triggerId: string) => string,
    value: (operation: AsyncOperationStatus<T>['operation']) => string | undefined
  ): Observable<OperationResult> {
    const base = this.configService.BASE_URL;
    return this.httpClient.post<TriggerResponse>(`${base}${url}`, body).pipe(
      switchMap(trigger =>
        timer(0, POLL_INTERVAL_MS).pipe(
          switchMap(() => this.httpClient.get<AsyncOperationStatus<T>>(`${base}${statusUrl(trigger['request-id'])}`)),
          filter(status => status.status.id === 'COMPLETED'),
          take(1),
          timeout(OPERATION_TIMEOUT_MS)
        )
      ),
      map(status => {
        const failure = status.operation?.['failure-cause'];
        return failure ? { ok: false, error: rootCause(failure) } : { ok: true, value: value(status.operation) };
      }),
      catchError(error => of({ ok: false, error: restError(error) }))
    );
  }
}
